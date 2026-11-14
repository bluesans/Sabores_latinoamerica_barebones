import { forwardRef, type RefObject, useImperativeHandle, useRef, useState } from 'react';
import type { Country } from '../api/types';

interface MapTipState {
  country: Country;
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
}

export interface MapTipHandle {
  show: (country: Country, clientX: number, clientY: number) => void;
  hide: () => void;
}

/**
 * Tooltip aislado del MapView: mover el mouse no re-renderiza los 22 paths SVG.
 */
export const MapTip = forwardRef<MapTipHandle, { shellRef: RefObject<HTMLDivElement | null> }>(
  function MapTip({ shellRef }, ref) {
    const [tip, setTip] = useState<MapTipState | null>(null);
    const current = useRef<Country | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        show(country, clientX, clientY) {
          const rect = shellRef.current?.getBoundingClientRect();
          if (!rect) return;
          current.current = country;
          const x = clientX - rect.left;
          const y = clientY - rect.top;
          const flipX = x > rect.width - 270;
          const flipY = y > rect.height - 96;
          setTip({
            country,
            x: x + (flipX ? -16 : 16),
            y: y + (flipY ? -14 : 18),
            flipX,
            flipY,
          });
        },
        hide() {
          current.current = null;
          setTip(null);
        },
      }),
      [shellRef],
    );

    return (
      <div
        className={`tip${tip ? ' show' : ''}`}
        style={{
          left: tip?.x ?? 0,
          top: tip?.y ?? 0,
          transform: tip
            ? `translate(${tip.flipX ? '-100%' : '0'}, ${tip.flipY ? '-100%' : '0'})`
            : undefined,
          opacity: tip ? 1 : 0,
        }}
      >
        {tip ? (
          <>
            <span className="tip-flag">{tip.country.emoji || '🌎'}</span>
            <div>
              <b>{tip.country.name}</b>
              <small>
                {tip.country.recipe_count > 0
                  ? `${tip.country.recipe_count} recetas disponibles`
                  : 'Sin recetas por ahora'}
              </small>
            </div>
          </>
        ) : null}
      </div>
    );
  },
);
