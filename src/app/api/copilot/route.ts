import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const url = process.env.PANDORA_COPILOT_URL;
  if (!url) return NextResponse.json({ mode: 'copilot-error', answer: 'PANDORA_COPILOT_URL missing' }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const r = await fetch(`${url.replace(/\/$/, '')}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}