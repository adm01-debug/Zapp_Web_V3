import "@testing-library/jest-dom";

// framer-motion/motion-dom cancela animações durante o teardown do happy-dom,
// emitindo AbortError como rejeição não tratada. Isso não indica falha real —
// todos os testes passam. Suprimimos apenas esse erro específico.
process.on('unhandledRejection', (reason) => {
  if (
    reason instanceof Error &&
    reason.name === 'AbortError' &&
    reason.message === 'The animation was canceled.'
  ) {
    return;
  }
  throw reason;
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
