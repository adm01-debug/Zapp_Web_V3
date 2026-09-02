-- FK sem índice cobrindo a coluna filha, achado ao vivo pela auditoria
-- (docs/audit-2026-09-02/): zapp.sicoob_contact_mapping.zappweb_agent_id
-- referencia zapp.profiles(id) mas não tem índice — regressão pontual
-- introduzida por 20260821005000_recreate_sicoob_contact_mapping.sql, que
-- só criou idx_sicoob_contact_mapping_lookup (sicoob_user_id, sicoob_singular_id),
-- deixando a FK de zappweb_agent_id sem cobertura (todo DELETE/UPDATE em
-- zapp.profiles forçaria seq scan nesta tabela para checar a FK).
CREATE INDEX IF NOT EXISTS idx_sicoob_contact_mapping_agent_id
  ON zapp.sicoob_contact_mapping (zappweb_agent_id);
