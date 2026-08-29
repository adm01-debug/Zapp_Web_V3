// Allowlist de origens — auditoria PLANO-100 etapa 29-backlog (2026-08-25):
//   REMOVIDO 'https://supabase.com' e pattern /^https:\/\/.*\.supabase\.co$/ —
//     produção é self-hosted em *.atomicabr.com.br (ARQUITETURA_CANONICA.md);
//     as únicas referências a supabase.co no src/ são DETECÇÃO de ambiente
//     (whatsappAdapter/BackendDiagnostics), nunca origem servindo o app.
//   REMOVIDO pattern zapp-web-v3-git-*-.vercel.app — Vercel aposentada para o
//     ZAPP em 2026-08-20 (team juca1 sem nenhum projeto zapp; verificado ao vivo).
//   ADICIONADO zappweb.app.br + www.zappweb.app.br — aliases de produção que
//     servem o MESMO bundle (ARQUITETURA_CANONICA.md, verificado byte-a-byte);
//     sem ACAO pra eles o app aberto nesses hosts não chama edge functions.
//   MANTIDO lovable.dev (exact + pattern) — src/lib/buildVersion.ts ainda
//     detecta beta.lovable.dev como ambiente de preview vivo.
//   MANTIDO promobrindes.com.br (empresa) — domínio próprio de 1ª parte,
//     sem documentação de aposentadoria.
const ALLOWED_ORIGINS = [
  'https://nexus.promobrindes.com.br',
  'https://app.promobrindes.com.br',
  'https://promobrindes.com.br',
  'https://zapp.atomicabr.com.br',
  'https://zappweb.app.br',
  'https://www.zappweb.app.br',
  'https://atomicabr.com.br',
  'https://lovable.dev',
];
const ALLOWED_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/.*\.lovable\.dev$/,
  /^https:\/\/.*\.promobrindes\.com\.br$/,
  /^https:\/\/.*\.atomicabr\.com\.br$/,
];
const ALLOWED_HEADERS = [
  'authorization', 'x-client-info', 'apikey', 'content-type',
  'x-api-key', 'x-request-id',
  'idempotency-key', 'x-idempotency-key',
  'x-hub-signature-256',
].join(', ');
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

/** cors utilities and exports. */
export function getCorsHeaders(req: Request): Record<string, string> {
  const requestOrigin = req.headers.get('Origin') ?? '';
  // Use value from static array (not user input) to avoid reflected-origin taint path.
  const exactMatch = ALLOWED_ORIGINS.find((allowed) => allowed === requestOrigin);
  // Pattern-matched origins (localhost, dev previews) echo the validated requestOrigin back.
  // For unrecognized origins: omit ACAO entirely. Never send 'null' — sandboxed iframes and
  // file:// pages serialize their origin as the literal string "null", so ACAO: null would
  // inadvertently grant them access.
  const patternMatch = !exactMatch && ALLOWED_PATTERNS.some((p) => p.test(requestOrigin));
  const allowedOrigin: string | null = exactMatch ?? (patternMatch ? requestOrigin : null);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowedOrigin !== null) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }
  return headers;
}

/** handle Cors Preflight function. */
export function handleCorsPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) });
}

/** json Response function. */
export function jsonResponse(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** error Response function. */
export function errorResponse(
  req: Request,
  msg: string,
  status = 400,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(req, { error: msg, ...(details || {}) }, status);
}
