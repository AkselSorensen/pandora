import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function baseUrl() {
  return (process.env.PANDORA_NUCLEAR_URL || '').replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  const url = baseUrl();
  if (!url) {
    return NextResponse.json(
      { mode: 'deterrence-error', error: 'PANDORA_NUCLEAR_URL missing', countries: [] },
      { status: 503 }
    );
  }
  const resource = req.nextUrl.searchParams.get('resource') || 'countries';
  const endpoint = resource === 'health' ? 'health' : 'countries';
  const r = await fetch(`${url}/${endpoint}`, { cache: 'no-store' });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const url = baseUrl();
  if (!url) {
    return NextResponse.json(
      { mode: 'deterrence-error', error: 'PANDORA_NUCLEAR_URL missing' },
      { status: 503 }
    );
  }
  const body = await req.json();
  const action = body?.action === 'scenario' ? 'scenario' : 'deterrence';
  const payload = { ...(body || {}) };
  delete payload.action;
  const r = await fetch(`${url}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
