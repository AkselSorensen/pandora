import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function baseUrl() {
  return (process.env.PANDORA_CYBERDEF_URL || '').replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  const url = baseUrl();
  if (!url) {
    return NextResponse.json(
      { mode: 'cyberdef-error', error: 'PANDORA_CYBERDEF_URL missing' },
      { status: 503 }
    );
  }
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource') || 'health';

  const endpoint = resource === 'sources' ? 'sources'
    : resource === 'posture' ? 'cyber-posture'
    : resource === 'cves' ? 'top-cves'
    : resource === 'threats' ? 'live-threats'
    : 'health';

  const r = await fetch(`${url}/${endpoint}`, { cache: 'no-store' });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const url = baseUrl();
  if (!url) {
    return NextResponse.json(
      { mode: 'cyberdef-error', error: 'PANDORA_CYBERDEF_URL missing' },
      { status: 503 }
    );
  }
  const body = await req.json();
  const action = body?.action || 'briefing';

  let endpoint: string;
  if (action === 'analyze-ip') endpoint = 'analyze-ip';
  else if (action === 'analyze-domain') endpoint = 'analyze-domain';
  else if (action === 'analyze-hash') endpoint = 'analyze-hash';
  else endpoint = 'briefing';

  const payload = { ...body };
  delete payload.action;

  const r = await fetch(`${url}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
