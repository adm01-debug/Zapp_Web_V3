-- v_cookie_health: expoe a saude dos cookies SEM abrir a tabela de probes.
--
-- Problema: a view lia `zapp.cookie_probe_log`, cuja politica e
-- `rls_cookie_probe_log_service_only` (FOR ALL TO service_role) — desenho deliberado da
-- casa. Conceder SELECT a `authenticated` ali CONTRARIARIA esse desenho, e nao se abre
-- tabela de probe (que guarda corpo de resposta de upstream) para usuario logado so para
-- fazer uma view funcionar.
--
-- Solucao: a view passa a ler uma FUNCAO NOSSA, `SECURITY DEFINER`, com colunas
-- escolhidas a dedo. A funcao roda como dono (a politica nao se aplica a ela, o que e
-- explicito e auditavel) e devolve exatamente o contrato da view, MENOS o corpo cru:
-- `last_probe_preview` sai NULL de proposito (campo descontinuado — era o
-- `response_preview` do upstream, que pode conter token/cookie de terceiro).
--
-- O contrato de saida e preservado nome a nome e tipo a tipo, entao o
-- CREATE OR REPLACE VIEW e aceito e a flag security_invoker=true e os GRANTs da view
-- permanecem intactos (nada de DROP).

CREATE OR REPLACE FUNCTION zapp.fn_cookie_health()
RETURNS TABLE (
  servico text,
  is_healthy boolean,
  health_status text,
  last_health_check_at timestamptz,
  health_error text,
  expires_at timestamptz,
  last_probe_http integer,
  last_probe_ms integer,
  last_probe_preview text,
  mins_since_probe numeric,
  probe_stale boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, pg_catalog
AS $fn$
  SELECT c.servico,
         c.is_healthy,
         c.health_status,
         c.last_health_check_at,
         c.health_error,
         c.expires_at,
         p.http_status,
         p.probe_ms,
         NULL::text,
         EXTRACT(epoch FROM now() - c.last_health_check_at) / 60::numeric,
         (c.last_health_check_at < (now() - '00:35:00'::interval))
    FROM zapp.cookies_config c
    LEFT JOIN LATERAL (
      SELECT pl.http_status, pl.probe_ms
        FROM zapp.cookie_probe_log pl
       WHERE pl.servico = c.servico
       ORDER BY pl.probed_at DESC
       LIMIT 1
    ) p ON true
   ORDER BY c.servico;
$fn$;

REVOKE ALL ON FUNCTION zapp.fn_cookie_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_cookie_health() TO authenticated, service_role, dyad_reader, metabase_reader, om_reader;

CREATE OR REPLACE VIEW zapp.v_cookie_health AS
SELECT * FROM zapp.fn_cookie_health();
