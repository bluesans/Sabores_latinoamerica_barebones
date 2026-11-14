import { createBrowserRouter } from 'react-router';
import { RootLayout } from './components/RootLayout';
import { AdminPage } from './pages/AdminPage';
import { MapPage } from './pages/MapPage';
import { NotFoundPage } from './pages/NotFoundPage';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      children: [
        { path: '/', element: <MapPage /> },
        { path: '/pais/:countryId', element: <MapPage /> },
        // Mismo componente que el mapa para conservar zoom/posición bajo el overlay.
        { path: '/favoritos', element: <MapPage favoritesOpen /> },
        { path: '/admin', element: <AdminPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename },
);
