# Runbook — Drill de restore de backups (plano-100 etapas 56/57)

> Estado validado **ao vivo em 2026-08-20** · **drill 0-erros executado em 2026-08-24**.
> Última revisão: 2026-08-24.

## 1) Fotografia atual dos backups

### supabase-db (Postgres do Supabase self-hosted — o banco do ZAPP)

| Camada | Estado 2026-08-24 | Evidência |
|---|---|---|
| **Dump lógico local** (stack 124 `supabase-backup`, `BACKUP_MODE=local+r2`) | ✅ SAUDÁVEL — dump de 2026-08-24 09:29 (137 MB), `.sha256` verificado OK | `ls /backups` + `sha256sum -c` no container |
| **Offsite R2** (`backups/supabase-db/daily/`) | ✅ **VERIFICADO 2026-08-24** — cadeia diária contínua 15/08→24/08 sem lacunas; marcador `OFFSITE_FAILED_20260810_211518` removido (stale) | `mc ls` + `mc stat` via Portainer; ver [`P0_OFFSITE_FAILED_STATUS.md`](../operations/P0_OFFSITE_FAILED_STATUS.md) |
| **Config offsite** (`backups/supabase-db/config/`) | ✅ tarballs diários de config chegando ao R2 | listagem R2 |
| **pgbackrest** (stack 270, criado 2026-08-16) | ⚠️ camada nova, **não validada** neste drill | — |
| **Drill de restore** | ✅ **EXECUTADO 2026-08-24** (`drill-restore-20260824.log` + `drill-replay-20260824.log`): bruto 99 erros → **fixups + replay = 0 erros**; 4 FKs revalidadas; MV com dados; sanidade OK (314.917 msgs, 22.440 contatos, 51.688 empresas) | logs no container |
| **Re-drill (auditoria PhD)** | ✅ **2026-08-24 ~20:10 UTC**, dump NOVO 19:08 (150 MB): bruto **108 erros** (mesmas classes: 93 cascata pg_cron + 4 FKs + 2 extensão + 9 cascade extra de views/comments) → fixups **single-shot `ON_ERROR_STOP=1` EXIT=0** (§3: DELETE 1+8+320, UPDATE 14.780 — idêntico ao 1º drill) → 4 FKs VALIDADAS via §4 → replay 86 entradas limpo → **idempotência provada** (2ª execução: 0 rows, EXIT 0) → sanidade 317.646 msgs / 22.489 contatos / 51.688 empresas (MV == count real; `mv_cron=0` = stub vazio documentado) → dropdb | `/tmp/drill2.log` (ephemeral) |

### Decomposição dos 99 erros do drill 2026-08-24

| Causa | Erros | Natureza | Remédio |
|---|---|---|---|
| Cascata pg_cron (mesma instância) | 93 | **Artefato de ambiente** — `CREATE EXTENSION pg_cron` só funciona no banco `postgres`; arrasta 9 views (`v_50_steps_progress`, `v_ai_catalog`, `v_cron_health_24h`, `v_ai_health_summary`, `v_perf_dashboard`), 79 comments e a `mv_system_status` | stubs `cron.job`/`cron.job_run_details` (fixups §0) + replay (§5) — em DR real (instância nova) não ocorre |
| FKs órfãs (4) | 4 | **ACHADO REAL de produção** — órfãos existem no banco principal AGORA: `evolution_whatsapp_status` 14.780 (99,9% da tabela!), `mfa_amr_claims` 320, `contact_intelligence` 8, `conversation_events` 1 | fixups §3 (drill) + ⚠ decisão de dono p/ produção |
| mv_system_status | 2 | subsumida pela cascata cron | fixups §2 / replay |

> **⚠ Achado de produção (decisão do dono pendente):** as 4 FKs estão
> `convalidated=true` no banco principal e ainda assim há 15.109 órfãos — algum
> caminho bypassa FK (bulk ops com `session_replication_role=replica` ou
> semântica divergente de `contact_id`). Recomendação: migration para dropar a
> FK vestigial de `evolution_whatsapp_status` (contact_id referencia outro
> domínio de id) + limpeza pontual das 3 menores (`mfa_amr_claims` 320,
> `contact_intelligence` 8, `conversation_events` 1).

### evolution-db (pg14 — stacks 112/84/85)

| Item | Estado |
|---|---|
| Daily → R2 (`backups/evolution-db/daily/`, retenção 14d, GPG) | ✅ dump de **2026-08-20 02:00** presente (81 MB) |
| **Lacunas** na janela de 14 dias | ⚠️ faltam os dias **09, 11, 12, 13 e 16/08** — runs falharam nesses dias (investigar `postgres-backup-daily` logs) |
| Weekly/monthly | presentes (retenções 35d/365d) |
| Snapshots de credenciais (`backups/evolution-creds-snapshot/`) | ✅ a cada 15 min (watchdog `evolution-creds-snapshot`) |

## 2) AÇÃO PRIORITÁRIA (P0) — ✅ FECHADA (2026-08-24)

O dado local existe e está íntegro; o risco é perder a VPS. Passos:

```bash
# no container supabase-backup_backup (Portainer > console):
cat /backups/OFFSITE_FAILED_20260810_211518          # timestamp da 1ª falha
grep -n -i 'r2\|offsite\|error' /backups/backup_v4.log | tail -30
# testar credencial R2 manualmente (aws cli ou rclone conforme o script backup_v4.sh):
sh /infra/backup/backup_v4.sh --offsite-only --dry-run   # ver flags reais no script
```

Causas prováveis (ordem de verificação) — **a falha começou em 2026-08-10, o
stack 261 `r2-rotation` só existe desde 2026-08-13: a rotação NÃO explica a
falha original, só uma continuação/agravamento a partir de 08-13.** Investigar
os dois períodos separadamente, com logs de cada um:
1. **Período 08-10 → 08-13 (pré-rotação, causa ainda desconhecida)** — checar
   `backup_v4.log` desse intervalo especificamente; credencial R2 rotacionada
   não é hipótese válida aqui.
2. **Período pós-08-13 (rotação como hipótese)** — se a falha persistiu depois
   do stack 261 subir: credencial R2 rotacionada — se rotacionou `r2_backup_*`
   sem atualizar o consumo do stack 124, o upload passa a falhar com 403.
3. Bucket/endpoint alterado.
4. Falha de rede pontual sem retry — o script marca `OFFSITE_FAILED` e não
   reenvia (backfill manual necessário após o conserto).

Após religar: **backfill** dos dumps locais mais recentes para
`backups/supabase-db/daily/`. Só remover o marcador `OFFSITE_FAILED_*` depois
de (a) confirmar que o upload terminou sem erro, (b) conferir o checksum do
objeto no R2 contra o dump local, e (c) validar que o objeto está presente e
legível no bucket. Se qualquer uma dessas checagens falhar, mantenha o
marcador — removê-lo cedo demais esconde o incidente em vez de fechá-lo.

## 3) Procedimento de drill completo (repetir trimestralmente) — PROVADO 2026-08-24

1. **Integridade do artefato (sem tocar em banco):**
   ```bash
   # supabase-db (container supabase-backup_backup):
   cd /backups && sha256sum -c supabase_selfhosted_<mais-recente>.dump.sha256
   pg_restore --list <dump> | wc -l     # TOC legível = arquivo íntegro
   ```
2. **Restore em banco descartável** (nunca no principal):
   ```bash
   export PGPASSWORD=$(cat /run/secrets/supabase_db_password_v1)
   createdb -h supabase_db -U supabase_admin restore_drill_$(date +%Y%m%d)
   pg_restore -h supabase_db -U supabase_admin -d restore_drill_... -j 4 \
     --no-owner --no-acl /backups/<dump> 2>&1 | tee drill-restore-$(date +%Y%m%d).log
   ```
3. **Fixups + replay (0 erros):** [`scripts/sql/restore-drill-fixups.sql`](../../scripts/sql/restore-drill-fixups.sql)
   na ordem §0 (stubs cron) → §3 (órfãos) → §4 (re-add FKs) → §5 (replay `-L`
   das entradas falhadas). Validado 2026-08-24: replay EXIT=0 com 86 entradas.
4. **Sanidade + limpeza:**
   ```bash
   psql -d restore_drill_... -c "select count(*) from evo.evolution_messages;"  # ~315k
   psql -d restore_drill_... -c "select total_messages from zapp.mv_system_status;"
   dropdb -h supabase_db -U supabase_admin restore_drill_...
   ```
5. **Registrar o resultado** neste arquivo (data, dump, erros, sanidade).
   Baselines: E93 2026-08-17 (19 erros ignorados) → **2026-08-24 (0 erros)**.

> Nota: os únicos 2 erros impossíveis no drill same-instance são
> `CREATE EXTENSION pg_cron` + `COMMENT ON EXTENSION` (o pg_cron só existe no
> banco `postgres`). Não contam contra a meta — são artefato de ambiente;
> em DR real (instância nova) não ocorrem.

> Nota da sessão 2026-08-20: a re-execução remota do passo 1 via exec não
> concluiu (env do container `postgres-backup-daily` não expõe as credenciais em
> shell de exec — o `/env.sh` exige `POSTGRES_PASSWORD` do entrypoint). O passo 1
> deve ser rodado pelo console do Portainer no container, onde o entrypoint já
> populou o ambiente.

## 4) O que "pronto" significa para backup (critério ESTADO.md)

- Dump local diário ✅ · Offsite diário ✅ (verificado no R2 em 2026-08-24)
- Drill trimestral com 0 erros ✅ (**atingido 2026-08-24** — restam só os 2
  artefatos pg_cron de same-instance, documentados)
- Lacunas de calendário = alerta (hoje: 5 dias faltando no evolution-db/daily —
  P1 aberto; alerta automatizado: `scripts/alert-missing-dumps.sh`)
