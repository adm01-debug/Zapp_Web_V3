# Investigação — zapp-schema-drift-gate vermelho (P2, 2026-08-24)

> **Sessão:** zapp-web-v3-d4 (execução do handoff PLANO-100)  
> **Decisão do dono:** investigar a divergência ANTES de regenerar o snapshot  
> **Veredito:** divergência atual = **4.170 linhas** (não 11.995); decomposição abaixo; 1 gap real de I7 encontrado e materializado

## O que mudou desde a medição original

O número "11.995 linhas" (doc de validação 2026-08-20, linha 216) estava desatualizado:

| Data | Evento | Divergência |
|------|--------|-------------|
| 2026-08-20 | Medição original ("drift das 684") | 11.995 linhas |
| **2026-08-21 09:39** | **Snapshot regenerado** (pipeline E41, PR #1354) | — |
| 2026-08-21 16:38 | Migration sicoob_contact_mapping aplicada | +drift |
| 2026-08-22 | Migrations user_settings/SLA aplicadas | +drift |
| **2026-08-24 09:27** | **Run 32711639089 (medição desta investigação)** | **4.170 linhas** |

## Decomposição do diff (hunks do run 32711639089)

### (a) Migrations legítimas sem regen — ~maioria, benigno

Todos os hunks estruturais do diff casam com migrations versionadas aplicadas **após** o regen de 21/08 09:39:

| Hunk | Objeto | Migration correspondente |
|------|--------|--------------------------|
| `@@51985`, `@@59567-59640` | `zapp.sicoob_contact_mapping` (CREATE + constraints) | `20260821005000_recreate_sicoob_contact_mapping.sql` |
| `@@45075` | `zapp.user_settings` +5 colunas SLA/simulation | `20260821010000_fix_user_settings_missing_sla_simulation_columns.sql` |
| `@@45266` | COMMENTs + CHECK `user_settings_sla_thresholds_check` | `20260822114406_fix_user_settings_view_and_sla_check_constraint.sql` |
| (não visíveis, truncados) | materializações de policies/funções | `20260821001000`–`20260821004000` (PR #1354) |

→ Remédio: **regen do snapshot** (rotina; o próprio workflow documenta "use quando migration nova foi aplicada").

### (b) DDL direto no banco sem migration — gap real de I7 ⚠️

Dois hunks de **tuning de autovacuum** sem migration correspondente em `supabase/migrations/` (verificado por grep — nenhuma migration `2026082*` menciona autovacuum):

| Tabela | Mudança (snapshot → banco) |
|--------|---------------------------|
| `zapp.webhook_events_processed` | vacuum_scale_factor `'0'→'0.0001'`, vacuum_threshold `'50000'→'0'` |
| `zapp.app_notifications` | ganhou `vacuum_scale_factor='0.0001'`, `vacuum_threshold='0'`, `vacuum_cost_delay='2'` |

Intervenção operacional manual (tabelas quentes com churn alto), razoável em si — mas invisível a restores e auditorias enquanto não versionada.

→ **Materializada nesta sessão:** migration [`20260824120000_versiona_autovacuum_webhook_events_app_notifications.sql`](../../supabase/migrations/20260824120000_versiona_autovacuum_webhook_events_app_notifications.sql) (idempotente — banco já está no estado alvo).

## Limitação

O log do run trunca o diff (`...` antes do total). A decomposição acima cobre todos os hunks visíveis; **podem existir mais hunks de DDL direto escondidos** nos 4.170. O próximo run após (aplicar migration b + regen) revela qualquer residual — se voltar vermelho com diff novo, repetir a decomposição.

## Caminho para o verde (decisão do dono já obtida: investigar primeiro — feito)

1. Aplicar a migration `20260824120000` (via `db-migrate` ou sessão VPS)
2. Regenerar o snapshot: `gh workflow run zapp-schema-drift-gate.yml -f regen=true`
3. Run seguinte deve ficar **verde**; se não, decompor o diff residual (passo desta investigação)

---

**Evidência:** log completo do run 32711639089 em `/tmp/drift-gate-run-32711639089.log` (sessão local) — header do diff confirma snapshot mtime `2026-08-21 09:39:38` e total `4170 linhas divergentes`.
