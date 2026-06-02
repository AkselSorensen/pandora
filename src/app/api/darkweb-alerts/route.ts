import { NextResponse } from 'next/server';
import { monitorConfiguredDarkWebForums } from '@/lib/tor-scraper';

export async function GET() {
  try {
    const alerts = await monitorConfiguredDarkWebForums();
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Error fetching dark web alerts:', error);
    return NextResponse.json(
      { alerts: [], error: error instanceof Error ? error.message : 'Failed to fetch dark web alerts' },
      { status: 500 }
    );
  }
}