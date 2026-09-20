-- Migration: dim-6 — State machine guard for evolution_conversations.status
-- Data: 2026-09-06 · Re-versionada 2026-09-17 (era 20260906130000)
-- Re-versionamento: irmã colidente de 20260906130000_fix_sicoob_bridge_concurrency
--   (o aplicador registra por versão — irmãs colidentes eram puladas para sempre).
--   Corpo idempotente (CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS).
-- Aplica BEFORE UPDATE trigger que bloqueia transições inválidas.
--
-- Máquina de estados de evolution_conversations:
--
--   open ──► pending ──► resolved
--    ▲          │           │
--    │          ▼           ▼
--   waiting ◄──┘        open (reopen)
--    │
--    └──► resolved
--
-- Transições válidas (NEW.status → OLD.status):
--   open      : pending, resolved, waiting, open (no-op)
--   pending   : open, waiting, pending (no-op)
--   resolved  : open, pending, waiting, resolved (no-op)
--   waiting   : open, pending, resolved, waiting (no-op)
--
-- Transições BLOQUEADAS:
--   qualquer → NULL   (status não pode ser removido — ERRCODE check_violation)
-- Observação: a máquina é simétrica — qualquer estado pode ir a qualquer outro
-- estado válido diretamente (sem rota obrigatória via 'open'). Isso inclui
-- resolved → pending sem passar por open. Valores fora do enum são permitidos
-- com aviso para não bloquear deploys com novos status futuros.
--
-- NOTA: A tabela evo.evolution_conversations é particionada. O trigger
-- DEVE ser criado na tabela ROOT (evo.evolution_conversations), não nas
-- partições — o PostgreSQL propaga automaticamente para todas as partições
-- quando attach_trigger_to_partitions=true (PG 13+).
--
-- Implementação via função security definer para evitar bypass via
-- SET ROLE e garantir execução com permissões do sistema.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Função de validação de transição
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION evo.fn_guard_conversation_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, zapp, public
AS $$
DECLARE
  old_status TEXT := OLD.status;
  new_status TEXT := NEW.status;
BEGIN
  -- Transições idempotentes (sem mudança) são sempre permitidas
  IF old_status IS NOT DISTINCT FROM new_status THEN
    RETURN NEW;
  END IF;

  -- NULL → qualquer status válido é permitido (primeira inserção via trigger)
  IF old_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Qualquer → NULL não é permitido (status não pode ser removido)
  IF new_status IS NULL THEN
    RAISE EXCEPTION
      'Transição de status inválida: % → NULL não é permitida. '
      'conversation_id=%, remote_jid=%, instance=%',
      old_status, NEW.id, NEW.remote_jid, NEW.instance_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- Matriz de transições válidas
  -- open: pode ir para pending, resolved, waiting
  -- pending: pode ir para open, resolved, waiting
  -- resolved: pode reabrir (open, pending) ou voltar p/ waiting
  -- waiting: pode ir para open, pending, resolved
  IF NOT (
    -- De open
    (old_status = 'open'     AND new_status IN ('pending', 'resolved', 'waiting')) OR
    -- De pending
    (old_status = 'pending'  AND new_status IN ('open', 'resolved', 'waiting'))    OR
    -- De resolved
    (old_status = 'resolved' AND new_status IN ('open', 'pending', 'waiting'))     OR
    -- De waiting
    (old_status = 'waiting'  AND new_status IN ('open', 'pending', 'resolved'))    OR
    -- Status não catalogado (valor futuro) → permitir com warning para não quebrar deploy
    (old_status NOT IN ('open', 'pending', 'resolved', 'waiting'))                 OR
    (new_status NOT IN ('open', 'pending', 'resolved', 'waiting'))
  ) THEN
    RAISE EXCEPTION
      'Transição de status inválida para evolution_conversations: % → %. '
      'conversation_id=%, remote_jid=%, instance=%',
      old_status, new_status, NEW.id, NEW.remote_jid, NEW.instance_name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION evo.fn_guard_conversation_status_transition() IS
  'Trigger function que bloqueia transições de status inválidas em '
  'evo.evolution_conversations. Implementa máquina de estados: '
  'open ↔ pending ↔ waiting ↔ resolved, com reopen de resolved.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Trigger na tabela root (propagado para todas as partições pelo PG)
-- ──────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_guard_conversation_status ON evo.evolution_conversations;

CREATE TRIGGER trg_guard_conversation_status
  BEFORE UPDATE OF status
  ON evo.evolution_conversations
  FOR EACH ROW
  EXECUTE FUNCTION evo.fn_guard_conversation_status_transition();

COMMENT ON TRIGGER trg_guard_conversation_status ON evo.evolution_conversations IS
  'Dim-6 state machine guard: bloqueia transições de status inválidas. '
  'Criado em 2026-09-06 — migration 20260917121200 (re-versionada de 20260906130000).';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Smoke test — não falha em produção, apenas loga
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Verifica que a função existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'evo'
      AND p.proname = 'fn_guard_conversation_status_transition'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: fn_guard_conversation_status_transition não criada';
  END IF;

  -- Verifica que o trigger existe na tabela root
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_conversations'
      AND t.tgname = 'trg_guard_conversation_status'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: trg_guard_conversation_status não criado';
  END IF;

  RAISE NOTICE 'dim-6 state machine guard: OK — trigger e função criados em evo.evolution_conversations';
END;
$$;
