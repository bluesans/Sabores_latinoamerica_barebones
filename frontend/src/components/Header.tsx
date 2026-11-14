import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/ToastProvider';
import { SearchBox } from './SearchBox';

function AccountDeleteDialog({
  onClose,
  restoreFocusRef,
}: {
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { deleteAccount } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const mutation = useMutation({
    mutationFn: () => deleteAccount(password),
    onSuccess: () => {
      toast('Cuenta eliminada. Tus datos se borraron.');
      onClose();
      navigate('/');
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  const requestClose = useCallback(() => {
    if (mutation.isPending) return;
    onClose();
  }, [mutation.isPending, onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!password) {
      setError('Ingresá tu contraseña para confirmar.');
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal
      label="Eliminar cuenta"
      onClose={requestClose}
      initialFocusRef={passwordRef}
      restoreFocusRef={restoreFocusRef}
      closeDisabled={mutation.isPending}
    >
      <h4 className="ing-title">Eliminar mi cuenta</h4>
      <p className="ing-sub">
        Esta acción borra tu usuario, favoritos y sesiones. No se puede deshacer. Si sos el último
        administrador, el sistema no permitirá la baja.
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="delete-password">Contraseña actual</label>
          <div className="inp-wrap">
            <input
              id="delete-password"
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>
        <div className="form-error" role="alert">
          {error}
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn-primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Eliminando…' : 'Eliminar cuenta'}
          </button>
          <button
            className="btn-ghost"
            type="button"
            onClick={requestClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Header() {
  const { status, user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuToggleRef = useRef<HTMLButtonElement | null>(null);

  const closeDeleteDialog = useCallback(() => setDeleteOpen(false), []);

  const favoritesQuery = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.favorites(),
    enabled: status === 'authenticated',
    retry: 1,
  });

  const favoriteCount = favoritesQuery.data?.favorites.length ?? 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    toast('Sesión cerrada. ¡Buen provecho! 🫡');
    navigate('/');
  };

  return (
    <header className="appbar">
      <Link className="logo" to="/">
        <span className="logo-ico" aria-hidden="true">
          🌽
        </span>
        <span className="logo-txt">
          <span className="logo-small">sabores de</span>
          <span className="logo-big">LATINOAMÉRICA</span>
        </span>
      </Link>

      {status === 'authenticated' && user ? (
        <div className="user-zone" ref={menuRef}>
          <SearchBox />
          <Link
            className="btn-ghost"
            to="/favoritos"
            title="Mis favoritos"
            aria-current={location.pathname === '/favoritos' ? 'page' : undefined}
          >
            <span aria-hidden="true">⭐ {favoriteCount}</span>
            <span className="sr-only">
              {favoriteCount} favorito{favoriteCount === 1 ? '' : 's'}
            </span>
          </Link>
          <button
            className="btn-ghost menu-toggle"
            type="button"
            ref={menuToggleRef}
            aria-expanded={menuOpen}
            aria-controls="user-menu"
            onClick={() => setMenuOpen((current) => !current)}
          >
            ☰ <span className="sr-only">Menú de cuenta</span>
          </button>
          <div id="user-menu" className={`user-actions${menuOpen ? ' open' : ''}`}>
            {user.role === 'admin' ? (
              <Link className="btn-ghost" to="/admin" onClick={() => setMenuOpen(false)}>
                🛠️ Admin
              </Link>
            ) : null}
            <div className="user-chip">
              <span
                className="avatar"
                style={{
                  background: ['#f2b134', '#31c98e', '#e8709a', '#e4572e'][
                    user.username.length % 4
                  ],
                }}
              >
                {user.username ? user.username[0]?.toUpperCase() : '🌽'}
              </span>
              <span>
                Hola, <b>{user.username}</b>
              </span>
            </div>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void handleLogout();
              }}
            >
              Salir ↩
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setDeleteOpen(true);
              }}
            >
              Mi cuenta
            </button>
          </div>
        </div>
      ) : (
        <div className="user-zone">
          {location.pathname !== '/' ? (
            <Link className="btn-ghost" to="/">
              Entrar
            </Link>
          ) : null}
        </div>
      )}

      {deleteOpen ? (
        <AccountDeleteDialog onClose={closeDeleteDialog} restoreFocusRef={menuToggleRef} />
      ) : null}
    </header>
  );
}
