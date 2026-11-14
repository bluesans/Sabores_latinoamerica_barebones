import { useState } from 'react';
import { safeYoutubeId } from '../lib/format';

export function VideoGate({ youtubeId, name }: { youtubeId: string | null; name: string }) {
  const id = safeYoutubeId(youtubeId);
  const [playing, setPlaying] = useState(false);

  if (!id) {
    return <div className="vid-none">🎥 El video de esta receta llega pronto</div>;
  }

  if (playing) {
    return (
      <div className="vid">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
          title={`Video de la receta ${name}`}
          loading="lazy"
          allowFullScreen
          allow="accelerometer; encrypted-media; picture-in-picture"
        />
      </div>
    );
  }

  return (
    <div className="vid">
      <button
        className="poster"
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={`Reproducir video de ${name}`}
      >
        <span className="play">▶</span>
        <span className="poster-txt">Ver preparación paso a paso</span>
      </button>
    </div>
  );
}
