import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const riskRes = await fetch(`${origin}/api/country-risk`, { next: { revalidate: 900 } });
    if (!riskRes.ok) throw new Error(`Country risk failed: ${riskRes.status}`);
    const riskData = await riskRes.json();
    const countries = riskData.countries || [];

    const enriched = await Promise.allSettled(
      countries.map(async (item: any) => {
        const res = await fetch(
          `https://restcountries.com/v3.1/alpha/${encodeURIComponent(item.code)}?fields=name,cca2,latlng,capital,capitalInfo,flag,flags`,
          { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } }
        );
        if (!res.ok) return null;
        const geo = await res.json();
        const coord = Array.isArray(geo.capitalInfo?.latlng) && geo.capitalInfo.latlng.length === 2
          ? geo.capitalInfo.latlng
          : geo.latlng;
        if (!Array.isArray(coord) || coord.length < 2) return null;
        return {
          ...item,
          name: geo.name?.common || item.code,
          flag: geo.flag,
          capital: Array.isArray(geo.capital) ? geo.capital[0] : undefined,
          lat: Number(coord[0]),
          lng: Number(coord[1]),
          source: 'Pandora Country Risk + REST Countries geodata',
        };
      })
    );

    const geocoded = enriched.flatMap((entry) => entry.status === 'fulfilled' && entry.value ? [entry.value] : []);
    return NextResponse.json({ countries: geocoded, timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    });
  } catch (error) {
    console.error('Country risk geo error:', error);
    return NextResponse.json({ countries: [], error: 'Failed to fetch country risk geodata' }, { status: 500 });
  }
}