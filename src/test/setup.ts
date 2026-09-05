import "@testing-library/jest-dom";

// framer-motion usa Element.animate() — no happy-dom, cancelar a animação
// durante o teardown rejeita a Promise `finished` com AbortError. Substituímos
// o método por um stub que retorna Promises que nunca rejeitam, prevenindo o
// erro na origem sem risco de mascarar AbortError de fetches reais.
if (typeof Element !== 'undefined') {
  const animationStub = (): Animation => {
    const noop = () => {};
    const stub: Record<string, unknown> = {
      cancel: noop, finish: noop, pause: noop, play: noop, reverse: noop,
      commitStyles: noop, persist: noop, updatePlaybackRate: noop,
      addEventListener: noop, removeEventListener: noop,
      dispatchEvent: () => false,
      currentTime: 0, startTime: null, playbackRate: 1,
      playState: 'idle', replaceState: 'active', pending: false,
      effect: null, timeline: null, id: '',
      oncancel: null, onfinish: null, onremove: null,
    };
    // Resolve imediatamente para que callbacks de conclusão disparem normalmente
    // sem depender do happy-dom (que rejeita com AbortError ao cancelar).
    stub.ready = Promise.resolve(stub as unknown as Animation);
    stub.finished = Promise.resolve(stub as unknown as Animation);
    return stub as unknown as Animation;
  };
  Element.prototype.animate = animationStub;
}

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
