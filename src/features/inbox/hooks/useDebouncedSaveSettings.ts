import { useCallback, useEffect, useRef } from 'react';

/**
 * Debounce de save com ref para a versão mais atual de `saveFn` — evita que o
 * cleanup do effect de unmount dispare a cada re-render (BUG-A: saveSettings
 * mudava identidade a cada updateSettings, e um effect com deps [saveSettings]
 * acionava a cleanup function — logo um save real — em cada tick de slider,
 * não só no unmount real do componente).
 */
export function useDebouncedSaveSettings(
  saveFn: () => Promise<boolean>,
  delayMs = 500
): () => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const debouncedSave = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveFnRef.current();
    }, delayMs);
  }, [delayMs]);

  // Deps vazias: roda uma única vez no mount, cleanup só no unmount real —
  // NÃO deve depender de saveFn/saveFnRef (é isso que causava o BUG-A).
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void saveFnRef.current();
      }
    },
    []
  );

  return debouncedSave;
}
