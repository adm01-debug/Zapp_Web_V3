# Índice de ADRs (gerado 2026-09-05, AUD-22D)

> 43 ADRs em 8 diretórios, com numeração colidida (ADR-003 ×4, ADR-004 ×4 …). Este índice é a
> lista única; novos ADRs devem usar o próximo número livre da coluna **Nº** (sequência global) e
> viver em `docs/adr/`. Regenerar: `find docs -iname 'ADR*' | sort`.

| Nº no nome | Arquivo | Título (1ª linha) |
|---|---|---|
| ADR-003 | [`docs/ADR-003_REPOSITORIO_PRIVADO.md`](../../docs/ADR-003_REPOSITORIO_PRIVADO.md) | ADR-003: Repositório Privado — Decisão de Segurança |
| ADR-004 | [`docs/ADR-004_REVOGA_BUCKET_PUBLICO.md`](../../docs/ADR-004_REVOGA_BUCKET_PUBLICO.md) | ADR-004: Revogação do Bucket Público — whatsapp-media |
| ADR-001 | [`docs/adr/ADR-001-media-url-storage.md`](../../docs/adr/ADR-001-media-url-storage.md) | ADR-001 — Proibir URL absoluta em campos de mídia |
| ADR-002 | [`docs/adr/ADR-002-bucket-public.md`](../../docs/adr/ADR-002-bucket-public.md) | ADR-002 — Bucket `whatsapp-media` deve ser PÚBLICO |
| ADR-003 | [`docs/adr/ADR-003-reverter-bucket-whatsapp-media.md`](../../docs/adr/ADR-003-reverter-bucket-whatsapp-media.md) | ADR-003: Reverter bucket whatsapp-media para Privado |
| ADR-004 | [`docs/adr/ADR-004-remover-modulo-bpm.md`](../../docs/adr/ADR-004-remover-modulo-bpm.md) | ADR-004: Remoção do módulo BPM |
| ADR-005 | [`docs/adr/ADR-005-implementar-pwa-offline.md`](../../docs/adr/ADR-005-implementar-pwa-offline.md) | ADR-005: Implementação de PWA e fila offline |
| ADR-006 | [`docs/adr/ADR-006-arquitetura-sla-canonica.md`](../../docs/adr/ADR-006-arquitetura-sla-canonica.md) | ADR-006: Arquitetura canônica de SLA |
| ADR-007 | [`docs/adr/ADR-007-manter-bloqueio-impressao.md`](../../docs/adr/ADR-007-manter-bloqueio-impressao.md) | ADR-007: Bloqueio de impressão mantido |
| ADR-008 | [`docs/adr/ADR-008-dashboard-sla-sem-dados.md`](../../docs/adr/ADR-008-dashboard-sla-sem-dados.md) | ADR-008: Comportamento do dashboard SLA com zero dados |
| ADR-016 | [`docs/adr/ADR-016-dev-role-env-whitelist.md`](../../docs/adr/ADR-016-dev-role-env-whitelist.md) | ADR-016: Whitelist de ambiente para o bypass do papel `dev` |
| ADR-017 | [`docs/adr/ADR-017-jwt-trust-boundary-main-gateway.md`](../../docs/adr/ADR-017-jwt-trust-boundary-main-gateway.md) | ADR-017 — Fronteira de confiança do JWT: `main` verifica, functions decodificam |
| ADR-CHAT-01 | [`docs/adr/ADR-CHAT-01-tailwind4-react19.md`](../../docs/adr/ADR-CHAT-01-tailwind4-react19.md) | ADR-CHAT-01: Migração Tailwind v4 + React 19 |
| ADR-R1 | [`docs/adr/ADR-R1EXT-F3-actions-instance-wide.md`](../../docs/adr/ADR-R1EXT-F3-actions-instance-wide.md) | ADR — R1-EXT F3: 3 actions da evolution-api sem gate (decisão de produto) |
|  | [`docs/arquitetura/adr-005-unicidade-contatos.md`](../../docs/arquitetura/adr-005-unicidade-contatos.md) | ADR-005 — Chave de Unicidade de Contatos (`evo.evolution_contacts`) |
| ADR-CHAT-01 | [`docs/chat-ui/ADR-CHAT-01.md`](../../docs/chat-ui/ADR-CHAT-01.md) | ADR-CHAT-01 — Estratégia de Migração TW4 |
| ADR-DB-001 | [`docs/db/adrs/ADR-DB-001-schema-public-destino.md`](../../docs/db/adrs/ADR-DB-001-schema-public-destino.md) | ADR-DB-001 — Destino do Schema `public` |
| ADR-DB-002 | [`docs/db/adrs/ADR-DB-002-fronteira-zapp-evo.md`](../../docs/db/adrs/ADR-DB-002-fronteira-zapp-evo.md) | ADR-DB-002 — Fronteira evo→zapp: monitoria = exceção formal; negócio = correção v |
| ADR-DB-003 | [`docs/db/adrs/ADR-DB-003-extensoes-public-para-extensions.md`](../../docs/db/adrs/ADR-DB-003-extensoes-public-para-extensions.md) | ADR-DB-003 — Mover Extensões de `public` para `extensions` |
| ADR-DB-004 | [`docs/db/adrs/ADR-DB-004-fks-zapp-evo-e-cross-modulo.md`](../../docs/db/adrs/ADR-DB-004-fks-zapp-evo-e-cross-modulo.md) | ADR-DB-004 — FKs zapp→evo e cross-módulo: MANTER (exceção formal documentada) |
| ADR-001 | [`docs/decisions/ADR-001-react-query-server-state.md`](../../docs/decisions/ADR-001-react-query-server-state.md) | ADR-001: Uso de React Query para Server State |
| ADR-002 | [`docs/decisions/ADR-002-supabase-rls-security.md`](../../docs/decisions/ADR-002-supabase-rls-security.md) | ADR-002: Row-Level Security (RLS) como Camada Primária de Autorização |
| ADR-003 | [`docs/decisions/ADR-003-css-modularization.md`](../../docs/decisions/ADR-003-css-modularization.md) | ADR-003: Modularização do Design System CSS |
| ADR-003 | [`docs/decisions/ADR-003-lazy-loading-architecture.md`](../../docs/decisions/ADR-003-lazy-loading-architecture.md) | ADR-003: Lazy Loading Universal para Rotas e Módulos |
| ADR-004 | [`docs/decisions/ADR-004-css-modularization.md`](../../docs/decisions/ADR-004-css-modularization.md) | ADR-004: Modularização do Design System CSS |
| ADR-004 | [`docs/decisions/ADR-004-evolution-api-webhook-bridge.md`](../../docs/decisions/ADR-004-evolution-api-webhook-bridge.md) | ADR-004: Evolution API Webhook Bridge Pattern |
| ADR-005 | [`docs/decisions/ADR-005-audit-recovery-model.md`](../../docs/decisions/ADR-005-audit-recovery-model.md) | ADR-005: Audit & Recovery Model |
| ADR-006 | [`docs/decisions/ADR-006-two-backend-boundary.md`](../../docs/decisions/ADR-006-two-backend-boundary.md) | ADR-006: Two-Backend Boundary & Communication |
| ADR-007 | [`docs/decisions/ADR-007-audit-recovery-model.md`](../../docs/decisions/ADR-007-audit-recovery-model.md) | ADR-007: Audit & Recovery Model (Implementation) |
| ADR-008 | [`docs/decisions/ADR-008-error-tracking-strategy.md`](../../docs/decisions/ADR-008-error-tracking-strategy.md) | ADR-008: Error Tracking & Monitoring Strategy |
| ADR-008 | [`docs/decouple/ADR-008-canonical-domain-model.md`](../../docs/decouple/ADR-008-canonical-domain-model.md) | ADR-008 — Modelo Canônico de Domínio |
| ADR-009 | [`docs/decouple/ADR-009-gateway-pattern.md`](../../docs/decouple/ADR-009-gateway-pattern.md) | ADR-009 — Gateway Pattern para Evolution API |
| ADR-010 | [`docs/decouple/ADR-010-sql-gateway.md`](../../docs/decouple/ADR-010-sql-gateway.md) | ADR-010: SQL Gateway — resolução centralizada de credenciais Evolution em PL/pgSQL |
| ADR-011 | [`docs/decouple/ADR-011-egress-gateway.md`](../../docs/decouple/ADR-011-egress-gateway.md) | ADR-011: Gateway Único de Egresso — `evolution-api` como porta edge canônica |
| ADR-012 | [`docs/decouple/ADR-012-T0-MEASUREMENT.md`](../../docs/decouple/ADR-012-T0-MEASUREMENT.md) | ADR-012 — Medição Formal T0: Score de Independência ZAPP×EVO |
| ADR-013 | [`docs/decouple/ADR-013-PHASE1-PLAN.md`](../../docs/decouple/ADR-013-PHASE1-PLAN.md) | ADR-013 — Plano da Fase 1: Fundação e Documentação |
| ADR-014 | [`docs/decouple/ADR-014-PHASE2-PLAN.md`](../../docs/decouple/ADR-014-PHASE2-PLAN.md) | ADR-014 — Plano da Fase 2: Correções Críticas de Egresso HTTP |
| ADR-015 | [`docs/decouple/ADR-015-evo-schema-owner.md`](../../docs/decouple/ADR-015-evo-schema-owner.md) | ADR-015: Dono único do schema `evo` — evolution-stack |
| ADR-017 | [`docs/decouple/ADR-017-corte-fisico-evo.md`](../../docs/decouple/ADR-017-corte-fisico-evo.md) | ADR-017: Corte físico do schema `evo` — NÃO EXECUTAR AGORA |
| ADR-I4 | [`docs/decouple/ADR-I4-E73-E77-PLANO-JANELA.md`](../../docs/decouple/ADR-I4-E73-E77-PLANO-JANELA.md) | ADR-I4: Plano de janela — Fase E73–E77 (I4 = 0) |
| ADR-I4 | [`docs/decouple/ADR-I4-ROTA-A-MANTIDA.md`](../../docs/decouple/ADR-I4-ROTA-A-MANTIDA.md) | ADR-I4: Decisão final — Rota A MANTIDA (fato consumado em produção) |

## Colisões de número

- ADR-001 × 2
- ADR-002 × 2
- ADR-003 × 4
- ADR-004 × 4
- ADR-005 × 2
- ADR-006 × 2
- ADR-007 × 2
- ADR-008 × 3
- ADR-017 × 2
