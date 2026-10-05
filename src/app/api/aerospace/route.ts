import { NextRequest, NextResponse } from 'next/server';
import { fetchDirectAirspace } from '@/lib/aerospace-direct';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function baseUrl() {
  return (process.env.PANDORA_AEROSPACE_URL || '').replace(/\/$/, '');
}

/**
 * Airspace always answers from real data: the microservice when it is
 * configured and alive, otherwise a direct fetch — OpenSky Network plus
 * ADSB.lol v2, merged (`src/lib/aerospace-direct.ts`). Anything else
 * (anomalies, briefing, analyze) genuinely needs the microservice, so it
 * reports why it failed.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource') || 'airspace';
  const url = baseUrl();

  let upstreamFailure = url ? '' : 'PANDORA_AEROSPACE_URL non configuré';

  if (url) {
    const lat = searchParams.get('lat') || '0';
    const lng = searchParams.get('lng') || '0';
    const radius = searchParams.get('radius') || '200';
    const endpoint = resource === 'anomalies' ? 'anomalies'
      : resource === 'zones' ? 'danger-zones'
      : resource === 'briefing' ? `briefing?question=${encodeURIComponent(searchParams.get('question') || '')}`
      : `airspace?lat=${lat}&lng=${lng}&radius_km=${radius}`;

    try {
      const r = await fetch(`${url}/${endpoint}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        return NextResponse.json(await r.json(), { status: 200, headers: NO_STORE });
      }
      upstreamFailure = `microservice aerospace injoignable (HTTP ${r.status})`;
    } catch {
      upstreamFailure = 'microservice aerospace injoignable (délai dépassé)';
    }
  }

  if (resource === 'airspace') {
    const direct = await fetchDirectAirspace();
    if (direct.aircraft.length > 0) {
      return NextResponse.json({
        mode: 'direct',
        source: direct.sources.join(' + '),
        degraded: true,
        upstream: upstreamFailure,
        total: direct.total,
        sourcesWithData: direct.sourcesOk,
        aircraft: direct.aircraft,
      }, { status: 200, headers: NO_STORE });
    }
    return NextResponse.json({
      mode: 'aerospace-error',
      error: `${upstreamFailure}. Sources directes (OpenSky, ADSB.lol) : aucune donnée renvoyée.`,
      aircraft: [],
    }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({
    mode: 'aerospace-error',
    error: `${upstreamFailure}. La ressource « ${resource} » nécessite le microservice pandora-aerospace.`,
  }, { status: url ? 502 : 503, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const url = baseUrl();
  if (!url) {
    return NextResponse.json({
      mode: 'aerospace-error',
      error: 'PANDORA_AEROSPACE_URL non configuré — l’analyse de vol nécessite le microservice pandora-aerospace.',
    }, { status: 503, headers: NO_STORE });
  }
  const body = await req.json();
  try {
    const r = await fetch(`${url}/analyze-flight`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    return NextResponse.json(await r.json(), { status: r.status, headers: NO_STORE });
  } catch {
    return NextResponse.json({
      mode: 'aerospace-error',
      error: 'Microservice aerospace injoignable (délai dépassé).',
    }, { status: 502, headers: NO_STORE });
  }
}
