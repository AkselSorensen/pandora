'use client';

import { useState } from 'react';
import { ExternalLink, Image as ImageIcon, Satellite } from 'lucide-react';

type Scene = {
  id?: string;
  datetime?: string;
  platform?: string;
  mode?: string;
  polarization?: string | string[];
  cloud_cover?: number | null;
  preview?: string | null;
  thumbnail?: string | null;
  bbox?: number[];
  source_name?: string;
};

type Props = {
  scenes?: Scene[];
  latitude: number;
  longitude: number;
  enabled: boolean;
  onEnable: () => void;
};

function getSceneLink(scene: Scene, latitude: number, longitude: number) {
  const isOptical = /sentinel.?2/i.test(`${scene.platform || ''} ${scene.mode || ''}`);
  const acquired = scene.datetime ? new Date(scene.datetime) : new Date();
  const from = new Date(acquired.getTime() - 60 * 60 * 1000).toISOString();
  const to = new Date(acquired.getTime() + 60 * 60 * 1000).toISOString();
  const url = new URL('https://browser.dataspace.copernicus.eu/');
  url.searchParams.set('zoom', '8');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lng', String(longitude));
  url.searchParams.set('themeId', 'DEFAULT-THEME');
  url.searchParams.set('datasetId', isOptical ? 'S2L2A' : 'S1GRD');
  url.searchParams.set('fromTime', from);
  url.searchParams.set('toTime', to);
  return url.toString();
}

function usablePreview(scene: Scene) {
  return [scene.preview, scene.thumbnail].find((value) => typeof value === 'string' && /^https?:\/\//i.test(value)) || null;
}

function SceneImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-28 items-center justify-center gap-2 bg-black/30 text-[8px] font-mono text-[var(--text-muted)]">
        <ImageIcon className="h-4 w-4" /> APERÇU TEMPORAIREMENT INDISPONIBLE
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-28 w-full bg-black object-cover" />;
}

export default function SatelliteImageryPanel({ scenes = [], latitude, longitude, enabled, onEnable }: Props) {
  const latestScenes = [...scenes]
    .sort((a, b) => Date.parse(b.datetime || '') - Date.parse(a.datetime || ''))
    .slice(0, 8);

  return (
    <section className="glass-panel-sm p-3 space-y-3" aria-label="Satellite imagery catalogue">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[9px] font-mono tracking-[0.16em] text-[var(--gold-light)]">
            <Satellite className="h-3.5 w-3.5" /> PUBLIC SATELLITE IMAGERY
          </div>
          <p className="mt-1 text-[8px] leading-relaxed text-[var(--text-muted)]">
            Aperçus radar Sentinel‑1 RTC autour du centre de la carte. Images ponctuelles, pas de vidéo en direct.
          </p>
        </div>
        {!enabled && (
          <button type="button" onClick={onEnable} className="shrink-0 rounded border border-[var(--border-primary)] px-2 py-1 text-[7px] font-mono tracking-wider text-[var(--gold-light)] hover:border-[var(--gold-primary)]">
            CHARGER
          </button>
        )}
      </div>

      {latestScenes.length === 0 ? (
        <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3 text-[8px] font-mono text-[var(--text-muted)]">
          {enabled ? 'Aucun aperçu radar disponible dans la recherche actuelle. Déplace la carte ou réessaie plus tard.' : 'Active la recherche pour afficher les scènes disponibles.'}
        </div>
      ) : (
        <div className="space-y-2">
          {latestScenes.map((scene, index) => {
            const preview = usablePreview(scene);
            const optical = /sentinel.?2/i.test(`${scene.platform || ''} ${scene.mode || ''}`);
            const acquired = scene.datetime ? new Date(scene.datetime) : null;
            return (
              <article key={`${scene.id || 'scene'}-${index}`} className="overflow-hidden rounded border border-[var(--border-secondary)] bg-black/20">
                <SceneImage src={preview} alt={`Aperçu satellite ${scene.id || ''}`} />
                <div className="space-y-1.5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[8px] font-mono tracking-wider text-[var(--text-primary)]">{optical ? 'SENTINEL‑2 · OPTICAL' : 'SENTINEL‑1 · RADAR'}</span>
                    <span className="text-[7px] font-mono text-[var(--text-muted)]">{acquired && !Number.isNaN(acquired.getTime()) ? `${acquired.toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'DATE INCONNUE'}</span>
                  </div>
                  <div className="truncate text-[7px] font-mono text-[var(--text-muted)]" title={scene.id}>{scene.id || 'Scène Copernicus'}</div>
                  <div className="truncate text-[7px] font-mono text-[var(--text-muted)]">{scene.source_name || (optical ? 'Copernicus Sentinel‑2' : 'Copernicus Sentinel‑1')}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[7px] font-mono text-[var(--text-muted)]">{optical ? (scene.cloud_cover == null ? 'Nuages : n/d' : `Nuages : ${Math.round(scene.cloud_cover)}%`) : 'Rendu radar RTC'}</span>
                    <a href={getSceneLink(scene, latitude, longitude)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[7px] font-mono tracking-wider text-[var(--gold-light)] hover:text-[var(--text-primary)]">
                      OUVRIR COPERNICUS <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="text-[7px] leading-relaxed text-[var(--text-muted)]">
        Source : Microsoft Planetary Computer · Sentinel‑1 RTC. Les aperçus sont des rendus de scène et leur disponibilité varie selon la couverture et le traitement.
      </p>
    </section>
  );
}
