import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function baseUrl() {
  return (process.env.PANDORA_DGSI_URL || '').replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  const url = baseUrl();
  if (!url) return NextResponse.json({ mode: 'dgsi-error', error: 'PANDORA_DGSI_URL missing' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource') || 'dashboard';
  const lat = searchParams.get('lat') || '48.8566';
  const lng = searchParams.get('lng') || '2.3522';
  const radius = searchParams.get('radius') || '5';

  const endpoint = resource === 'zones' ? 'zones'
    : resource === 'infra-types' ? 'infra-types'
    : resource === 'zone-infra' ? `zone-infra?lat=${lat}&lng=${lng}&radius_km=${radius}`
    : resource === 'zone-intel' ? `zone-intel?lat=${lat}&lng=${lng}&radius_km=${radius}`
    : 'dashboard';

  const r = await fetch(`${url}/${endpoint}`, { cache: 'no-store' });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
