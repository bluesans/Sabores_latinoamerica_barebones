import { useCallback, useEffect, useRef } from 'react';

/**
 * Pila global de overlays para que Escape/Tab los atienda de arriba hacia abajo.
 * Sin esto, un modal y el panel de atrás escuchan el mismo `document` y ambos
 * reaccionan al mismo keydown.
 */
const stack: symbol[] = [];

export function useOverlayLayer(active = true): () => boolean {
  const id = useRef(Symbol('overlay')).current;

  useEffect(() => {
    if (!active) return;
    stack.push(id);
    return () => {
      const index = stack.lastIndexOf(id);
      if (index >= 0) stack.splice(index, 1);
    };
  }, [active, id]);

  return useCallback(() => stack[stack.length - 1] === id, [id]);
}
