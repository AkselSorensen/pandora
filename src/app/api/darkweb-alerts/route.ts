import { NextResponse } from 'next/server';
import { monitorDarkWebForums } from '@/lib/tor-scraper';

export async function GET() {
  try {
    // Liste des forums dark web à surveiller (exemples)
    const forumsToMonitor = [
      'http://dreadytofatroptsdj6io7l3xptbet6onoyno2yv7jicoxknyazubad.onion', // Dread
      'http://exploitinc3onion.invalid', // Exemple ExploitIN
      'http://darkmarketi2p.invalid' // Exemple DarkMarket I2P
    ];
    
    // Scraper les forums via Tor/I2P
    const alerts = await monitorDarkWebForums(forumsToMonitor);
    
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Error fetching dark web alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dark web alerts' },
      { status: 500 }
    );
  }
}