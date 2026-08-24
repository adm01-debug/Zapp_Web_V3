# HANDOFF — PLANO-100 Execução (Sessões 2026-08-24)

> **Sessões:** zapp-web-v3-d4 (manhã) + execução do handoff (tarde)  
> **Data:** 2026-08-24  
> **Status:** todos os itens executáveis sem VPS concluídos; restam 5 execuções que exigem acesso VPS/banco

---

## 🎯 OBJETIVO

Executar as pendências do PLANO-100 priorizadas: P0 (offsite backup), P1 (restore limpo, lacunas evolution-db), P2 (drift-gate, decisões dono), janela track_functions (etapas 38/39).

---

## ✅ CONCLUÍDO NESTA EXECUÇÃO (tarde 2026-08-24)

### 1. P0 — Discrepância sentinel × runbook RESOLVIDA (análise de código)

**Veredito:** offsite **provavelmente recuperado** entre 20 e 24/08. Sem acesso VPS/MCP, a análise foi feita 100% via código versionado + logs do GH Actions:

1. **Stack versionado** ([`infra/stacks/supabase-backup.yml`](../infra/stacks/supabase-backup.yml), correção AG-EX-17 de 2026-08-06): passou a gravar sentinel com o **flag real** do upload R2 (antes: `false` hardcoded). Único escritor do sentinel no repo.
2. **Marcador `OFFSITE_FAILED_20260810_211518` é legítimo** — criado por código já corrigido (08-06 < 08-10).
3. **`last_offsite_at` = 24/08 09:29** com código pós-AG-EX-17 ⇒ o `mc cp` para R2 retornou sucesso hoje.
4. Residual: corpo de `ops.fn_update_backup_sentinel` não versionado (não 100% excluível que grave incondicional) → verificação final = listar R2.

**Doc atualizado:** [`docs/operations/P0_OFFSITE_FAILED_STATUS.md`](operations/P0_OFFSITE_FAILED_STATUS.md) — status 🔴→🟡 + comando de verificação (1 linha, no container supabase-backup_backup).

### 2. P2 — Drift-gate INVESTIGADO (decisão do dono: investigar antes do regen)

**Descoberta-chave:** a divergência atual é **4.170 linhas, não 11.995** — o snapshot foi regenerado em 21/08 09:39 (pipeline E41, PR #1354) e o número do doc de validação estava desatualizado.

**Decomposição** (log do run 32711639089, 24/08 09:27):
- **(a) Maioria benigna:** migrations legítimas aplicadas APÓS o regen — sicoob_contact_mapping (`20260821005000`), user_settings/SLA (`20260821010000` + `20260822114406`), materializações do PR #1354. Remédio: regen (rotina).
- **(b) Gap real de I7:** tuning de autovacuum em `zapp.webhook_events_processed` e `zapp.app_notifications` aplicado **direto no banco, sem migration** (grep em `2026082*` = zero menções a autovacuum). **Materializado:** migration [`20260824120000_versiona_autovacuum_webhook_events_app_notifications.sql`](../supabase/migrations/20260824120000_versiona_autovacuum_webhook_events_app_notifications.sql) (idempotente — banco já no estado alvo).

**Doc novo:** [`docs/audits/DRIFT_GATE_INVESTIGACAO_2026-08-24.md`](audits/DRIFT_GATE_INVESTIGACAO_2026-08-24.md) — com caminho pro verde e limitação (diff truncado no log; residual possível).

### 3. Janela track_functions — PACOTE COMPLETO (aprovado pelo dono)

| Artefato | Papel |
|----------|-------|
| [`infra/runbooks/TRACK_FUNCTIONS_JANELA_7D.md`](../infra/runbooks/TRACK_FUNCTIONS_JANELA_7D.md) | Runbook: dia 0 ligar + baseline → dia 7 colher → podar → desligar. Inclui por que NÃO rodar `pg_stat_reset()` |
| [`scripts/sql/track-functions-coleta.sql`](../scripts/sql/track-functions-coleta.sql) | §1 baseline (dia 0) · §2 delta + salvaguardas (trigger/view/default/cron/rpc_boundary) · §2b extensions padrão×custom via `pg_depend deptype='e'` · §3 candidatas |
| [`scripts/sql/track-functions-poda-dryrun.sql`](../scripts/sql/track-functions-poda-dryrun.sql) | Gera DROPs como texto (não executa) + painel de dependentes do catálogo |

### 4. P1 — Restore limpo: FIXUPS MATERIALIZADOS

[`scripts/sql/restore-drill-fixups.sql`](../scripts/sql/restore-drill-fixups.sql) — roda no banco descartável pós-pg_restore:
- §1: limpa órfão da FK `evolution_whatsapp_status_contact_id_fkey` (localiza a tabela pela constraint — imune à topologia zapp/evo; **teto de segurança de 15 órfãos**, acima disso EXCEPTION para investigar)
- §2: recria `zapp.mv_system_status` (definição canônica do snapshot) + REFRESH

Referenciado no runbook: [`RESTORE_DRILL.md`](../infra/runbooks/RESTORE_DRILL.md) §3 passo 4.

### 5. Docs sincronizadas

- [`VALIDACAO_PLANO_100_2026-08-20.md`](plano-100/VALIDACAO_PLANO_100_2026-08-20.md): pendências P0/P1/P2 e etapas 38/39 atualizadas com status ▶️
- Este handoff reescrito

---

## 📦 NÃO COMMITADO — fila para o container VPS (stack 122)

**Regra:** sessão de chat não faz push no main. Arquivos novos/modificados aguardando commit pelo agente VPS:

```
NOVOS:
  supabase/migrations/20260824120000_versiona_autovacuum_webhook_events_app_notifications.sql
  docs/audits/DRIFT_GATE_INVESTIGACAO_2026-08-24.md
  infra/runbooks/TRACK_FUNCTIONS_JANELA_7D.md
  scripts/sql/track-functions-coleta.sql
  scripts/sql/track-functions-poda-dryrun.sql
  scripts/sql/restore-drill-fixups.sql
MODIFICADOS:
  docs/operations/P0_OFFSITE_FAILED_STATUS.md        (veredito 🟡 + comando verificação)
  infra/runbooks/RESTORE_DRILL.md                    (ref fixups §3.4)
  docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md   (P0/P1/P2 + etapas 38/39)
  docs/HANDOFF_PLANO_100_EXECUCAO_2026-08-24.md      (este arquivo)
(+ os da sessão da manhã: etapa 99/65/98, deploy-vps.yml, docker-compose-zapp-web.yml,
   alert-missing-dumps.sh, movimentação docs/audits/ — ver git status)
```

---

## 🔄 RESTA EXECUTAR (tudo exige VPS/banco — ordem sugerida)

| # | Ação | Onde | Comando/ref |
|---|------|------|-------------|
| 1 | **Commit da fila acima** | container VPS (stack 122) | política HERMES.md |
| 2 | **Verificar R2** (fecha P0) | container `supabase-backup_backup` | `mc ls --recursive r2/promo-brindes-backups/backups/supabase-db/daily/ \| sort -k2 \| tail -10` — dump de 24/08 presente? → atualizar P0_OFFSITE_FAILED_STATUS.md p/ ✅ e remover marcador |
| 3 | **Aplicar migration autovacuum** + **regen snapshot** (fecha P2) | db-migrate + `gh workflow run zapp-schema-drift-gate.yml -f regen=true` | ordem: migration ANTES do regen |
| 4 | **Ligar track_functions** (abre janela 7d) | superuser na VPS | runbook TRACK_FUNCTIONS_JANELA_7D.md dia 0 (ligar + baseline §1) |
| 5 | **Drill restore com fixups** (fecha P1) | banco descartável | RESTORE_DRILL.md §3 + restore-drill-fixups.sql — meta 0 erros |
| 6 | (após 7 dias) **Colher track_functions** | VPS | coleta §2/§3 → revisar candidatas → migration de poda → desligar |

**Agendar também:** `scripts/alert-missing-dumps.sh` (criado na sessão da manhã) no cron da VPS.

---

## 💡 NOTAS PARA A PRÓXIMA SESSÃO

1. **Supabase MCP NÃO disponível** nesta sessão (a da manhã tinha). Se precisar de banco sem VPS, verificar MCP antes de planejar.
2. **`gh` CLI funcional** — logs de runs do GH Actions são fonte rica quando o banco está inacessível (foi assim que o drift foi decomposto).
3. **Drift-gate dispara regen via** `gh workflow run zapp-schema-drift-gate.yml -f regen=true` — mas SÓ após aplicar a migration `20260824120000` (senão o DDL direto vira baseline invisível de novo).
4. Os números "11.995 linhas" em docs antigos referem-se a 20/08; atual é 4.170 (24/08).
5. Comunicação sempre em pt-BR (CLAUDE.md).

---

**HANDOFF ATUALIZADO:** 2026-08-24 (tarde)  
**EXECUÇÃO ANTERIOR:** ver seção "CONCLUÍDO" do arquivo versionado no commit — sessões da manhã (5 itens: etapas 99/65/88/98 + P0/P1 docs)
