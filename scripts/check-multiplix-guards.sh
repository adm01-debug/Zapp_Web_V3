#!/usr/bin/env sh
# check-multiplix-guards.sh
#
# Guard CI: evita regressão das políticas de segurança multiplix
# implementadas em 20260927210000_multiplix_rls_hardening_realtime_pii.
#
# Varre supabase/migrations/*.sql detectando 3 classes de regressão:
#
#   Classe A — RLS sendo desabilitado em multiplix_dispatches ou multiplix_recipients
#   Classe B — DROP POLICY sem CREATE POLICY compensatória nas tabelas multiplix
#   Classe C — Colunas PII re-adicionadas ao supabase_realtime para multiplix_recipients
#              (destino_e164 | personalized_message | delivery_claim_token)
#
# Uso: sh scripts/check-multiplix-guards.sh [migrations_dir]
# Sai com 1 se encontrar regressão; 0 se tudo OK.

MIGRATIONS_DIR="${1:-supabase/migrations}"
ERRORS=0

echo "==> check-multiplix-guards: varrendo $MIGRATIONS_DIR"

# ── Classe A: DISABLE ROW LEVEL SECURITY ─────────────────────────────────────
# Qualquer migration que desabilite RLS em tabela multiplix é uma regressão crítica.
for f in "$MIGRATIONS_DIR"/*.sql; do
  test -f "$f" || continue
  if grep -qiE \
    'ALTER[[:space:]]+TABLE[[:space:]]+[^;]*multiplix_(dispatches|recipients)[^;]*DISABLE[[:space:]]+ROW[[:space:]]+LEVEL[[:space:]]+SECURITY' \
    "$f" 2>/dev/null
  then
    echo "FAIL [A] RLS desabilitado em tabela multiplix: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

# ── Classe B: DROP POLICY sem CREATE POLICY compensatória ────────────────────
# Um DROP sem CREATE correspondente na mesma migration deixa a tabela aberta.
for f in "$MIGRATIONS_DIR"/*.sql; do
  test -f "$f" || continue
  DROPS=$(grep -cE \
    'DROP[[:space:]]+POLICY[[:space:]]+[^;]+ON[[:space:]]+(public\.)?multiplix_(dispatches|recipients)' \
    "$f" 2>/dev/null || true)
  CREATES=$(grep -cE \
    'CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?POLICY[[:space:]]+[^;]+ON[[:space:]]+(public\.)?multiplix_(dispatches|recipients)' \
    "$f" 2>/dev/null || true)
  if [ "$DROPS" -gt 0 ] && [ "$CREATES" -eq 0 ]; then
    echo "FAIL [B] DROP POLICY sem CREATE POLICY compensatória em multiplix: $f (drops=$DROPS creates=$CREATES)"
    ERRORS=$((ERRORS + 1))
  fi
done

# ── Classe C: Colunas PII re-adicionadas ao supabase_realtime ────────────────
# Detecta ALTER PUBLICATION supabase_realtime que menciona multiplix_recipients
# e inclui qualquer das três colunas PII removidas em 20260927210000.
PII_COLS='destino_e164|personalized_message|delivery_claim_token'
for f in "$MIGRATIONS_DIR"/*.sql; do
  test -f "$f" || continue
  if grep -qiE \
    'ALTER[[:space:]]+PUBLICATION[[:space:]]+supabase_realtime[[:space:]]' \
    "$f" 2>/dev/null
  then
    if grep -iE "$PII_COLS" "$f" 2>/dev/null | grep -qiE 'multiplix_recipients'; then
      echo "FAIL [C] Coluna PII detectada em ALTER PUBLICATION supabase_realtime para multiplix_recipients: $f"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

if [ "$ERRORS" -eq 0 ]; then
  echo "OK multiplix-guards: RLS, policies e Realtime PII — sem regressão detectada ($MIGRATIONS_DIR)"
  exit 0
fi

echo ""
echo "Para corrigir, consulte:"
echo "  supabase/migrations/20260927210000_multiplix_rls_hardening_realtime_pii.sql"
echo "  docs/realtime-schema-guide.md"
exit 1
