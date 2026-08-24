/**
 * Strings de UI do módulo chat — centralizadas para i18n futura (E82).
 * Estratégia: copy.ts canônico, sem dependência externa.
 * Uso: import { COPY } from './copy';
 */
export const COPY = {
  // ─── Criptografia ───────────────────────────────────────────────────────────
  encryptionNotice: {
    title: 'Criptografia de Ponta a Ponta',
    body: 'As mensagens são protegidas.',
  },

  // ─── ComposerCore ───────────────────────────────────────────────────────────
  composer: {
    // textarea defaults
    placeholder: 'Escreva sua mensagem...',
    placeholderWhisper: 'Sussurro interno (apenas agentes)...',
    placeholderReply: 'Digite sua resposta...',
    placeholderEdit: 'Editar mensagem...',
    // aria
    inputLabel: 'Digite sua mensagem',
    formLabel: 'Área de composição de mensagem',
    toolbarLabel: 'Barra de mensagem',
    plusLabel: 'Mais opções de mensagem',
    // Send button
    sendLabel: 'Enviar mensagem',
    sendingLabel: 'Enviando mensagem...',
    sendingInline: 'Enviando...',
    tooltipSending: '🚀 Mensagem sendo processada...',
    tooltipOverLimit: '⚠️ Limite de caracteres excedido',
    tooltipAttach: '📎 Clique para anexar arquivo',
    tooltipEdit: '✅ Confirmar alterações',
    sendTooltipDefault: '🚀 Enviar mensagem (Enter)',
    // Mic button
    micActiveLabel: 'Parar gravação',
    micIdleLabel: 'Gravar áudio',
    tooltipMicActive: '🔴 Gravando... Clique para parar',
    tooltipMicCantRecord: '🚫 Limpe o texto para gravar áudio',
    tooltipMicWaiting: '⏳ Aguarde o envio para gravar',
    tooltipMicIdle: '🎤 Gravar áudio (Segure ou clique)',
  },

  // ─── Chat messages area ─────────────────────────────────────────────────────
  messages: {
    regionLabel: 'Mensagens da conversa',
    skipLink: 'Ir para mensagens',
    loadingPrev: 'Carregando mensagens anteriores...',
  },

  // ─── Sentimento (ChatPanelHeader) ───────────────────────────────────────────
  sentiment: {
    critical: 'Sentimento Crítico',
    negative: 'Sentimento Negativo',
    positive: 'Sentimento Positivo',
  },
} as const;
