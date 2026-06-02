import { NextResponse } from 'next/server';
import { runOSINTQuery, generateOSINTReport } from '@/lib/osint-scraper';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, platforms, maxResults = 10, format = 'json' } = body;
    
    if (!query || !platforms || !Array.isArray(platforms)) {
      return NextResponse.json(
        { error: 'Invalid request: query and platforms are required' },
        { status: 400 }
      );
    }
    
    const osintQuery = { query, platforms, maxResults };
    
    if (format === 'report') {
      const report = await generateOSINTReport(osintQuery);
      return NextResponse.json(report);
    } else {
      const results = await runOSINTQuery(osintQuery);
      return NextResponse.json({ results });
    }
  } catch (error) {
    console.error('OSINT API error:', error);
    return NextResponse.json(
      { error: 'Failed to perform OSINT query' },
      { status: 500 }
    );
  }
}