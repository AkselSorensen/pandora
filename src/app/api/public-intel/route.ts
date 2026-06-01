import { NextResponse } from 'next/server';
import { getPublicIntelCatalog } from '@/lib/public-intel-catalog';

export async function GET() {
  return NextResponse.json(getPublicIntelCatalog(), {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}