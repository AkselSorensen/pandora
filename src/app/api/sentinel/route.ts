import { NextResponse } from 'next/server';

// Sentinel-1 SAR Satellite — STAC Catalog via Element84 Earth Search + Copernicus fallback
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');
  const radius = parseFloat(searchParams.get('radius') || '2');
  const days = parseInt(searchParams.get('days') || '30'); // Expanded to 30 days for more results

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Missing lat/lng parameters' }, { status: 400 });
  }

  try {
    const bbox = [lng - radius, lat - radius, lng + radius, lat + radius];
    const now = new Date();
    const from = new Date(now.getTime() - days * 86400000);
    const datetime = `${from.toISOString().split('.')[0]}Z/${now.toISOString().split('.')[0]}Z`;

    let scenes: any[] = [];
    let source = '';
    let total = 0;
    // Une source INJOIGNABLE n'est pas « aucune scène ». Sans cette liste, un opérateur
    // lit « pas d'imagerie sur cette zone » là où il devrait lire « trois sources muettes ».
    const degraded: string[] = [];

    // Source 1: Element84 Earth Search v1
    try {
      const res = await fetch('https://earth-search.aws.element84.com/v1/search', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'PandoraAtlas/1.0 (public satellite scene map)' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          collections: ['sentinel-1-grd'],
          bbox,
          datetime,
          limit: 20,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        scenes = (data.features || []).map(formatScene);
        total = data.numberMatched || scenes.length;
        source = 'element84';
      }
    } catch (e) {
      degraded.push('element84:sentinel-1');
      console.warn('[PANDORA] Earth Search S1 injoignable:', e instanceof Error ? e.message : e);
    }

    // Source 2: Try sentinel-2 if sentinel-1 is empty
    if (scenes.length === 0) {
      try {
        const res = await fetch('https://earth-search.aws.element84.com/v1/search', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'PandoraAtlas/1.0 (public satellite scene map)' },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            collections: ['sentinel-2-l2a'],
            bbox,
            datetime,
            limit: 20,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          scenes = (data.features || []).map(formatScene);
          total = data.numberMatched || scenes.length;
          source = 'element84-s2';
        }
      } catch (e) {
        degraded.push('element84:sentinel-2');
        console.warn('[PANDORA] Earth Search S2 injoignable:', e instanceof Error ? e.message : e);
      }
    }

    // Source 3: Copernicus STAC fallback
    if (scenes.length === 0) {
      try {
        const fallbackRes = await fetch('https://catalogue.dataspace.copernicus.eu/stac/search', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            collections: ['SENTINEL-1'],
            bbox,
            datetime,
            limit: 10,
          }),
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          scenes = (data.features || []).map(formatScene);
          total = data.numberMatched || scenes.length;
          source = 'copernicus';
        }
      } catch (e) {
        degraded.push('copernicus:stac');
        console.warn('[PANDORA] Copernicus STAC injoignable:', e instanceof Error ? e.message : e);
      }
    }

    // Element84 exposes Sentinel-1 quicklooks as s3:// URIs. That bucket is
    // Requester Pays, so browsers cannot load those assets anonymously. Fetch
    // public rendered RTC previews from Planetary Computer for the gallery.
    let previewScenes: any[] = [];
    try {
      const previewRes = await fetch('https://planetarycomputer.microsoft.com/api/stac/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'PandoraAtlas/1.0 (public satellite imagery gallery)' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          collections: ['sentinel-1-rtc'],
          bbox: [Math.max(-180, lng - radius), Math.max(-90, lat - radius), Math.min(180, lng + radius), Math.min(90, lat + radius)],
          datetime,
          limit: 20,
        }),
      });
      if (previewRes.ok) {
        const previewData = await previewRes.json();
        previewScenes = (previewData.features || [])
          .map((feature: any) => ({
            id: feature.id,
            datetime: feature.properties?.datetime,
            platform: feature.properties?.platform || 'Sentinel-1 RTC',
            mode: feature.properties?.['sar:instrument_mode'] || 'RTC',
            polarization: feature.properties?.['sar:polarizations'] || [],
            bbox: feature.bbox,
            preview: feature.assets?.rendered_preview?.href || null,
            source_name: 'Microsoft Planetary Computer · Sentinel‑1 RTC',
            source_url: feature.links?.find((link: any) => link.rel === 'self')?.href || null,
          }))
          .filter((scene: any) => scene.preview)
          .sort((a: any, b: any) => Date.parse(b.datetime || '') - Date.parse(a.datetime || ''))
          .slice(0, 8);
      }
    } catch (e) {
      degraded.push('planetary-computer:rtc-preview');
      console.warn('[PANDORA] Planetary Computer injoignable:', e instanceof Error ? e.message : e);
    }

    // Aucune source n'a répondu : on le DIT. Un 200 avec des listes vides et sans
    // `degraded` se lirait « rien à voir ici », ce qui serait faux.
    const allSourcesFailed = degraded.filter(entry => !entry.startsWith('planetary-computer')).length >= 3
      && scenes.length === 0 && previewScenes.length === 0;

    return NextResponse.json({
      source,
      scenes,
      previewScenes,
      total,
      bbox,
      datetime,
      degraded,
      allSourcesFailed,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Sentinel lookup failed', scenes: [], previewScenes: [] }, { status: 500 });
  }
}

function formatScene(feature: any) {
  const props = feature.properties || {};
  return {
    id: feature.id,
    datetime: props.datetime,
    platform: props.platform || props['sar:instrument_mode'] || 'Sentinel',
    orbit: props['sat:orbit_state'] || props.orbitDirection,
    polarization: props['sar:polarizations'] || props.polarisation,
    mode: props['sar:instrument_mode'] || props.productType,
    resolution: props['sar:resolution_range'] || null,
    pass_direction: props['sat:relative_orbit'] || null,
    cloud_cover: props['eo:cloud_cover'] ?? null,
    bbox: feature.bbox,
    thumbnail: feature.assets?.thumbnail?.href || null,
    preview: feature.assets?.preview?.href || null,
    geometry_type: feature.geometry?.type,
    area_km2: feature.bbox ? estimateArea(feature.bbox) : null,
  };
}

function estimateArea(bbox: number[]): number {
  if (bbox.length < 4) return 0;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const latDiff = Math.abs(maxLat - minLat) * 111;
  const lngDiff = Math.abs(maxLng - minLng) * 111 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  return Math.round(latDiff * lngDiff);
}
