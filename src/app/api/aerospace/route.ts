import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function baseUrl() {
  return (process.env.PANDORA_AEROSPACE_URL || '').replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  const url = baseUrl();
  if (!url) {
    return NextResponse.json({ mode: 'aerospace-error', error: 'PANDORA_AEROSPACE_URL missing' }, { status: 503 });
  }
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource') || 'airspace';
  const lat = searchParams.get('lat') || '0';
  const lng = searchParams.get('lng') || '0';
  const radius = searchParams.get('radius') || '200';

  const endpoint = resource === 'anomalies' ? 'anomalies'
    : resource === 'zones' ? 'danger-zones'
    : resource === 'briefing' ? `briefing?question=${encodeURIComponent(searchParams.get('question') || '')}`
    : `airspace?lat=${lat}&lng=${lng}&radius_km=${radius}`;

  const r = await fetch(`${url}/${endpoint}`, { cache: 'no-store' });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const url = baseUrl();
  if (!url) {
    return NextResponse.json({ mode: 'aerospace-error', error: 'PANDORA_AEROSPACE_URL missing' }, { status: 503 });
  }
  const body = await req.json();
  const r = await fetch(`${url}/analyze-flight`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store',
  });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
