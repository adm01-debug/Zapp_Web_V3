// Recomputa HMAC-SHA256 do payload de um evolution_webhook_events_v2 e devolve
// diagnóstico (válido / inválido + motivo). Não grava nada.
//
// Auth: exige Bearer JWT de usuário com role 'admin'.
// Lê o evento direto do Evolution DB via service role do projeto self-hosted.
import { createZappAdminClient } from '../_shared/db-client.ts';

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { requireAdminOrSupervisor } from '../_shared/auth.ts';
import { readWebhookSecretsFromEnv, verifyHmacSignature } from '../_shared/hmac-validation.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { parseRequestOrReject } from '../_shared/contract-kit.ts';
import { CONTRACT_SCHEMAS } from '../_shared/contract-schemas.ts';
interface RecheckRequest {
  event_id: string;
  /** Assinatura observada no recebimento (opcional, vem do payload se presente). */
  observed_signature?: string;
}

interface RecheckResult {
  event_id: string;
  instance_name: string | null;
  event_type: string | null;
  created_at: string | null;
  secret_configured: boolean;
  observed_signature: string | null;
  computed_signature: string | null;
  signature_valid: boolean | null;
  reason: string;
}

// Fica local (não migrou pro módulo): a resposta diagnóstica expõe o digest
// recomputado (`computed_signature`) e a API de _shared/hmac-validation.ts só
// retorna boolean. A COMPARAÇÃO em si usa o módulo (verifyHmacSignature),
// mesmo primitivo do validador de produção (evolution-webhook).
async function computeHmac(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  try {
    // 1. AuthN + AuthZ — server-side JWT verification + admin/supervisor role check
    const authed = await requireAdminOrSupervisor(req);
    if (authed instanceof Response) return authed;
    const rl = checkRateLimit(`recheck-webhook-signature:${authed.user.id}`, 20, 60_000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 2. Body — contrato recheck-webhook-signature@v1: event_id obrigatório
    // (string 1..200), observed_signature opcional. Falha → envelope 422 único.
    const parsed = await parseRequestOrReject('recheck-webhook-signature', CONTRACT_SCHEMAS['recheck-webhook-signature'], req, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as RecheckRequest;

    // 3. Secret + client admin (service role, schema zapp)
    // Mesma cadeia de resolução do validador de produção (evolution-webhook):
    // EVOLUTION_WEBHOOK_SECRETS (lista de rotação) → EVOLUTION_WEBHOOK_SECRET
    // → WEBHOOK_SECRET legacy. Antes lia só o segundo/terceiro e ignorava a
    // lista de rotação — diagnóstico divergia do que o webhook aceitava de fato.
    const secrets = (() => {
      const evo = readWebhookSecretsFromEnv('EVOLUTION_WEBHOOK');
      if (evo.length > 0) return evo;
      const legacy = Deno.env.get('WEBHOOK_SECRET');
      return legacy ? [legacy] : [];
    })();
    const secret = secrets[0] ?? '';
    const ext = createZappAdminClient();

    // 4. Buscar evento
    const { data: ev, error: evErr } = await ext
      .from('evolution_webhook_events_v2')
      .select('id,event_type,instance_name,created_at,payload')
      .eq('id', body.event_id)
      .maybeSingle();
    if (evErr || !ev) {
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    const result: RecheckResult = {
      event_id: ev.id as string,
      instance_name: (ev.instance_name as string) ?? null,
      event_type: (ev.event_type as string) ?? null,
      created_at: (ev.created_at as string) ?? null,
      secret_configured: secret.length > 0,
      observed_signature: null,
      computed_signature: null,
      signature_valid: null,
      reason: '',
    };

    if (!secret) {
      result.reason =
        'WEBHOOK_SECRET não configurado no backend — impossível recomputar a assinatura.';
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 5. Extrair assinatura observada do payload (se a Evolution salvou nos headers)
    const payload = ev.payload as Record<string, unknown> | null;
    const headersField = (payload?._headers ?? payload?.headers ?? null) as
      | Record<string, string>
      | null;
    let observed = body.observed_signature ?? null;
    if (!observed && headersField) {
      const lower: Record<string, string> = {};
      for (const [k, v] of Object.entries(headersField)) lower[k.toLowerCase()] = String(v);
      observed =
        lower['x-hub-signature-256'] ??
        lower['x-signature'] ??
        lower['x-webhook-signature'] ??
        lower['x-evolution-signature'] ??
        null;
    }
    result.observed_signature = observed;

    // 6. Recomputar — usamos JSON.stringify do payload armazenado.
    // Limitação conhecida: o webhook original assina o RAW BODY, não o JSON re-serializado.
    // Diferenças de espaçamento/ordenação podem invalidar a assinatura mesmo com o secret correto.
    const raw = JSON.stringify(payload ?? {});
    const computed = await computeHmac(raw, secret);
    result.computed_signature = computed;

    if (!observed) {
      result.signature_valid = null;
      result.reason =
        'Evento não tem assinatura observada armazenada — não é possível comparar. ' +
        'A assinatura recomputada está disponível no campo `computed_signature` para inspeção manual.';
    } else {
      // Comparação via módulo canônico (normaliza prefixo sha256=, timing-safe),
      // tentando cada secret da rotação — mesma semântica de aceite do validador
      // de produção (evolution-webhook/WebhookSecurityService).
      let ok = false;
      for (const s of secrets) {
        if (await verifyHmacSignature(raw, observed, s)) {
          ok = true;
          break;
        }
      }
      result.signature_valid = ok;
      result.reason = ok
        ? 'Assinatura confere com o WEBHOOK_SECRET atual.'
        : 'Assinatura NÃO confere. Causas prováveis: (a) secret rotacionado após o recebimento, ' +
          '(b) JSON re-serializado difere do raw body original, (c) replay/adulteração do payload.';
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
