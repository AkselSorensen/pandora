import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const url = process.env.PANDORA_HOTSPOTS_URL;
  if (!url) return NextResponse.json({ mode: 'hotspots-error', hotspots: [], total: 0, error: 'PANDORA_HOTSPOTS_URL missing' }, { status: 503 });
  const r = await fetch(`${url.replace(/\/$/, '')}/hotspots`, { cache: 'no-store' });
  return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}