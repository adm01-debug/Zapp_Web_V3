#!/usr/bin/env bash
set -euo pipefail

functions_mount="${1:-$PWD/supabase/functions}"
runtime_image="${EDGE_RUNTIME_IMAGE:-supabase/edge-runtime:v1.74.0}"
boot_timeout="${EDGE_BOOT_TIMEOUT_SECONDS:-8}"
parallelism="${EDGE_BOOT_PARALLELISM:-4}"
log_parent="${RUNNER_TEMP:-/tmp}"
log_dir="$(mktemp -d "${log_parent%/}/edge-runtime-functions.XXXXXX")"

export functions_mount runtime_image boot_timeout log_dir

check_edge_function() {
  local function_dir="$1"
  local function_name="${function_dir##*/}"
  local log_file="${log_dir}/${function_name}.log"
  local container_name="edge-parse-${GITHUB_RUN_ID:-local}-${function_name}-${BASHPID}"
  local started_at="$SECONDS"
  local elapsed
  local status

  set +e
  timeout --signal=TERM --kill-after=3 "$boot_timeout" docker run --rm \
    --name "$container_name" \
    -v "${functions_mount}:/home/deno/functions:ro" \
    -e SUPABASE_URL=http://localhost:8000 \
    -e SUPABASE_ANON_KEY=test-anon-key \
    -e SUPABASE_SERVICE_ROLE_KEY=test-service-role-key \
    -e JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long \
    -e VERIFY_JWT=false \
    "$runtime_image" \
    start --main-service "/home/deno/functions/${function_name}" \
    >"$log_file" 2>&1
  status=$?
  elapsed=$((SECONDS - started_at))
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  set -e

  if [ "$status" -eq 124 ] ||
    { [ "$status" -eq 137 ] && [ "$elapsed" -ge "$boot_timeout" ]; }; then
    if grep -Eq 'worker boot error|could not be parsed|main worker boot error' "$log_file"; then
      printf '%s\n' "$status" >"${log_file}.failed"
      printf 'FAIL %s (erro de boot antes do timeout, exit %s)\n' "$function_name" "$status"
      return 0
    fi
    if [ "$status" -eq 137 ]; then
      printf 'OK %s (runtime exigiu SIGKILL após a janela)\n' "$function_name"
    else
      printf 'OK %s\n' "$function_name"
    fi
    return 0
  fi

  printf '%s\n' "$status" >"${log_file}.failed"
  printf 'FAIL %s (exit %s)\n' "$function_name" "$status"
  return 0
}

export -f check_edge_function

mapfile -d '' function_dirs < <(
  find "$functions_mount" -mindepth 2 -maxdepth 2 -name index.ts -printf '%h\0' | sort -z
)

if [ "${#function_dirs[@]}" -eq 0 ]; then
  echo "Nenhuma Edge Function com index.ts encontrada em ${functions_mount}." >&2
  exit 1
fi

printf '%s\0' "${function_dirs[@]}" |
  xargs -0 -r -n 1 -P "$parallelism" bash -c 'check_edge_function "$1"' _

mapfile -t failures < <(find "$log_dir" -name '*.failed' -print | sort)
if [ "${#failures[@]}" -gt 0 ]; then
  echo "Edge Functions incompatíveis com ${runtime_image}:" >&2
  for marker in "${failures[@]}"; do
    log_file="${marker%.failed}"
    status="$(<"$marker")"
    printf '\n--- %s (exit %s) ---\n' "$(basename "$log_file" .log)" "$status" >&2
    sed -n '1,40p' "$log_file" >&2
  done
  exit 1
fi

echo "Todas as ${#function_dirs[@]} Edge Functions iniciaram no runtime ${runtime_image}."
