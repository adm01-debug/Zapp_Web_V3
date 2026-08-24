#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# Alerta: dumps ausentes no R2 (PLANO-100 — fecha a lacuna de calendário)
# ═══════════════════════════════════════════════════════════════════════════
# Checagens:
#   1. Idade do dump mais recente por prefix (>=26h = problema)
#      supabase-db/daily  (P0 — dump ~09:29 UTC; severity critical)
#      evolution-db/daily (P1 — dump ~02:00 UTC; severity high)
#   2. Lacunas de calendário: <6 dumps em 7 dias = problema (tolera 1 dia)
#
# ONDE RODA: service `dump-alert` do stack supabase-backup (Portainer 124).
# Este arquivo é o ESPELHO versionado do comando embedado em
# infra/stacks/supabase-backup.yml — manter os dois em sincronia.
#
# Canal de alerta: INSERT em zapp.webhook_health_alerts (mesma tabela do
# sentinel check cron 127), deduplicado por dia+title. Marker em /state/.
#
# Notas de portabilidade (alpine/busybox — validado ao vivo 2026-08-24):
#   - busybox awk NÃO tem mktime → idades calculadas via psql (timestamptz)
#   - `mc ls` colunas: [data hora UTC] tamanho classe arquivo → sort -k1,2
#   - comparações de data como string "YYYY-MM-DD HH:MM:SS" (ordem lexicográfica
#     = ordem cronológica neste formato)
# ═══════════════════════════════════════════════════════════════════════════
set -u

R2_BUCKET="${R2_BUCKET:-promo-brindes-backups}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
STATE_DIR="${STATE_DIR:-/state}"
TODAY=$(date -u +%Y-%m-%d)
export PGPASSWORD="$(cat /run/secrets/supabase_db_password_v1 2>/dev/null || echo x)"
PG="psql -h supabase_db -p 5432 -U supabase_admin -d postgres -tA"

MISSING=0

newest_line() { mc ls --recursive "r2/${R2_BUCKET}/$1" 2>/dev/null | sort -k1,2 | tail -1; }
newest_ts()   { newest_line "$1" | sed -n 's/^\[\([^]]* UTC\)\].*/\1/p'; }

age_hours() {
  # idade em horas do timestamp "YYYY-MM-DD HH:MM:SS UTC" (via psql; busybox não tem mktime)
  ts="$1"
  [ -z "$ts" ] && { echo 999999; return; }
  $PG -c "select floor(extract(epoch from (now() - '${ts}'::timestamptz)) / 3600)::int" 2>/dev/null || echo 999999
}

insert_alert() {
  # $1=alert_type $2=severity $3=title $4=details_jsonb
  $PG -c "INSERT INTO zapp.webhook_health_alerts (alert_type, severity, title, details)
SELECT '$1', '$2', '$3', '$4'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM zapp.webhook_health_alerts
  WHERE alert_type = '$1' AND title = '$3' AND created_at >= current_date
)" 2>/dev/null || echo "WARN: INSERT do alerta falhou (psql)"
}

notify() {
  # webhook n8n warroom-alert — mesmo schema do alert() do stack supabase-backup
  [ -n "${ALERT_WEBHOOK_URL:-}" ] || return 0
  curl -s --max-time 10 -X POST "$ALERT_WEBHOOK_URL" -H "Content-Type: application/json" \
    -d "{\"source\":\"dump-alert\",\"entity\":\"dump-alert\",\"alert_type\":\"$1\",\"title\":\"$2\",\"message\":\"$3\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
    >/dev/null 2>&1 || true
}

check_age() {
  name="$1"; sev="$2"
  ts=$(newest_ts "$name")
  age=$(age_hours "$ts")
  if [ "${age:-999999}" -gt "$MAX_AGE_HOURS" ]; then
    MISSING=$((MISSING + 1))
    echo "[$(date -u +%Y%m%d_%H%M%S)] ALERTA ${name}: ultimo='${ts:-NENHUM}' idade=${age}h (limite ${MAX_AGE_HOURS}h)"
    touch "${STATE_DIR}/ALERT_DUMP_MISSING_${name//\//_}_${TODAY}" 2>/dev/null
    details="{\"prefix\":\"${name}\",\"age_hours\":${age:-0},\"last_object\":\"${ts:-nenhum}\",\"limit_hours\":${MAX_AGE_HOURS}}"
    insert_alert backup_dump_missing "$sev" "Dump ${name} ausente/stale no R2 (${TODAY})" "$details"
    notify "$sev" "dump-alert: ${name} stale" "ultimo dump: ${ts:-nenhum} (${age}h; limite ${MAX_AGE_HOURS}h)"
  else
    echo "[$(date -u +%Y%m%d_%H%M%S)] OK ${name}: ultimo='${ts}' idade=${age}h"
  fi
}

# ─── 2. lacunas de calendário (7d, tolera 1) ────────────────────────────────
cutoff7=$($PG -c "select to_char(now() - interval '7 days', 'YYYY-MM-DD HH24:MI:SS')" 2>/dev/null || echo "")

count_since() {
  # conta objetos com timestamp >= cutoff (comparação lexicográfica segura)
  [ -z "$cutoff7" ] && { echo 999; return; }
  mc ls --recursive "r2/${R2_BUCKET}/$1" 2>/dev/null | awk -v cutoff="$cutoff7" '
    {
      d = $1; gsub(/\[|\]/, "", d);
      n = split(d, ymd, "-");
      if (n < 3) next
      ts = sprintf("%04d-%02d-%02d %s", ymd[1], ymd[2], ymd[3], $2)
      if (ts >= cutoff) c++
    } END { print c + 0 }'
}

check_gaps() {
  name="$1"; sev="$2"
  c=$(count_since "$name")
  if [ "${c:-0}" -lt 6 ]; then
    MISSING=$((MISSING + 1))
    echo "[$(date -u +%Y%m%d_%H%M%S)] ALERTA lacunas ${name}: ${c} dumps em 7d (esperado >=6)"
    touch "${STATE_DIR}/ALERT_DUMP_GAPS_${name//\//_}_${TODAY}" 2>/dev/null
    details="{\"prefix\":\"${name}\",\"dumps_7d\":${c:-0},\"esperado_min\":6}"
    insert_alert backup_dump_gaps "$sev" "Lacunas de calendario em ${name} (${TODAY})" "$details"
    notify "$sev" "dump-alert: lacunas em ${name}" "apenas ${c} dumps em 7d (esperado >=6)"
  else
    echo "[$(date -u +%Y%m%d_%H%M%S)] OK ${name}: ${c} dumps nos ultimos 7d"
  fi
}

echo "=== DUMP ALERT $(date -u +%Y-%m-%dT%H:%M:%SZ) (bucket=${R2_BUCKET}, limite=${MAX_AGE_HOURS}h) ==="
check_age  "backups/supabase-db/daily"  "critical"
check_age  "backups/evolution-db/daily" "high"
check_gaps "backups/supabase-db/daily"  "warning"
check_gaps "backups/evolution-db/daily" "high"

if [ "$MISSING" -eq 0 ]; then
  echo "=== RESULTADO: todos os dumps presentes ==="
else
  echo "=== RESULTADO: ${MISSING} problema(s) ==="
fi
exit "$MISSING"
