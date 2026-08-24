# P0 — Offsite Backup Supabase-db: Status Crítico

> **Estado:** 🟡 PROVAVELMENTE RECUPERADO (2026-08-24) — requer verificação final no R2  
> **Marcador histórico:** `OFFSITE_FAILED_20260810_211518` (falha real de 08-10, ver análise abaixo)  
> **Risco residual:** até a verificação do R2, tratar como quebrado no planejamento de DR  
> **Ação:** Verificar bucket R2 (comando abaixo) e só então remover marcador/runbook §2

## 🔍 ANÁLISE DA DISCREPÂNCIA (2026-08-24, via código versionado)

**Fato:** `ops.backup_sentinel` mostra `last_backup_at` = `last_offsite_at` = **2026-08-24T09:29:41Z** (hoje), enquanto este doc dizia "quebrado desde 08-10".

**Veredito da análise de código** (sessão zapp-web-v3-d4, sem acesso VPS):

1. **Sentinel é confiável desde 2026-08-06.** O stack versionado [`infra/stacks/supabase-backup.yml`](../../infra/stacks/supabase-backup.yml) (correção AG-EX-17, label `AG-EX-17-sentinel-offsite-flag-2026-08-06`) mudou a ordem para **offsite primeiro → sentinel depois, com o flag REAL do upload** (`mc cp` só retorna sucesso → `OFFSITE_OK=true` → `fn_update_backup_sentinel(..., true)`). Antes disso o flag era `false` hardcoded.
2. **O marcador de 08-10 é legítimo** — foi criado pelo código já corrigido (08-06 < 08-10), então o offsite de fato falhou em 08-10. ✓ consistente com o runbook.
3. **`last_offsite_at` = hoje ⇒ o upload R2 de hoje retornou sucesso** segundo o pipeline pós-AG-EX-17. O único escritor do sentinel no repo é o stack de backup (verificado por grep em migrations/scripts/infra).
4. **Conclusão provável:** o offsite **voltou a funcionar entre 20/08 (auditoria: R2 sem dump) e 24/08 09:29** — candidates: estabilização das credenciais pós-rotação (stack 261 `r2-rotation` existe desde 08-13) ou redeploy do stack de backup. O marcador `OFFSITE_FAILED_*` fica em `/backups` por 30 dias (find -mtime +30) e o runbook não foi reavaliado.

**Residual (baixo):** o corpo de `ops.fn_update_backup_sentinel` **não está versionado** no repo (só o `ALTER FUNCTION ... SET search_path` no squash de 133 migrations). Não é 100% excluível que grave `last_offsite_at` incondicionalmente. → Ação derivada: versionar a definição como migration.

## Estado Validado (2026-08-20 → 2026-08-24)

| Camada | Estado | Evidência |
|--------|--------|-----------|
| **Dump local** | ✅ SAUDÁVEL | 2026-08-20 03:19 (188 MB) + 17:34 (140 MB), com `.sha256`; 33 cópias locais (19,3 GB) |
| **Offsite R2** | 🟡 PROVAVELMENTE OK | Sentinel 24/08 09:29 com `last_offsite_at` = hoje (flag real pós-AG-EX-17); R2 sem dump completo em 20/08 → verificação final pendente |
| **Config offsite** | ✅ OK | Tarballs diários de config chegam ao R2 |
| **pgbackrest** | ⚠️ Não validado | Stack 270 criado 16-08, sem drill |

## ✅ VERIFICAÇÃO FINAL (1 comando, via VPS)

```bash
# Listar os 10 dumps mais recentes no R2 (dentro do container supabase-backup_backup)
mc ls --recursive r2/promo-brindes-backups/backups/supabase-db/daily/ | sort -k2 | tail -10
# Esperado se recuperado: dump .gpg de 2026-08-24 (~tamanho do local de 09:29)
```

## Diagnóstico Necessário (Runbook §2)

**ACELERADOR:** A falha começou em 08-10; o stack 261 (r2-rotation) só existe desde 08-13. A rotação **NÃO explica a causa original** — investigar os dois períodos separadamente.

### Período 1: 08-10 → 08-13 (causa desconhecida)
- Credencial R2 rotacionada **não é hipótese válida** aqui
- Verificar: `backup_v4.log` desse intervalo, buscar erros específicos

### Período 2: Pós 08-13 (rotação como hipótese)
- Se stack 261 rotacionou `r2_backup_*` sem atualizar consumo do stack 124
- Upload passa a falhar com 403

### Testes Manuais (no container)
```bash
# 1. Ler marcador
cat /backups/OFFSITE_FAILED_20260810_211518

# 2. Logs recentes
grep -n -i 'r2\|offsite\|error' /backups/backup_v4.log | tail -30

# 3. Testar credencial R2
sh /infra/backup/backup_v4.sh --offsite-only --dry-run

# 4. Verificar env atual
env | grep -i "r2\|s3\|backup" | grep -v "PATH\|HOME"
```

## Backfill Pós-Reparo

Após religar, backfill dos dumps locais mais recentes para `backups/supabase-db/daily/`.

**Só remover marcador após:**
- (a) Upload terminar sem erro
- (b) Checksum do objeto no R2 conferir com dump local
- (c) Objeto estar presente e legível no bucket

## Lacunas Evolution-db (P1)

| Datas Ausentes | Causa |
|----------------|-------|
| 09, 11, 12, 13, 16/08 | Runs falharam — investigar logs `postgres-backup-daily` |

## Próximos Passos

1. **VERIFICAR R2** (comando acima) — se dump de 24/08 presente: remover marcador, fechar P0, atualizar este doc para ✅
2. **Se R2 vazio:** sentinel mente (função mal-comportada) → executar runbook §2 completo + versionar corpo de `fn_update_backup_sentinel` corrigido
3. **Alerta:** `scripts/alert-missing-dumps.sh` criado (sessão 2026-08-24) — agendar na VPS
4. **P1:** Restore limpo (FK órfã + mv_system_status)
5. **Validar:** pgbackrest (stack 270, drill trimestral)

---

**Referência:** [`infra/runbooks/RESTORE_DRILL.md`](../../infra/runbooks/RESTORE_DRILL.md) §2  
**Status PLANO-100:** [`docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md`](../../docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md) linha 212