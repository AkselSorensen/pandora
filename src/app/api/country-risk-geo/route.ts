import { NextResponse } from 'next/server';

// Reference points are national capitals: country-level risk is not a city-level finding.
const COUNTRY_CAPITALS: Record<string, { name: string; capital: string; lat: number; lng: number }> = {
  UA: { name: 'Ukraine', capital: 'Kyiv', lat: 50.4501, lng: 30.5234 },
  RU: { name: 'Russia', capital: 'Moscow', lat: 55.7558, lng: 37.6173 },
  IL: { name: 'Israel', capital: 'Jerusalem', lat: 31.7683, lng: 35.2137 },
  PS: { name: 'Palestine', capital: 'Ramallah', lat: 31.9038, lng: 35.2034 },
  SY: { name: 'Syria', capital: 'Damascus', lat: 33.5138, lng: 36.2765 },
  YE: { name: 'Yemen', capital: "Sana'a", lat: 15.3694, lng: 44.191 },
  MM: { name: 'Myanmar', capital: 'Naypyidaw', lat: 19.7633, lng: 96.0785 },
  SD: { name: 'Sudan', capital: 'Khartoum', lat: 15.5007, lng: 32.5599 },
  AF: { name: 'Afghanistan', capital: 'Kabul', lat: 34.5553, lng: 69.2075 },
  KP: { name: 'North Korea', capital: 'Pyongyang', lat: 39.0392, lng: 125.7625 },
  IR: { name: 'Iran', capital: 'Tehran', lat: 35.6892, lng: 51.389 },
  CN: { name: 'China', capital: 'Beijing', lat: 39.9042, lng: 116.4074 },
  TW: { name: 'Taiwan', capital: 'Taipei', lat: 25.033, lng: 121.5654 },
  VE: { name: 'Venezuela', capital: 'Caracas', lat: 10.4806, lng: -66.9036 },
  HT: { name: 'Haiti', capital: 'Port-au-Prince', lat: 18.5944, lng: -72.3074 },
  LB: { name: 'Lebanon', capital: 'Beirut', lat: 33.8938, lng: 35.5018 },
  PK: { name: 'Pakistan', capital: 'Islamabad', lat: 33.6844, lng: 73.0479 },
  SO: { name: 'Somalia', capital: 'Mogadishu', lat: 2.0469, lng: 45.3182 },
  LY: { name: 'Libya', capital: 'Tripoli', lat: 32.8872, lng: 13.1913 },
  ET: { name: 'Ethiopia', capital: 'Addis Ababa', lat: 9.03, lng: 38.74 },
};

export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const riskRes = await fetch(`${origin}/api/country-risk`, { cache: 'no-store' });
    if (!riskRes.ok) throw new Error(`Country risk failed: ${riskRes.status}`);
    const riskData = await riskRes.json();
    const countries = (riskData.countries || []).flatMap((item: any) => {
      const reference = COUNTRY_CAPITALS[item.code];
      if (!reference) return [];
      return [{
        ...item,
        ...reference,
        flag: '',
        source: 'Pandora Country Risk Index; country-level values shown at capital reference points',
      }];
    });
    return NextResponse.json({ countries, source: 'Pandora Country Risk Index + capital reference coordinates', timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    });
  } catch (error) {
    console.error('Country risk geo error:', error);
    return NextResponse.json({ countries: [], error: 'Failed to load country risk index' }, { status: 502 });
  }
}
