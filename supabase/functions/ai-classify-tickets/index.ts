/**
 * STEP 4B Migration: ai-classify-tickets now forwards to unified ai-router
 */

import { handleCors, errorResponse, errorEnvelope, getCorsHeaders, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorEnvelope("unauthorized", "Unauthorized", 401, req);

    // Rate limit por-isolate, chaveado por IP: este proxy NÃO verifica o JWT
    // (auth real é no ai-router), então o sub não é confiável aqui. 120/min é
    // o limite mais folgado do repo (zapp-email-inbound-webhook) — protege o
    // parse + forward e a conta de IA contra flood sem apertar escritório
    // atrás de NAT. PLANO-100 etapa 28 (rate-limit unificado).
    const rl = checkRateLimit(`ai-classify-tickets:${getClientIP(req)}`, 120, 60_000);
    if (!rl.allowed) return errorEnvelope("rate_limit_exceeded", "Rate limit exceeded", 429, req);

    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject("ai-classify-tickets", CONTRACT_SCHEMAS["ai-classify-tickets"], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as Record<string, any>;
    const aiRouterUrl = Deno.env.get("AI_ROUTER_URL");
    if (!aiRouterUrl) return errorEnvelope("ai_router_not_configured", "AI_ROUTER_URL not configured", 503, req);
    const res = await fetch(aiRouterUrl, {
      method: "POST",
      headers: {
        "authorization": authHeader,
        "content-type": "application/json",
        ...Object.fromEntries([...req.headers.entries()].filter(([k]) => k.toLowerCase().startsWith("x-") || k.toLowerCase() === "idempotency-key")),
      },
      body: JSON.stringify({ ...body, action: "classify_tickets" }),
      signal: AbortSignal.timeout(60_000),
    });

    const responseBody = await res.json().catch(() => ({ error: `Upstream HTTP ${res.status}` }));
    return new Response(JSON.stringify(responseBody), {
      status: res.status,
      headers: { ...getCorsHeaders(req), "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(`Proxy error: ${err instanceof Error ? err.message : String(err)}`, 502, req);
  }
});
