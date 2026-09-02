/**
 * STEP 4B Migration: ai-transcribe-audio now forwards to unified ai-router
 */

import { handleCors, errorResponse, errorEnvelope, getCorsHeaders, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { parseRequestOrReject } from "../_shared/contract-kit.ts";
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
    const rl = checkRateLimit(`ai-transcribe-audio:${getClientIP(req)}`, 120, 60_000);
    if (!rl.allowed) return errorEnvelope("rate_limit_exceeded", "Rate limit exceeded", 429, req);

    let body: Record<string, unknown> = {};
    // Contrato ai-transcribe-audio@v1 (estrito) — POST/PUT com corpo JSON;
    // GET não envia corpo (forward vazio para o router, comportamento preservado).
    if (req.method === 'POST' || req.method === 'PUT') {
      const parsed = await parseRequestOrReject('ai-transcribe-audio', CONTRACT_SCHEMAS['ai-transcribe-audio'], req, {
        extraHeaders: getCorsHeaders(req),
      });
      if (parsed.ok === false) return parsed.response;
      body = parsed.data as Record<string, unknown>;
    }

    const aiRouterUrl = Deno.env.get("AI_ROUTER_URL");
    if (!aiRouterUrl) return errorEnvelope("ai_router_not_configured", "AI_ROUTER_URL not configured", 503, req);
    const res = await fetch(aiRouterUrl, {
      method: "POST",
      headers: {
        "authorization": authHeader,
        "content-type": "application/json",
        ...Object.fromEntries([...req.headers.entries()].filter(([k]) => k.toLowerCase().startsWith("x-") || k.toLowerCase() === "idempotency-key")),
      },
      body: JSON.stringify({ ...body, action: "transcribe_audio" }),
      signal: AbortSignal.timeout(60_000),
    });

    let responseBody: unknown;
    try {
      responseBody = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `Upstream error: HTTP ${res.status}`, detail: text.slice(0, 200) }),
        {
          status: res.ok ? 502 : res.status,
          headers: { ...getCorsHeaders(req), "content-type": "application/json" },
        }
      );
    }
    return new Response(JSON.stringify(responseBody), {
      status: res.status,
      headers: { ...getCorsHeaders(req), "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(`Proxy error: ${err instanceof Error ? err.message : String(err)}`, 502, req);
  }
});
