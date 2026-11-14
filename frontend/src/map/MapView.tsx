import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Country } from '../api/types';
import { prefersReducedMotion } from '../lib/motion';
import { renderCountries, VB_H, VB_W } from './geo';
import { MapTip, type MapTipHandle } from './MapTip';
import { useGeoLayers } from './useGeoLayers';

interface View {
  k: number;
  x: number;
  y: number;
}

interface MapViewProps {
  countries: Country[];
  selectedCountryId: number | null;
  onSelect: (country: Country, opener: SVGGElement | null) => void;
  onEscape: () => void;
}

const IDENTITY: View = { k: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function MapView({ countries, selectedCountryId, onSelect, onEscape }: MapViewProps) {
  const { geo, hd, loading } = useGeoLayers();
  const [view, setView] = useState<View>(IDENTITY);
  const [dragging, setDragging] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<MapTipHandle | null>(null);
  const hoveredCountry = useRef<Country | null>(null);
  const viewRef = useRef<View>(IDENTITY);
  const countryRefs = useRef(new Map<number, SVGGElement>());
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ sx: number; sy: number; moved: number } | null>(null);
  const draggingRef = useRef(false);
  const pinchPrev = useRef<number | null>(null);
  const downCountry = useRef<Country | null>(null);
  const animRef = useRef<number | null>(null);
  const lastSelected = useRef<number | null>(null);

  const rendered = useMemo(() => renderCountries(countries, geo), [countries, geo]);
  const selectable = rendered.filter((entry) => entry.info.recipe_count > 0);

  const commitView = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const metrics = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { rect: { width: 0, height: 0 }, s: 1, ox: 0, oy: 0 };
    const s = Math.min(rect.width / VB_W, rect.height / VB_H);
    return {
      rect,
      s,
      ox: (rect.width - VB_W * s) / 2,
      oy: (rect.height - VB_H * s) / 2,
    };
  }, []);

  const zoomAt = useCallback(
    (screenX: number, screenY: number, factor: number) => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      const m = metrics();
      if (m.rect.width === 0 || m.rect.height === 0 || m.s <= 0) return;
      const current = viewRef.current;
      const nextK = clamp(current.k * factor, 0.65, 9);
      const wx = ((screenX - m.ox) / m.s - current.x) / current.k;
      const wy = ((screenY - m.oy) / m.s - current.y) / current.k;
      commitView({
        k: nextK,
        x: (screenX - m.ox) / m.s - wx * nextK,
        y: (screenY - m.oy) / m.s - wy * nextK,
      });
    },
    [commitView, metrics],
  );

  const animateView = useCallback(
    (target: View, duration = 450) => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
      if (prefersReducedMotion()) {
        commitView(target);
        return;
      }
      const from = { ...viewRef.current };
      const started = performance.now();
      const step = (now: number) => {
        let progress = clamp((now - started) / duration, 0, 1);
        progress = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        commitView({
          k: from.k + (target.k - from.k) * progress,
          x: from.x + (target.x - from.x) * progress,
          y: from.y + (target.y - from.y) * progress,
        });
        if (progress < 1) animRef.current = requestAnimationFrame(step);
        else animRef.current = null;
      };
      animRef.current = requestAnimationFrame(step);
    },
    [commitView],
  );

  const focusCountry = useCallback(
    (element: SVGGElement | null) => {
      if (!element) return;
      const box = element.getBBox();
      const m = metrics();
      if (m.rect.width === 0 || m.rect.height === 0 || m.s <= 0) return;
      const fit =
        (Math.min(m.rect.width, m.rect.height) * 0.42) / (Math.max(box.width, box.height) * m.s);
      const k = clamp(Math.max(fit, viewRef.current.k), 1, 9);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const mobile = window.matchMedia('(max-width: 720px)').matches;
      animateView({
        k,
        x: (m.rect.width * (mobile ? 0.5 : 0.44) - m.ox) / m.s - cx * k,
        y: (m.rect.height * 0.5 - m.oy) / m.s - cy * k,
      });
    },
    [animateView, metrics],
  );

  const select = useCallback(
    (entry: (typeof rendered)[number], element: SVGGElement | null) => {
      const db = countries.find((country) => country.iso_code === entry.info.iso);
      if (!db) return;
      if (entry.info.recipe_count > 0) {
        focusCountry(element ?? countryRefs.current.get(entry.info.iso) ?? null);
      }
      onSelect(db, element);
    },
    [countries, focusCountry, onSelect],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      tipRef.current?.hide();
      hoveredCountry.current = null;
      const rect = svg.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const factor = clamp(Math.exp(-event.deltaY * unit * 0.0014), 0.7, 1.4);
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useEffect(() => {
    if (selectedCountryId === null) {
      lastSelected.current = null;
      return;
    }
    if (lastSelected.current === selectedCountryId) return;
    const entry = rendered.find((item) => item.info.dbId === selectedCountryId);
    const element = entry ? countryRefs.current.get(entry.info.iso) : undefined;
    lastSelected.current = selectedCountryId;
    if (element) focusCountry(element);
  }, [selectedCountryId, rendered, focusCountry]);

  useEffect(() => {
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      drag.current = { sx: event.clientX, sy: event.clientY, moved: 0 };
      draggingRef.current = false;
      pinchPrev.current = null;
      const target = event.target instanceof Element ? event.target.closest('.country') : null;
      const iso = target instanceof SVGGElement ? Number(target.dataset.iso) : Number.NaN;
      const entry = rendered.find((item) => item.info.iso === iso);
      downCountry.current = entry
        ? (countries.find((country) => country.iso_code === iso) ?? null)
        : null;
    } else {
      drag.current = null;
      downCountry.current = null;
      tipRef.current?.hide();
      hoveredCountry.current = null;
      pinchPrev.current = null;

      if (pointers.current.size >= 2) {
        const values = [...pointers.current.values()];
        const first = values[0];
        const second = values[1];
        if (first && second) {
          const distance = Math.hypot(first.x - second.x, first.y - second.y);
          if (distance > 0) pinchPrev.current = distance;
        }
      }
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2) {
      const values = [...pointers.current.values()];
      const first = values[0];
      const second = values[1];
      if (!first || !second) return;
      const distance = Math.hypot(first.x - second.x, first.y - second.y);

      if (pinchPrev.current !== null && pinchPrev.current > 0 && distance > 0) {
        const rect = event.currentTarget.getBoundingClientRect();
        zoomAt(
          (first.x + second.x) / 2 - rect.left,
          (first.y + second.y) / 2 - rect.top,
          distance / pinchPrev.current,
        );
      }
      if (distance > 0) pinchPrev.current = distance;

      return;
    }

    if (!drag.current) return;
    const dx = event.clientX - drag.current.sx;
    const dy = event.clientY - drag.current.sy;
    drag.current.moved += Math.abs(dx) + Math.abs(dy);

    if (drag.current.moved > 4 && !draggingRef.current) {
      draggingRef.current = true;
      setDragging(true);
      tipRef.current?.hide();
      hoveredCountry.current = null;
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    }

    if (draggingRef.current) {
      const m = metrics();
      if (m.rect.width > 0 && m.rect.height > 0 && m.s > 0) {
        const current = viewRef.current;
        const next = {
          ...current,
          x: current.x + dx / m.s,
          y: current.y + dy / m.s,
        };
        next.x = clamp(next.x, -(VB_W * (next.k - 0.25)), VB_W * 0.25);
        next.y = clamp(next.y, -(VB_H * (next.k - 0.25)), VB_H * 0.25);
        commitView(next);
      }
    }

    drag.current.sx = event.clientX;
    drag.current.sy = event.clientY;
  };

  const endPointer = (event: ReactPointerEvent<SVGSVGElement>, isUp: boolean) => {
    pointers.current.delete(event.pointerId);

    if (pointers.current.size === 0) {
      if (isUp && drag.current && !draggingRef.current && downCountry.current) {
        const country = downCountry.current;
        const entry = rendered.find((item) => item.info.dbId === country.id);
        if (entry) select(entry, countryRefs.current.get(entry.info.iso) ?? null);
      }
      downCountry.current = null;
      drag.current = null;
      draggingRef.current = false;
      pinchPrev.current = null;
      setDragging(false);
      return;
    }

    downCountry.current = null;

    if (pointers.current.size === 1) {
      // Al levantar un dedo de un pinch, el restante sigue paneando.
      const remaining = [...pointers.current.values()][0];
      if (remaining) drag.current = { sx: remaining.x, sy: remaining.y, moved: 99 };
      draggingRef.current = true;
      setDragging(true);
      pinchPrev.current = null;
      return;
    }

    drag.current = null;
    pinchPrev.current = null;
    const values = [...pointers.current.values()];
    const first = values[0];
    const second = values[1];
    if (first && second) {
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (distance > 0) pinchPrev.current = distance;
    }
  };

  const moveFocus = (index: number) => {
    const list = rendered;
    if (!list.length) return;
    const wrapped = ((index % list.length) + list.length) % list.length;
    setActiveIndex(wrapped);
    const entry = list[wrapped];
    if (entry) {
      const element = countryRefs.current.get(entry.info.iso);
      element?.focus({ preventScroll: true });
    }
  };

  const handleCountryKey = (event: ReactKeyboardEvent<SVGGElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      const entry = rendered[index];
      if (entry) select(entry, event.currentTarget);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
      return;
    }
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: rendered.length - 1,
    };
    const target = keys[event.key];
    if (target !== undefined) {
      event.preventDefault();
      moveFocus(target);
    }
  };

  const showTip = (country: Country, event: ReactPointerEvent<SVGGElement>) => {
    if (draggingRef.current) return;
    hoveredCountry.current = country;
    tipRef.current?.show(country, event.clientX, event.clientY);
  };

  const moveTip = (event: ReactPointerEvent<SVGGElement>) => {
    const country = hoveredCountry.current;
    if (country) tipRef.current?.show(country, event.clientX, event.clientY);
  };

  const hideTip = () => {
    hoveredCountry.current = null;
    tipRef.current?.hide();
  };

  return (
    <>
      <div className="map-shell" ref={shellRef} tabIndex={-1} id="mapShell" data-lenis-prevent>
        <svg
          ref={svgRef}
          className={`map-svg${dragging ? ' dragging' : ''}${view.k >= 1.8 ? ' zoomed' : ''}${selectedCountryId !== null ? ' has-active' : ''}`}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label="Mapa de Latinoamérica"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => endPointer(event, true)}
          onPointerCancel={(event) => endPointer(event, false)}
          onLostPointerCapture={(event) => endPointer(event, false)}
          onDoubleClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            zoomAt(event.clientX - rect.left, event.clientY - rect.top, 1.7);
          }}
        >
          <defs>
            <pattern id="waves" width="90" height="26" patternUnits="userSpaceOnUse">
              <path
                d="M0 13 Q22 4 45 13 T90 13"
                fill="none"
                stroke="rgba(150,200,215,.06)"
                strokeWidth="1.5"
              />
            </pattern>
            <pattern
              id="hatch"
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="7" height="7" fill="#1b2620" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(244,234,214,.05)" strokeWidth="2" />
            </pattern>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <rect x={-1600} y={-1600} width={4200} height={4300} fill="url(#waves)" />
            <g stroke="rgba(150,200,215,.05)">
              {Array.from({ length: 8 }, (_, index) => 100 + index * 125).map((x) => (
                <line key={x} x1={x} x2={x} y1={0} y2={VB_H} />
              ))}
              {Array.from({ length: 8 }, (_, index) => 110 + index * 125).map((y) => (
                <line key={y} y1={y} y2={y} x1={0} x2={VB_W} />
              ))}
            </g>
            <line
              x1={-400}
              x2={1400}
              y1={geo?.eqY ?? 420}
              y2={geo?.eqY ?? 420}
              stroke="rgba(242,177,52,.14)"
              strokeDasharray="7 7"
            />
            <text x={geo ? 60 : 20} y={(geo?.eqY ?? 420) - 8} className="eq-lab">
              LÍNEA DEL ECUADOR
            </text>
            {geo ? (
              <>
                <text
                  x={geo.labels.pacifico[0]}
                  y={geo.labels.pacifico[1]}
                  textAnchor="middle"
                  className="ocean-lab"
                  transform={`rotate(-75 ${geo.labels.pacifico[0]} ${geo.labels.pacifico[1]})`}
                >
                  OCÉANO PACÍFICO
                </text>
                <text
                  x={geo.labels.atlantico[0]}
                  y={geo.labels.atlantico[1]}
                  textAnchor="middle"
                  className="ocean-lab"
                  transform={`rotate(-70 ${geo.labels.atlantico[0]} ${geo.labels.atlantico[1]})`}
                >
                  OCÉANO ATLÁNTICO
                </text>
                <text
                  x={geo.labels.caribe[0]}
                  y={geo.labels.caribe[1]}
                  textAnchor="middle"
                  className="ocean-lab small"
                >
                  MAR CARIBE
                </text>
              </>
            ) : (
              <>
                <text
                  x={150}
                  y={700}
                  textAnchor="middle"
                  className="ocean-lab"
                  transform="rotate(-78 150 700)"
                >
                  OCÉANO PACÍFICO
                </text>
                <text x={468} y={236} textAnchor="middle" className="ocean-lab small">
                  MAR CARIBE
                </text>
                <text
                  x={880}
                  y={700}
                  textAnchor="middle"
                  className="ocean-lab"
                  transform="rotate(-72 880 700)"
                >
                  OCÉANO ATLÁNTICO
                </text>
              </>
            )}

            {rendered.map((entry, index) => {
              const db = countries.find((country) => country.iso_code === entry.info.iso);
              const hasData = entry.info.recipe_count > 0;
              const isActive = db?.id === selectedCountryId;
              return (
                // Los países son grupos SVG interactivos; un <button> HTML no puede contener paths.
                // biome-ignore lint/a11y/useSemanticElements: SVG groups with roving tabindex (APG).
                <g
                  key={entry.info.iso}
                  ref={(element) => {
                    if (element) countryRefs.current.set(entry.info.iso, element);
                    else countryRefs.current.delete(entry.info.iso);
                  }}
                  className={`country ${hasData ? 'has-data' : 'no-data'}${isActive ? ' active' : ''}`}
                  tabIndex={activeIndex === index ? 0 : -1}
                  role="button"
                  data-iso={entry.info.iso}
                  aria-label={`${db?.name ?? entry.info.n} — ${
                    hasData ? `${entry.info.recipe_count} recetas` : 'sin recetas'
                  }`}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleCountryKey(event, index)}
                  onPointerEnter={(event) => {
                    if (db) showTip(db, event);
                  }}
                  onPointerMove={moveTip}
                  onPointerLeave={hideTip}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <path d={entry.path} fill={entry.fill} />
                </g>
              );
            })}

            {geo ? (
              <g className="labels-g">
                {rendered.map((entry) => {
                  const point = geo.labelPts[entry.info.iso];
                  if (!point) return null;
                  return (
                    <text
                      key={entry.info.iso}
                      className="country-lab"
                      textAnchor="middle"
                      transform={`translate(${point[0]},${point[1]}) scale(${1 / view.k})`}
                    >
                      {entry.info.name}
                    </text>
                  );
                })}
              </g>
            ) : null}
          </g>
        </svg>

        {loading ? (
          <div className="map-loading" role="status" aria-live="polite">
            <span className="map-loading-spin" aria-hidden="true" />
            Ubicando Latinoamérica…
          </div>
        ) : null}
        {!loading ? (
          <div
            className="geo-badge"
            title={hd ? 'Geometría Natural Earth' : 'Geometría de respaldo local'}
          >
            {hd ? '🌐 Mapa HD' : '🗺️ Mapa básico'}
          </div>
        ) : null}

        <div className="zoom-ctl">
          <button
            type="button"
            aria-label="Acercar"
            onClick={() => {
              const rect = svgRef.current?.getBoundingClientRect();
              if (rect) zoomAt(rect.width / 2, rect.height / 2, 1.35);
            }}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Alejar"
            onClick={() => {
              const rect = svgRef.current?.getBoundingClientRect();
              if (rect) zoomAt(rect.width / 2, rect.height / 2, 1 / 1.35);
            }}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Reiniciar vista"
            title="Reiniciar vista"
            onClick={() => animateView(IDENTITY)}
          >
            ⌂
          </button>
        </div>

        <div className={`coach${selectedCountryId !== null ? ' done' : ''}`}>
          👆 Hacé clic en un país para descubrir su cocina
        </div>

        <MapTip ref={tipRef} shellRef={shellRef} />
      </div>

      <details className="map-list-alt">
        <summary>Ver lista de países (alternativa accesible al mapa)</summary>
        <ul>
          {selectable.map((entry) => {
            const db = countries.find((country) => country.iso_code === entry.info.iso);
            if (!db) return null;
            return (
              <li key={entry.info.iso}>
                <button
                  type="button"
                  onClick={() => {
                    const element = countryRefs.current.get(entry.info.iso) ?? null;
                    focusCountry(element);
                    onSelect(db, element);
                  }}
                >
                  {db.emoji} {db.name} · {db.recipe_count} recetas
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </>
  );
}
