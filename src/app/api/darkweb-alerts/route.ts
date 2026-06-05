import { NextResponse } from 'next/server';
import { monitorConfiguredDarkWebForums } from '@/lib/tor-scraper';

export async function GET() {
  try {
    const alerts = await monitorConfiguredDarkWebForums();
    return NextResponse.json({ alerts, configured: true });
  } catch (error) {
    console.error('Error fetching dark web alerts:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch dark web alerts';
    return NextResponse.json({
      alerts: [],
      configured: false,
      message,
      error: message,
    });
  }
}