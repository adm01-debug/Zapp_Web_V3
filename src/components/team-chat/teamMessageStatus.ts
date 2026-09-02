import type { MessageUIStatus } from '@/types/messageStatus';

/**
 * Mantém a UI fail-safe quando uma linha antiga ou payload realtime traz um
 * status fora do contrato atual. Valores conhecidos preservam sua semântica;
 * ausentes/desconhecidos mantêm o fallback histórico de mensagem enviada.
 */
export function normalizeTeamMessageStatus(status: string | null | undefined): MessageUIStatus {
  switch (status) {
    case 'pending':
    case 'sending':
    case 'retrying':
    case 'sent':
    case 'delivered':
    case 'read':
    case 'played':
    case 'failed':
    case 'failed_auth':
    case 'failed_retries':
      return status;
    default:
      return 'sent';
  }
}
