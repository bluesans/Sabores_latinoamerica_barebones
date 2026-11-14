import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type { Favorite } from '../api/types';
import { DIFF } from '../data/map-data';
import { formatTime } from '../lib/format';
import { useOverlayLayer } from '../ui/overlay';
import { useToast } from '../ui/ToastProvider';

interface FavoritesPanelProps {
  onClose: () => void;
}

interface FavoritesData {
  favorites: Favorite[];
}

export function FavoritesPanel({ onClose }: FavoritesPanelProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<Element | null>(document.activeElement);
  const openedAt = useRef(Date.now());
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isTop = useOverlayLayer();

  const query = useQuery({ queryKey: ['favorites'], queryFn: () => api.favorites(), retry: 1 });

  const remove = useMutation({
    mutationFn: ({ id }: { id: number; name: string }) => api.toggleFavorite(id, false),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });
      const previous = queryClient.getQueryData<FavoritesData>(['favorites']);
      if (previous) {
        queryClient.setQueryData<FavoritesData>(['favorites'], {
          ...previous,
          favorites: previous.favorites.filter((favorite) => favorite.id !== id),
        });
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['favorites'], context.previous);
      toast(error.message);
    },
    onSuccess: (_data, variables) => {
      toast(`Quitamos «${variables.name}» de tus favoritos.`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      const opener = openerRef.current;
      const target = opener instanceof HTMLElement || opener instanceof SVGElement ? opener : null;
      if (target && target !== document.body && target.isConnected) {
        target.focus({ preventScroll: true });
        return;
      }
      document.getElementById('mapShell')?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusables = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hasAttribute('disabled'));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isTop, onClose]);

  const favorites = query.data?.favorites ?? [];
  const hasData = query.data !== undefined;
  const showError = query.isError && !hasData;

  return (
    <>
      <button
        className="panel-backdrop show"
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => {
          if (Date.now() - openedAt.current < 350) return;
          onClose();
        }}
      />
      <aside
        className="panel open"
        role="dialog"
        aria-modal="true"
        aria-labelledby="favorites-title"
        ref={panelRef}
        data-lenis-prevent
      >
        <button
          className="panel-close"
          type="button"
          aria-label="Cerrar panel"
          onClick={onClose}
          ref={closeRef}
        >
          ✕
        </button>
        <div className="p-head">
          <div className="p-flag" aria-hidden="true">
            ⭐
          </div>
          <h3 id="favorites-title">Mis favoritos</h3>
          <p className="p-tag">
            {query.isLoading && !hasData
              ? 'Buscando tus recetas guardadas…'
              : showError
                ? 'No pudimos traer tus recetas.'
                : favorites.length
                  ? `${favorites.length} receta${favorites.length === 1 ? '' : 's'} guardada${favorites.length === 1 ? '' : 's'}`
                  : 'Tu recetario personal, siempre a mano.'}
          </p>
        </div>

        {query.isLoading && !hasData ? (
          <div aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div className="fav-skel-row" key={index} style={{ '--i': index } as CSSProperties}>
                <div className="skel fav-skel-dot" />
                <div className="fav-skel-lines">
                  <div className="skel w70" />
                  <div className="skel w40" style={{ marginBottom: 0 }} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {showError ? (
          <div className="state-error" role="alert">
            <span className="state-error-ico">⚠️</span>
            <p>
              {query.error instanceof Error
                ? query.error.message
                : 'No se pudieron cargar los favoritos.'}
            </p>
            <button className="btn-retry" type="button" onClick={() => void query.refetch()}>
              ↻ Reintentar
            </button>
          </div>
        ) : null}

        {hasData && query.isError ? (
          <p className="fav-stale" role="status">
            No pudimos actualizar la lista; mostrando la última copia.
          </p>
        ) : null}

        {hasData && favorites.length === 0 ? (
          <div className="fav-empty">
            <span className="fav-empty-star" aria-hidden="true">
              ⭐
            </span>
            <b className="fav-empty-title">Tu recetario está esperando</b>
            <p>Tocá el ♥ de cualquier receta del mapa para guardarla acá.</p>
            <button className="btn-primary fav-empty-btn" type="button" onClick={onClose}>
              Explorar el mapa
            </button>
          </div>
        ) : null}

        {hasData
          ? favorites.map((favorite, index) => {
              const [label] = favorite.difficulty ? (DIFF[favorite.difficulty] ?? ['—']) : ['—'];
              return (
                <div
                  className="fav-item"
                  key={favorite.id}
                  style={{ '--i': index } as CSSProperties}
                >
                  <button
                    className="ing-row"
                    type="button"
                    onClick={() => navigate(`/pais/${favorite.country_id}?receta=${favorite.id}`)}
                  >
                    <span className="flag" aria-hidden="true">
                      {favorite.emoji || '🌎'}
                    </span>
                    <span>
                      <b>{favorite.name}</b>
                      <small>
                        {favorite.country_name} · {label} · {formatTime(favorite.time_minutes)}
                      </small>
                    </span>
                  </button>
                  <button
                    className="fav-remove"
                    type="button"
                    title="Quitar de favoritos"
                    aria-label={`Quitar ${favorite.name} de favoritos`}
                    disabled={remove.isPending && remove.variables?.id === favorite.id}
                    onClick={() => remove.mutate({ id: favorite.id, name: favorite.name })}
                  >
                    ♥
                  </button>
                </div>
              );
            })
          : null}
      </aside>
    </>
  );
}
