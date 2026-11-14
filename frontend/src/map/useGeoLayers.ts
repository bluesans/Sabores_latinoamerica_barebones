import { useEffect, useState } from 'react';
import { buildGeoLayers, type GeoLayers, type TopoJSON } from './geo';

const CACHE_KEY = 'sdl_topo_50m_v1';
const REQUEST_TIMEOUT_MS = 8000;

function isTopo(value: unknown): value is TopoJSON {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.arcs)) return false;
  if (typeof record.transform !== 'object' || record.transform === null) return false;
  if (typeof record.objects !== 'object' || record.objects === null) return false;
  const objects = record.objects as Record<string, unknown>;
  const countries = objects.countries;
  return typeof countries === 'object' && countries !== null;
}

function safeBuild(topo: TopoJSON): GeoLayers | null {
  try {
    return buildGeoLayers(topo);
  } catch {
    return null;
  }
}

async function loadJson(url: string): Promise<TopoJSON | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isTopo(data) ? data : null;
  } catch {
    return null;
  }
}

function readCache(): TopoJSON | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed: unknown = JSON.parse(cached);
    return isTopo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface GeoState {
  geo: GeoLayers | null;
  hd: boolean;
  loading: boolean;
}

export function useGeoLayers(): GeoState {
  const [state, setState] = useState<GeoState>({ geo: null, hd: false, loading: true });

  useEffect(() => {
    let active = true;
    const base = import.meta.env.BASE_URL;
    const sources = [`${base}data/countries-50m.json`, `${base}data/countries-110m.json`];

    async function load() {
      let geo: GeoLayers | null = null;
      let hd = false;
      const topo = readCache();

      if (topo) {
        geo = safeBuild(topo);
        hd = geo !== null;
        // Caché corrupta: se descarta y se reintenta con la red.
        if (!geo) {
          try {
            localStorage.removeItem(CACHE_KEY);
          } catch {
            // Storage bloqueado.
          }
        }
      }

      if (!geo) {
        for (const [index, url] of sources.entries()) {
          const loaded = await loadJson(url);
          if (!loaded) continue;
          const built = safeBuild(loaded);

          if (!built) continue;
          geo = built;
          hd = index === 0;

          if (index === 0) {
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify(loaded));
            } catch {
              // Cuota llena o storage bloqueado: se sigue sin caché.
            }
          }
          break;
        }
      }

      if (!active) return;
      setState({ geo, hd: hd && geo !== null, loading: false });
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return state;
}
