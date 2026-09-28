# Solicitação ao lado `evo` — leitura das tabelas de monitoramento

**De:** Hermes (agente de execução) · repo `adm01-debug/Zapp_Web_V3`
**Para:** responsáveis pelo schema `evo` (repo `evolution-stack`)
**Data:** 28/09/2026 · **PR de referência:** #1618
**Assunto:** conceder leitura a `authenticated` (ou decidir manter fechado) em 22 tabelas de monitoramento, para reabrir 21 views de dashboard que hoje falham fechado.

---

## 1. Situação em uma frase

Endurecemos as views do schema `zapp` com `security_invoker = true` (correto: elas passaram a respeitar a RLS de quem consulta). Como efeito colateral, **21 views de monitoramento ficaram ilegíveis** para usuários logados, porque a tabela-base vive no schema `evo` e **não concede SELECT** a `authenticated`.

Não é vazamento: elas **falham fechado** (erro em vez de dado exposto) e não têm consumidor no código hoje. Mas o dashboard de monitoramento não funciona.

## 2. Por que não resolvemos do nosso lado

O gate **E42** deste repo proíbe DDL novo no schema `evo`:

> "bloqueia DDL NOVO em schema evo via migrations deste repo. O schema evo é fronteira (infra no repo evolution-stack); DDL evo novo exige revisão explícita."

Exceções vivem em `scripts/decouple/evo-ddl-allowlist.txt`. **Não contornamos gate para conceder privilégio** — por isso este pedido é seu, não nosso.

## 3. O que precisamos (por tabela)

Para cada tabela abaixo: `GRANT SELECT ON evo.<tabela> TO authenticated;` **e** uma policy de leitura, já que as policies atuais são apenas para `service_role`:

```sql
-- exemplo, repetir por tabela
GRANT SELECT ON evo.evolution_alert_cooldown TO authenticated;

CREATE POLICY <nome>_select_authenticated ON evo.evolution_alert_cooldown
  FOR SELECT TO authenticated
  USING (<condição que faça sentido para o negócio>);
```

A condição é sua decisão. Onde não houver critério por usuário, `USING (auth.uid() IS NOT NULL)` (qualquer usuário logado) é o padrão que já usamos em `zapp`.

## 4. As 22 tabelas (nomes medidos no catálogo, não digitados)

**Monitoramento/ops — 8 tabelas:**

| # | tabela | view que depende (`zapp.*`) |
|---|---|---|
| 1 | `evo.evolution_alert_cooldown` | `evolution_alert_cooldown` |
| 2 | `evo.evolution_backfill_audit` | `evolution_backfill_audit` |
| 3 | `evo.evolution_bootstrap_log` | `evolution_bootstrap_log` |
| 4 | `evo.evolution_guardian_heartbeat` | `evolution_guardian_heartbeat` |
| 5 | `evo.evolution_pipeline_health_log` | `evolution_pipeline_health_log` |
| 6 | `evo.evolution_pipeline_history` | `evolution_pipeline_history` |
| 7 | `evo.evolution_reconcile_jobs` | `evolution_reconcile_jobs` **e** `v_connection_drift_score` |
| 8 | `evo.evolution_retention_log` | `evolution_retention_log` |

**Histórico de conexão — 1 tabela:**

| 9 | `evo.evolution_connection_history` | `v_connection_drift_score` |
|---|---|---|

**Particionamento de webhook — 12 tabelas:**

`evolution_webhook_events_v2_2026_08`, `_2026_09`, `_2026_10`, `_2026_11`, `_2026_12`, `_2027_01`, `_2027_02`, `_2027_03`, `_2027_04`, `_2027_05`, `_2027_06`, `_default` — todas com prefixo `evo.`, cada uma sustentando a view `zapp.<mesmo nome>`.

> **Atenção de segurança (item 5 abaixo):** as 12 partições carregam **payload cru de webhook**. Podem conter dado de mensagem. Se a decisão for manter fechado, ótimo — só nos digam, e documentamos como "fechado por decisão do dono" em vez de "dívida pendente".

## 5. O que NÃO estamos pedindo (e por quê)

| Objeto | Motivo |
|---|---|
| `evo.evolution_messages` | já concede SELECT a `authenticated` e tem 5 policies — **nada a fazer** ✓ |
| `evo.evolution_contacts` | idem ✓ |
| `zapp.evolution_instance_credentials` | tabela de credenciais (`api_key`, `instance_token`, `vault_secret_id`). **Nunca** deve ser legível por usuário logado |
| `zapp.evolution_instances` | depende da tabela de credenciais acima — fica fechada **por decisão nossa**. Para status de instância a superfície sancionada já existe: `zapp.evolution_instances_public` (decisão do dono do projeto) |
| `cron.job` | `pg_cron` não é de vocês nem nosso; hoje só `postgres`/`supabase_admin` leem |

## 6. Como conferir depois de aplicar

```sql
-- deve retornar linhas para authenticated (antes: permission denied)
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"<uuid-de-um-usuario-real>","role":"authenticated"}';
SELECT count(*) FROM zapp.evolution_alert_cooldown;   -- repetir por view
RESET ROLE;
```

## 7. Se a resposta for "não" para alguma

Sem problema — e sem pressa. Basta dizer **qual** e **por quê**, que registramos no cabeçalho do baseline do INV-9 como decisão do dono. O que não pode acontecer é ficar indefinido: hoje essas views não são lidas por ninguém e a única diferença entre "fechada por decisão" e "fechada por dívida" é esta conversa.

*(Registro técnico completo do caso — medições, simulações e o que foi reprovado — está no PR #1618 do `Zapp_Web_V3`.)*
