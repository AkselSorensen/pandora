import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const url = process.env.PANDORA_RISK_URL;
  if (!url) return NextResponse.json({ mode: 'risk-error', score: 0, level: 'unknown', error: 'PANDORA_RISK_URL missing' }, { status: 503 });
  const r = await fetch(`${url.replace(/\/$/, '')}/risk`, { cache: 'no-store' });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}