import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function baseUrl() {
  return (process.env.PANDORA_TERRITORIAL_URL || '').replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  const url = baseUrl();
  if (!url) return NextResponse.json({ mode: 'territorial-error', error: 'PANDORA_TERRITORIAL_URL missing' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource') || 'risk-map';
  const lat = searchParams.get('lat') || '48.8566';
  const lng = searchParams.get('lng') || '2.3522';

  const endpoint = resource === 'risk-score' ? `risk-score?lat=${lat}&lng=${lng}`
    : resource === 'hotspots' ? 'hotspots'
    : resource === 'timeline' ? 'timeline'
    : 'risk-map';

  const r = await fetch(`${url}/${endpoint}`, { cache: 'no-store' });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
