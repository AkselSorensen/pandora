import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Recent geotagged readings from Safecast's open, keyless measurement API. */
export async function GET() {
  try {
    const capturedAfter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
    const params = new URLSearchParams({ per_page: '1000', captured_after: capturedAfter });
    const res = await fetch(`https://api.safecast.org/measurements.json?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', 'User-Agent': 'PandoraAtlas/1.0 (Safecast open data map)' },
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`Safecast returned ${res.status}`);

    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('Safecast returned an invalid measurement list');
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const stations = rows.flatMap((row: any) => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      const capturedAt = Date.parse(row.captured_at || '');
      const reading = Number(row.value);
      if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) return [];
      if (!Number.isFinite(reading) || !Number.isFinite(capturedAt) || capturedAt < cutoff || capturedAt > Date.now() + 5 * 60 * 1000) return [];
      return [{
        id: `safecast-${row.id}`,
        name: row.location_name || `Safecast device ${row.device_id || row.id}`,
        city: '',
        country: '',
        lat,
        lng,
        reading,
        unit: row.unit || 'unknown',
        status: 'reported',
        network: 'Safecast',
        lastUpdated: row.captured_at,
        source: 'Safecast open measurements',
      }];
    }).sort((a: any, b: any) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated)).slice(0, 800);

    return NextResponse.json({ stations, total: stations.length, source: 'Safecast', window_days: 90, timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    });
  } catch (error) {
    console.error('Safecast radiation feed error:', error);
    return NextResponse.json({ stations: [], error: 'Safecast radiation measurements unavailable' }, { status: 502 });
  }
}
