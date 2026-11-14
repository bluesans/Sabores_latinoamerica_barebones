import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="main" id="main-content">
      <div className="map-head">
        <div>
          <h2 className="map-title">404 — Esta receta no existe</h2>
          <p className="map-sub">La página que buscás no está en el atlas.</p>
        </div>
      </div>
      <p>
        <Link to="/">← Volver al mapa del sabor</Link>
      </p>
    </main>
  );
}
