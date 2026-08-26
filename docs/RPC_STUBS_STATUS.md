# STATUS DOS RPC STUBS — ZAPP-WEB

> **Referência ativa para stubs e contratos parciais de RPC.** Atualizado em: 2026-08-26
> A migration original `20260717000002_create_missing_rpcs_stubs.sql` NÃO está mais no repo
> após o cleanup; o contrato vivo deve ser lido em `src/integrations/supabase/types.ts`,
> no snapshot canônico `scripts/decouple/snapshots/zapp_schema_snapshot.sql` e nas
> migrations vivas que substituíram consumidores específicos.
> Plano de implementação: `docs/AUDIT_MIGRATION_VS_DB_50_STEPS.md` (Etapa 20)

---

## Resumo

| RPC | Schema | Comportamento Atual | Implementação Real | Prioridade |
|-----|--------|--------------------|--------------------|-----------|
| `initiate_gmail_oauth` | `zapp` | RAISE EXCEPTION P0001 | Edge Function OAuth flow | 🔴 Alta |
| `complete_gmail_oauth` | `zapp` | RAISE EXCEPTION P0001 | Edge Function OAuth callback | 🔴 Alta |
| `sync_to_crm` | `zapp` | RAISE EXCEPTION P0001 | Integração CRM via webhook/API | 🟡 Média |
| `export_user_data` | `zapp` | Retorna dados básicos de perfil (JSON apenas) | Edge Function com export completo | 🟡 Média |
| `import_user_data` | `zapp` | RAISE EXCEPTION P0001 | Edge Function com validação + import | 🟡 Média |
| `enrich_contact` | `zapp` | Retorna dados do contato com `enriched: false` | Integração com API de enriquecimento | 🟢 Baixa |
| `get_latest_analysis` | `zapp` | Legado/parcial; UI nova não usa mais este caminho | Analytics completo por contato | 🟢 Baixa |

> `check_download_permission` — **NÃO é stub**. Função intencionalmente ausente.
> O design original era fail-open via SQLSTATE `42883`, mas o hook atual do frontend
> está em fail-closed quando a RPC não existe. Ver `src/hooks/useMediaManagement.ts`.

---

## Detalhes por RPC

### `initiate_gmail_oauth` 🔴

**Chamador atual:** sem uso direto via `supabase.rpc(...)` no frontend vivo.
O fluxo atual inicia OAuth pela Edge Function `gmail-oauth` em
`src/hooks/useGmailOAuthFlow.ts`.
**Assinatura atual do catálogo gerado:** `initiate_gmail_oauth() RETURNS JSONB`
**Comportamento atual:**
```sql
RAISE EXCEPTION 'initiate_gmail_oauth: OAuth Gmail não implementado. Use Edge Function.' 
USING ERRCODE = 'P0001';
```
**Por que existe:** Evita erro 42883 (function does not exist) que causava falso `setIsAuthenticated(true)` incondicionalmente (BUG-11).

**Implementação real necessária:**
1. Gerar URL de autorização OAuth 2.0 do Google
2. Armazenar `state` anti-CSRF em `email_app.oauth_states`
3. Retornar `{auth_url: string, state: string}`

**Dependências:** Google OAuth credentials (env var), `email_app.oauth_states` table

---

### `complete_gmail_oauth` 🔴

**Chamador atual:** sem uso direto via `supabase.rpc(...)` no frontend vivo.
O callback/troca de code também foi movido para a Edge Function `gmail-oauth`
via `src/hooks/useGmailOAuthFlow.ts`.
**Assinatura atual do catálogo gerado:** `complete_gmail_oauth(p_code TEXT, p_state TEXT DEFAULT NULL) RETURNS JSONB`
**Comportamento atual:** RAISE EXCEPTION P0001 (igual ao anterior)

**Implementação real necessária:**
1. Validar `state` anti-CSRF
2. Trocar `code` por `access_token` + `refresh_token` via Google Token API
3. Salvar tokens em `email_app.email_accounts` (Realtime na publication ✅)
4. Retornar `{success: true, account_id: UUID}`

**Dependências:** Google OAuth credentials, Edge Function para troca de token, `email_app.email_accounts`

---

### `sync_to_crm` 🟡

**Chamador atual:** sem uso direto via `supabase.rpc(...)` no frontend vivo.
**Assinatura atual do catálogo gerado:** `sync_to_crm(p_contact_id UUID, p_crm_type TEXT DEFAULT 'bitrix24') RETURNS JSONB`
**Comportamento atual:** retorna payload stub/parcial
`{"synced": false, "error": "CRM sync not yet implemented"}`

**Implementação real necessária:**
- Disparar integração assíncrona/Edge Function `crm-sync` com `p_contact_id` e `p_crm_type`
- Suporte inicial: HubSpot, Pipedrive, RD Station
- Resultado assíncrono via `zapp.app_notifications`

---

### `export_user_data` 🟡

**Chamador:** `src/hooks/useMediaManagement.ts:93`
**Assinatura atual do catálogo gerado:** `export_user_data(p_user_id UUID DEFAULT NULL) RETURNS JSONB`
**Comportamento atual:** Retorna dados básicos de perfil em JSON

**Implementação real necessária:**
- Exportar TODOS os dados do usuário: perfil, mensagens, contatos, settings
- Formatos: JSON, CSV, ZIP
- Edge Function assíncrona com geração de URL assinada no Storage

---

### `import_user_data` 🟡

**Chamador:** `src/hooks/useMediaManagement.ts:128`
**Assinatura atual do catálogo gerado:** `import_user_data(p_data JSONB) RETURNS JSONB`
**Comportamento atual:** RAISE EXCEPTION P0001

**Implementação real necessária:**
- Validar estrutura do JSONB de import
- Import idempotente com conflict resolution
- Transação atomica com rollback em caso de violação de constraint

---

### `enrich_contact` 🟢

**Chamador:** `src/hooks/useCRMManagement.ts:146`
**Assinatura:** `enrich_contact(p_contact_id UUID) RETURNS JSONB`
**Comportamento atual:** Retorna `{enriched: false, ...dados básicos do contato}`

**Implementação real necessária:**
- Integração com APIs: Clearbit, FullContact, ou similar
- Cache de resultados em `zapp.contact_intelligence`
- Rate limiting (evitar cobranças excessivas de API)

---

### `get_latest_analysis` 🟢

**Chamador legado:** `src/hooks/useAnalyticsManagement.ts:168`
**Assinatura atual do catálogo gerado:** `get_latest_analysis(p_contact_id UUID, p_analysis_type TEXT DEFAULT NULL) RETURNS JSONB`
**Comportamento atual:** existe como caminho legado/parcial; o consumidor principal de UI foi migrado para `rpc_latest_contact_analysis(p_contact_id UUID)` pela migration `20260817230000_etapa66_latest_analysis_rpc.sql`

**Implementação real necessária:**
- Análise completa: sentiment trend, response time, engagement score
- Integração com `zapp.evolution_sentiment_analysis` (na publication ✅)
- Cache com TTL de 1 hora (evitar recalcular em cada chamada)

---

## Como Implementar um Stub

Quando a implementação real estiver pronta, substituir o stub:

```sql
-- 1. Drop o stub existente
DROP FUNCTION IF EXISTS zapp.nome_da_funcao(tipos_de_params);

-- 2. Criar a implementação real
CREATE OR REPLACE FUNCTION zapp.nome_da_funcao(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  -- implementação real aqui
END;
$$;

-- 3. GRANT correto
REVOKE EXECUTE ON FUNCTION zapp.nome_da_funcao(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.nome_da_funcao(...) TO authenticated;
```

---

## Referências

- Catálogo gerado: `src/integrations/supabase/types.ts`
- Snapshot canônico: `scripts/decouple/snapshots/zapp_schema_snapshot.sql`
- Substituição do consumidor de UI de analytics: `supabase/migrations/20260817230000_etapa66_latest_analysis_rpc.sql`
- Plano de migração: `docs/AUDIT_MIGRATION_VS_DB_50_STEPS.md` Etapa 20
- Histórico de bugs de stubs: `docs/CHANGELOG_SESSIONS.md` (BUG-11, GAP-2 a GAP-6)
- Caminho atual de permissão de download: `src/hooks/useMediaManagement.ts`
