import { createZappAdminClient } from '../_shared/db-client.ts';
import { handleCors, errorResponse, errorEnvelope, requireEnv, Logger, getCorsHeaders } from "../_shared/validation.ts";
import { timingSafeStringEqual } from "../_shared/auth.ts";
import { parseOrReject, respondWithContract } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("sicoob-bridge");

  // Hotfix (auditoria 2026-08-21, Bloco 5.1): mutável içada pra fora — precisa
  // estar acessível também no catch-all (parsed é const, escopo do try), pra
  // errorResponse() pós-gate não descartar x-contract-version/deprecated/sunset.
  let contractResponseHeaders: Record<string, string> = {};

  try {
    const bridgeSecret = requireEnv('SICOOB_BRIDGE_SECRET');
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!timingSafeStringEqual(authHeader, `Bearer ${bridgeSecret}`)) {
      return errorEnvelope('unauthorized', 'Unauthorized', 401, req);
    }

    const supabase = createZappAdminClient();
    const rawBody = await req.json().catch(() => null);
    const parsed = parseOrReject('sicoob-bridge', CONTRACT_SCHEMAS['sicoob-bridge'], req, rawBody, { extraHeaders: getCorsHeaders(req) });
    if (parsed.ok === false) return parsed.response;
    contractResponseHeaders = parsed.headers;
    const body = parsed.data as Record<string, any>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'new_message') {
      const { message_id, sender_name, sender_email, sender_phone, singular_name, singular_id, content, vendedor_user_id, created_at } = body;

      // F-DATA-01 (auditoria 2026-09-02): contato + mapeamento + mensagem numa
      // unica transacao via RPC, em vez de 4 escritas sequenciais separadas —
      // elimina o risco de contato orfao sem vinculo Sicoob em caso de falha
      // parcial (ver supabase/migrations/20260902020000_fn_sicoob_bridge_ingest_message.sql).
      const { data: ingestRows, error: ingestError } = await supabase.rpc('fn_sicoob_bridge_ingest_message', {
        p_message_id: message_id,
        p_sender_id: body.sender_id || null,
        p_sender_name: sender_name,
        p_sender_email: sender_email || null,
        p_sender_phone: sender_phone || null,
        p_singular_name: singular_name,
        p_singular_id: singular_id,
        p_content: content,
        p_vendedor_user_id: vendedor_user_id,
        p_created_at: created_at || null,
      });

      if (ingestError) throw new Error(`Failed to ingest sicoob message: ${ingestError.message}`);
      const result = Array.isArray(ingestRows) ? ingestRows[0] : ingestRows;
      const contactId = result?.contact_id;
      const messageId = result?.message_id;
      const idempotent = result?.idempotent === true;

      if (idempotent) {
        log.info("Duplicate message_id — returning idempotent success", { message_id });
        // Etapa 54 (PLANO-100-CONTRATOS-EDGE): respostas de sucesso migram pra
        // respondWithContract — parsed.headers (x-contract-version/deprecated/
        // sunset) anexados pelo kit, sem propagação manual.
        return respondWithContract(parsed, { success: true, message: 'Message already exists', idempotent: true }, { status: 200, headers: getCorsHeaders(req) });
      }

      log.done(200, { contactId, messageId });
      return respondWithContract(parsed, { success: true, contact_id: contactId, message_id: messageId }, { status: 200, headers: getCorsHeaders(req) });

    } else if (action === 'mark_read') {
      const { external_ids } = body;
      const { error } = await supabase.from('messages').update({ is_read: true }).in('external_id', external_ids);
      if (error) throw new Error(`Failed to mark messages as read: ${error.message}`);

      log.done(200, { count: external_ids.length });
      return respondWithContract(parsed, { success: true, updated: external_ids.length }, { status: 200, headers: getCorsHeaders(req) });

    } else {
      return errorResponse(`Unknown action: ${action}. Supported: new_message, mark_read`, 400, req, undefined, contractResponseHeaders);
    }
  } catch (error) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorEnvelope('internal_error', 'Internal server error', 500, req, undefined, contractResponseHeaders);
  }
});
