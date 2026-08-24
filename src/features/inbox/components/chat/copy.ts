/**
 * Strings de UI do módulo chat — centralizadas para i18n futura (E82).
 * Estratégia: copy.ts canônico, sem dependência externa.
 * Uso: import { COPY } from './copy';  (chat) ou '../chat/copy' (outros)
 */
export const COPY = {
  // ─── Criptografia ───────────────────────────────────────────────────────────
  encryptionNotice: {
    title: 'Criptografia de Ponta a Ponta',
    body: 'As mensagens são protegidas.',
  },

  // ─── ComposerCore ───────────────────────────────────────────────────────────
  composer: {
    placeholder: 'Escreva sua mensagem...',
    placeholderWhisper: 'Sussurro interno (apenas agentes)...',
    placeholderReply: 'Digite sua resposta...',
    placeholderEdit: 'Editar mensagem...',
    ariaLabel: 'Digite sua mensagem',
    ariaLabelReply: 'Responder mensagem',
    ariaLabelEdit: 'Editar mensagem',
    ariaForm: 'Área de composição de mensagem',
    ariaToolbar: 'Barra de mensagem',
    ariaMore: 'Mais opções de mensagem',
    sendLabel: 'Enviar mensagem',
    sendingLabel: 'Enviando mensagem...',
    sendTooltipSending: '🚀 Mensagem sendo processada...',
    sendTooltipOverLimit: '⚠️ Limite de caracteres excedido',
    sendTooltipAttach: '📎 Clique para anexar arquivo',
    sendTooltipEdit: '✅ Confirmar alterações',
    sendTooltipDefault: '🚀 Enviar mensagem (Enter)',
    micLabelRecording: 'Parar gravação',
    micLabelIdle: 'Gravar áudio',
    micTooltipRecording: '🔴 Gravando... Clique para parar',
    micTooltipBlocked: '🚫 Limpe o texto para gravar áudio',
    micTooltipWait: '⏳ Aguarde o envio para gravar',
    micTooltipDefault: '🎤 Gravar áudio (Segure ou clique)',
    sendingLabel_short: 'Enviando...',
  },

  // ─── Chat messages area ─────────────────────────────────────────────────────
  messages: {
    ariaLog: 'Mensagens da conversa',
    skipLink: 'Ir para mensagens',
    loadingPrev: 'Carregando mensagens anteriores...',
  },

  // ─── Sentimento (ChatPanelHeader) ───────────────────────────────────────────
  sentiment: {
    critical: 'Sentimento Crítico',
    negative: 'Sentimento Negativo',
    positive: 'Sentimento Positivo',
  },

  // ─── Bolha (Bubble) ─────────────────────────────────────────────────────────
  bubble: {
    sent: 'Mensagem enviada',
    received: 'Mensagem recebida',
  },
} as const;
