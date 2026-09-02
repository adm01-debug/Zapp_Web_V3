-- Achado do cubic (P2, review do PR #1483): o contrato do webhook
-- sicoob-bridge (SicoobBridgeNewMessageV1Schema em
-- supabase/functions/_shared/contract-schemas.ts) declara vendedor_user_id e
-- singular_id como .optional().nullable() — um payload real e válido do
-- Sicoob pode chegar sem esses campos. Mas zapp.sicoob_contact_mapping tinha
-- as colunas correspondentes (sicoob_vendedor_id, sicoob_singular_id) como
-- NOT NULL, então zapp.fn_sicoob_bridge_ingest_message (migration
-- 20260902020000) rejeitava a transação inteira nesse caso — a mensagem do
-- cliente era perdida (rollback), não só o mapeamento.
--
-- Fix mínimo: relaxa as duas colunas para permitir NULL, alinhando a tabela
-- ao contrato que já existe. Não muda a lógica de negócio (a função já
-- passa os valores recebidos direto, sem fallback) — só para de derrubar a
-- transação inteira quando o Sicoob manda um payload sem esses campos.
ALTER TABLE zapp.sicoob_contact_mapping
  ALTER COLUMN sicoob_vendedor_id DROP NOT NULL,
  ALTER COLUMN sicoob_singular_id DROP NOT NULL;
