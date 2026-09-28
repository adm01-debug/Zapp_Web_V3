-- v_system_scorecard: intenção declarada no catálogo. É ESTREITAMENTO, não ampliação.
--
-- Medido no catálogo:
--   * a view lê `cron.job` (pg_cron), `pg_stat_activity`, `pg_stat_user_tables`,
--     `pg_statio_user_tables`, além de `evo.active_messages` / `evo.evolution_messages`;
--   * `cron.job` concede SELECT apenas a `postgres`, `supabase_admin` e
--     `supabase_read_only_user` — ou seja, NEM `service_role` consegue ler `cron.job`.
--     Logo esta view é, de fato, ADMIN-ONLY: não existe caminho para um usuário logado
--     lê-la, em nenhuma configuração de policy.
--   * Ainda assim `authenticated` carrega DELETE, INSERT, SELECT e UPDATE nela. Esses
--     privilégios são INERTES (a view é agregada, não é atualizável), mas aparecem como
--     permissão de escrita que não existe — e ninguém deveria precisar raciocinar sobre
--     isso ao auditar.
--
-- Esta migration apenas torna explícito o que já é verdade, removendo os privilégios de
-- `authenticated`. NÃO toca em `cron`, NÃO toca em `evo`, NÃO concede nada, e preserva
-- os leitores de BI (`dyad_reader`, `metabase_reader`, `om_reader`) e `service_role`.
--
-- Motivo de existir: "fechada por acidente" (erro de permissão em runtime) e "fechada
-- por decisão" precisam ser distinguíveis no catálogo. A partir daqui é decisão.

REVOKE ALL ON zapp.v_system_scorecard FROM authenticated;

COMMENT ON VIEW zapp.v_system_scorecard IS
  'ADMIN-ONLY por natureza: le cron.job (pg_cron) e pg_stat_*, e cron.job nao concede SELECT a authenticated nem a service_role. Privilegios de authenticated foram revogados em 20260928230000 para que "fechado por decisao" seja distinguivel de "fechado por acidente". Para um scorecard voltado a usuario logado, criar view nova sobre fonte sancionada nossa.';
