/**
 * Regressão BUG-A (commit 244a32bba): `useEffect(() => cleanup, [saveSettings])`
 * disparava a cleanup function — e portanto um save real — a cada tick de
 * slider TTS, porque `saveSettings` (useCallback com deps [settings]) mudava
 * de identidade a cada `updateSettings`. Resultado: 12x
 * 'SupabaseQueueSaturatedError' por sessão em vez de 1 save debounced.
 *
 * Este teste exercita `useDebouncedSaveSettings` (lógica extraída de
 * ChatPanel.tsx) simulando exatamente esse cenário: `saveFn` muda de
 * identidade a cada re-render (como `saveSettings` fazia), e o hook é
 * re-renderizado a cada chamada de `debouncedSave()` (como o React faz a
 * cada tick de slider). Antes do fix, isso disparava um save por tick;
 * depois do fix, apenas 1 save após o debounce de 500ms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedSaveSettings } from '../useDebouncedSaveSettings';

describe('useDebouncedSaveSettings — regressão do saveSettings loop (BUG-A)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('5 ticks rápidos com saveFn trocando de identidade resultam em 1 único save após o debounce', () => {
    // Contador compartilhado: cada tick troca a identidade de saveFn (como o
    // useCallback de saveSettings fazia a cada updateSettings), então o que
    // importa é o TOTAL de saves reais disparados, não uma instância fixa.
    let totalCalls = 0;
    const makeSaveFn = () =>
      vi.fn(() => {
        totalCalls += 1;
        return Promise.resolve(true);
      });

    const { result, rerender } = renderHook(
      ({ saveFn }: { saveFn: () => Promise<boolean> }) => useDebouncedSaveSettings(saveFn),
      { initialProps: { saveFn: makeSaveFn() } }
    );

    // Simula 5 ticks de slider: cada tick chama debouncedSave() e o
    // componente é re-renderizado com uma NOVA identidade de saveFn (como
    // saveSettings, que é um useCallback com `settings` nas deps).
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current();
      });
      rerender({ saveFn: makeSaveFn() });
    }

    // Antes do debounce disparar: nenhum save deve ter ocorrido.
    expect(totalCalls).toBe(0);

    // Avança o debounce de 500ms: exatamente 1 save, não 5.
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(totalCalls).toBe(1);
  });

  it('desmontar com save pendente dispara o save (cleanup real), mas apenas 1 vez — não a cada re-render', () => {
    // Contador compartilhado: cada nova identidade de saveFn incrementa o
    // MESMO contador, então o teste mede o total de saves reais disparados,
    // independente de qual identidade de saveFn estava ativa no momento.
    let totalCalls = 0;
    const makeSaveFn = () =>
      vi.fn(() => {
        totalCalls += 1;
        return Promise.resolve(true);
      });

    const { result, rerender, unmount } = renderHook(
      ({ saveFn }: { saveFn: () => Promise<boolean> }) => useDebouncedSaveSettings(saveFn),
      { initialProps: { saveFn: makeSaveFn() } }
    );

    act(() => {
      result.current();
    });

    // Re-renderiza várias vezes com saveFn de identidade nova ANTES do
    // debounce disparar — regressão do BUG-A: isso NÃO deve acionar saves
    // espúrios via cleanup do effect (deps deveriam ser [], não [saveFn]).
    for (let i = 0; i < 4; i++) {
      rerender({ saveFn: makeSaveFn() });
    }
    expect(totalCalls).toBe(0);

    // Desmonta com o timer ainda pendente: cleanup real dispara 1 save.
    unmount();
    expect(totalCalls).toBe(1);
  });
});
