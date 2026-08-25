import { useEffect, useRef } from "react";

/**
 * Returns a ref that is `true` while the component is mounted and `false`
 * after it unmounts. Use this to guard async callbacks against post-unmount
 * setState calls:
 *
 *   const mountedRef = useMountedRef();
 *   const data = await fetchSomething();
 *   if (!mountedRef.current) return;
 *   setData(data);
 *
 * StrictMode-safe: o setup body reseta `current = true` no remount, evitando
 * que o ciclo mount→unmount→remount do React 18 deixe o ref permanentemente
 * false após a primeira desmontagem de desenvolvimento.
 */
export function useMountedRef() {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;          // reset no mount/remount (StrictMode)
    return () => { mountedRef.current = false; };
  }, []);
  return mountedRef;
}
