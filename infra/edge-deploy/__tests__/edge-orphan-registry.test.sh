#!/usr/bin/env bash
# edge-orphan-registry.test.sh — teste de regressão do registry de órfãos
# (infra/edge-deploy/deploy-edge.sh, consumido pelo gate E38/E39 edge-drift-check)
#
# Cobre:
#  1. A comparação de órfão é SIMÉTRICA: arquivo não-.ts versionado em _shared
#     (README.md, evolution-event-types.json) entra na lista do repo. Antes não
#     entrava e por isso era acusado como órfão — medido em 2026-09-27 contra o
#     volume de produção (ORPHAN=7, dos quais 2 eram versionados no main).
#  2. O teste de órfão de _shared compara contra REPO_SHARED_ALL, não REPO_SHARED.
#  3. RETIRED_FUNCTIONS cobre as funções retiradas com ADR (email-health,
#     zapp-google-calendar-sync): continuam no volume como zumbis inertes.
#  4. Rigor preservado: um órfão desconhecido continua sendo reportado.
#  5. Segurança: o input `prune` do edge-deploy.yml tem default false.
#
# POR QUE BASH (e não `node --test`): o job que hospeda este teste roda em runner
# self-hosted cujo Node é antigo — `node --test` falha com "node: bad option:
# --test" (run 36328997858) e um `.mjs` ESM nem parseia (SyntaxError). Bash é o
# runtime já provado nesse runner (o próprio deploy é shell).
#
# Run: bash infra/edge-deploy/__tests__/edge-orphan-registry.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$HERE/../../.." && pwd)"
SCRIPT="$HERE/../deploy-edge.sh"
WF="$RAIZ/.github/workflows/edge-deploy.yml"

FALHAS=0
ok()   { echo "ok - $1"; }
falha() { FALHAS=$((FALHAS+1)); echo "not ok - $1"; echo "  $2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── 1. comparação simétrica ─────────────────────────────────────────────────
mkdir -p "$TMP/__tests__"
: > "$TMP/README.md"
: > "$TMP/evolution-event-types.json"
: > "$TMP/mode.ts"
: > "$TMP/__tests__/x.test.ts"

listar_so_ts() {
  ( cd "$TMP" && find . -type f -name '*.ts' \
      ! -path '*/__tests__/*' ! -path '*/__fixtures__/*' \
      ! -name '*.test.ts' ! -name '*.spec.ts' -printf '%P\n' | sort )
}
listar_todos() {
  ( cd "$TMP" && find . -type f \
      ! -path '*/__tests__/*' ! -path '*/__fixtures__/*' \
      ! -name '*.test.ts' ! -name '*.spec.ts' -printf '%P\n' | sort )
}

SO_TS="$(listar_so_ts)"
TODOS="$(listar_todos)"

if printf '%s\n' "$SO_TS" | grep -qx 'README.md'; then
  falha "1. lista do repo inclui não-.ts" "a lista antiga (só .ts) não deveria ver README.md"
elif printf '%s\n' "$SO_TS" | grep -qx 'evolution-event-types.json'; then
  falha "1. lista do repo inclui não-.ts" "a lista antiga (só .ts) não deveria ver o .json"
elif [ "$TODOS" != "$(printf 'README.md\nevolution-event-types.json\nmode.ts')" ]; then
  falha "1. lista do repo inclui não-.ts" "lista nova inesperada: [$TODOS]"
else
  ok "1. a lista do repo inclui arquivos não-.ts versionados (comparação simétrica)"
fi

# ── 2. o teste de órfão usa a lista simétrica ───────────────────────────────
if grep -q 'REPO_SHARED_ALL' "$SCRIPT" \
   && grep -q 'printf '"'"'%s\\n'"'"' "${REPO_SHARED_ALL\[@\]}" | grep -qx "\$name"' "$SCRIPT"; then
  ok "2. o teste de órfão de _shared usa a lista simétrica"
else
  falha "2. o teste de órfão de _shared usa a lista simétrica" \
        "deploy-edge.sh precisa comparar contra REPO_SHARED_ALL"
fi

# ── 3. funções retiradas com ADR estão no registry ─────────────────────────
M=0
grep -qE 'RETIRED_FUNCTIONS=\(([^)]*[[:space:]])?email-health([[:space:])]|$)' "$SCRIPT" || M=1
grep -qE 'RETIRED_FUNCTIONS=\([^)]*zapp-google-calendar-sync' "$SCRIPT" || M=1
grep -qE 'email-health|calendar' <(ls "$RAIZ/docs/_archive/" 2>/dev/null) || M=1
if [ "$M" -eq 0 ]; then
  ok "3. funções retiradas com ADR estão no registry"
else
  falha "3. funções retiradas com ADR estão no registry" \
        "email-health e zapp-google-calendar-sync precisam estar em RETIRED_FUNCTIONS, com ADR em docs/_archive/"
fi

# ── 4. rigor: órfão desconhecido continua sendo reportado ───────────────────
if grep -q 'funcao-nova-desconhecida' "$SCRIPT"; then
  falha "4. rigor preservado" "a lista de retiradas não pode virar curinga"
elif ! grep -A1 'RETIRED_FUNCTIONS\[@\]}" | grep -qx "\$name"; then' "$SCRIPT" | grep -q 'continue'; then
  falha "4. rigor preservado" "a tolerância precisa ser um continue ANTES do incremento de ORPHAN"
else
  ok "4. rigor preservado: órfão desconhecido continua sendo reportado"
fi

# ── 5. prune só por dispatch explícito ─────────────────────────────────────
if grep -q 'prune:' "$WF" && grep -q 'default: false' "$WF" && grep -q -- '--apply --restart' "$WF"; then
  ok "5. segurança: prune só por dispatch explícito (default false)"
else
  falha "5. segurança: prune só por dispatch explícito (default false)" \
        "edge-deploy.yml precisa do input prune com default false"
fi

echo "1..5"
if [ "$FALHAS" -eq 0 ]; then
  echo "ok - registry de órfãos: 5 testes, 0 falhas"
  exit 0
fi
echo "not ok - registry de órfãos: $FALHAS falha(s)"
exit 1
