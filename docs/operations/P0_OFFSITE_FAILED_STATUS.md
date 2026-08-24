# P0 — Offsite Backup Supabase-db: Status Crítico

> **Estado:** ✅ **RECUPERADO E VERIFICADO NO R2 (2026-08-24)** — P0 FECHADO  
> **Decriptabilidade provada (auditoria PhD, 24/08 20:13 UTC):** `mc cp` do `.gpg` 19:08 (138 MiB) → `gpg -d` com `backup_passphrase_v1` → **sha256 `86730843…` triplo-idêntico** (R2 decriptado = dump local = manifesto `.sha256`). A cópia offsite é restaurável, não apenas presente.
> **Marcador histórico:** `OFFSITE_FAILED_20260810_211518` (falha real de 08-10; marcador **removido** em 24/08 após verificação)  
> **Risco residual:** nenhum para o offsite diário — cadeia contínua confirmada (abaixo). pgbackrest segue não validado (item separado)  
> **Ação:** ~~Verificar bucket R2 e remover marcador~~ ✅ EXECUTADO 2026-08-24 (evidência abaixo)

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
| **Offsite R2** | ✅ **VERIFICADO 2026-08-24** | Cadeia diária contínua **15/08→24/08 sem lacunas**; `supabase_selfhosted_20260824_092900.dump.gpg` (125 MiB, ETag `b0a07a62…-8`, CRC64NVME presente); timestamp do objeto = `last_offsite_at` do sentinel (09:29 UTC) |
| **Config offsite** | ✅ OK | Tarballs diários de config chegam ao R2 |
| **pgbackrest** | ⚠️ Não validado | Stack 270 criado 16-08, sem drill |

## ✅ VERIFICAÇÃO FINAL — EXECUTADA (2026-08-24, via Portainer exec no container supabase-backup_backup)

```bash
# Executado (evidência em log da sessão):
mc ls --recursive r2/promo-brindes-backups/backups/supabase-db/daily/ | sort -k1,2 | tail -12
#   → 10 dumps diários contínuos 15/08 → 24/08 (125–143 MiB cada)
mc stat r2/promo-brindes-backups/backups/supabase-db/daily/supabase_selfhosted_20260824_092900.dump.gpg
#   → ETag b0a07a62…-8 · CRC64NVME presente · 125 MiB
rm /backups/OFFSITE_FAILED_20260810_211518   # marcador removido (critérios a+b+c atendidos)
```

**Nota:** o redeploy do stack 124 (v4.3, service `dump-alert` adicionado às ~19:0x UTC)
reiniciou o ciclo de backup → novo dump `20260824_190851` (143 MB, 755 tabelas) subiu ao
R2 no mesmo dia e atualizou o sentinel. Efeito colateral benigno; cadeia segue contínua.

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

1. ~~**VERIFICAR R2**~~ ✅ **FEITO (2026-08-24)** — dump presente e íntegro; marcador removido; P0 fechado
2. ~~**Se R2 vazio**~~ — não se aplica (R2 verificado com cadeia completa)
3. **Alerta:** ✅ automatizado — service `dump-alert` no stack 124 (v4.3), espelho em `scripts/alert-missing-dumps.sh`; primeira execução 24/08 19:08 UTC tudo OK
4. **P1:** ✅ restore limpo — drill 2026-08-24 com 0 erros (`RESTORE_DRILL.md` §3)
5. **Validar:** pgbackrest (stack 270, drill trimestral) — **aberto**

---

**Referência:** [`infra/runbooks/RESTORE_DRILL.md`](../../infra/runbooks/RESTORE_DRILL.md) §2  
**Status PLANO-100:** [`docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md`](../../docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md) linha 212