/**
 * Strings compartilhadas de UI do chat/composer.
 * Ficam em lib para permitir consumo por features distintas sem violar barreiras de domínio.
 */
export const CHAT_COPY = {
  encryptionNotice: {
    title: 'Criptografia de Ponta a Ponta',
    body: 'As mensagens são protegidas.',
  },
  composer: {
    placeholder: 'Escreva sua mensagem...',
    placeholderWhisper: 'Sussurro interno (apenas agentes)...',
    placeholderReply: 'Digite sua resposta...',
    placeholderEdit: 'Editar mensagem...',
    inputLabel: 'Digite sua mensagem',
    formLabel: 'Área de composição de mensagem',
    toolbarLabel: 'Barra de mensagem',
    plusLabel: 'Mais opções de mensagem',
    sendLabel: 'Enviar mensagem',
    sendingLabel: 'Enviando mensagem...',
    sendingInline: 'Enviando...',
    tooltipSending: '🚀 Mensagem sendo processada...',
    tooltipOverLimit: '⚠️ Limite de caracteres excedido',
    tooltipAttach: '📎 Clique para anexar arquivo',
    tooltipEdit: '✅ Confirmar alterações',
    sendTooltipDefault: '🚀 Enviar mensagem (Enter)',
    micActiveLabel: 'Parar gravação',
    micIdleLabel: 'Gravar áudio',
    tooltipMicActive: '🔴 Gravando... Clique para parar',
    tooltipMicCantRecord: '🚫 Limpe o texto para gravar áudio',
    tooltipMicWaiting: '⏳ Aguarde o envio para gravar',
    tooltipMicIdle: '🎤 Gravar áudio (Segure ou clique)',
  },
  messages: {
    regionLabel: 'Mensagens da conversa',
    skipLink: 'Ir para mensagens',
    loadingPrev: 'Carregando mensagens anteriores...',
  },
  sentiment: {
    critical: 'Sentimento Crítico',
    negative: 'Sentimento Negativo',
    positive: 'Sentimento Positivo',
  },
} as const;

export const COPY = CHAT_COPY;
