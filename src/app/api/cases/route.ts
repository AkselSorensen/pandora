import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const url = process.env.PANDORA_CASES_URL;
  if (!url) return NextResponse.json({ mode: 'cases-error', cases: [], total: 0, error: 'PANDORA_CASES_URL missing' }, { status: 503 });
  const r = await fetch(`${url.replace(/\/$/, '')}/cases`, { cache: 'no-store' });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}