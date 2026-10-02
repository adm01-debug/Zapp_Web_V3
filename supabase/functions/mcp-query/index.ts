// Endpoint máquina→máquina (MCP server → edge fn): nenhum chamador é
// browser, então não há ACAO — página web hostil não consegue ler a
// resposta (fetch cross-origin bloqueado pelo preflight), enquanto
// curl/MCP passam normal (não fazem preflight).
const CORS = {
  "Access-Control-Allow-Headers": "x-mcp-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

// P1 2026-08-07: o secret era HARDCODED no source (repo público) — agora vem
// exclusivamente da env MCP_QUERY_SECRET (definida no runtime do serviço
// supabase_functions). Fail-closed: sem env → 401, nunca aceita sem segredo.
const SECRET = Deno.env.get("MCP_QUERY_SECRET") ?? "";

// Comparação em tempo constante (auditoria 5-agentes: !== vaza timing do
// prefixo do segredo — a chave protege exec_sql com service_role).
const timingSafeEqual = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
};

// Whitelist read-only (P1 2026-08-07): a função executa com service_role via
// exec_sql — qualquer comando que não seja leitura (SELECT/EXPLAIN/WITH) é
// rejeitado ANTES de chegar ao banco. Bloqueia INSERT/UPDATE/DELETE/DDL/
// GRANT/etc. (o filtro antigo só cobria DROP/TRUNCATE).
// 2ª linha (validação 5-agentes, achado ALTO): o primeiro token passar não
// basta — WITH x AS (DELETE ...), SELECT INTO, EXPLAIN ANALYZE, multi-
// statement e funções voláteis (nextval, exec_sql, pg_terminate_backend)
// executam escrita sob service_role. Regex não é parser: a defesa
// definitiva é um exec_sql read-only no lado do banco.
const READ_ONLY_RE = /^\s*(SELECT|EXPLAIN|WITH)\b/i;
// O deny-list cobre só escrita embutida em SELECT/EXPLAIN/WITH (CTE com DML,
// SELECT INTO, EXPLAIN ANALYZE, FOR UPDATE) + funções voláteis/side-effect.
// Statements top-level (CALL, DO, COPY, SET...) já são barrados pelo
// primeiro token do READ_ONLY_RE — listá-los aqui daria falso-positivo em
// identificadores plausíveis (coluna `comment`, `call`, `lock`).
const WRITE_HINT_RE = /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|INTO|ANALYZE)\b|nextval\s*\(|setval\s*\(|currval\s*\(|exec_sql|exec_ddl|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_sleep|dblink|pg_read_file|pg_read_binary_file|pg_write_file|pg_stat_file|pg_ls_|lo_import|lo_export|set_config\s*\(|pg_advisory/i;
const hasInnerSemicolon = (sql: string): boolean =>
  sql.trim().replace(/;+\s*$/, "").includes(";");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!SECRET || !timingSafeEqual(req.headers.get("x-mcp-secret") ?? "", SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  // Gate de contrato (2026-08-07 — função nasceu sem gate, quebrava o
  // contract-coverage): valida { sql, limit } antes de qualquer execução.
  const raw = await req.json().catch(() => null);
  const parsed = parseOrReject("mcp-query", CONTRACT_SCHEMAS["mcp-query"], req, raw, {
    extraHeaders: CORS,
  });
  if (parsed.ok === false) return parsed.response;
  const { sql, limit = 100 } = parsed.data as { sql: string; limit?: number };
  if (!READ_ONLY_RE.test(sql) || WRITE_HINT_RE.test(sql) || hasInnerSemicolon(sql)) {
    return new Response(JSON.stringify({
      error: true,
      code: "READ_ONLY_VIOLATION",
      message: "Somente consultas de leitura são permitidas (SELECT/EXPLAIN/WITH).",
    }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // 'limit' dentro de string literal não conta — strip antes de testar;
  // o terminador final sai antes de compor finalSql (senão o LIMIT ia
  // para DEPOIS do ';' — query válida quebrava, achado do Devin Review)
  const sqlTrimmed = sql.trim().replace(/;+\s*$/, "");
  const sqlNoStrings = sqlTrimmed.replace(/'[^']*'/g, "''");
  const finalSql = /\blimit\b/i.test(sqlNoStrings) ? sqlTrimmed : `${sqlTrimmed} LIMIT ${limit}`;
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "apikey": key,
    },
    body: JSON.stringify({ query: finalSql }),
  });
  const data = await res.json();
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const rows = Array.isArray(data) ? data : [data];
  return new Response(JSON.stringify({ rows, count: rows.length }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
