import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { ExtendedDatabase } from './types-manual';
import { getLogger } from '@/lib/logger';
import { cookieStorage } from './cookieStorage';
import { withRetry } from '@/lib/retry';

const log = getLogger('supabase-client');

// Re-export so callers that need the specific type can use it
/** Re-exported module members. */
export type { Database, ExtendedDatabase };

// ---------------------------------------------------------------------------
// Self-hosted production Supabase (AtomicaBR VPS)
// This is the authoritative backend for the ZAPP Web platform.
// URL is not a secret — all data access is enforced by RLS.
// The anon key MUST come from VITE_SUPABASE_ANON_KEY or
// VITE_SUPABASE_PUBLISHABLE_KEY environment variables.
// DO NOT add a hardcoded key here — use GitHub Secrets / Vercel env vars.
// DO NOT point VITE_SUPABASE_URL at a Lovable Cloud project: the real data
// lives in this self-hosted instance (production data is authoritative).
// ---------------------------------------------------------------------------
const SELF_HOSTED_URL = 'https://supabase.atomicabr.com.br';

// ---------------------------------------------------------------------------
// Hardened configuration detection
// ---------------------------------------------------------------------------
const PLACEHOLDER_TOKENS = new Set([
  'undefined',
  'null',
  'missing-anon-key',
  'your-anon-key',
  'your-project-url',
  'your-supabase-url',
  'your-supabase-anon-key',
  'your_supabase_url',
  'your_supabase_anon_key',
  'changeme',
  'todo',
]);
const SENTINEL_HOST = 'supabase-unconfigured.invalid';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function isPlaceholder(value: string): boolean {
  return value.length === 0 || PLACEHOLDER_TOKENS.has(value.toLowerCase());
}
function isValidSupabaseUrl(value: unknown): boolean {
  const v = normalize(value);
  if (isPlaceholder(v)) return false;
  if (v.toLowerCase().includes(SENTINEL_HOST)) return false;
  return /^https?:\/\/[^\s]+$/i.test(v);
}
function isValidSupabaseKey(value: unknown): boolean {
  const v = normalize(value);
  if (isPlaceholder(v)) return false;
  return v.length >= 20;
}

const envUrl = import.meta.env.VITE_SUPABASE_URL;
// Suporte a ambos os nomes de variável (GitHub secret: VITE_SUPABASE_PUBLISHABLE_KEY)
const envKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isLovableCloudUrl = typeof envUrl === 'string' && envUrl.includes('.supabase.co');

const SUPABASE_URL = !isLovableCloudUrl && isValidSupabaseUrl(envUrl) ? envUrl : SELF_HOSTED_URL;

// Chave vem EXCLUSIVAMENTE de env vars — sem fallback hardcoded.
// Defina VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY) no
// ambiente de deploy (Vercel Dashboard / GitHub Secrets → deploy-vps.yml).
const SUPABASE_ANON_KEY = isValidSupabaseKey(envKey) ? envKey : '';

/** is Supabase Configured. */
export const isSupabaseConfigured =
  isValidSupabaseUrl(SUPABASE_URL) && isValidSupabaseKey(SUPABASE_ANON_KEY);

let warnedUnconfigured = false;
/** warn Supabase Unconfigured. */
export function warnSupabaseUnconfigured(context?: string): void {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  log.warn(
    '[Supabase] Modo degradado: cliente nao configurado' +
      (context ? ` (origem: ${context})` : '') +
      '. Chamadas de rede desativadas.'
  );
}

if (!isSupabaseConfigured) {
  log.error(
    '[Supabase] URL ou chave invalida — verifique VITE_SUPABASE_URL e ' +
      'VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY) no ambiente de deploy.'
  );
} else {
  if (isLovableCloudUrl) {
    log.info(
      `[Supabase] VITE_SUPABASE_URL aponta para um projeto Supabase Cloud (.supabase.co: ${envUrl}) — IGNORADO. ` +
        `Usando self-hosted: ${SELF_HOSTED_URL}. ` +
        `Corrija o .env para apontar para a instância self-hosted.`
    );
  } else if (!isValidSupabaseUrl(envUrl) || !isValidSupabaseKey(envKey)) {
    log.info(
      '[Supabase] Usando URL self-hosted (SELF_HOSTED_URL como fallback). ' +
        'Para remover este aviso, defina VITE_SUPABASE_URL no ambiente de deploy.'
    );
  }
  // Log da URL resolvida sempre (nao so DEV) para facilitar diagnostico em prod
  // eslint-disable-next-line no-console
  console.info(
    `[Supabase] Backend resolvido: ${SUPABASE_URL === SELF_HOSTED_URL ? 'self-hosted (AtomicaBR)' : SUPABASE_URL}`
  );
}

const supabaseUrl = isSupabaseConfigured ? SUPABASE_URL : 'https://supabase-unconfigured.invalid';
const supabaseAnonKey = isSupabaseConfigured ? SUPABASE_ANON_KEY : 'missing-anon-key';

const realtimeReconnectAfterMs = (tries: number): number =>
  Math.min(1000 * 2 ** Math.max(0, tries - 1), 30000);

// ---------------------------------------------------------------------------
// Bounded fetch — nenhuma chamada de rede do Supabase pode pendurar para sempre.
//
// O backend self-hosted normalmente responde em <300ms, mas um edge/proxy
// travado ou uma conexao derrubada pode deixar um request pendente
// indefinidamente. Sem limite, auth.getSession() (que faz single-flight de um
// refresh de token) pendura pela janela inteira do race no app e trava o
// bootstrap de auth. Um timeout via AbortController converte qualquer stall em
// falha rapida e limpa: getSession rejeita, o single-flight e liberado e o
// autoRefreshToken se recupera no proximo tick. Um AbortSignal do caller
// (realtime, aborts por request) e respeitado e encadeado.
// ---------------------------------------------------------------------------
const SUPABASE_FETCH_TIMEOUT_MS = 12_000;

// Cooldown global de rate-limit — após um 429, pausa novas aquisições de
// slot por RATE_LIMIT_COOLDOWN_MS. O semaforo canônico vive em retryFetch;
// boundedFetch apenas aguarda o cooldown mantendo o MESMO slot ocupado.
// Assim nao existe uma segunda fila capaz de divergir do trabalho de rede.
let _rateLimitCooldownUntil = 0;
const RATE_LIMIT_COOLDOWN_MS = 2000; // 2s global pause after 429

// FIX 2026-08-03: Detector de DB degradado.
// Quando queries lentas (>5s) ocorrem, ativa cooldown temporário que
// desacelera o drain da fila — evita acumular novas queries enquanto o
// DB ainda está processando as anteriores (spiral-of-death prevention).
let _slowQueryCooldownUntil = 0;
const SLOW_QUERY_THRESHOLD_MS = 5_000;
const SLOW_QUERY_COOLDOWN_MS = 3_000; // 3s pause after a slow query
/** Chama no início de cada RPC: registra timestamp de início. */
export function markQueryStart(): number {
  return Date.now();
}
/** Chama no fim de cada RPC: se demorou demais, ativa cooldown do pool. */
export function markQueryEnd(startMs: number): void {
  if (Date.now() - startMs > SLOW_QUERY_THRESHOLD_MS) {
    _slowQueryCooldownUntil = Math.max(
      _slowQueryCooldownUntil,
      Date.now() + SLOW_QUERY_COOLDOWN_MS
    );
  }
}

const _activeControllers = new Set<AbortController>();

if (typeof window !== 'undefined') {
  window.addEventListener(
    'beforeunload',
    () => {
      for (const ctrl of _activeControllers) {
        try {
          ctrl.abort(new DOMException('Page unload', 'AbortError'));
        } catch {
          /* abort errors expected during page unload */
        }
      }
      _activeControllers.clear();
    },
    { once: true }
  );
}

const makeTimeoutReason = (): unknown =>
  typeof DOMException !== 'undefined'
    ? new DOMException('Supabase request timed out', 'TimeoutError')
    : Object.assign(new Error('Supabase request timed out'), { name: 'TimeoutError' });

async function waitForSupabaseCooldown(signal?: AbortSignal | null): Promise<void> {
  while (true) {
    const remaining = Math.max(
      _rateLimitCooldownUntil - Date.now(),
      _slowQueryCooldownUntil - Date.now(),
      0
    );
    if (remaining <= 0) return;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, remaining + 50);
      const onAbort = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(makeAbortError('Supabase cooldown wait aborted'));
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

const boundedFetch: typeof fetch = async (input, init) => {
  // O unico gate de concorrencia e o semaforo de retryFetch. Aqui apenas
  // respeitamos cooldowns mantendo o slot ja adquirido ocupado.
  if (!isAuthRequest(input)) {
    await waitForSupabaseCooldown(init?.signal);
  }

  const controller = new AbortController();
  _activeControllers.add(controller);
  const timeoutId = setTimeout(
    () => controller.abort(makeTimeoutReason()),
    SUPABASE_FETCH_TIMEOUT_MS
  );

  // Cancela a request REAL quando o caller abandona o contato. O retry
  // semantico exclui AbortError, portanto nao existe tempestade de retry.
  // Auth continua removendo o signal no caller de retryFetch.
  const callerSignal = init?.signal ?? null;
  const abortFromCaller = () => {
    const reason = callerSignal?.reason ?? makeAbortError('Supabase request aborted by caller');
    controller.abort(reason);
  };
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

  const { signal: _callerSignal, ...restInit } = init ?? {};

  return fetch(input, { ...restInit, signal: controller.signal })
    .then((response) => {
      // Alguns mocks/transports podem ignorar AbortSignal. Nesse caso a
      // capacidade permanece ocupada ate a resposta, mas o resultado obsoleto
      // ainda deve ser descartado.
      if (controller.signal.aborted) {
        throw controller.signal.reason ?? makeAbortError('Supabase request aborted by caller');
      }
      return response;
    })
    .catch((err: unknown) => {
      // boundedFetch não reporta ao monitor de conectividade aqui — quem
      // reporta é retryFetch (após esgotar todas as tentativas) e o path de
      // auth. Reportar em cada tentativa individual consumiria os mocks do
      // health-ping durante testes e acusaria backend-down em falhas transitórias.
      throw err;
    })
    .finally(() => {
      callerSignal?.removeEventListener('abort', abortFromCaller);
      clearTimeout(timeoutId);
      _activeControllers.delete(controller);
    });
};

// ---------------------------------------------------------------------------
// Retry policy (F9-04) — o cliente supabase-js era criado sem qualquer retry:
// uma falha de rede transitória (`TypeError: Failed to fetch`), timeout ou um
// 5xx/429 do backend virava erro imediato no componente. Este wrapper envolve
// o boundedFetch em `withRetry` (src/lib/retry.ts):
//
//   - 3 tentativas no total (1 inicial + 2 retentativas), backoff exponencial
//     ~300ms/600ms (+ jitter ≤500ms, cap 900ms) — suficiente para absorver
//     blips sem mascarar indisponibilidade real nem estourar o SLA de UI;
//   - retenta APENAS falhas transitórias: erro de rede (TypeError), timeout
//     (TimeoutError) e HTTP 429/5xx. Nunca 4xx de negócio (400/401/403/404…);
//   - aborts do caller (navegação, realtime, unmount) NUNCA são retentados;
//   - chamadas de auth (/auth/v1/) passam direto: já cobertas pelo timeout do
//     boundedFetch e pelo single-flight do autoRefreshToken — retry aqui
//     criaria dupla temporização e re-execução de refresh token (F9-04 ação 3);
//   - bodies em stream (ReadableStream) passam direto — não podem ser refeitos;
//   - o monitor de conectividade só é acusado APÓS esgotar as tentativas: uma
//     falha que recuperou no retry não marca backend-down (evita falso positivo).
// ---------------------------------------------------------------------------
const SUPABASE_RETRY_MAX_RETRIES = 2; // 2 retentativas → 3 tentativas totais
const SUPABASE_RETRY_BASE_DELAY_MS = 300;
const SUPABASE_RETRY_MAX_DELAY_MS = 900;

/** Erro sintético para status HTTP retentáveis (429/5xx) — o fetch resolve, não rejeita. */
class RetryableHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Supabase request failed with HTTP ${status}`);
    this.name = 'RetryableHttpError';
    this.status = status;
  }
}

const describeFetchError = (err: unknown): string =>
  err instanceof RetryableHttpError
    ? `HTTP ${err.status}`
    : err instanceof Error
      ? err.message
      : String(err);

const isAbortError = (err: unknown): boolean => err instanceof Error && err.name === 'AbortError';

const getRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

/** Chamadas de auth do supabase-js (bootstrap, refresh token) — fora do retry. */
const isAuthRequest = (input: RequestInfo | URL): boolean =>
  getRequestUrl(input).includes('/auth/v1/');

/** Streams de body não podem ser reenviados — fora do retry. */
const hasStreamBody = (init?: RequestInit): boolean =>
  typeof ReadableStream !== 'undefined' && init?.body instanceof ReadableStream;

/** Política F9-04: só falhas transitórias são retentadas. */
const shouldRetryFetchError = (err: unknown): boolean => {
  if (isAbortError(err)) return false; // abort do caller nunca é retentado
  if (err instanceof TypeError) return true; // falha de rede
  // perf fix 2026-08-05: TimeoutError = DB query took too long, NOT a transient network blip.
  // A 30-51s query timeout signals DB saturation — retrying doubles pool pressure.
  // When RLS count(*) causes timeout, retry fires another heavy scan. Kill the cycle.
  if (err instanceof Error && err.name === 'TimeoutError') return false;
  if (err instanceof RetryableHttpError) return err.status === 429 || err.status >= 500;
  return false;
};

/** Reporta ao monitor de conectividade apenas falhas reais (rede/timeout), nunca aborts. */
function reportRealFailure(err: unknown): void {
  const isRealFailure =
    (err instanceof Error && err.name === 'TimeoutError') || err instanceof TypeError;
  if (!isRealFailure) return;
  // Avisa o monitor de conectividade para marcar backend-down imediatamente
  // (não espera o próximo heartbeat). Dynamic import evita ciclo de módulos
  // (client → monitor → client).
  void import('./connectivityMonitor')
    .then((m) => m.reportSupabaseRequestFailure(err))
    .catch(() => {});
}

/** Pool de concorrência com PRIORIZAÇÃO para o backend Supabase self-hosted.
 *
 * SEM este limitador, o browser abre até 6 conexões simultâneas por domínio
 * (HTTP/1.1). Na inbox com 5+ contatos visíveis, cada um dispara 2+ RPCs
 * (get_contact_360_by_phone + rpc_list_messages_lite), totalizando 10+
 * requisições simultâneas. As que excedem o limite ficam em fila no browser
 * (até 4-6s de latência) enquanto o pool Supabase também pode saturar.
 *
 * O semáforo limita a 8 requisições simultâneas para o backend Supabase,
 * garantindo que as demais aguardam em JS (com timeout curto) em vez de
 * congestionar o pool TCP e o connection pool do Supavisor/Kong.
 *
 * HISTÓRICO: Era 4. Aumentado para 8 em 2026-08-04 após análise de log que
 * mostrou semáforo saturado (inFlight:4, queueLength:2) atrasando getProfile
 * em 5+ segundos. Com as correções de N+1 (batch reactions + contact summary),
 * o número de requests concorrentes caiu, então 8 é seguro sem saturar o pool.
 *
 * PRIORIZAÇÃO: _acquireSupabaseSlot() aceita opção `priority: 'high'`.
 * Requisições high-priority (ex.: contato selecionado) furam a fila FIFO,
 * garantindo que o usuário veja os dados do contato ativo primeiro.
 *
 * Requisições de auth NUNCA passam pelo semáforo (já são bypass no retryFetch). */
const SUPABASE_MAX_CONCURRENT = 8; // 2026-08-04: 4→8 (semáforo saturado em prod)

// ---------------------------------------------------------------------------
// Timeout de espera na fila do semáforo (FIX incidente 18/08 22:09Z).
//
// O incidente de referência mostrou 104 RPCs com durations 4→39s lineares:
// a cauda da fila esperava dezenas de segundos por um slot (48+ RPCs na fila,
// 8 slots, dreno serial). O DB estava rápido (EXPLAIN ≤13ms) — o gargalo era
// a ESPERA na fila JS, não a query.
//
// Com QUEUE_WAIT_TIMEOUT_MS, qualquer acquire que espere mais de 15s por um
// slot rejeita com SupabaseQueueTimeoutError (falha rápida) e SAI da fila —
// a cauda de 39s vira erro em 15s. O erro NÃO é retentado pelo withRetry
// (não é TypeError/TimeoutError/RetryableHttpError) e NÃO acusa o monitor de
// conectividade (reportRealFailure só trata TimeoutError/TypeError); o retry
// natural vem do TanStack Query, que re-dispara a query com backoff quando a
// fila drena.
//
// O timeout NÃO libera slot: a entrada na fila nunca teve slot (só resume()
// incrementa _supabaseInFlight) — ela é apenas removida da fila e rejeitada.
// ---------------------------------------------------------------------------
export const QUEUE_WAIT_TIMEOUT_MS = 15_000;

let _supabaseInFlight = 0;

interface SupabaseQueueEntry {
  resume: () => void;
  reject: (err: unknown) => void;
  priority: 'normal' | 'high';
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Guarda de duplo-settle: resume/timeout/abort marcam settled UMA vez. */
  settled: boolean;
}

const _supabaseQueue: SupabaseQueueEntry[] = [];

/** Erro sintético de abort compatível com DOMException onde disponível. */
const makeAbortError = (reason: string): Error =>
  typeof DOMException !== 'undefined'
    ? new DOMException(reason, 'AbortError')
    : Object.assign(new Error(reason), { name: 'AbortError' });

/** Erro sintético de timeout de fila — NÃO é AbortError nem TimeoutError (sem retry). */
const makeQueueTimeoutError = (): Error =>
  Object.assign(new Error('Supabase queue wait timed out'), {
    name: 'SupabaseQueueTimeoutError',
  });

// Cleanup on page unload: evita memory leak por promises órfãs
// e garante que a fila não cresça sem limite em SPAs com navegação rápida.
if (typeof window !== 'undefined') {
  window.addEventListener(
    'beforeunload',
    () => {
      const unloadError = makeAbortError('Page unload');
      for (const entry of _supabaseQueue) {
        if (entry.settled) continue;
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        // entry.reject marca settled internamente — NÃO setar settled antes,
        // senão o guard do reject engole o erro e a Promise fica pendurada.
        entry.reject(unloadError);
      }
      _supabaseQueue.length = 0;
      _supabaseInFlight = 0;
    },
    { once: true }
  );
}

function _acquireSupabaseSlot(opts?: {
  priority?: 'normal' | 'high';
  signal?: AbortSignal | null;
}): Promise<void> {
  const priority = opts?.priority ?? 'normal';
  const signal = opts?.signal ?? null;

  // Signal já abortado ANTES do acquire: rejeita imediatamente, sem consumir
  // slot nem criar timer (caller cancelado não pode ocupar capacidade).
  if (signal?.aborted) {
    return Promise.reject(makeAbortError('Supabase slot acquire aborted'));
  }

  if (_supabaseInFlight < SUPABASE_MAX_CONCURRENT) {
    _supabaseInFlight++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const entry: SupabaseQueueEntry = {
      resume: () => {
        // settled guard: se timeout/abort já settleou (mesmo tick do timer),
        // este resume é de uma entrada morta — no-op.
        if (entry.settled) return;
        entry.settled = true;
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        signal?.removeEventListener('abort', onAbort);
        _supabaseInFlight++;
        resolve();
      },
      reject: (err: unknown) => {
        // settled guard: se o release já resumiu, reject é no-op (evita
        // duplo-settle e unhandled rejection de entrada viva).
        if (entry.settled) return;
        entry.settled = true;
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      },
      priority,
      timer: undefined,
      settled: false,
    };

    /** Remove a entrada da fila por identidade — preserva a ordem dos demais. */
    const removeFromQueue = () => {
      const idx = _supabaseQueue.indexOf(entry);
      if (idx >= 0) _supabaseQueue.splice(idx, 1);
    };

    /** Abort do caller durante a espera: mesma semântica do timeout. */
    const onAbort = () => {
      entry.reject(makeAbortError('Supabase slot acquire aborted'));
      removeFromQueue();
    };

    // Timeout de espera na fila: rejeita e REMOVE a entrada. NÃO libera slot
    // (a entrada nunca teve slot — só resume() incrementa _supabaseInFlight).
    entry.timer = setTimeout(() => {
      entry.reject(makeQueueTimeoutError());
      removeFromQueue();
    }, QUEUE_WAIT_TIMEOUT_MS);

    if (signal) {
      // AbortError de fila NÃO é retentado (TanStack não retenta abort e
      // shouldRetryFetchError retorna false para AbortError).
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // Cap de fila: rejeita requests normais quando a fila esta saturada.
    // High-priority (roles/profile/auth) nunca sao rejeitados por cap.
    // Sem cap, 200+ requests normais podem acumular indefinidamente durante
    // um boot storm — o cap garante falha rapida em vez de timeout de 15s.
    const QUEUE_CAP = 80;
    if (priority !== 'high' && _supabaseQueue.length >= QUEUE_CAP) {
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      entry.settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(
        Object.assign(new Error('Supabase queue saturated — request dropped'), {
          name: 'SupabaseQueueSaturatedError',
        })
      );
      return;
    }

    if (priority === 'high') {
      // Fura a fila: insere após o último high-priority (antes dos normal).
      // Usa loop reverso manual em vez de findLastIndex() para compatibilidade
      // com Safari < 15.4 / iOS < 15.4 (findLastIndex é ES2023).
      let lastHighIdx = -1;
      for (let i = _supabaseQueue.length - 1; i >= 0; i--) {
        if (_supabaseQueue[i].priority === 'high') {
          lastHighIdx = i;
          break;
        }
      }
      if (lastHighIdx >= 0) {
        _supabaseQueue.splice(lastHighIdx + 1, 0, entry);
      } else {
        _supabaseQueue.unshift(entry);
      }
    } else {
      _supabaseQueue.push(entry);
    }
  });
}

function _releaseSupabaseSlot(): void {
  _supabaseInFlight = Math.max(0, _supabaseInFlight - 1);
  const next = _supabaseQueue.shift();
  if (next) next.resume();
}

// ---------------------------------------------------------------------------
// API pública do semáforo — permite a callers fora do retryFetch (ex.:
// getProfile) furar a fila FIFO com prioridade 'high' SEM alterar o
// comportamento do retryFetch (que segue adquirindo slots 'normal').
//
// ⚠️ O slot adquirido DEVE ser liberado SEMPRE (padrão try/finally) — um
// slot órfão decrementa a capacidade do semáforo permanentemente (8 slots
// → 7 → ... até travar todas as requests não-auth).
// ---------------------------------------------------------------------------
/** Adquire um slot do semáforo de concorrência; retorna a função de release (chamar UMA vez, em finally). */
export async function acquireSupabaseSlot(
  priority: 'normal' | 'high' = 'normal',
  signal?: AbortSignal | null
): Promise<() => void> {
  await _acquireSupabaseSlot({ priority, signal });
  // Guarda de idempotência (FIX validação 2026-08-07): release duplicado
  // decrementaria o contador 2x e corromperia o semáforo (8 slots → 7 → ...).
  // Chamadas adicionais ao release são no-op.
  let released = false;
  return () => {
    if (released) return;
    released = true;
    _releaseSupabaseSlot();
  };
}

// ---------------------------------------------------------------------------
// Contexto de prioridade HIGH por chamada (FIX review 2026-08-06).
//
// Motivação: o getProfile NÃO pode adquirir slot manual + deixar o fetch
// interno (supabase.from(...)) adquirir OUTRO slot normal — isso seguraria 1
// slot durante a espera (inversão de prioridade) e poderia degradar a fila.
// O padrão correto: marcar o CONTEXTO da chamada como high; o retryFetch lê
// o flag e adquire UM ÚNICO slot com prioridade high (fura a fila, não
// segura capacidade extra).
//
// FIX validação 2026-08-07: CONTADOR de profundidade em vez de boolean —
// duas chamadas concorrentes com withSupabaseHighPriority não se clobberam
// (a que termina primeiro não derruba o high da outra).
// ---------------------------------------------------------------------------
let _highPriorityDepth = 0;
const _highPrioritySignalDepth = new WeakMap<AbortSignal, number>();

/** Executa `fn` com requests supabase (via retryFetch) priorizadas 'high' na fila do semáforo. */
export async function withSupabaseHighPriority<T>(fn: () => Promise<T>): Promise<T> {
  _highPriorityDepth++;
  try {
    return await fn();
  } finally {
    _highPriorityDepth--;
  }
}

/**
 * Prioriza somente a request que carrega este AbortSignal. Diferente do
 * contexto global legado, requests auxiliares concorrentes nao herdam a
 * prioridade da primeira pagina/mark-as-read.
 */
export async function withSupabaseHighPrioritySignal<T>(
  signal: AbortSignal,
  fn: () => Promise<T>
): Promise<T> {
  _highPrioritySignalDepth.set(signal, (_highPrioritySignalDepth.get(signal) ?? 0) + 1);
  try {
    return await fn();
  } finally {
    const remaining = (_highPrioritySignalDepth.get(signal) ?? 1) - 1;
    if (remaining <= 0) _highPrioritySignalDepth.delete(signal);
    else _highPrioritySignalDepth.set(signal, remaining);
  }
}

function isHighPrioritySignal(signal?: AbortSignal | null): boolean {
  return !!signal && (_highPrioritySignalDepth.get(signal) ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Estado do semáforo exposto para callers ajustarem timeouts adaptativos.
//
// O getProfile do AuthProvider NÃO é auth request (/auth/v1/), então entra na
// fila do semáforo e pode esperar 10-20s quando a inbox satura com 48+ RPCs.
// Expor inFlight/queueLength permite ao caller dimensionar o timeout pela
// saturação real em vez de chutar um valor fixo.
// ---------------------------------------------------------------------------
export interface SupabaseSemaphoreState {
  /** Requests em voo (slots ocupados). */
  inFlight: number;
  /** Requests aguardando slot na fila. */
  queueLength: number;
  /** Slots máximos do semáforo. */
  maxConcurrent: number;
  /** true quando todos os slots estão ocupados E há fila (saturação real). */
  saturated: boolean;
}

/** Leitura síncrona do semáforo de concorrência do retryFetch. */
export function getSupabaseSemaphoreState(): SupabaseSemaphoreState {
  return {
    inFlight: _supabaseInFlight,
    queueLength: _supabaseQueue.length,
    maxConcurrent: SUPABASE_MAX_CONCURRENT,
    saturated: _supabaseInFlight >= SUPABASE_MAX_CONCURRENT && _supabaseQueue.length > 0,
  };
}

// Expoe metricas do semaforo para debug em producao.
// Acesso: window.__zappPool no DevTools console.
// Atualizado a cada 30s e no carregamento inicial do modulo.
if (typeof window !== 'undefined') {
  const _updateWindowPoolMetrics = (): void => {
    (window as unknown as Record<string, unknown>).__zappPool = {
      inFlight: _supabaseInFlight,
      queued: _supabaseQueue.length,
      maxConcurrent: SUPABASE_MAX_CONCURRENT,
      saturated: _supabaseInFlight >= SUPABASE_MAX_CONCURRENT && _supabaseQueue.length > 0,
      ts: Date.now(),
    };
  };
  _updateWindowPoolMetrics();
  setInterval(_updateWindowPoolMetrics, 30_000);
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function hasIdempotencyKey(init?: RequestInit): boolean {
  if (!init?.headers) return false;
  const headers = new Headers(init.headers);
  return headers.has('Idempotency-Key');
}

/** Somente leituras e mutacoes explicitamente idempotentes podem ter retry de transporte. */
function isRetrySafeRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = getRequestMethod(input, init);
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || hasIdempotencyKey(init);
}

/** Fetch customizado injetado no supabase-js: timeout (boundedFetch) + retry (F9-04) + semáforo de concorrência. */
export const retryFetch: typeof fetch = async (input, init) => {
  if (isAuthRequest(input)) {
    // Auth requests nunca devem ser abortados por unmount do React
    // (StrictMode remount abortava o getSession e o supabase-js retentava em loop)
    const { signal: _callerSignal, ...restInit } = init ?? {};
    return boundedFetch(input, restInit as RequestInit).catch((err: unknown) => {
      reportRealFailure(err);
      throw err;
    });
  }

  // Semáforo: adquire slot antes de disparar a requisição.
  // Evita que 10+ RPCs simultâneas saturem o pool TCP e o Supavisor.
  // Prioridade high (contexto withSupabaseHighPriority, contador de
  // profundidade) fura a fila FIFO.
  // O signal do caller é repassado ao acquire e ao boundedFetch: abort durante
  // a fila nao consome slot; abort em voo cancela a request real.
  // Se o acquire rejeitar (timeout de fila/abort), o try abaixo não roda e o
  // finally não libera slot — correto, a entrada nunca teve slot.
  await _acquireSupabaseSlot({
    priority: _highPriorityDepth > 0 || isHighPrioritySignal(init?.signal) ? 'high' : 'normal',
    signal: init?.signal,
  });

  try {
    const retrySafe = !hasStreamBody(init) && isRetrySafeRequest(input, init);
    return await withRetry(
      async () => {
        const response = await boundedFetch(input, init);
        if (response.status === 429) {
          // Rate-limit: ativa o cooldown global ANTES do retry para que as
          // demais aquisições de slot esperem e não formem cascata de 429.
          _rateLimitCooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          // Não consumimos o body: a resposta será descartada e refeita.
          throw new RetryableHttpError(response.status);
        }
        if (response.status >= 500) {
          // Não consumimos o body: a resposta será descartada e refeita.
          throw new RetryableHttpError(response.status);
        }
        return response;
      },
      {
        maxRetries: retrySafe ? SUPABASE_RETRY_MAX_RETRIES : 0,
        baseDelayMs: SUPABASE_RETRY_BASE_DELAY_MS,
        maxDelayMs: SUPABASE_RETRY_MAX_DELAY_MS,
        shouldRetry: retrySafe ? shouldRetryFetchError : () => false,
        onRetry: (err, attempt) => {
          log.warn(
            `[Supabase] Tentativa ${attempt}/${SUPABASE_RETRY_MAX_RETRIES} falhou ` +
              `(${describeFetchError(err)}); retentando com backoff`
          );
        },
      }
    ).catch((err: unknown) => {
      // Só acusa o monitor após esgotar as tentativas.
      reportRealFailure(err);
      throw err;
    });
  } finally {
    // O slot representa trabalho real: so e liberado quando o fetch conclui
    // ou confirma o abort. Se um transporte ignorar AbortSignal, o slot fica
    // ocupado ate resposta/timeout em vez de declarar capacidade ficticia.
    _releaseSupabaseSlot();
  }
};

// ---------------------------------------------------------------------------
// ZAPP Web client — schema 'zapp' (schema canônico de todas as tabelas)
// ---------------------------------------------------------------------------
/** supabase. */
export const supabase = createClient<ExtendedDatabase, 'zapp'>(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'zapp',
  },
  auth: {
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  global: {
    fetch: retryFetch,
  },
  realtime: {
    reconnectAfterMs: realtimeReconnectAfterMs,
  },
});

if (!isSupabaseConfigured) {
  const originalChannel = supabase.channel.bind(supabase);
  supabase.channel = ((name: string, opts?: Parameters<typeof originalChannel>[1]) => {
    warnSupabaseUnconfigured('realtime');
    const channel = originalChannel(name, opts);
    channel.subscribe = (() => channel) as typeof channel.subscribe;
    return channel;
  }) as typeof supabase.channel;
}

/** SUPABASE_RESOLVED_URL. */
export const SUPABASE_RESOLVED_URL = supabaseUrl;
/** SUPABASE_RESOLVED_ANON_KEY. */
export const SUPABASE_RESOLVED_ANON_KEY = supabaseAnonKey;
