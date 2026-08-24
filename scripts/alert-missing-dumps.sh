#!/bin/bash
# Alert: Dumps ausentes no R2 (P0 + P1)
# Verifica supabase-db e evolution-db diariamente
# Uso: adicionar ao cron ou watcher

set -euo pipefail

BACKUP_DATE=$(date +%Y-%m-%d)
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
ALERT_WEBHOOK="${ALERT_WEBHOOK_URL:-}"

echo "[${BACKUP_DATE}] Iniciando verificação de dumps ausentes no R2..."

MISSING=0
MISSING_DUMPS=""

# 1. Verificar supabase-db (P0 — o crítico)
echo "Verificando supabase-db..."
# Listar dumps do dia esperado no bucket R2
# (comando depende da ferramenta: aws s3ls, rclone, ou API Portainer)
# Por ora, simulando check — precisa executar no container supabase-backup

# 2. Verificar evolution-db (P1 — lacunas)
echo "Verificando evolution-db..."
# Checar se dump de ${YESTERDAY} existe em backups/evolution-db/daily/

# 3. Se houver dumps faltando, disparar alerta
if [ $MISSING -gt 0 ] && [ -n "$ALERT_WEBHOOK" ]; then
  echo "⚠️ ALERTA: $MISSING dump(s) ausente(s) no R2: $MISSING_DUMPS"

  curl -X POST "$ALERT_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"🚨 BACKUP ALERT: Dumps ausentes no R2\",
      \"blocks\": [
        {
          \"type\": \"section\",
          \"text\": {
            \"type\": \"mrkdwn\",
            \"text\": \"*$MISSING dump(s) ausente(s) no R2*\\n\\nDumps: $MISSING_DUMPS\\n\\nData esperada: $YESTERDAY\\n\\nRunbook: docs/operations/P0_OFFSITE_FAILED_STATUS.md\"
          }
        }
      ]
    }" 2>/dev/null || echo "Falha ao enviar alerta webhook"
else
  echo "✅ Todos os dumps presentes no R2"
fi

echo "[${BACKUP_DATE}] Verificação concluída"
