# PLANO DE CORREÇÃO E MELHORIA — ARQUITETURA EVOLUTION API
## 100 etapas · 10 subetapas cada · checklist de conclusão

> **Origem:** auditoria exaustiva ao vivo de 2026-09-02 (sessão Claude Code) cobrindo
> Evolution API (stack 25), Baileys/wpp2, RabbitMQ + consumer (stack 113), PG14 dedicado,
> Supabase self-hosted (PG 15.8, schemas `evo`/`zapp`), Redis, pipeline de mídia,
> Cloudflare R2 (`zapp-whatsapp-media`), N8N, watchdogs e pg_cron (239 jobs).
>
> **Estado no momento da auditoria (2026-09-02 ~18:00 UTC):**
> - 🔴 wpp2 em loop `connecting` desde **2026-08-25 17:22 UTC** (DisconnectReason 408) — 0 mensagens desde então (confirmado em Evolution API, PG14 via FDW e `evo.evolution_messages`).
> - 🔴 Consumer RabbitMQ silencioso: stats (`evo.evolution_rabbit_consumer_stats_fdw`) param em **23/08 09:55**; último evento em `evo.evolution_webhook_events_v2` em **27/08 20:30**.
> - 🔴 Watchdogs de reconexão **desativados**: `cron.job` 104 (`wpp2_disconnection_watchdog`) e 120 (`wpp2-session-expiry-watchdog`) com `active=false`.
> - 🔴 Fila de mídia morta desde **10/08**: `evo.media_download_queue` = 3.218 done / **2.883 failed**; `evo.media_cache` = 0 linhas; `evo.media_loss_registry` = **5.075**.
> - 🟠 Webhook nativo da instância aponta para projeto Supabase **Cloud** órfão `tnnnlkbymytvtqngbbqh.supabase.co` (não referenciado em nenhum repo).
> - 🟠 Dump GPG diário do banco Evolution no R2 parado desde **04/05** (`backups/evolution-db/daily/`); offsite do pgbackrest não comprovado.
> - 🟡 Alertas detectaram tudo (`pipeline_silent` 24 abertos, `ingestion_zero_inbound` 14 **sem notificação**, `license_heartbeat` 37) mas nenhuma ação automática/humana ocorreu.
> - 🟡 Supabase PG15 reiniciou em 02/09 15:15 UTC (causa não identificada); alerta `wal_slot_absent` ×3 (slot de analytics ausente).
> - 🟢 Mídia → R2 funcionava até a queda: objeto de 24/08 confirmado byte a byte no bucket (`evolution-api/f7a73e2c-.../...oga`). URLs `mediaUrl` são pré-assinadas com validade 7 dias (design: proxy `zapp-media-proxy` serve o permanente).

### Como usar este plano
- **Ordem:** as fases 1–3 são bloqueantes (produção parada). Fases 4–10 podem intercalar.
- **Marcação:** `[x]` só quando a subetapa foi **executada e verificada** (nunca "deveria funcionar").
- **Cada etapa tem critério de conclusão** = todas as 10 subetapas marcadas.
- **Registro:** ao concluir uma fase, atualizar `ESTADO.md` e a tabela de progresso abaixo.
- Convenção de comandos: SQL = via MCP `supabase_db_query` no self-hosted; PG14 = via FDW `evolution_postgres` ou psql no container; ações Docker = Portainer MCP (resolver ID fresco antes).

### Tabela de progresso

| Fase | Tema | Etapas | Status |
|---|---|---|---|
| 1 | Emergência: restauração da wpp2 | E001–E010 | ⬜ |
| 2 | Consumer RabbitMQ e pipeline de eventos | E011–E020 | ⬜ |
| 3 | Watchdogs e auto-remediação | E021–E030 | ⬜ |
| 4 | Pipeline de mídia e R2 | E031–E040 | ⬜ |
| 5 | Backup e disaster recovery | E041–E050 | ⬜ |
| 6 | Higiene de configuração | E051–E060 | ⬜ |
| 7 | Observabilidade e alertas | E061–E070 | ⬜ |
| 8 | Banco Supabase (PG15) | E071–E080 | ⬜ |
| 9 | Resiliência e hardening | E081–E090 | ⬜ |
| 10 | Validação E2E e prevenção de recorrência | E091–E100 | ⬜ |

---

# FASE 1 — EMERGÊNCIA: RESTAURAÇÃO DA WPP2 (E001–E010)

## E001 — Snapshot de diagnóstico pré-ação
Congelar o estado atual antes de qualquer intervenção, para post-mortem e comparação.
- [ ] E001.1 Registrar `evo_status`/`evo_dashboard` completos em `docs/plano-evolution-2026-09/evidencias/E001-status-pre.json`
- [ ] E001.2 SQL: `SELECT max("messageTimestamp") FROM evo.fdw_evolution_message` — registrar valor (esperado ~1787678356 = 25/08 17:19)
- [ ] E001.3 SQL: contagens `evo.evolution_messages` por dia dos últimos 14 dias — salvar em evidências
- [ ] E001.4 Portainer: `portainer_list_containers` — registrar ID, uptime e health do container evolution (stack 25)
- [ ] E001.5 Portainer: registrar estado das 2 réplicas do consumer (stack 113) e dos watchdogs (stacks 225/230/240)
- [ ] E001.6 Registrar profundidade das filas RabbitMQ (`wpp2.*`, `wpp2.dlq`) via management/`rabbitmqctl list_queues`
- [ ] E001.7 Registrar `zapp.evolution_alerts` abertos por tipo (baseline de alertas)
- [ ] E001.8 Verificar espaço em disco da VPS e do volume `evolution_instances` antes de restart
- [ ] E001.9 Confirmar que o snapshot NÃO inclui secrets nem PII (JIDs, números de telefone, e-mails, API keys) — redigir antes de salvar em evidências
- [ ] E001.10 Commitar evidências no repo (`docs/plano-evolution-2026-09/evidencias/`)

## E002 — Análise dos logs do container evolution
Entender POR QUE o Baileys está em loop 408 há 8 dias antes de reiniciar.
- [ ] E002.1 `portainer_container_logs` do evolution: últimas 2.000 linhas — salvar em evidências
- [ ] E002.2 Grep nos logs: `408|timedOut|connection.update|restart|QR|logged out|stream errored`
- [ ] E002.3 Identificar o padrão do ciclo: intervalo entre tentativas, erro exato retornado pelo WhatsApp
- [ ] E002.4 Verificar se há erro de credencial/sessão (`bad session`, `401`, `logged out`) vs. timeout puro
- [ ] E002.5 Checar logs do `baileys-watchdog` (stack 230): agiu? entrou em cooldown? travou?
- [ ] E002.6 Verificar `evo.baileys_errors`/tabela equivalente no PG14 (producer `baileys_errors` do observer)
- [ ] E002.7 Checar Sentry (DSN do evolution.yml) por eventos de 25/08 em diante
- [ ] E002.8 Verificar memória/CPU do container no período (limite 3G — houve OOM?)
- [ ] E002.9 Cruzar com o commit `0ca8b41` ("para loop infinito de auto-reconnect") — o fix chegou ao runtime? qual digest está rodando vs. `33eb167c` do YML?
- [ ] E002.10 Documentar hipótese de causa raiz em `docs/plano-evolution-2026-09/evidencias/E002-causa-raiz.md`

## E003 — Restart controlado da instância (nível API)
Primeira intervenção, a menos invasiva: restart da instância via Evolution API.
- [ ] E003.1 Confirmar janela: avisar operação (WhatsApp fora há 8 dias — qualquer horário é aceitável, mas registrar)
- [ ] E003.2 Executar `evo_instance_restart` (instância `wpp2`)
- [ ] E003.3 Aguardar 60s e coletar `evo_status` — registrar `state`
- [ ] E003.4 Se `state=open`: pular para E004.5; se `connecting`: aguardar 5 min e repetir leitura
- [ ] E003.5 Se voltar a 408: coletar logs do momento exato da tentativa (janela de 2 min)
- [ ] E003.6 Verificar se o WhatsApp exige novo pareamento (evento QR nos logs / `evo_instance_connect` retorna QR)
- [ ] E003.7 Registrar cada tentativa com timestamp em evidências (máx. 3 tentativas de restart de instância)
- [ ] E003.8 NÃO usar `evo_instance_logout`/`evo_instance_delete` nesta etapa (destrutivo — só na E005 com decisão explícita)
- [ ] E003.9 Se aberto: confirmar `ownerJid=<NUMERO_WPP>@s.whatsapp.net` e perfil "Promo Brindes" — **não registrar o JID real em evidências públicas**
- [ ] E003.10 Atualizar `zapp.instance_registry`/`whatsapp_connections` refletindo o estado real

## E004 — Validação pós-reconexão
Provar com dados que a instância voltou de verdade.
- [ ] E004.1 `evo_status` com `state=open` e `isHealthy=true` por 15 min contínuos
- [ ] E004.2 Enviar mensagem de teste outbound via `evo_send_text` para número interno de controle
- [ ] E004.3 Receber mensagem inbound de teste e confirmar gravação no PG14 (`fdw_evolution_message` com timestamp novo)
- [ ] E004.4 Confirmar replicação no Supabase: linha nova em `evo.evolution_messages` (partição wpp2)
- [ ] E004.5 Confirmar evento correspondente em `evo.evolution_webhook_events_v2` (consumer vivo — senão Fase 2 primeiro)
- [ ] E004.6 Confirmar Realtime no frontend: subscription `schema:'evo'` recebe o CDC da mensagem de teste
- [ ] E004.7 Enviar mídia de teste (imagem) e confirmar upload no R2 (objeto novo em `evolution-api/f7a73e2c-...`)
- [ ] E004.8 Confirmar exibição da mídia no frontend via `zapp-media-proxy`
- [ ] E004.9 Verificar `evo-wpp2-uptime-kpi` (cron 163) registrando uptime novamente
- [ ] E004.10 Registrar horário de restauração e duração total do outage em evidências

## E005 — Recuperação de sessão Baileys (se E003 falhar)
Runbook `Evolution_Api_Stack/runbooks/recover-baileys-session.sql` + decisão de re-pareamento.
- [ ] E005.1 Ler o runbook completo e conferir se as tabelas/paths citados ainda existem no PG14 atual
- [ ] E005.2 Backup da sessão atual: dump das tabelas de sessão/creds do PG14 + snapshot do volume `evolution_instances`
- [ ] E005.3 Executar diagnóstico do runbook (verificar creds corrompidas/pre-keys esgotadas)
- [ ] E005.4 **Decisão com o dono (Joaquim):** limpar sessão = exige novo QR no aparelho `<NUMERO_WPP>` — confirmar com o responsável antes de prosseguir
- [ ] E005.5 Executar limpeza de sessão conforme runbook (somente após aprovação registrada)
- [ ] E005.6 Reiniciar instância e capturar QR via `evo_instance_connect`
- [ ] E005.7 Parear no aparelho físico e confirmar `state=open`
- [ ] E005.8 Rodar validação completa da E004
- [ ] E005.9 Atualizar o runbook com o que divergiu na prática (versão Baileys 7.0.0-rc.9)
- [ ] E005.10 Registrar em `docs/CHANGELOG_SESSIONS.md`

## E006 — Restart do serviço Docker (última alternativa)
Só se E003+E005 falharem: restart do serviço evolution no Swarm, respeitando cooldown.
- [ ] E006.1 Confirmar cooldown de 600s do stack 25 (regra do CLAUDE.md do evolution-stack)
- [ ] E006.2 Verificar digest em execução (`portainer_inspect_service`) — deve ser `33eb167c` ou posterior
- [ ] E006.3 `portainer_container_action restart` no serviço evolution (ou `update --force` no service)
- [ ] E006.4 Acompanhar healthcheck: `start_period=120s`, aguardar `healthy`
- [ ] E006.5 Verificar logs de boot: conexão PG14 ok, Redis db8 ok, RabbitMQ ok, S3/R2 ok
- [ ] E006.6 Verificar que o volume `evolution_instances` foi montado e a sessão carregada
- [ ] E006.7 Acompanhar `connection.update` nos primeiros 5 min
- [ ] E006.8 Se abrir: rodar E004 completa
- [ ] E006.9 Se não abrir: retornar à E005 (sessão) — restart de serviço não resolve sessão inválida
- [ ] E006.10 Registrar downtime adicional causado pelo restart

## E007 — Reingestão e verificação do fluxo contínuo
Depois de reconectado, garantir que o fluxo NORMAL (não só o teste) voltou.
- [ ] E007.1 Monitorar `evo.pg14_message_hourly` por 6 horas — volume compatível com dia útil (~150–400 msgs/h)
- [ ] E007.2 Confirmar `msgs_24h > 0` em `evo.evolution_messages` no Supabase
- [ ] E007.3 Confirmar `zapp.webhook_events_processed` voltando a contar (KPI `v_kpi_webhook_saude.eventos_processados > 0`)
- [ ] E007.4 Verificar auto-resolução dos alertas `pipeline_silent` e `ingestion_zero_inbound` (cron 427)
- [ ] E007.5 Verificar mensagens com mídia entrando e `mediaUrl` presente no PG14
- [ ] E007.6 Conferir contatos/chats atualizando (`evo.evolution_contacts`, `evolution_conversations`)
- [ ] E007.7 Validar entrega outbound de mensagens enviadas pelo frontend zapp (fila de dispatch)
- [ ] E007.8 Verificar `zapp.failed_messages` e `zapp.dispatch_error_logs` — sem acúmulo novo
- [ ] E007.9 Acompanhar 1 dia completo e comparar volume com média histórica (5–6,7 mil/dia)
- [ ] E007.10 Marcar wpp2 como restaurada em `ESTADO.md` com data/hora

## E008 — Verificação do WhatsApp Web/atendimento
Garantir que a equipe de atendimento voltou a operar.
- [ ] E008.1 Confirmar com 2 atendentes que o inbox do zapp exibe conversas novas em tempo real
- [ ] E008.2 Testar envio de texto, imagem, áudio e documento a partir do frontend
- [ ] E008.3 Testar recebimento de áudio/imagem e reprodução via proxy de mídia
- [ ] E008.4 Verificar labels do pipeline (Novo pedido, Pago, Lead) sincronizando
- [ ] E008.5 Verificar `rejectCall` ativo (mensagem automática de ligação recusada)
- [ ] E008.6 Conferir filas/departamentos (`zapp.queues`) distribuindo conversas
- [ ] E008.7 Verificar notificações (`zapp.app_notifications`) chegando via Realtime
- [ ] E008.8 Testar busca de mensagens históricas (pré-outage) no frontend
- [ ] E008.9 Coletar feedback de anomalias residuais da equipe em 48h
- [ ] E008.10 Registrar confirmação operacional em evidências

## E009 — Reconciliação do gap 25/08 → restauração
Mensagens enviadas por clientes durante o outage estão perdidas no WhatsApp? Medir e reconciliar o que for possível.
- [ ] E009.1 Rodar delta FDW (mecanismo da sentinela cron 556 `fdw-delta-sentinel-30min`) na janela 25/08→restauração
- [ ] E009.2 Verificar se o WhatsApp entregou histórico offline na reconexão (`syncFullHistory=false` — provável perda; medir)
- [ ] E009.3 Contar mensagens recebidas na 1ª hora pós-reconexão com timestamp retroativo (offline queue do WhatsApp)
- [ ] E009.4 Comparar PG14 × `evo.evolution_messages` na janela — divergência deve ser 0
- [ ] E009.5 Rodar `whatsapp_reconcile_apply` (cron existente) e registrar resultado
- [ ] E009.6 Listar conversas com última atividade entre 24/08 e 25/08 (clientes possivelmente não respondidos)
- [ ] E009.7 Gerar lista de follow-up para o comercial (clientes que escreveram e não foram atendidos)
- [ ] E009.8 Avaliar comunicação proativa aos clientes afetados (decisão de negócio — registrar decisão)
- [ ] E009.9 Documentar o gap definitivo (mensagens irrecuperáveis) em evidências
- [ ] E009.10 Atualizar `parity_audit` com a janela do incidente

## E010 — Registro formal do incidente
- [ ] E010.1 Escrever timeline: 23/08 (stats param) → 25/08 17:22 (408) → 27/08 20:30 (último evento) → 02/09 (detecção via auditoria) → restauração
- [ ] E010.2 Registrar em `docs/CHANGELOG_SESSIONS.md` e `ESTADO.md`
- [ ] E010.3 Atualizar tabela "Incidentes fechados — NÃO REABRIR" do `CLAUDE.md` com causa raiz + trava
- [ ] E010.4 Calcular impacto: dias de outage × volume médio (≈5.500 msgs/dia ≈ 44.000 mensagens não trafegadas)
- [ ] E010.5 Identificar o porquê de 8 dias sem detecção humana (alertas sem notificação — link com E026/E063)
- [ ] E010.6 Listar os 3 elos quebrados: watchdog desativado, consumer morto, notificação muda
- [ ] E010.7 Definir as travas permanentes (implementadas nas fases 3 e 7)
- [ ] E010.8 Revisar se `DEL_INSTANCE=false` e demais configs contribuíram (não devem mudar sem decisão)
- [ ] E010.9 Post-mortem de 1 página em `docs/plano-evolution-2026-09/POSTMORTEM-20260825.md`
- [ ] E010.10 Commit + PR do post-mortem

---

# FASE 2 — CONSUMER RABBITMQ E PIPELINE DE EVENTOS (E011–E020)

## E011 — Estado real dos serviços do consumer (stack 113)
- [ ] E011.1 `portainer_list_containers`: as 2 réplicas do consumer existem? Desde quando rodam?
- [ ] E011.2 `portainer_container_logs` de cada réplica: últimas 500 linhas
- [ ] E011.3 Procurar nos logs: exceções Python, reconexões AMQP, erros HTTP ao POST no evolution-webhook
- [ ] E011.4 Verificar se a réplica `ac48cd120dfd` (última a reportar stats em 23/08) ainda existe
- [ ] E011.5 Conferir healthcheck (socket rabbitmq:5672) passando
- [ ] E011.6 Verificar memória (limite 512M) — OOM kill no histórico?
- [ ] E011.7 Conferir versão em execução = `consumer@v8.2` (digest `f6dd6eb5`)
- [ ] E011.8 Verificar env `SUPABASE_URL` apontando para o self-hosted (`supabase.atomicabr.com.br/functions/v1/evolution-webhook`)
- [ ] E011.9 Verificar `SHADOW_MODE=false` e `INSTANCE_PREFIX=wpp2` no runtime
- [ ] E011.10 Documentar diagnóstico: consumer travado, morto ou sem eventos para consumir?

## E012 — Diagnóstico do RabbitMQ
- [ ] E012.1 Localizar o serviço rabbitmq no Swarm (stack/ID) e seu uptime
- [ ] E012.2 `rabbitmqctl list_queues name messages consumers` — registrar TODAS as filas `wpp2.*`
- [ ] E012.3 Verificar profundidade de `wpp2.dlq` (dlq-ops F2-23 alerta em depth>50)
- [ ] E012.4 Verificar se o exchange `evolution` existe com bindings corretos para as filas wpp2
- [ ] E012.5 Conferir consumers conectados em cada fila (esperado: 2 do consumer + dlq-ops na dlq)
- [ ] E012.6 Verificar memória/disco do RabbitMQ (watermarks) — fila acumulada por 8 dias?
- [ ] E012.7 Verificar usuários/permissões: `evolution_v2` (publish) e `consumer_v1`/`dlq_ops` (consume)
- [ ] E012.8 Checar logs do RabbitMQ por desconexões em 23–27/08
- [ ] E012.9 Se houver backlog: estimar tempo de drenagem antes de religar tudo
- [ ] E012.10 Registrar snapshot das filas em evidências

## E013 — Por que os stats do consumer pararam em 23/08
- [ ] E013.1 Ler o código do consumer (repo evolution-stack, imagem) na parte de `STATS_CHANNEL=dual`
- [ ] E013.2 Verificar a edge function `evolution-consumer-stats` no self-hosted (existe? responde?)
- [ ] E013.3 Testar POST manual assinado (HMAC `stats_http_hmac_v1`) no endpoint de stats
- [ ] E013.4 Verificar canal secundário de stats (gravação direta no PG? tabela de destino do FDW)
- [ ] E013.5 Correlacionar 23/08 09:55 com eventos do host (deploy? restart? rotação de secret?)
- [ ] E013.6 Verificar validade do secret `stats_http_hmac_v1` no Swarm
- [ ] E013.7 Distinguir: stats pararam mas consumo continuou (eventos até 27/08) — confirmar nos logs
- [ ] E013.8 Corrigir o canal de stats (fix mínimo no que estiver quebrado)
- [ ] E013.9 Validar: nova linha em `evo.evolution_rabbit_consumer_stats_fdw` com `collected_at` atual
- [ ] E013.10 Criar verificação de frescor de stats (integra com E020)

## E014 — Validação do HMAC consumer → evolution-webhook
Garantir que, com tráfego de volta, os eventos NÃO serão rejeitados por assinatura.
- [ ] E014.1 Confirmar qual secret a edge function `evolution-webhook` valida (vault/env do self-hosted)
- [ ] E014.2 Confirmar qual secret o consumer usa (`supabase_evolution_webhook_secret_v3` → target v1)
- [ ] E014.3 Comparar fingerprints (nunca logar o valor) — divergência = causa de rejeição futura
- [ ] E014.4 Enviar evento de teste assinado pelo consumer (modo manual/replay de 1 evento)
- [ ] E014.5 Confirmar `zapp.webhook_audit_log` com `status` de sucesso (não `rejected`)
- [ ] E014.6 Confirmar processamento: linha em `zapp.webhook_events_processed`
- [ ] E014.7 Verificar tratamento de retry do consumer em 5xx (`retry_by 5xx:502` visto nos stats)
- [ ] E014.8 Verificar idempotência: reenviar o mesmo evento e confirmar dedupe por `idempotency_key`
- [ ] E014.9 Documentar a cadeia de secrets do webhook em `docs/SECRETS_INVENTORY.md`
- [ ] E014.10 Registrar teste E2E de assinatura em evidências

## E015 — Religar/redeploy do consumer
- [ ] E015.1 Se diagnóstico E011 = travado/morto: `portainer_update_service --force` no consumer (start-first, seguro)
- [ ] E015.2 Acompanhar boot das 2 réplicas nos logs (conexão AMQP + prefetch)
- [ ] E015.3 Confirmar consumo: profundidade das filas wpp2.* caindo
- [ ] E015.4 Confirmar POSTs chegando: `zapp.webhook_audit_log` com eventos reais (não só probe)
- [ ] E015.5 Confirmar `evo.evolution_webhook_events_v2` com `created_at` atual
- [ ] E015.6 Monitorar taxa de erro (`err`, `drop`) nos stats religados
- [ ] E015.7 Verificar CPU/memória das réplicas sob drenagem de backlog
- [ ] E015.8 Sem backlog residual após drenagem: filas ~0 em regime
- [ ] E015.9 Rodar por 24h e revisar logs por warnings recorrentes
- [ ] E015.10 Registrar restauração do consumer em `ESTADO.md`

## E016 — Drenagem e triagem da DLQ
- [ ] E016.1 Contar mensagens em `wpp2.dlq` e classificar por causa (headers x-death)
- [ ] E016.2 Verificar tabela de triagem do dlq-ops (status `pending`/`drained`/`ready_for_replay`/`poison`)
- [ ] E016.3 Conferir se o inspector (stack 224) está rodando e drenando (DRAIN_INTERVAL 300s)
- [ ] E016.4 Marcar elegíveis para replay (attempts<5) conforme fluxo v1.4
- [ ] E016.5 Executar `replay-dlq-upsert.py`/`replay_dlq_all.py` com filtro `ready_for_replay` (batch 200)
- [ ] E016.6 Confirmar upserts no destino sem duplicar mensagens (idempotência)
- [ ] E016.7 Revisar mensagens `poison` (attempts≥5): amostrar 10, decidir descarte documentado
- [ ] E016.8 Zerar DLQ ou justificar resíduo
- [ ] E016.9 Versionar o `alert-guard` do stack 224 (pendência declarada no YML — "NAO versionado")
- [ ] E016.10 Registrar contagens antes/depois em evidências

## E017 — Replay/recuperação de eventos perdidos (23–27/08)
- [ ] E017.1 Delimitar a janela real de perda de eventos downstream (últimos processados vs. PG14)
- [ ] E017.2 Como o PG14 tem as mensagens até 25/08: verificar se `evo.evolution_messages` (Supabase) tem TODAS até 25/08
- [ ] E017.3 Rodar reconcile FDW na janela definida por E017.1 (datas do último evento PG14 downstream até o último evento válido pré-outage — não usar janela hardcoded 20/08–28/08 que pode ficar obsoleta; mecânica: delta PG14 × evo, conforme F-002)
- [ ] E017.4 Para deltas >0: reimportar via caminho de reconcile existente (`whatsapp_reconcile_apply`)
- [ ] E017.5 Verificar eventos não-message perdidos (contacts/chats update) — impacto e recuperação via sync
- [ ] E017.6 Confirmar `evo.evolution_contacts` sem buracos (count e updated_at na janela)
- [ ] E017.7 Confirmar conversas com `updated_at` coerente pós-reconcile
- [ ] E017.8 Validar KPIs `monitoring.v_kpi_*` refletindo dados reconciliados
- [ ] E017.9 Delta final = 0 documentado
- [ ] E017.10 Registrar procedimento executado em evidências

## E018 — Auditoria de bindings, eventos e roteamento
- [ ] E018.1 Listar os 17 eventos habilitados no RABBITMQ_EVENTS_* do evolution.yml vs. o que as filas recebem
- [ ] E018.2 Confirmar `RABBITMQ_EVENTS_QRCODE_UPDATED=false` (evita vazamento de QR em fila)
- [ ] E018.3 Verificar se todos os eventos consumidos têm handler no consumer (nenhum drop silencioso)
- [ ] E018.4 Verificar TTL/limites de fila (mensagens acumuladas por 8 dias não devem expirar silenciosamente — conferir policy)
- [ ] E018.5 Confirmar `RABBITMQ_GLOBAL_ENABLED=false` (somente wpp2)
- [ ] E018.6 Documentar o mapa evento→fila→handler→tabela em `docs/ARCHITECTURE_AND_FLOW.md`
- [ ] E018.7 Verificar ack/nack strategy do consumer (requeue vs. dlq) no código
- [ ] E018.8 Testar 1 evento de cada tipo principal (message, contact, chat, connection) E2E
- [ ] E018.9 Conferir ordem/duplicação sob 2 réplicas (prefetch e partição por fila)
- [ ] E018.10 Registrar auditoria completa em evidências

## E019 — Frescor contínuo do pipeline de eventos
- [ ] E019.1 Criar/validar view de frescor: idade do último evento em `evo.evolution_webhook_events_v2`
- [ ] E019.2 Validar `v2-pipeline-heartbeat` (cron 176) usando essa medida
- [ ] E019.3 Ajustar `evolution-pipeline-probe-15min` (cron 182) para falhar quando idade>30min em horário comercial
- [ ] E019.4 Garantir que `pipeline_silent` usa horas reais (hoje mostra "9999.0 horas" — cap/format bug)
- [ ] E019.5 Corrigir o cálculo/format do alerta (valor real de horas desde o último evento)
- [ ] E019.6 Testar o alerta com janela sintética
- [ ] E019.7 Integrar com notificação humana (dependência E063)
- [ ] E019.8 Documentar SLO: eventos com atraso máx. 5 min em horário comercial
- [ ] E019.9 Medir latência fim-a-fim (messageTimestamp → processed_at) e registrar baseline
- [ ] E019.10 Adicionar a medição ao dashboard (E064)

## E020 — Watchdog de consumer parado (novo)
A falha "stats param mas ninguém percebe" não pode se repetir.
- [ ] E020.1 Criar função SQL `zapp.fn_consumer_stats_stale_alert()` — alerta se `max(collected_at) IS NULL OR max(collected_at) < now()-interval '15 min'` (cobre tanto ausência total de linhas quanto dados estagnados)
- [ ] E020.2 Criar cron job (padrão dos watchdogs existentes) a cada 10 min
- [ ] E020.3 Inserir em `zapp.evolution_alerts` com `alert_type='consumer_stats_stale'`, severity high
- [ ] E020.4 Integrar ao canal warroom N8N (`https://n8n.atomicabr.com.br/webhook/warroom-alert`)
- [ ] E020.5 Testar: pausar stats artificialmente e confirmar alerta em ≤15 min
- [ ] E020.6 Adicionar auto-resolve quando stats voltam (padrão cron 427)
- [ ] E020.7 Segunda camada: watchdog de `evolution_webhook_events_v2` stale >30min em horário comercial
- [ ] E020.8 Migration versionada no repo (workaround do apply_migration self-hosted: `supabase_db_query` + INSERT em `schema_migrations`)
- [ ] E020.9 Espelho da migration commitado em `supabase/migrations/`
- [ ] E020.10 Documentar no runbook de operações

---

# FASE 3 — WATCHDOGS E AUTO-REMEDIAÇÃO (E021–E030)

## E021 — Inventário completo de watchdogs
Hoje há watchdogs em 3 camadas (pg_cron, containers Swarm, N8N) com sobreposição e lacunas.
- [ ] E021.1 Listar todos os cron jobs de watchdog/alerta (`SELECT jobid, jobname, schedule, active FROM cron.job WHERE ...`) — base: 104, 120, 33, 34, 55, 142, 161, 163, 176, 182, 184, 208, 213, 427, 429, 460, 461, 483, 484, 524, 556, 565
- [ ] E021.2 Listar containers de watchdog (stacks 225 observer, 230 whatsapp-watchdog, 240 evolution-watchdogs, 262 guardian, liveness, redis-health, wal-slot-guard, ag6-watchdogs, ops-guards)
- [ ] E021.3 Listar workflows N8N de alerta (warroom-alert e derivados)
- [ ] E021.4 Montar matriz: sinal monitorado × quem monitora × quem age × quem notifica
- [ ] E021.5 Marcar duplicidades (mesmo sinal em 2+ camadas) e lacunas (sinal sem dono)
- [ ] E021.6 Identificar TODOS os watchdogs desativados e o motivo histórico de cada desativação
- [ ] E021.7 Confirmar que nenhum watchdog ativo aponta para recursos extintos (ex.: v13 migrou webhook-check p/ events_v2)
- [ ] E021.8 Salvar matriz em `docs/plano-evolution-2026-09/MATRIZ_WATCHDOGS.md`
- [ ] E021.9 Validar a matriz com o dono (decisão de qual camada é canônica por sinal)
- [ ] E021.10 Commitar matriz no repo

## E022 — Reativar cron 104 (`wpp2_disconnection_watchdog`) com revisão
- [ ] E022.1 Ler o `command` completo do job 104 e a função que ele chama
- [ ] E022.2 Descobrir POR QUE foi desativado (histórico em CHANGELOG_SESSIONS/commits) — não reativar às cegas
- [ ] E022.3 Revisar a ação do watchdog: o que ele faz ao detectar desconexão (restart? alerta?)
- [ ] E022.4 Garantir guarda anti-flapping (não reiniciar em desconexões <5 min, conforme regra da wpp2)
- [ ] E022.5 Garantir cooldown entre ações (evitar loop de restart)
- [ ] E022.6 Corrigir o que motivou a desativação original
- [ ] E022.7 `UPDATE cron.job SET active=true WHERE jobid=104` (via migration versionada)
- [ ] E022.8 Testar em janela controlada: simular estado `connecting` >30 min e verificar ação
- [ ] E022.9 Confirmar execuções `succeeded` em `cron.job_run_details` por 48h
- [ ] E022.10 Documentar no runbook + ESTADO.md

## E023 — Reativar cron 120 (`wpp2-session-expiry-watchdog`) com revisão
- [ ] E023.1 Ler o `command` do job 120 e a função associada
- [ ] E023.2 Levantar motivo da desativação (mesmo processo da E022)
- [ ] E023.3 Validar o critério de "sessão expirada" contra o comportamento do Baileys 7.0.0-rc.9
- [ ] E023.4 Definir ação segura: alertar sempre; agir (restart) só com critérios estritos
- [ ] E023.5 Corrigir o que motivou a desativação
- [ ] E023.6 Reativar via migration versionada
- [ ] E023.7 Teste controlado do disparo
- [ ] E023.8 Monitorar 48h de execuções
- [ ] E023.9 Conferir integração com o alerta warroom
- [ ] E023.10 Documentar

## E024 — Auditoria do baileys-watchdog (container, stack 230)
- [ ] E024.1 Verificar se o serviço está rodando e desde quando
- [ ] E024.2 Ler logs do período 25/08–02/09: ele detectou o 408? tentou agir?
- [ ] E024.3 Revisar a lógica de cooldown compartilhado (volume `cooldown`) — bug de future-timestamp já teve fix v2.1; validar
- [ ] E024.4 Conferir `ALERT_GAP_MIN=30` / `GAP_MIN=60` — thresholds adequados?
- [ ] E024.5 Verificar se ele usa a API key atual (`evolution_api_key_v7_20260814`)
- [ ] E024.6 Testar a ação dele manualmente (modo dry-run se existir)
- [ ] E024.7 Decidir sobreposição com crons 104/120 (matriz E021): quem é o autoritativo para restart
- [ ] E024.8 Corrigir/simplificar para uma única cadeia de decisão
- [ ] E024.9 Atualizar YML canônico no repo evolution-stack se houver mudança
- [ ] E024.10 Registrar em evidências por que ele não salvou a wpp2 em 25/08

## E025 — Teste de caminho completo detecção→ação
- [ ] E025.1 Definir cenário de teste: instância em `connecting` forçado (janela de manutenção anunciada)
- [ ] E025.2 Executar o cenário com todos os watchdogs ativos
- [ ] E025.3 Medir tempo até detecção (alerta criado)
- [ ] E025.4 Medir tempo até ação (restart automático)
- [ ] E025.5 Medir tempo até notificação humana
- [ ] E025.6 MTTR alvo: detecção ≤5 min, ação ≤15 min, notificação ≤15 min — comparar
- [ ] E025.7 Corrigir os elos que estourarem o alvo
- [ ] E025.8 Repetir o teste até passar
- [ ] E025.9 Registrar resultados em evidências
- [ ] E025.10 Agendar re-teste trimestral (rotina E099)

## E026 — Corrigir o elo de notificação (alertas mudos)
`ingestion_zero_inbound` teve 14 alertas com `sem_notificacao=14` — detecção sem ninguém saber.
- [ ] E026.1 Mapear o campo `notified_at` de `zapp.evolution_alerts`: quem deveria preenchê-lo e por qual canal
- [ ] E026.2 Identificar por que `ingestion_zero_inbound`, `wal_slot_absent`, `evo_guardian_*` e `ddl_drop_alert` não notificam
- [ ] E026.3 Conferir a função/cron de despacho de notificações (existe? está ativa?)
- [ ] E026.4 Definir matriz severidade×canal: critical → WhatsApp/telefone do dono; high → warroom N8N; info → digest diário
- [ ] E026.5 Implementar despacho para os tipos hoje mudos
- [ ] E026.6 Testar cada tipo de alerta com disparo sintético e confirmar recebimento real
- [ ] E026.7 Garantir dedupe/cooldown (não spammar 37 alertas de license_heartbeat)
- [ ] E026.8 Zerar o backlog: resolver ou notificar os alertas abertos atuais
- [ ] E026.9 Criar verificação semanal de `sem_notificacao > 0` (query na v_kpi_alertas)
- [ ] E026.10 Documentar a matriz de notificação no runbook

## E027 — Revisar auto-resolve de alertas (cron 427)
- [ ] E027.1 Ler o UPDATE completo do `auto-resolve-pipeline-alerts`
- [ ] E027.2 Listar quais `alert_type` ele resolve automaticamente e com que idade
- [ ] E027.3 Verificar se ele mascarou o incidente (resolveu alertas críticos sem humano ver)
- [ ] E027.4 Regra: auto-resolve SÓ quando a condição saneou de fato (ex.: pipeline voltou), nunca por idade
- [ ] E027.5 Ajustar o SQL conforme a regra
- [ ] E027.6 Garantir que alerta auto-resolvido registre `resolved_by='auto-resolve-cron'` + condição verificada
- [ ] E027.7 Testar: alerta com condição persistente NÃO pode ser resolvido
- [ ] E027.8 Testar: alerta com condição sanada resolve em ≤3 min
- [ ] E027.9 Migration versionada
- [ ] E027.10 Documentar

## E028 — Consolidar duplicidades de watchdogs
- [ ] E028.1 A partir da matriz E021, listar sinais com 2+ vigilantes (ex.: mídia tem crons 142, 213, 524 + watchdog-media-links 461)
- [ ] E028.2 Para cada duplicidade: eleger o canônico (critério: menor latência + ação mais segura)
- [ ] E028.3 Desativar os redundantes VIA MIGRATION (documentado, reversível) — nunca deletar
- [ ] E028.4 Garantir que o canônico cobre 100% do que os desativados cobriam
- [ ] E028.5 Rodar 1 semana e conferir que nenhum sinal ficou órfão
- [ ] E028.6 Atualizar a matriz com o estado final
- [ ] E028.7 Reduzir ruído em `cron.job_run_details` (menos jobs = menos volume)
- [ ] E028.8 Conferir `docs/ops/CRON-MATRIX.md` e atualizar
- [ ] E028.9 Revisar consumo de CPU dos watchdogs containerizados (limites 0.10 ok)
- [ ] E028.10 Commit da consolidação

## E029 — Runbook de escalonamento humano
- [ ] E029.1 Escrever runbook: "wpp2 caiu e a automação não resolveu em 30 min — o que fazer"
- [ ] E029.2 Incluir sequência exata: evo_status → logs → restart instância → recover-session → restart serviço
- [ ] E029.3 Incluir comandos copy-paste (MCP e SQL) validados nesta auditoria
- [ ] E029.4 Incluir critérios de decisão para re-pareamento QR
- [ ] E029.5 Incluir contatos/canal de escalonamento
- [ ] E029.6 Incluir o que NUNCA fazer (logout/delete instance, restart stack 25 sem cooldown 600s)
- [ ] E029.7 Revisar com o dono
- [ ] E029.8 Publicar em `Evolution_Api_Stack/runbooks/ESCALATION_WPP2.md`
- [ ] E029.9 Referenciar no CLAUDE.md dos dois repos
- [ ] E029.10 Testar o runbook com uma pessoa que não o escreveu

## E030 — Teste de caos controlado (validação da fase)
- [ ] E030.1 Planejar janela de teste com o dono (fora de horário comercial)
- [ ] E030.2 Cenário 1: matar o consumer → alerta consumer_stats_stale em ≤15 min (E020)
- [ ] E030.3 Cenário 2: pausar entrega de eventos → pipeline_silent com horas corretas + notificação (E019/E026)
- [ ] E030.4 Cenário 3: instância `connecting` >15 min → watchdog age (E022–E024)
- [ ] E030.5 Cenário 4: fila de mídia parada → media-queue-stalled-alert notifica (E026)
- [ ] E030.6 Restaurar tudo e confirmar auto-resolve correto (E027)
- [ ] E030.7 Registrar MTTD/MTTR de cada cenário
- [ ] E030.8 Corrigir falhas encontradas e repetir o cenário que falhou
- [ ] E030.9 Relatório do teste em evidências
- [ ] E030.10 Marcar Fase 3 como concluída no progresso

---

# FASE 4 — PIPELINE DE MÍDIA E CLOUDFLARE R2 (E031–E040)

## E031 — Identificar o consumidor da `media_download_queue`
A fila está morta desde 10/08 e o ESTADO.md diz "religar é decisão do dono" — primeiro, saber QUEM é o worker.
- [ ] E031.1 Grep no zapp: quem lê `media_download_queue` com lock (`worker_id`, `locked_at`) — edge function ou cron?
- [ ] E031.2 Verificar edge functions candidatas (`contact-media`, `download-wa-status-media`, `migrate-media-storage`) e o gateway evolution client
- [ ] E031.3 Verificar se o worker era um container/N8N workflow desativado (procurar nos 254 workflows)
- [ ] E031.4 Ler `evo.media_download_queue`: valores históricos de `worker_id` dos `done` (identifica o worker antigo)
- [ ] E031.5 Levantar por que parou em 10/08 (deploy? desativação deliberada? erro fatal)
- [ ] E031.6 Ler os erros dos 2.883 `failed` (`error_message` agrupado) e classificar
- [ ] E031.7 Verificar se o design mudou: com S3 nativo da Evolution ativo desde quando? (a fila pode ser legado parcial)
- [ ] E031.8 Decidir com o dono: religar o worker OU aposentar a fila formalmente (S3 nativo cobre o caso?)
- [ ] E031.9 Documentar a decisão arquitetural (ADR curto em `docs/decouple/` ou `docs/plano-evolution-2026-09/`)
- [ ] E031.10 Registrar achados em evidências

## E032 — Religar (ou aposentar) o worker de downloads
- [ ] E032.1 Se religar: restaurar o worker identificado na E031 (redeploy/reativação)
- [ ] E032.2 Processar um lote de teste de 10 itens e confirmar `done` + objeto no R2
- [ ] E032.3 Se aposentar: desativar crons associados (10, 445, 446, 524 etc.) via migration documentada
- [ ] E032.4 Se aposentar: marcar a fila como legado no schema (comment) e congelar inserts
- [ ] E032.5 Garantir que o caminho substituto (S3 nativo) cobre TODOS os tipos de mídia (S3_SAVE_VIDEO=true ok; conferir docs/stickers/áudio)
- [ ] E032.6 Verificar mídia outbound (enviada pelo zapp) — também vai ao R2?
- [ ] E032.7 Confirmar `media_status_target` e integrações dependentes da fila (quem lê `storage_path`?)
- [ ] E032.8 Rodar 48h e medir: mídias novas × objetos novos no R2 (paridade 100%)
- [ ] E032.9 Atualizar `ESTADO.md` fechando o P1 de 20/08
- [ ] E032.10 Atualizar CLAUDE.md (seção de mídia)

## E033 — Triagem dos 2.883 `failed`
- [ ] E033.1 `SELECT error_message, count(*) FROM evo.media_download_queue WHERE status='failed' GROUP BY 1`
- [ ] E033.2 Separar: URL pré-assinada expirada (>7d) × erro de rede × erro de credencial × mídia removida do WhatsApp
- [ ] E033.3 Cruzar com `media_loss_registry` (5.075) — sobreposição?
- [ ] E033.4 Para itens com `media_key`+`direct_path` válidos: viáveis de rebaixar via `evo_media_download` (WhatsApp re-fetch)
- [ ] E033.5 Amostrar 20 itens e testar recuperação real
- [ ] E033.6 Medir taxa de sucesso da amostra e extrapolar o recuperável
- [ ] E033.7 Classificar irrecuperáveis (mídia >30d no WhatsApp geralmente morre) e mover para `media_loss_archive`
- [ ] E033.8 Fila limpa: só itens acionáveis permanecem
- [ ] E033.9 Registrar estatística final (recuperados/perdidos/arquivados)
- [ ] E033.10 Commit do relatório de triagem

## E034 — Reprocessamento em massa dos recuperáveis
- [ ] E034.1 Preparar batch com throttle (respeitar rate limit do WhatsApp/Evolution)
- [ ] E034.2 Reprocessar em lotes de 100 com pausa (fora de horário de pico)
- [ ] E034.3 Monitorar `retry_count`/`next_retry_at` e o cron `retry-stuck-media-queue` cooperando
- [ ] E034.4 Confirmar objetos chegando no R2 (contagem antes/depois via `cf_r2_list` por prefixo)
- [ ] E034.5 Atualizar `storage_path` dos recuperados
- [ ] E034.6 Verificar consumo de banda/CPU durante o reprocessamento
- [ ] E034.7 Repetir até fila estabilizar (só `done`/arquivados)
- [ ] E034.8 Validar amostra de 10 mídias reprocessadas abrindo no frontend
- [ ] E034.9 Registrar números finais
- [ ] E034.10 Atualizar evidências

## E035 — Auditoria do `media_loss_registry` (5.075 perdas)
- [ ] E035.1 Distribuição por data/tipo/instância das perdas
- [ ] E035.2 Correlacionar clusters de perda com incidentes conhecidos (14/08 outage, 10/08 parada do worker)
- [ ] E035.3 Verificar quantas perdas têm mensagem correspondente viva no PG14 (recuperável via re-download)
- [ ] E035.4 Tentar recuperação da fração viável (mesmo fluxo E033/E034)
- [ ] E035.5 Mover irrecuperáveis para `media_loss_archive` com motivo
- [ ] E035.6 Verificar o cron `media-loss-retry-purge` (525) — política de retry/purge adequada?
- [ ] E035.7 Definir meta: `media_loss_registry` ativo próximo de zero em regime
- [ ] E035.8 Criar KPI de perda de mídia (novas perdas/dia) no dashboard
- [ ] E035.9 Alerta para novas perdas acima de threshold (10/dia)
- [ ] E035.10 Documentar

## E036 — `media_cache` vazia: validar design
- [ ] E036.1 Levantar quem escreveria em `media_cache` (file_hash, storage_path) — dedupe por hash?
- [ ] E036.2 Verificar `media_dedupe_log` — o dedupe rodou algum dia?
- [ ] E036.3 Decidir: implementar o preenchimento OU aposentar a tabela (comment + doc)
- [ ] E036.4 Se implementar: popular a partir dos objetos R2 existentes (backfill de hash)
- [ ] E036.5 Medir ganho real de dedupe (catálogos PDF repetidos, ex.: mesmo etag visto em 2 JIDs no R2)
- [ ] E036.6 Se aposentar: remover referências no código
- [ ] E036.7 Revisar `_unknown_media_backfill_20260820` e `media_orphan_triage` — resolver e limpar tabelas temporárias
- [ ] E036.8 Revisar `media_quarantine` e o fluxo de segurança (integração com scan-media-security, cron 41)
- [ ] E036.9 Atualizar dicionário de banco (`docs/DICIONARIO-BANCO.md`)
- [ ] E036.10 Migration/commit do que for decidido

## E037 — Corrigir o probe E2E de mídia (falso verde)
`e2e-media-probe-hourly` passou às 17:30 de 02/09 com o pipeline morto — probe não prova nada.
- [ ] E037.1 Ler a função do probe (crons 339/340) — o que ele de fato testa?
- [ ] E037.2 Identificar o falso verde: provavelmente testa só a config/endpoint, não o fluxo real
- [ ] E037.3 Redesenhar: probe deve verificar "última mídia recebida tem objeto correspondente no R2" (idade máx. 24h em dia útil)
- [ ] E037.4 Implementar verificação de existência no R2 (via worker proxy HEAD ou tabela de paridade)
- [ ] E037.5 Alertar `e2e_media_probe` FAIL quando paridade quebrar
- [ ] E037.6 Testar o probe contra o estado atual (deve FALHAR com a fila morta — prova do fix)
- [ ] E037.7 Confirmar probe verde após E032/E034
- [ ] E037.8 Integrar à notificação (E026)
- [ ] E037.9 Migration versionada
- [ ] E037.10 Documentar o contrato do probe

## E038 — Proxy de mídia e URLs assinadas no frontend
- [ ] E038.1 Auditar `src/lib/useMediaUrl.ts` e `mediaUrl.ts` (ADR-004): **signed URL TTL 1h** (para acesso imediato via Supabase Storage) vs. **`mediaUrl` com validade 7 dias** (URL pré-assinada gravada no banco pelo consumer, servida pelo proxy permanente `zapp-media-proxy`) — verificar que ambas as rotas funcionam pós-outage e que o frontend usa a rota correta por contexto
- [ ] E038.2 Testar `zapp-media-proxy.adm01.workers.dev` com um path real do R2 (200 + content-type correto)
- [ ] E038.3 Verificar autenticação/limites do worker (não pode ser open proxy do bucket)
- [ ] E038.4 Conferir CORS do worker para os domínios do zapp
- [ ] E038.5 Testar mídia antiga (URL do banco expirada) sendo servida via proxy — cadeia completa
- [ ] E038.6 Verificar tratamento de 404 no frontend (mídia perdida → placeholder, não quebra)
- [ ] E038.7 Medir latência do proxy (P50/P95) — cache do worker configurado?
- [ ] E038.8 Verificar logs/analytics do worker no Cloudflare (erros 5xx?)
- [ ] E038.9 Documentar a rota de leitura de mídia em `docs/ARCHITECTURE_AND_FLOW.md`
- [ ] E038.10 Registrar testes em evidências

## E039 — Reconciliação R2 × banco
- [ ] E039.1 Inventariar o bucket por prefixo (contagem/bytes por instanceId — atenção: 2 instanceIds históricos `7676538d` e `f7a73e2c`)
- [ ] E039.2 Comparar mensagens com mídia no PG14 × objetos no R2 (paridade por período)
- [ ] E039.3 Listar objetos órfãos no R2 (sem mensagem correspondente) — candidatos de limpeza futura
- [ ] E039.4 Listar mensagens com mídia sem objeto (perdas não registradas) e alimentar `media_loss_registry`
- [ ] E039.5 Verificar `_probe/` e `_healthcheck/` — lixo de teste ok, documentar
- [ ] E039.6 Validar `custom_metadata` (`custom-header-application=evolution-api`) como marcador de origem
- [ ] E039.7 Verificar objetos de instâncias mortas (wppmkt, pink_test) e decidir retenção
- [ ] E039.8 Criar rotina mensal de paridade (cron `sync-evolution-media-daily` 535 — validar o que faz e aproveitar)
- [ ] E039.9 Relatório de reconciliação em evidências
- [ ] E039.10 Commit

## E040 — Lifecycle, custo e governança do R2
- [ ] E040.1 Conferir regras de lifecycle no bucket vs. `media_storage_config` (1825 dias para todos os tipos)
- [ ] E040.2 Medir tamanho total do bucket e projeção de crescimento (mensagens ~5,5k/dia, ~300 mídias/dia)
- [ ] E040.3 Avaliar classe de storage (Standard vs. IA) para mídia >90 dias
- [ ] E040.4 Confirmar que os tokens R2 em uso (`r2_s3_access_key_v3`) têm escopo mínimo (bucket único)
- [ ] E040.5 Revogar tokens R2 antigos não usados (`cf_r2_tokens_list` / v1, v2)
- [ ] E040.6 Separar backups de banco do bucket de mídia (bucket próprio `zapp-db-backups` — hoje dumps vivem no bucket de mídia)
- [ ] E040.7 Habilitar/verificar versioning ou proteção contra deleção acidental no bucket
- [ ] E040.8 Documentar limites e custos mensais estimados
- [ ] E040.9 Alerta de crescimento anômalo (>2× média diária)
- [ ] E040.10 Atualizar `docs/SECRETS_INVENTORY.md` com os tokens R2

---

# FASE 5 — BACKUP E DISASTER RECOVERY (E041–E050)

## E041 — Auditoria do pgbackrest (stack 264)
- [ ] E041.1 Ler o script `pgbackrest_script_v3_f9d30da` (config Swarm) — o que ele executa exatamente
- [ ] E041.2 Verificar logs do container backup: último backup EXECUTADO com sucesso (intervalo semanal, alvo 05:00 BRT)
- [ ] E041.3 `pgbackrest info` no repo da stanza `evolution` — listar backups full/diff existentes e datas
- [ ] E041.4 Verificar onde o repo vive (volume `pgbackrest_data` local? R2 via secrets `evolution_r2_*_v1`?)
- [ ] E041.5 Se só local: backup morre com o disco da VPS — classificar como P0
- [ ] E041.6 Verificar espaço ocupado pelo repo e retenção configurada
- [ ] E041.7 Confirmar archive_command/WAL archiving do PG14 funcionando (sem gaps)
- [ ] E041.8 Verificar alerta de falha de backup (ALERT_WEBHOOK_URL) — testou algum dia?
- [ ] E041.9 Registrar inventário completo de backups em evidências
- [ ] E041.10 Commit

## E042 — Offsite real do PG14
- [ ] E042.1 Decidir destino offsite: repo2 do pgbackrest no R2 (bucket dedicado) — proposta padrão
- [ ] E042.2 Criar bucket R2 dedicado a backups com token operacional mínimo: `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` (write-only puro impede `pgbackrest verify` e restore — token read+write é necessário; escopo = bucket único de backups)
- [ ] E042.3 Configurar repo2 s3 no pgbackrest (endpoint R2, região auto)
- [ ] E042.4 Rodar full backup para o repo2 e cronometrar
- [ ] E042.5 Validar `pgbackrest verify` no repo2
- [ ] E042.6 Agendar: full semanal + diff diário + WAL contínuo
- [ ] E042.7 Alerta em falha de qualquer backup (integrado E026)
- [ ] E042.8 Documentar RPO alcançado (alvo: ≤24h para PG14; WAL contínuo ≈ minutos)
- [ ] E042.9 Fechar/atualizar `docs/operations/P0_OFFSITE_FAILED_STATUS.md`
- [ ] E042.10 Atualizar `infra/backup/README.md` e o DR runbook

## E043 — Dump lógico GPG diário (parado desde 04/05)
- [ ] E043.1 Localizar o job/script que gerava `backups/evolution-db/daily/evolution_*.dump.gpg`
- [ ] E043.2 Descobrir quando/por que parou (04/05 — antes do desacoplamento de 12/08)
- [ ] E043.3 Decidir: reativar (defesa em profundidade vs. pgbackrest) ou aposentar formalmente
- [ ] E043.4 Se reativar: corrigir o script, apontar para o bucket de backups dedicado (E040.6)
- [ ] E043.5 Verificar a chave GPG usada (quem tem a privada? testável?)
- [ ] E043.6 TESTAR DECRYPT + RESTORE do dump de 04/05 existente (prova de que o formato serve)
- [ ] E043.7 Agendar diário com verificação de sucesso
- [ ] E043.8 Retenção: 7 diários + 4 semanais + 12 mensais (ou política definida)
- [ ] E043.9 Remover da raiz do bucket de mídia os dumps antigos após migração
- [ ] E043.10 Documentar

## E044 — Backups do Supabase self-hosted (PG15)
- [ ] E044.1 Auditar os stacks `infra/stacks/postgres-backup-{daily,weekly,monthly}.yml` e `supabase-backup.yml` do zapp — estão RODANDO?
- [ ] E044.2 Verificar `infra/backup/backup_v4.sh` e `scripts/alert-missing-dumps.sh` (alerta de dump ausente ativo?)
- [ ] E044.3 Confirmar último backup bem-sucedido do PG15 e onde está (local/offsite)
- [ ] E044.4 O PG15 tem 323 tabelas zapp + evo espelho — RPO alvo ≤24h; validar
- [ ] E044.5 Garantir offsite (mesmo padrão E042)
- [ ] E044.6 Incluir schemas críticos no dump (zapp, evo, bpm, financeiro, vendas, ai, email_app)
- [ ] E044.7 Verificar backup de `storage/` (16 buckets Supabase) — MinIO/objetos inclusos?
- [ ] E044.8 Verificar backup do `vault.secrets` (37 secrets) e de `auth` (usuários)
- [ ] E044.9 Alerta em falha integrado (E026)
- [ ] E044.10 Documentar matriz de backup: o quê × frequência × destino × retenção × última verificação

## E045 — Drill de restore do PG14
- [ ] E045.1 Provisionar container PG14 isolado (fora do Swarm de produção, rede fechada)
- [ ] E045.2 Restaurar o backup mais recente do pgbackrest no container isolado
- [ ] E045.3 Cronometrar o restore completo (RTO medido)
- [ ] E045.4 Validar integridade: contagens de `Message`, `Contact`, `Chat` × produção
- [ ] E045.5 Validar dados recentes (última mensagem do backup ≈ RPO esperado)
- [ ] E045.6 Testar point-in-time recovery com WAL (recuperar para timestamp arbitrário)
- [ ] E045.7 Destruir o ambiente de teste (sem sobras com dados de produção)
- [ ] E045.8 Registrar RTO/RPO medidos no DR runbook
- [ ] E045.9 Corrigir o que falhou no drill
- [ ] E045.10 Agendar drill semestral

## E046 — Drill de restore do Supabase (PG15)
- [ ] E046.1 Mesmo padrão E045 em container PG15 isolado
- [ ] E046.2 Restaurar dump mais recente
- [ ] E046.3 Validar schemas zapp/evo (tabelas, views auto-updatable, RLS presente)
- [ ] E046.4 Validar funções e cron jobs restaurados (239 jobs)
- [ ] E046.5 Validar publication `supabase_realtime` restaurada (5+ tabelas, publish_via_partition_root)
- [ ] E046.6 Cronometrar RTO
- [ ] E046.7 Documentar passos manuais necessários pós-restore (recriar slots, reconfigurar realtime)
- [ ] E046.8 Destruir ambiente de teste
- [ ] E046.9 Atualizar `infra/runbooks/RESTORE_DRILL.md` com o executado
- [ ] E046.10 Corrigir gaps e agendar recorrência

## E047 — Backup de secrets e configs do Swarm
- [ ] E047.1 Inventariar todos os secrets externos dos stacks (evolution.yml lista 9; consumer 5; watchdogs etc.)
- [ ] E047.2 Verificar se existe cópia segura fora da VPS (cofre/vault criptografado)
- [ ] E047.3 Exportar INVENTÁRIO (nomes+propósito, nunca valores) para `docs/SECRETS_INVENTORY.md`
- [ ] E047.4 Guardar valores em cofre offsite cifrado (decisão de ferramenta com o dono)
- [ ] E047.5 Backup das configs Swarm (`evo_watchdog_*`, `pgbackrest_script_*`) — versionar conteúdo no repo evolution-stack
- [ ] E047.6 Testar reconstrução de 1 secret a partir do cofre
- [ ] E047.7 Documentar procedimento de recriação total dos secrets em DR
- [ ] E047.8 Verificar secrets órfãos no Swarm (v1/v2 antigos não usados) e remover com aprovação
- [ ] E047.9 Política de rotação documentada por secret
- [ ] E047.10 Commit do inventário

## E048 — Backup do volume `evolution_instances` (sessão Baileys)
- [ ] E048.1 Verificar conteúdo/tamanho do volume (creds da sessão wpp2)
- [ ] E048.2 A sessão vive só no volume ou também no PG14/Redis (CACHE_REDIS_SAVE_INSTANCES=true)? Mapear as 3 cópias
- [ ] E048.3 Snapshot periódico do volume (tar cifrado) para o offsite
- [ ] E048.4 Testar restore do snapshot em ambiente isolado
- [ ] E048.5 Validar que restaurar sessão antiga NÃO conflita com sessão ativa (risco de ban — documentar)
- [ ] E048.6 Definir quando usar: só em DR total, nunca com instância ativa
- [ ] E048.7 Automatizar snapshot semanal
- [ ] E048.8 Alerta em falha do snapshot
- [ ] E048.9 Documentar no DR runbook
- [ ] E048.10 Registrar 1º snapshot verificado

## E049 — Verificação automática contínua de backups
- [ ] E049.1 Criar verificação diária: "existe backup de X nas últimas 24h?" para cada item da matriz E044.10
- [ ] E049.2 Implementar como cron SQL + checagem de metadados (pgbackrest info, listagem R2)
- [ ] E049.3 Alerta `backup_missing` (severity critical) integrado à notificação E026
- [ ] E049.4 Dashboard: idade do último backup por sistema (E064)
- [ ] E049.5 Teste mensal automático de restore parcial (1 tabela) onde viável
- [ ] E049.6 Verificar checksums/verify do pgbackrest semanalmente
- [ ] E049.7 Testar o alerta simulando ausência de backup
- [ ] E049.8 Documentar
- [ ] E049.9 Rodar 2 semanas sem falso positivo/negativo
- [ ] E049.10 Marcar item como trava permanente

## E050 — Consolidação DR
- [ ] E050.1 Atualizar `Evolution_Api_Stack/runbooks/DR_RUNBOOK_EVO.md` com tudo desta fase
- [ ] E050.2 Definir cenários DR: perda da VPS inteira / perda do PG14 / perda do PG15 / perda da sessão wpp2
- [ ] E050.3 Para cada cenário: passos, RTO/RPO medidos, responsável
- [ ] E050.4 Validar dependências de bootstrap (Traefik, redes, secrets primeiro)
- [ ] E050.5 Lista de DNS/certificados a reapontar em DR
- [ ] E050.6 Simulação de mesa (tabletop) do cenário "perda da VPS" com o dono
- [ ] E050.7 Corrigir gaps identificados na simulação
- [ ] E050.8 Registrar data do exercício e resultado
- [ ] E050.9 Fechar `P0_OFFSITE_FAILED_STATUS.md` definitivamente
- [ ] E050.10 Marcar Fase 5 concluída

---

# FASE 6 — HIGIENE DE CONFIGURAÇÃO (E051–E060)

## E051 — Eliminar o webhook órfão (Supabase Cloud desconhecido)
O webhook nativo da wpp2 aponta para `https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/evolution-webhook` — projeto Cloud sem referência em nenhum repo.
- [ ] E051.1 Identificar o projeto `tnnnlkbymytvtqngbbqh` (é da conta Promo Brindes? Lovable? teste antigo?)
- [ ] E051.2 Verificar se ele recebeu eventos reais (logs do projeto Cloud, se acessível) — vazamento de dados de clientes?
- [ ] E051.3 Confirmar que o caminho canônico é RabbitMQ→consumer (webhook nativo é redundante/errado)
- [ ] E051.4 Decisão com o dono: desabilitar o webhook nativo OU apontar para o self-hosted como redundância
- [ ] E051.5 Executar via `evo_set_webhook` conforme decisão
- [ ] E051.6 Se o projeto Cloud for lixo: descomissionar/deletar o projeto (elimina superfície)
- [ ] E051.7 Se recebeu dados de clientes: avaliar impacto LGPD e registrar
- [ ] E051.8 Verificar as OUTRAS instâncias (wppmkt, wpp_pink_test) por webhooks órfãos semelhantes
- [ ] E051.9 Documentar a config de webhook canônica em `infra/evolution/SETTINGS.md`
- [ ] E051.10 Re-auditar `evo_webhook` após a mudança (17 eventos, URL certa)

## E052 — Auditoria completa das configs da instância
- [ ] E052.1 `evo_settings`: validar rejectCall/msgCall, groupsIgnore=false, readMessages=true, readStatus=false, syncFullHistory=false — cada um é intencional? Documentar
- [ ] E052.2 Avaliar `syncFullHistory=true` como mitigação de gaps pós-reconexão (trade-off: carga × recuperação) — decisão registrada
- [ ] E052.3 `evo_rabbitmq_get`: eventos habilitados = espelho do YML (17)
- [ ] E052.4 Verificar `DATABASE_SAVE_*` (MESSAGE_UPDATE=false e HISTORIC=false — perda aceitável? documentar)
- [ ] E052.5 Verificar `CACHE_REDIS_TTL=2592000` (30d) e prefixo — coerente com memória do Redis (2gb)
- [ ] E052.6 Validar `WEBHOOK_RETRY_*` (4 tentativas, backoff exp) — adequado para o consumer path? (webhook nativo pode nem ser usado — cf. E051)
- [ ] E052.7 Conferir `CONFIG_SESSION_PHONE_*` (Chrome/Promo Brindes) — impacto em detecção de spam do WhatsApp
- [ ] E052.8 Revisar `QRCODE_LIMIT=30` e `DEL_INSTANCE=false`
- [ ] E052.9 Consolidar tudo em `infra/evolution/SETTINGS.md` (fonte única)
- [ ] E052.10 Commit

## E053 — Corrigir drift documental do CLAUDE.md (zapp)
- [ ] E053.1 Corrigir: `evo.evolution_media` NÃO existe (o CLAUDE.md cita "Mídias 23.366 linhas") — descrever o subsistema real (media_download_queue, media_cache, media_loss_registry, media_storage_config etc.)
- [ ] E053.2 Corrigir contagem de cron jobs (239 em 02/09; CLAUDE.md diz 239 auditado 20/08 — revalidar e datar)
- [ ] E053.3 Atualizar seção Evolution: rota de eventos canônica (RabbitMQ→consumer→edge) e papel do webhook nativo
- [ ] E053.4 Documentar o PG14 dedicado (o CLAUDE.md do zapp quase não o menciona) e o FDW `evolution_postgres`
- [ ] E053.5 Documentar as URLs pré-assinadas de 7 dias e a regra "nunca persistir mediaUrl como permanente"
- [ ] E053.6 Atualizar tabela de bugs abertos (BUG-C n8n ainda vale?)
- [ ] E053.7 Adicionar o incidente 25/08–02/09 na tabela de incidentes fechados (pós E010)
- [ ] E053.8 Revalidar a tabela de storage buckets citada (16 buckets — conferir se mudou)
- [ ] E053.9 Rodar validação cruzada: cada afirmação numérica do CLAUDE.md × banco real
- [ ] E053.10 PR específico de docs

## E054 — Atualizar ESTADO.md com o estado real
- [ ] E054.1 Registrar o fechamento (ou reclassificação) do P1 "consumidor de downloads parado desde 10/08"
- [ ] E054.2 Registrar o incidente wpp2 e sua resolução
- [ ] E054.3 Atualizar inventário de edge functions ligadas (123 no repo — quantas com chamador vivo?)
- [ ] E054.4 Atualizar a seção de desacoplamento com estado atual dos invariantes I1–I9
- [ ] E054.5 Revalidar "o que está ligado" para os watchdogs (pós fase 3)
- [ ] E054.6 Datar a verificação (regra do próprio ESTADO.md)
- [ ] E054.7 Remover informações obsoletas comprovadas
- [ ] E054.8 Cruzar com `docs/CHANGELOG_SESSIONS.md`
- [ ] E054.9 PR de atualização
- [ ] E054.10 Merge com CI verde

## E055 — Versionar componentes de runtime não versionados
- [ ] E055.1 `alert-guard` do stack 224 (declarado no YML como "NÃO versionado — pendência separada") — capturar do runtime e versionar
- [ ] E055.2 Conferir TODAS as configs Swarm (`docker config ls`) × repo evolution-stack — listar não-versionadas
- [ ] E055.3 Capturar e versionar cada config órfã (`evo_watchdog_*`, `baileys_errors_producer_*`, `pgbackrest_script_*`)
- [ ] E055.4 Conferir stacks no Portainer × arquivos em `stacks/` (o CLAUDE.md do evolution-stack lista IDs 25/113/238/225/230/240/265/262/264 — validar 1:1; nota: 265 zapp-functions-health não tem arquivo com esse nome, hoje é supabase-functions-liveness)
- [ ] E055.5 Corrigir a tabela "Stack de stacks" do CLAUDE.md (evolution-stack) com nomes/IDs reais
- [ ] E055.6 Identificar stacks live sem YML no repo (drift GitOps)
- [ ] E055.7 Exportar YML live (`portainer_get_stack_file`) e reconciliar com o canônico
- [ ] E055.8 Ativar verificação periódica de drift (script no CI ou cron)
- [ ] E055.9 Documentar o processo GitOps real (o que redeploya automático vs. manual)
- [ ] E055.10 Commit no evolution-stack

## E056 — Sincronizar YMLs canônicos × runtime live
- [ ] E056.1 Para cada stack crítico (25, 113): `portainer_get_stack_file` × arquivo do repo — diff zero?
- [ ] E056.2 Verificar digest da imagem RODANDO × digest no YML (`33eb167c` evolution; `f6dd6eb5` consumer)
- [ ] E056.3 Divergências: decidir lado a lado (runtime certo → atualizar repo; repo certo → redeploy)
- [ ] E056.4 Verificar env vars live × YML (mudanças manuais via Portainer UI?)
- [ ] E056.5 Verificar secrets montados live × YML
- [ ] E056.6 Repetir para stacks disposable
- [ ] E056.7 Confirmar watchtower desabilitado em tudo (`watchtower.enable=false`)
- [ ] E056.8 Registrar diffs encontrados em evidências
- [ ] E056.9 Zerar drift
- [ ] E056.10 Ativar guard contra edição manual (processo: toda mudança via GitOps)

## E057 — Inventário e faxina de secrets
- [ ] E057.1 `docker secret ls` completo × `docs/SECRETS_INVENTORY.md` — reconciliar
- [ ] E057.2 Identificar versões obsoletas (v1/v2 substituídas por v3/v7) ainda existentes no Swarm
- [ ] E057.3 Confirmar que nenhum stack referencia as obsoletas antes de remover
- [ ] E057.4 Remover obsoletas (com aprovação; uma por vez, validando serviços após cada)
- [ ] E057.5 Verificar idade da `evolution_api_key_v7_20260814` (criada em 14/08/2026 — ~3 semanas ao momento da auditoria) — política de rotação: definir prazo (sugestão: 90 dias → próxima rotação ~14/11/2026)
- [ ] E057.6 Verificar tokens R2 (E040.4/E040.5) e credencial `d1f6dd90...` usada nas URLs pré-assinadas
- [ ] E057.7 Verificar secrets do Vault Supabase (37) × uso real
- [ ] E057.8 Confirmar `bundle-secret-guard.yml` (CI) verde e cobrindo anon key
- [ ] E057.9 Atualizar `SECRETS_INVENTORY.md` como fonte única com datas de rotação
- [ ] E057.10 Commit

## E058 — Limpeza de instâncias mortas
- [ ] E058.1 `wpp_pink_test` (disconnected desde 26/08): confirmar que é teste; decidir remoção
- [ ] E058.2 `wppmkt` (disconnected): tem plano de uso? Se não, remover
- [ ] E058.3 Registrar em `zapp.instance_registry` o destino das 4 `not_provisioned` (financeiro, compras, logistica, marketing) — roadmap real ou limpar
- [ ] E058.4 Remover instâncias mortas via `evo_instance_delete` (aprovação explícita; guardar export antes)
- [ ] E058.5 Limpar partições/objetos R2 correspondentes se aplicável (decisão de retenção E039.7)
- [ ] E058.6 Atualizar `zapp.whatsapp_connections` (só conexões reais)
- [ ] E058.7 Verificar partições `evo.evolution_messages_*` das instâncias mortas (manter histórico, documentar)
- [ ] E058.8 Conferir labels/filas do WhatsApp duplicadas (dashboard mostra "No lidas"/"Favoritos"/"Grupos" em triplicata — IDs 1-3, 12-14, 20-22)
- [ ] E058.9 Atualizar docs
- [ ] E058.10 Commit

## E059 — Documentar a arquitetura canônica de eventos e mídia
- [ ] E059.1 Diagrama: WhatsApp→Baileys→Evolution→{PG14 via Prisma, RabbitMQ, S3/R2}
- [ ] E059.2 Diagrama: RabbitMQ→consumer(×2)→evolution-webhook(self-hosted)→zapp/evo tables→Realtime→frontend
- [ ] E059.3 Diagrama: mídia inbound→R2 (S3 nativo) + proxy de leitura + (fila de download: estado pós E031/E032)
- [ ] E059.4 Tabela de portas/redes (AtomicaBRNet, evolution-net) por serviço
- [ ] E059.5 Tabela de bancos: PG14 (evolution/Prisma) × PG15 (Supabase) × FDW entre eles
- [ ] E059.6 Fluxo de watchdogs pós-consolidação (matriz E021)
- [ ] E059.7 Publicar em `docs/ARQUITETURA_CANONICA.md` (seção Evolution) nos dois repos
- [ ] E059.8 Revisar com o grafo (graphify) — regenerar e cruzar
- [ ] E059.9 Validação do dono
- [ ] E059.10 Commit

## E060 — Revisão de superfícies de acesso
- [ ] E060.1 Revisar ipwhitelist do /manager (2 IPs residenciais + rede interna) — ainda válidos?
- [ ] E060.2 Revisar /metrics (auth + ipwhitelist) e o consumo pelo Prometheus interno
- [ ] E060.3 Confirmar CORS_ORIGIN restrito a `evolution.atomicabr.com.br`
- [ ] E060.4 Rate limit Traefik (200 req/min burst 100) — adequado ao consumo real do zapp via gateway?
- [ ] E060.5 Verificar exposição do RabbitMQ management (não deve ter rota pública)
- [ ] E060.6 Verificar exposição do Redis (porta fechada, senha)
- [ ] E060.7 Verificar PG14 (port-closed-2026-06-12 — confirmar que segue fechado)
- [ ] E060.8 Rodar `supabase_get_advisors` (security) no self-hosted e tratar os P0/P1
- [ ] E060.9 Revisar `zapp-media-proxy` (E038.3) como única porta pública de mídia
- [ ] E060.10 Registrar revisão em `SECURITY.md`

---

# FASE 7 — OBSERVABILIDADE E ALERTAS (E061–E070)

## E061 — Separar o probe de liveness do KPI de segurança
Os 12 `401 Missing webhook signature`/hora são o probe do stack `supabase-functions-liveness` (POST `{}` a cada 300s) e hoje poluem `v_kpi_webhook_saude.invalid_signature`.
- [ ] E061.1 Marcar o probe: enviar header identificador (`X-Probe: liveness`) no curl do stack
- [ ] E061.2 Registrar o marcador no `webhook_audit_log` (coluna `webhook_source='liveness-probe'`)
- [ ] E061.3 Ajustar `v_kpi_webhook_saude` para excluir o probe do contador `invalid_signature`
- [ ] E061.4 Manter contador separado `probe_ok` (liveness visível como métrica própria)
- [ ] E061.5 Alertar `invalid_signature > 0` REAL (agora que o ruído saiu, qualquer 401 real é sinal)
- [ ] E061.6 Testar dois cenários separados: (a) **sem assinatura** — POST de origem desconhecida sem header HMAC → conta em `invalid_signature` e dispara alerta; (b) **assinatura inválida** — POST com `X-Hub-Signature-256` corrompido → idem; (c) **probe legítimo** com `X-Probe: liveness` → registra em `probe_ok`, NÃO incrementa `invalid_signature`
- [ ] E061.7 Atualizar YML do stack liveness no repo evolution-stack
- [ ] E061.8 Migration da view versionada
- [ ] E061.9 Validar 48h de KPI limpo
- [ ] E061.10 Documentar

## E062 — Corrigir o license_heartbeat (37 alertas críticos)
- [ ] E062.1 Ler `zapp.fn_check_license_heartbeat()` — o que ele chama (HTTP=NULL sem_resposta)
- [ ] E062.2 Identificar o endpoint alvo e por que não responde (serviço morto? URL antiga? pg_net falhando)
- [ ] E062.3 Verificar `zapp.license_heartbeat_log` histórico (quando parou de responder)
- [ ] E062.4 Decidir: consertar o endpoint OU aposentar o heartbeat se o serviço foi descomissionado
- [ ] E062.5 Executar a correção
- [ ] E062.6 Resolver os 37 alertas abertos com anotação
- [ ] E062.7 Se mantido: integrar à notificação real (E026)
- [ ] E062.8 Testar falha sintética
- [ ] E062.9 Migration/commit
- [ ] E062.10 Documentar o que o heartbeat protege

## E063 — Canal de notificação humana confiável
8 dias de outage sem ninguém saber = o canal N8N warroom não alcança humanos de forma confiável.
- [ ] E063.1 Auditar o workflow N8N `warroom-alert`: o que ele faz com o POST? (log? mensagem? para quem?)
- [ ] E063.2 Constatar o gap: warroom notificava para onde durante 25/08–02/09?
- [ ] E063.3 Definir canal primário: WhatsApp para o celular do dono é inviável quando a wpp2 É o problema — usar canal independente (e-mail ti@promobrindes.com.br + push/Telegram/SMS)
- [ ] E063.4 Implementar o canal independente no N8N (mínimo: e-mail via SMTP já existente no email_app)
- [ ] E063.5 Regra de severidade: critical → todos os canais; high → e-mail; medium/info → digest
- [ ] E063.6 Heartbeat do próprio canal: teste semanal automático ("alerta de teste — responda OK")
- [ ] E063.7 Testar fim-a-fim: alerta critical sintético chega ao celular/e-mail em ≤5 min
- [ ] E063.8 Documentar quem recebe o quê
- [ ] E063.9 Integrar todos os watchdogs das fases 2–6 a esse canal
- [ ] E063.10 Registrar teste com evidência (screenshot do recebimento)

## E064 — Dashboard operacional único (Grafana)
- [ ] E064.1 Verificar os stacks obs-* (Prometheus, Grafana, Loki) — rodando? versões?
- [ ] E064.2 Painel 1: mensagens/hora (PG14) com linha de baseline semanal
- [ ] E064.3 Painel 2: estado da wpp2 (open/connecting) + uptime KPI (cron 163)
- [ ] E064.4 Painel 3: consumer (stats frescor, ok/err/drop, profundidade de filas RabbitMQ)
- [ ] E064.5 Painel 4: mídia (novas mídias × objetos R2, fila, perdas)
- [ ] E064.6 Painel 5: idade do último backup por sistema (E049)
- [ ] E064.7 Painel 6: alertas abertos por severidade (zapp.evolution_alerts)
- [ ] E064.8 Datasources: Prometheus (evolution /metrics) + PostgreSQL (PG15 e PG14)
- [ ] E064.9 Provisionar dashboards como código (JSON versionado no evolution-stack)
- [ ] E064.10 Validar com o dono e fixar como página inicial do Grafana

## E065 — Prometheus scrape da Evolution
- [ ] E065.1 Confirmar `PROMETHEUS_METRICS=true` expondo /metrics (auth prometheus + senha v3)
- [ ] E065.2 Verificar job de scrape no prometheus.yml do stack obs
- [ ] E065.3 Validar métricas-chave disponíveis (conexão, eventos, memória do processo)
- [ ] E065.4 Adicionar scrape do RabbitMQ (prometheus plugin) se ausente
- [ ] E065.5 Adicionar postgres_exporter para PG14 (conexões, WAL, locks) se ausente
- [ ] E065.6 Adicionar redis_exporter se ausente
- [ ] E065.7 Regras de alerta Prometheus para os sinais de infra (complementar aos SQL)
- [ ] E065.8 Retenção do Prometheus adequada (15d+)
- [ ] E065.9 Versionar configs no repo
- [ ] E065.10 Validar targets UP no /targets

## E066 — Centralização de logs (Loki)
- [ ] E066.1 Verificar stack obs-loki e o driver de logs dos serviços críticos
- [ ] E066.2 Garantir ingestão dos logs do evolution, consumer, rabbitmq, watchdogs
- [ ] E066.3 Labels consistentes (service, stack, tier)
- [ ] E066.4 Retenção definida (14–30d)
- [ ] E066.5 Query salva: "erros do evolution nas últimas 24h"
- [ ] E066.6 Query salva: "ciclo de reconexão Baileys"
- [ ] E066.7 Alerta Loki para padrões fatais (`FATAL|OOM|panic`)
- [ ] E066.8 Testar busca do incidente 25/08 (se logs ainda existirem)
- [ ] E066.9 Documentar como consultar em runbook
- [ ] E066.10 Versionar config

## E067 — Sentry: sinal sobre ruído
- [ ] E067.1 Auditar os 3 DSNs (evolution, consumer, watchdog) — projetos ativos?
- [ ] E067.2 Ver eventos de 23–27/08: o Sentry capturou a morte do consumer? (stats mostravam sentry_sent=4)
- [ ] E067.3 Configurar alertas do Sentry → e-mail do dono para erros novos em produção
- [ ] E067.4 Limpar issues resolvidas/ruído acumulado
- [ ] E067.5 Verificar release tracking (`consumer@v8.2`, digest da evolution)
- [ ] E067.6 Adicionar contexto de instância (wpp2) nos eventos
- [ ] E067.7 Testar captura com erro sintético
- [ ] E067.8 Definir política de triagem semanal
- [ ] E067.9 Documentar
- [ ] E067.10 Integrar link do Sentry no runbook de incidente

## E068 — KPIs de negócio do canal WhatsApp
- [ ] E068.1 Validar `v_kpi_resumo`/`v_kpi_instancias` com dados pós-restauração
- [ ] E068.2 KPI: tempo de primeira resposta ao cliente (mensagem inbound → resposta atendente)
- [ ] E068.3 KPI: conversas ativas/dia, novas/dia
- [ ] E068.4 KPI: mensagens não respondidas >4h úteis (alerta operacional)
- [ ] E068.5 Consolidar no dashboard (E064) aba negócio
- [ ] E068.6 Validar `refresh-daily-metrics`/`refresh_mv_daily_kpis` (tiveram falhas em 24h — corrigir causa)
- [ ] E068.7 Materialized views com refresh confiável e monitorado
- [ ] E068.8 Comparar semana pós-outage × baseline para medir recuperação
- [ ] E068.9 Relatório mensal automático (e-mail)
- [ ] E068.10 Validação do dono

## E069 — Sentinelas de paridade e gap
- [ ] E069.1 Validar cron 556 `fdw-delta-sentinel-30min` ativo e correto (comparação PG14×evo)
- [ ] E069.2 Testar a sentinela com delta sintético
- [ ] E069.3 Garantir alerta em delta>0 sustentado (integrado E026)
- [ ] E069.4 Validar `evo-reconcile-media-fk-orphans` (cron 512) e `whatsapp_reconcile_apply`
- [ ] E069.5 Verificar `parity_audit` (2 tabelas) alimentado e consultado
- [ ] E069.6 Sentinela de partições: partição do mês seguinte existe? (messages/conversations/webhook_events 2027+)
- [ ] E069.7 Sentinela de FDW down (conexão PG14 falhou → alerta)
- [ ] E069.8 Testar cada sentinela
- [ ] E069.9 Documentar na matriz de watchdogs
- [ ] E069.10 Commit

## E070 — Revisão das views de monitoring
- [ ] E070.1 Revisar as 13 views `monitoring.v_*` — todas retornam dados válidos?
- [ ] E070.2 Corrigir `v_kpi_webhook_saude` (pós E061)
- [ ] E070.3 Corrigir a origem do "9999.0 horas" no pipeline_silent (E019.4)
- [ ] E070.4 `v_architecture_score`: critérios ainda fazem sentido? Atualizar pós-plano
- [ ] E070.5 `v_cron_health`: cobre os novos crons das fases 2–6
- [ ] E070.6 `v_db_health_overview`: incluir idade de backup e frescor de FDW
- [ ] E070.7 Remover views mortas (sem consumidor) com aprovação
- [ ] E070.8 Documentar cada view no dicionário
- [ ] E070.9 Migrations versionadas
- [ ] E070.10 Validar no dashboard

---

# FASE 8 — BANCO SUPABASE PG15 (E071–E080)

## E071 — Causa do restart de 02/09 15:15 UTC
- [ ] E071.1 Ler logs do container do Postgres do Supabase em torno de 15:15 UTC
- [ ] E071.2 Verificar `dmesg`/OOM killer do host no horário
- [ ] E071.3 Verificar se foi restart do stack/deploy intencional (histórico Portainer)
- [ ] E071.4 Verificar `pg_stat_activity`/conexões antes do evento (max_connections=150 — saturou?)
- [ ] E071.5 Conferir crash recovery no log (recovery time, consistência)
- [ ] E071.6 Verificar impacto: conexões derrubadas, realtime slots recriados, cron perdido no intervalo
- [ ] E071.7 Se OOM: revisar limites de memória do container × shared_buffers/work_mem
- [ ] E071.8 Implementar correção/limite conforme causa
- [ ] E071.9 Alerta de restart do PG (uptime < 10 min → notificar)
- [ ] E071.10 Documentar em evidências

## E072 — Slot de replicação de analytics ausente
- [ ] E072.1 Confirmar quais slots existem (hoje: 2 do realtime) × quais deveriam existir (alerta `wal_slot_absent` ×3 aponta slot analytics)
- [ ] E072.2 Identificar o consumidor do slot analytics (pipeline de BI? logflare? WAL listener)
- [ ] E072.3 Verificar `public._wal_slot_guard_events` e o stack `wal-slot-guard` (histórico do slot)
- [ ] E072.4 Decidir: recriar o slot + religar o consumidor OU aposentar formalmente o pipeline de analytics
- [ ] E072.5 Executar a decisão
- [ ] E072.6 Se recriado: monitorar lag do slot (alerta `wal_slot_high_lag` já existe)
- [ ] E072.7 Garantir que slot inativo NUNCA acumule WAL sem limite (max_slot_wal_keep_size configurado?)
- [ ] E072.8 Resolver os 3 alertas abertos
- [ ] E072.9 Testar o guard: derrubar slot em teste → alerta
- [ ] E072.10 Documentar

## E073 — Retenções e crescimento de tabelas quentes
- [ ] E073.1 `zapp.webhook_events_processed` (301 MB): retenção 7d (cron 546) está rodando? Por que 301 MB? (bloat pós-purge — VACUUM)
- [ ] E073.2 `zapp.webhook_audit_log` (60 MB): definir retenção (30d?) e cron de purge
- [ ] E073.3 `net._http_response` (34 MB): purge periódico do pg_net (cron)
- [ ] E073.4 `cron.job_run_details` (39 MB): purge >30d
- [ ] E073.5 `ops.ddl_audit` (42 MB): retenção definida
- [ ] E073.6 VACUUM FULL/pg_repack nas tabelas com bloat comprovado (janela de manutenção)
- [ ] E073.7 Medir tamanho antes/depois
- [ ] E073.8 Automatizar purges como migrations versionadas
- [ ] E073.9 Monitorar `v_table_bloat` mensalmente
- [ ] E073.10 Documentar política de retenção por tabela

## E074 — Saúde de partições
- [ ] E074.1 Verificar partições futuras de `evo.evolution_webhook_events_v2_*` (existem até 2027-06 + default — validar)
- [ ] E074.2 Conferir se `default` das particionadas está vazio (dados caindo no default = partição faltando)
- [ ] E074.3 Automatizar criação de partições futuras (função + cron, 3 meses à frente)
- [ ] E074.4 Verificar partições de `evolution_messages` (14) e `evolution_conversations` (13) — necessidade de novas por instância
- [ ] E074.5 Política de arquivamento: `archive-old-wpp2-messages` (cron 88, mensal) — funcionando? destino?
- [ ] E074.6 Validar `evolution_messages_wpp2_archive` (standalone) e seu crescimento
- [ ] E074.7 Índices por partição consistentes
- [ ] E074.8 Testar consulta cross-partição (planos de execução com pruning)
- [ ] E074.9 Alerta de partição faltante (E069.6)
- [ ] E074.10 Documentar

## E075 — VACUUM/autovacuum e estatísticas
- [ ] E075.1 Revisar configuração de autovacuum global e por tabela quente
- [ ] E075.2 Verificar last_autovacuum/last_analyze das 20 maiores tabelas
- [ ] E075.3 Ajustar scale_factor para tabelas de alta rotatividade (webhook_events_processed)
- [ ] E075.4 Verificar transaction wraparound (idade dos datfrozenxid)
- [ ] E075.5 Rodar ANALYZE nas tabelas com stats velhas
- [ ] E075.6 Conferir `vacuum-pipeline-health-log-daily` (cron 184) e similares
- [ ] E075.7 Medir efeito em queries lentas (`v_slow_queries` antes/depois)
- [ ] E075.8 Ajustes via migration versionada
- [ ] E075.9 Monitoramento mensal agendado
- [ ] E075.10 Documentar

## E076 — Índices: faltantes, duplicados, não usados
- [ ] E076.1 Rodar análise de missing indexes (tool MCP `supabase_db_missing_indexes`) nos schemas zapp/evo
- [ ] E076.2 Validar os achados com EXPLAIN das queries reais (não criar índice às cegas)
- [ ] E076.3 Rodar duplicate indexes e confirmar 0 (F-007 fechou; revalidar pós-mudanças)
- [ ] E076.4 Índices não usados (idx_scan=0 há 30d+) — candidatos a remoção com aprovação
- [ ] E076.5 Verificar FKs sem índice (F-006 fechou 4; revalidar)
- [ ] E076.6 Criar índices aprovados CONCURRENTLY em janela
- [ ] E076.7 Medir impacto (latência das queries alvo)
- [ ] E076.8 Migrations versionadas
- [ ] E076.9 Atualizar baseline no `v_index_health`
- [ ] E076.10 Documentar

## E077 — Boundary evo×zapp (invariantes do desacoplamento)
- [ ] E077.1 Re-medir os 9 invariantes (baseline T0: 3/9 nota D) com os scripts de `scripts/decouple/`
- [ ] E077.2 I1: funções zapp referenciando `evo.*` — reduzir das 20 (plano por função)
- [ ] E077.3 I2: confirmar que segue 0 (fechado em 20/08)
- [ ] E077.4 I4: egresso HTTP fora do gateway (5 crons + 16 funções pg_net) — migrar para o gateway único
- [ ] E077.5 I8: sincronizar fixture sql-gate (12 vs 25 em prod)
- [ ] E077.6 I9: documentar as 24 FKs cross-schema (CASCADE em media_download_queue — revisar pós E031)
- [ ] E077.7 Validar grants: `authenticated` sem DML em `evo.*` (F-005 — revalidar)
- [ ] E077.8 Atualizar `BOUNDARY_SCORE` com nova medição datada
- [ ] E077.9 Meta: ≥6/9 invariantes
- [ ] E077.10 Registrar no ESTADO.md

## E078 — RLS e permissões
- [ ] E078.1 Confirmar RLS 100% em zapp (323 tabelas) e evo (136) — re-auditar contra o número atual de tabelas
- [ ] E078.2 Amostrar 10 policies críticas (profiles, evolution_messages view, workspaces) e testar com JWT de usuário comum
- [ ] E078.3 Verificar policies das tabelas novas criadas neste plano (alertas, logs)
- [ ] E078.4 Verificar SECURITY DEFINER sem search_path seguro (guard `secdef-search-path-guard` teve 1 falha em 24h — corrigir causa)
- [ ] E078.5 Rodar `supabase_get_advisors` (security + performance) e tratar achados
- [ ] E078.6 Revisar grants de `service_role` vs anon nos schemas expostos
- [ ] E078.7 Confirmar `evo` fora do PostgREST (PGRST205 esperado) — segue?
- [ ] E078.8 Testar acesso indevido (query como anon em tabela protegida → negado)
- [ ] E078.9 Migrations de correção versionadas
- [ ] E078.10 Registrar auditoria em SECURITY.md

## E079 — Migrations: drift zero
- [ ] E079.1 Verificar estado do PR #1478 (migrations espelho de 30-31/08) — mergear ou finalizar
- [ ] E079.2 Reconciliar `supabase_migrations.schema_migrations` × arquivos em `supabase/migrations/`
- [ ] E079.3 Listar migrations aplicadas sem arquivo (além das 2 conhecidas) — deve ser 0 após #1478
- [ ] E079.4 Listar arquivos não aplicados (drift reverso)
- [ ] E079.5 Validar o drift-gate/pipeline E41 (snapshot canônico) rodando no CI
- [ ] E079.6 Todas as migrations deste plano seguem o workaround do self-hosted + espelho no repo
- [ ] E079.7 Confirmar rollback documentado nas migrations novas
- [ ] E079.8 Testar o gate com drift sintético (deve falhar CI)
- [ ] E079.9 Zerar divergências
- [ ] E079.10 Documentar o fluxo no CLAUDE.md

## E080 — Performance geral do PG15
- [ ] E080.1 Revisar `v_slow_queries`/pg_stat_statements: top 10 por tempo total
- [ ] E080.2 Otimizar as 3 piores (índice, rewrite, cache)
- [ ] E080.3 Verificar `v_connection_stats`: uso de conexões por role/app (150 max — margem?)
- [ ] E080.4 Avaliar pgbouncer/pooling se conexões >70% no pico
- [ ] E080.5 Conferir locks recorrentes (`v_locks`/db_locks) em horário de pico
- [ ] E080.6 Revisar shared_buffers/effective_cache_size × memória do container
- [ ] E080.7 Medir latência média das queries do frontend (PostgREST) P95
- [ ] E080.8 Ajustes aplicados e medidos (antes/depois)
- [ ] E080.9 Registrar baseline de performance pós-plano
- [ ] E080.10 Documentar

---

# FASE 9 — RESILIÊNCIA E HARDENING (E081–E090)

## E081 — Auditoria runtime do Redis
- [ ] E081.1 `INFO memory`: uso × maxmemory 2gb, fragmentação
- [ ] E081.2 `INFO persistence`: AOF ok, último rewrite, RDB saves conforme `save 300 10 / 3600 1`
- [ ] E081.3 `INFO stats`: evicted_keys (policy volatile-lru — chaves da Evolution têm TTL? sem TTL não evicta e estoura)
- [ ] E081.4 Verificar db8 (Evolution): quantidade de chaves, padrão `evolution*`
- [ ] E081.5 Verificar quem usa os outros DBs (mapa por db)
- [ ] E081.6 Latência: `redis-cli --latency` na rede interna
- [ ] E081.7 Verificar `redis-health-watchdog` (stack) e o que ele monitora
- [ ] E081.8 Conferir `CACHE_REDIS_SAVE_INSTANCES=true` — a sessão wpp2 em Redis sobrevive a restart do Redis? (AOF cobre)
- [ ] E081.9 Plano de memória: crescimento projetado × 2gb
- [ ] E081.10 Registrar baseline em evidências

## E082 — Hardening do RabbitMQ
- [ ] E082.1 Versão e uptime; políticas de vhost
- [ ] E082.2 Limites: memory watermark, disk_free_limit configurados
- [ ] E082.3 Policies de fila: TTL/max-length nas filas wpp2.* (evitar crescimento infinito num outage de consumer — trade-off com perda; definir e documentar)
- [ ] E082.4 DLX corretamente configurado (fila→dlq)
- [ ] E082.5 Usuários least-privilege (evolution_v2 publish-only, consumer_v1 consume-only, dlq_ops restrito) — validar permissões reais
- [ ] E082.6 Remover usuários/credenciais antigos (v1 legado)
- [ ] E082.7 Backup das definições (rabbitmqctl export_definitions) versionado/agendado
- [ ] E082.8 Alerta de fila >N sem consumer (integrar E026)
- [ ] E082.9 Testar comportamento em restart do RabbitMQ (durabilidade das filas/mensagens)
- [ ] E082.10 Documentar

## E083 — Healthchecks e restart policies (revisão global)
- [ ] E083.1 Revisar healthcheck de cada serviço crítico (evolution, consumer, rabbitmq, redis, postgres×2)
- [ ] E083.2 Healthcheck do consumer testa só socket RabbitMQ — evoluir para verificar consumo real (lag)
- [ ] E083.3 Verificar `restart_policy` de todos (condition any/on-failure adequados)
- [ ] E083.4 Verificar `update_config`/`rollback_config` (stop-first no evolution ok; monitor 180s)
- [ ] E083.5 Confirmar failure_action=pause do evolution (deploy ruim não flapa)
- [ ] E083.6 Testar rollback de deploy do evolution em janela (procedimento :stable-rc9)
- [ ] E083.7 Verificar reservas/limites de recursos × capacidade da VPS (soma dos limites)
- [ ] E083.8 Placement constraints coerentes (tudo em manager — single node? documentar SPOF)
- [ ] E083.9 Ajustes aplicados via GitOps
- [ ] E083.10 Documentar

## E084 — GHCR e cadeia de imagens
- [ ] E084.1 Validar política "2 digests no host" (atual + rollback) para evolution e consumer
- [ ] E084.2 Confirmar TTL 30d do GHCR não vai coletar o digest de rollback (incidente 17/08 — trava criada; revalidar)
- [ ] E084.3 Verificar `ghcr-auth-keeper` (stack) funcionando (pull autenticado)
- [ ] E084.4 Workflow `publish-evolution-api-custom.yml` verde no último build
- [ ] E084.5 Confirmar tag `:stable-rc9` ainda aponta para 0b154e1c (rollback de emergência)
- [ ] E084.6 Verificar assinatura/proveniência da imagem (build no runner self-hosted vps-evo)
- [ ] E084.7 Runner (stack 210) atualizado e com labels certos
- [ ] E084.8 Testar pull do digest de rollback (existe e baixa)
- [ ] E084.9 Documentar procedimento de rollback de imagem no runbook
- [ ] E084.10 Registrar inventário de digests em evidências

## E085 — Guards de infraestrutura
- [ ] E085.1 `wal-slot-guard` (stack): validar função e integração com E072
- [ ] E085.2 `ops-guards` e `ag6-watchdogs`: ler os YMLs, documentar o que cada um guarda
- [ ] E085.3 `evolution-security-guardian` (stack 262): o que audita? logs recentes
- [ ] E085.4 `evolution-db-purge` (stack 238): política de purge do PG14 (o que apaga? retention?)
- [ ] E085.5 Validar que o purge do PG14 NÃO apaga mensagens antes do espelhamento no Supabase (ordem de dependência)
- [ ] E085.6 `whatsapp-observer` (stack 225): wa-version tracking funcionando (última versão observada)
- [ ] E085.7 Verificar alerta de mudança de versão do WhatsApp Web (risco de quebra do Baileys)
- [ ] E085.8 Consolidar todos na matriz de watchdogs (E021)
- [ ] E085.9 Remover guards mortos/obsoletos com aprovação
- [ ] E085.10 Documentar

## E086 — Segurança de mídia e quarentena
- [ ] E086.1 Validar `scan-media-security` (cron 41, a cada 5 min): o que escaneia? está processando algo com a fila morta?
- [ ] E086.2 Revisar `media_security_config` e `media_security_alerts` (alertas recentes?)
- [ ] E086.3 Fluxo de quarentena (`media_quarantine` + bucket `quarantine` 100MB): testar com arquivo EICAR
- [ ] E086.4 Definir tipos de arquivo bloqueados/permitidos (executáveis via WhatsApp?)
- [ ] E086.5 Verificar `scan_status`/`scan_result` na fila de mídia — integração real com o worker (pós E032)
- [ ] E086.6 Limites de tamanho (50 MB) aplicados no fluxo
- [ ] E086.7 Alertas de segurança de mídia integrados à notificação
- [ ] E086.8 Revisar acesso ao bucket quarantine (só service_role)
- [ ] E086.9 Documentar o fluxo de segurança de mídia
- [ ] E086.10 Registrar teste em evidências

## E087 — Traefik e borda
- [ ] E087.1 Verificar validade/renovação dos certificados letsencrypt (evolution, supabase, n8n, zapp)
- [ ] E087.2 Conferir headers de segurança aplicados (STS, nosniff — labels do evolution ok; validar resposta real)
- [ ] E087.3 Ocultação de Server/X-Powered-By funcionando
- [ ] E087.4 Verificar `traefik_401_stats` (retenção 7d, cron 551) e o padrão de 401 na borda
- [ ] E087.5 Access logs do Traefik: habilitados? retenção?
- [ ] E087.6 Rate limits por rota revisados (evo-rl 200/min)
- [ ] E087.7 Rotas expostas: inventário completo (nenhum serviço interno vazando)
- [ ] E087.8 TLS mínimo 1.2+ e ciphers modernos
- [ ] E087.9 Testar com scanner externo (ssllabs/testssl) os hosts públicos
- [ ] E087.10 Registrar em SECURITY.md

## E088 — SPOF e estratégia de contingência do WhatsApp
- [ ] E088.1 Documentar formalmente: VPS única = SPOF de tudo (aceito? mitigações)
- [ ] E088.2 Avaliar instância WhatsApp de contingência (segundo número em standby — custo/benefício)
- [ ] E088.3 Plano de comunicação alternativo com clientes quando WhatsApp cair (e-mail/telefone — processo, não tech)
- [ ] E088.4 Documentar tempo máximo tolerável de outage do canal (decisão de negócio; 8 dias foi o real)
- [ ] E088.5 Avaliar WhatsApp Cloud API oficial como fallback parcial (WA_BUSINESS_* já configurado no YML — explorar)
- [ ] E088.6 Verificar `whatsapp-cloud-webhook`/`whatsapp-cloud-webhook-verify` (edge functions existem) — estado e plano
- [ ] E088.7 Prova de conceito do fallback (1 fluxo crítico: notificação de pedido)
- [ ] E088.8 Runbook de ativação do fallback
- [ ] E088.9 Decisão registrada com o dono
- [ ] E088.10 Documentar

## E089 — Capacity planning
- [ ] E089.1 Medir uso real de CPU/mem/disco da VPS (7 dias) por serviço
- [ ] E089.2 Comparar com limites declarados (evolution 3G/2cpu, pg14 5G/3cpu, consumer 512M...)
- [ ] E089.3 Projetar crescimento 12 meses (mensagens, mídia, banco)
- [ ] E089.4 Disco: projeção do PG14 (361MB+ wpp2 atual), PG15, volumes, R2
- [ ] E089.5 Identificar o primeiro gargalo projetado e o prazo
- [ ] E089.6 Alertas de capacidade (disco >80%, mem >85%)
- [ ] E089.7 Plano de upgrade da VPS documentado (quando e como)
- [ ] E089.8 Revisar shm/tmpfs allocations (1G tmpfs evolution + 1G shm pg14)
- [ ] E089.9 Registrar baseline
- [ ] E089.10 Revisão trimestral agendada

## E090 — Exercício DR completo
- [ ] E090.1 Consolidar aprendizados das fases 5 e 9 no `DR_RUNBOOK_EVO.md`
- [ ] E090.2 Exercício de mesa: cenário "VPS perdida às 9h de segunda"
- [ ] E090.3 Cronometrar (no papel) cada passo do runbook até serviço restaurado
- [ ] E090.4 Identificar passos sem automação/documentação suficiente
- [ ] E090.5 Corrigir os gaps
- [ ] E090.6 Validar acesso de emergência (quem tem chaves da VPS, Cloudflare, GitHub, GPG)
- [ ] E090.7 Documentar árvore de decisão (restaurar in-place vs. nova VPS)
- [ ] E090.8 Estimar RTO total realista e validar com o negócio
- [ ] E090.9 Registrar o exercício
- [ ] E090.10 Marcar Fase 9 concluída

---

# FASE 10 — VALIDAÇÃO E2E E PREVENÇÃO DE RECORRÊNCIA (E091–E100)

## E091 — Suíte E2E do fluxo inbound
- [ ] E091.1 Roteiro: cliente envia texto → wpp2 → PG14 → RabbitMQ → consumer → evo.evolution_messages → Realtime → inbox
- [ ] E091.2 Executar manualmente com cronômetro em cada etapa (latências por camada)
- [ ] E091.3 Automatizar o roteiro (script no CI e2e ou probe agendado com número de teste)
- [ ] E091.4 Incluir verificação de mídia inbound (R2 + proxy)
- [ ] E091.5 Incluir verificação de contato novo (upsert em evolution_contacts)
- [ ] E091.6 Rodar diariamente e registrar resultado em tabela própria
- [ ] E091.7 Alerta em falha do E2E (canal E063)
- [ ] E091.8 Baseline de latência documentada (P50/P95 por camada)
- [ ] E091.9 Integrar ao dashboard
- [ ] E091.10 Rodar 1 semana sem falso positivo

## E092 — Suíte E2E do fluxo outbound
- [ ] E092.1 Roteiro: atendente envia no zapp → edge/gateway → Evolution → WhatsApp → confirmação de entrega
- [ ] E092.2 Executar com texto, imagem, documento e áudio
- [ ] E092.3 Verificar persistência do outbound (SEND_MESSAGE event → banco)
- [ ] E092.4 Verificar status de entrega (ack) refletido no frontend
- [ ] E092.5 Testar falha controlada (número inválido) → `failed_messages` + alerta ao atendente
- [ ] E092.6 Validar retry de dispatch e `dispatch_error_logs`
- [ ] E092.7 Automatizar o roteiro mínimo (texto) junto ao E2E diário
- [ ] E092.8 Medir latência envio→ack
- [ ] E092.9 Documentar
- [ ] E092.10 1 semana estável

## E093 — Probes honestos permanentes
- [ ] E093.1 Revisar TODOS os probes pós-plano: cada um falha quando o que ele protege quebra? (lição do e2e-media-probe falso verde)
- [ ] E093.2 Teste de mutação: quebrar de propósito cada sinal em homologação/janela e confirmar probe vermelho
- [ ] E093.3 Matriz probe×sinal×canal de alerta consolidada
- [ ] E093.4 Eliminar probes decorativos (verde sempre = ruído)
- [ ] E093.5 Padronizar registro de resultado (tabela única de probe runs)
- [ ] E093.6 Idade máxima de "último verde" visível no dashboard
- [ ] E093.7 Runbook por probe (o que fazer quando fica vermelho)
- [ ] E093.8 Revisão trimestral da matriz
- [ ] E093.9 Documentar
- [ ] E093.10 Commit

## E094 — Teste de carga do pipeline
- [ ] E094.1 Definir alvo: pico histórico ×2 (≈14k msgs/dia ≈ 10 msgs/min sustentado, rajadas de 60/min)
- [ ] E094.2 Gerar carga sintética no RabbitMQ (publisher de teste em vhost/fila de staging)
- [ ] E094.3 Medir throughput do consumer (2 réplicas) e da edge function
- [ ] E094.4 Medir impacto no PG15 (locks, latência de inserts nas partições)
- [ ] E094.5 Identificar o gargalo e o limite real
- [ ] E094.6 Testar comportamento do backlog (parar consumer 1h sob carga, religar, medir drenagem)
- [ ] E094.7 Ajustar prefetch/réplicas se necessário
- [ ] E094.8 Documentar capacidade máxima certificada
- [ ] E094.9 Alerta quando volume real atingir 70% da capacidade
- [ ] E094.10 Registrar em evidências

## E095 — Post-mortem formal do incidente 25/08–02/09
- [ ] E095.1 Consolidar timeline definitiva (E010) com causa raiz confirmada da desconexão (E002)
- [ ] E095.2 Os 5 porquês: por que caiu → por que não reconectou → por que watchdog estava off → por que ninguém foi notificado → por que só uma auditoria achou
- [ ] E095.3 Quantificar impacto de negócio (mensagens perdidas, clientes sem resposta, vendas)
- [ ] E095.4 Listar as travas implementadas (E020, E022-024, E026, E063) com evidência de teste
- [ ] E095.5 Registrar o que NÃO será feito e por quê (decisões conscientes)
- [ ] E095.6 Revisar com o dono
- [ ] E095.7 Publicar em `docs/plano-evolution-2026-09/POSTMORTEM-20260825.md`
- [ ] E095.8 Atualizar a tabela de incidentes do CLAUDE.md
- [ ] E095.9 Extrair 3 lições generalizáveis para os outros sistemas da Promo Brindes
- [ ] E095.10 Commit + merge

## E096 — Processo: quem olha o quê, quando
- [ ] E096.1 Definir rotina diária mínima (5 min): dashboard E064 verde? alertas abertos?
- [ ] E096.2 Definir dono de cada classe de alerta (hoje: tudo = Joaquim; explicitar)
- [ ] E096.3 Ritual semanal: revisar `v_kpi_alertas`, backups, probes (checklist de 10 itens)
- [ ] E096.4 Ritual mensal: revisar capacidade, custos R2/VPS, índices
- [ ] E096.5 Documentar os rituais em `infra/runbooks/OPERATIONS.md`
- [ ] E096.6 Automatizar o que der: digest diário por e-mail com o resumo (N8N)
- [ ] E096.7 Testar o digest por 2 semanas
- [ ] E096.8 Ajustar sinal/ruído do digest
- [ ] E096.9 Validar aderência (o digest está sendo lido?)
- [ ] E096.10 Registrar

## E097 — Gates de deploy mais seguros
- [ ] E097.1 Revisar o fluxo de deploy da imagem evolution (push main → build → deploy manual?)
- [ ] E097.2 Garantir validação pós-deploy automática: state=open + mensagens fluindo em 10 min, senão alerta
- [ ] E097.3 Procedimento canário documentado (T26/T27 de 18/08 como referência)
- [ ] E097.4 Proibir deploy de sexta/vespera de feriado sem aprovação (processo)
- [ ] E097.5 CI do evolution-stack: validar compose (`docker compose config`) e lint dos YMLs
- [ ] E097.6 CI do zapp: confirmar gates existentes verdes (decouple-guard, bundle-secret-guard, drift-gate)
- [ ] E097.7 Corrigir o vazamento de containers órfãos do CI gate6 (F-012 GATE-C2 pendente)
- [ ] E097.8 Checklist de deploy no PR template do evolution-stack
- [ ] E097.9 Testar o gate com deploy sintético ruim
- [ ] E097.10 Documentar

## E098 — Runbooks atualizados e testados
- [ ] E098.1 Inventariar runbooks existentes (EVOLUTION_OPS, DR_EVO, recover-baileys, RESTORE_DRILL, OPERATIONS, 401_WORKERS)
- [ ] E098.2 Atualizar cada um com o aprendido no plano (comandos reais validados)
- [ ] E098.3 Remover/arquivar runbooks obsoletos
- [ ] E098.4 Criar índice único de runbooks (`runbooks/INDEX.md` nos dois repos)
- [ ] E098.5 Cada alerta crítico aponta para seu runbook (link no payload do alerta)
- [ ] E098.6 Teste cego: executar 2 runbooks seguindo só o texto
- [ ] E098.7 Corrigir o que travou no teste cego
- [ ] E098.8 Padronizar formato (sintoma → diagnóstico → ação → validação)
- [ ] E098.9 Commit nos dois repos
- [ ] E098.10 Revisão semestral agendada

## E099 — Rotina de verificação contínua (anti-entropia)
- [ ] E099.1 Criar verificação semanal automatizada: watchdogs ativos? (nenhum cron crítico com active=false sem registro)
- [ ] E099.2 Verificação semanal: drift GitOps zero (E056 contínua)
- [ ] E099.3 Verificação semanal: migrations sem espelho = 0 (E079 contínua)
- [ ] E099.4 Verificação semanal: docs com data de validação >30d marcados para revalidar
- [ ] E099.5 Consolidar num relatório semanal automático (mesmo canal do digest)
- [ ] E099.6 Trava: desativar watchdog crítico EXIGE registro em ESTADO.md (auditoria ddl/config pega violação)
- [ ] E099.7 Testar as verificações com violações sintéticas
- [ ] E099.8 Rodar 1 mês e medir falsos positivos
- [ ] E099.9 Ajustar e estabilizar
- [ ] E099.10 Documentar

## E100 — Fechamento do plano
- [ ] E100.1 Revisar as 99 etapas anteriores: todas com 10/10 ou justificativa registrada
- [ ] E100.2 Atualizar a tabela de progresso deste documento (10 fases ✅)
- [ ] E100.3 Re-executar a auditoria original de 02/09 (mesmas queries) e comparar: todos os 🔴/🟠 sanados
- [ ] E100.4 Medir o novo `v_architecture_score` e registrar evolução
- [ ] E100.5 Re-medir invariantes de desacoplamento (E077) e registrar
- [ ] E100.6 Consolidar métricas: MTTD/MTTR, RPO/RTO, paridade de mídia, uptime wpp2
- [ ] E100.7 Listar débitos residuais aceitos (com dono e prazo)
- [ ] E100.8 Atualizar ESTADO.md e CLAUDE.md finais
- [ ] E100.9 Relatório executivo de 1 página para registro
- [ ] E100.10 Merge final e tag `plano-evolution-2026-09-concluido`

---

*Documento gerado a partir da auditoria ao vivo de 2026-09-02. Toda afirmação numérica deste plano foi observada diretamente no ambiente de produção (banco, R2, API, stacks) naquela data — revalidar antes de executar etapas sensíveis.*
