#!/usr/bin/env bash
set -euo pipefail

functions_target="${1:-$PWD/supabase/functions}"
if [ "${functions_target#/}" = "$functions_target" ]; then
  functions_target="${PWD%/}/${functions_target#./}"
fi
functions_target="${functions_target%/}"
functions_target="$(cd "$(dirname "$functions_target")" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$functions_target")")"
runtime_image="${EDGE_RUNTIME_IMAGE:-supabase/edge-runtime:v1.74.0}"
boot_timeout="${EDGE_BOOT_TIMEOUT_SECONDS:-12}"
parallelism="${EDGE_BOOT_PARALLELISM:-4}"
poll_interval="${EDGE_BOOT_POLL_SECONDS:-1}"
log_parent="${RUNNER_TEMP:-/tmp}"
log_dir="${EDGE_LOG_DIR:-$(mktemp -d "${log_parent%/}/edge-runtime-functions.XXXXXX")}"
docker_bin="${EDGE_DOCKER_BIN:-docker}"
curl_bin="${EDGE_CURL_BIN:-curl}"

if [ ! -d "$functions_target" ]; then
  echo "Diretório de Edge Functions não encontrado: ${functions_target}" >&2
  exit 1
fi

cleanup_main() {
  if [ "${EDGE_KEEP_LOG_DIR:-0}" != "1" ]; then
    rm -rf "$log_dir"
  fi
}

contains_boot_error() {
  local log_file="$1"
  grep -Eiq 'worker boot error|could not be parsed|main worker boot error|failed to create the graph|panic:' "$log_file"
}

check_edge_function() {
  local function_dir="$1"
  local function_name="${function_dir##*/}"
  local sanitized_name
  sanitized_name="$(printf '%s' "$function_name" | tr -cs '[:alnum:]._+-' '-')"
  local log_file="${log_dir}/${function_name}.log"
  local body_file="${log_dir}/${function_name}.body"
  local headers_file="${log_dir}/${function_name}.headers"
  local meta_file="${log_dir}/${function_name}.meta"
  local failed_file="${log_file}.failed"
  local container_name="edge-http-${GITHUB_RUN_ID:-local}-${sanitized_name}-${BASHPID}"
  local container_id=""
  local running=""
  local host_port=""
  local http_code=""
  local probe_path="/functions/v1/${function_name}"
  local deadline
  local boot_succeeded=false

  cleanup_function() {
    if [ -n "$container_id" ]; then
      "$docker_bin" rm -f "$container_id" >/dev/null 2>&1 || true
    fi
    rm -f "$body_file" "$headers_file" "$meta_file"
  }

  trap cleanup_function RETURN

  : >"$log_file"
  : >"$body_file"
  : >"$headers_file"

  set +e
  container_id=$(
    "$docker_bin" run -d \
      --name "$container_name" \
      -p 127.0.0.1::9000 \
      -v "${functions_mount_root}:/home/deno/functions:ro" \
      -e SUPABASE_URL=http://localhost:8000 \
      -e SUPABASE_ANON_KEY=test-anon-key \
      -e SUPABASE_SERVICE_ROLE_KEY=test-service-role-key \
      -e JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long \
      -e VERIFY_JWT=false \
      "$runtime_image" \
      start --main-service "/home/deno/functions/${function_name}" 2>&1
  )
  local run_status=$?
  set -e

  if [ "$run_status" -ne 0 ] || [ -z "$container_id" ]; then
    printf 'docker run -d falhou (exit %s)\n%s\n' "$run_status" "${container_id:-}" >"$log_file"
    printf '%s\n' "$run_status" >"$failed_file"
    printf 'FAIL %s (docker run -d exit %s)\n' "$function_name" "$run_status"
    return 0
  fi

  printf 'container_id=%s\n' "$container_id" >"$meta_file"
  if [ "$function_name" = "main" ]; then
    # O entrypoint main já é o roteador compartilhado: a URL "/functions/v1/main"
    # tenta despachar para uma function inexistente chamada "functions". O health
    # do boot é provado pelo 400 estruturado em "/".
    probe_path="/"
  fi
  deadline=$(( $(date +%s) + boot_timeout ))

  while [ "$(date +%s)" -lt "$deadline" ]; do
    "$docker_bin" logs "$container_id" >"$log_file" 2>&1 || true

    if contains_boot_error "$log_file"; then
      printf '%s\n' "boot-error" >"$failed_file"
      printf 'FAIL %s (boot error no runtime)\n' "$function_name"
      return 0
    fi

    set +e
    running=$("$docker_bin" inspect -f '{{.State.Running}}' "$container_id" 2>>"$log_file")
    local inspect_status=$?
    set -e
    if [ "$inspect_status" -ne 0 ]; then
      printf '%s\n' "inspect-failed-${inspect_status}" >"$failed_file"
      printf 'FAIL %s (container desapareceu antes da resposta HTTP)\n' "$function_name"
      return 0
    fi
    if [ "$running" != "true" ]; then
      printf '%s\n' "container-stopped" >"$failed_file"
      printf 'FAIL %s (container parou antes da resposta HTTP)\n' "$function_name"
      return 0
    fi

    host_port="$("$docker_bin" port "$container_id" 9000/tcp 2>>"$log_file" | sed -n '1s/.*://p')"
    if [ -z "$host_port" ]; then
      sleep "$poll_interval"
      continue
    fi

    set +e
    http_code=$(
      "$curl_bin" --silent --show-error \
        --output "$body_file" \
        --dump-header "$headers_file" \
        --write-out '%{http_code}' \
        --max-time 5 \
        "http://127.0.0.1:${host_port}${probe_path}"
    )
    local curl_status=$?
    set -e
    if [ "$curl_status" -eq 0 ] &&
      printf '%s' "$http_code" | grep -Eq '^[1-5][0-9][0-9]$' &&
      [ "$http_code" != "404" ]; then
      "$docker_bin" logs "$container_id" >"$log_file" 2>&1 || true
      if contains_boot_error "$log_file"; then
        printf '%s\n' "boot-error-after-http" >"$failed_file"
        printf 'FAIL %s (boot error após responder HTTP)\n' "$function_name"
        return 0
      fi
      {
        printf '\nHTTP %s em %s\n' "$http_code" "$probe_path"
        printf 'porta=%s\n' "$host_port"
        printf '\n--- headers ---\n'
        sed -n '1,20p' "$headers_file"
        printf '\n--- body ---\n'
        sed -n '1,20p' "$body_file"
      } >>"$log_file"
      boot_succeeded=true
      break
    fi

    sleep "$poll_interval"
  done

  "$docker_bin" logs "$container_id" >"$log_file" 2>&1 || true

  if [ "$boot_succeeded" != "true" ]; then
    if contains_boot_error "$log_file"; then
      printf '%s\n' "boot-error-timeout" >"$failed_file"
      printf 'FAIL %s (boot error antes da prova HTTP)\n' "$function_name"
      return 0
    fi
    {
      printf '\nNenhuma resposta HTTP válida obtida dentro de %ss\n' "$boot_timeout"
      printf 'porta_detectada=%s\n' "${host_port:-<vazia>}"
      printf 'ultimo_http_code=%s\n' "${http_code:-<nenhum>}"
    } >>"$log_file"
    printf '%s\n' "http-timeout" >"$failed_file"
    printf 'FAIL %s (sem prova HTTP positiva em %ss)\n' "$function_name" "$boot_timeout"
    return 0
  fi

  printf 'OK %s (HTTP %s)\n' "$function_name" "$http_code"
}

trap cleanup_main EXIT
export functions_mount_root runtime_image boot_timeout poll_interval log_dir docker_bin curl_bin
export -f contains_boot_error check_edge_function

if [ -f "${functions_target}/index.ts" ]; then
  functions_mount_root="$(dirname "${functions_target}")"
  function_dirs=("${functions_target}")
else
  functions_mount_root="${functions_target}"
  mapfile -d '' function_dirs < <(
    find "$functions_target" -mindepth 2 -maxdepth 2 -name index.ts -printf '%h\0' | sort -z
  )
fi

if [ "${#function_dirs[@]}" -eq 0 ]; then
  echo "Nenhuma Edge Function com index.ts encontrada em ${functions_target}." >&2
  exit 1
fi

printf '%s\0' "${function_dirs[@]}" |
  xargs -0 -r -n 1 -P "$parallelism" bash -c 'check_edge_function "$1"' _

mapfile -t failures < <(find "$log_dir" -name '*.failed' -print | sort)
if [ "${#failures[@]}" -gt 0 ]; then
  echo "Edge Functions incompatíveis com ${runtime_image}:" >&2
  for marker in "${failures[@]}"; do
    log_file="${marker%.failed}"
    reason="$(<"$marker")"
    printf '\n--- %s (%s) ---\n' "$(basename "$log_file" .log)" "$reason" >&2
    sed -n '1,80p' "$log_file" >&2
  done
  exit 1
fi

echo "Todas as ${#function_dirs[@]} Edge Functions responderam HTTP no runtime ${runtime_image}."
