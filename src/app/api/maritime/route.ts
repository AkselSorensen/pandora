import { NextResponse } from 'next/server';
import WebSocket from 'ws';

/**
 * PANDORA — Maritime Intelligence
 * Real-time AIS vessel tracking via aisstream.io + Static global ports.
 */

const PORTS = [
  // ── Top Container Ports ──
  { name: 'Shanghai', country: 'CN', lat: 31.23, lng: 121.47, type: 'container', volume: '47.3M TEU', rank: 1 },
  { name: 'Singapore', country: 'SG', lat: 1.26, lng: 103.84, type: 'container', volume: '37.2M TEU', rank: 2 },
  { name: 'Ningbo-Zhoushan', country: 'CN', lat: 29.87, lng: 121.55, type: 'container', volume: '33.3M TEU', rank: 3 },
  { name: 'Shenzhen', country: 'CN', lat: 22.54, lng: 114.05, type: 'container', volume: '30.0M TEU', rank: 4 },
  { name: 'Guangzhou', country: 'CN', lat: 23.08, lng: 113.32, type: 'container', volume: '24.2M TEU', rank: 5 },
  { name: 'Busan', country: 'KR', lat: 35.10, lng: 129.04, type: 'container', volume: '22.7M TEU', rank: 6 },
  { name: 'Qingdao', country: 'CN', lat: 36.07, lng: 120.38, type: 'container', volume: '22.0M TEU', rank: 7 },
  { name: 'Rotterdam', country: 'NL', lat: 51.90, lng: 4.50, type: 'container', volume: '14.5M TEU', rank: 8 },
  { name: 'Dubai (Jebel Ali)', country: 'AE', lat: 25.01, lng: 55.06, type: 'container', volume: '14.0M TEU', rank: 9 },
  { name: 'Port Klang', country: 'MY', lat: 2.99, lng: 101.39, type: 'container', volume: '13.2M TEU', rank: 10 },
  { name: 'Antwerp', country: 'BE', lat: 51.30, lng: 4.40, type: 'container', volume: '12.0M TEU', rank: 11 },
  { name: 'Xiamen', country: 'CN', lat: 24.48, lng: 118.09, type: 'container', volume: '11.4M TEU', rank: 12 },
  { name: 'Hamburg', country: 'DE', lat: 53.55, lng: 9.97, type: 'container', volume: '8.7M TEU', rank: 14 },
  { name: 'Los Angeles', country: 'US', lat: 33.74, lng: -118.27, type: 'container', volume: '9.9M TEU', rank: 13 },
  { name: 'Long Beach', country: 'US', lat: 33.75, lng: -118.19, type: 'container', volume: '8.0M TEU', rank: 15 },
  { name: 'Tanjung Pelepas', country: 'MY', lat: 1.36, lng: 103.55, type: 'container', volume: '9.8M TEU', rank: 16 },
  { name: 'Savannah', country: 'US', lat: 32.08, lng: -81.09, type: 'container', volume: '5.6M TEU', rank: 20 },
  { name: 'Felixstowe', country: 'GB', lat: 51.96, lng: 1.35, type: 'container', volume: '3.8M TEU', rank: 25 },
  { name: 'Santos', country: 'BR', lat: -23.95, lng: -46.31, type: 'container', volume: '4.2M TEU', rank: 22 },
  { name: 'Colombo', country: 'LK', lat: 6.94, lng: 79.84, type: 'container', volume: '7.2M TEU', rank: 17 },

  // ── Energy/Oil Ports ──
  { name: 'Ras Tanura', country: 'SA', lat: 26.64, lng: 50.16, type: 'energy', volume: '6.5M bpd' },
  { name: 'Fujairah', country: 'AE', lat: 25.14, lng: 56.35, type: 'energy', volume: '3.5M bpd' },
  { name: 'Novorossiysk', country: 'RU', lat: 44.72, lng: 37.77, type: 'energy', volume: '2.8M bpd' },
  { name: 'Houston Ship Channel', country: 'US', lat: 29.73, lng: -95.27, type: 'energy', volume: '2.5M bpd' },
  { name: 'Kharg Island', country: 'IR', lat: 29.24, lng: 50.33, type: 'energy', volume: '2.0M bpd' },
  { name: 'Primorsk', country: 'RU', lat: 60.35, lng: 28.70, type: 'energy', volume: '1.6M bpd' },

  // ── Major Naval Bases ──
  { name: 'Norfolk Naval Station', country: 'US', lat: 36.95, lng: -76.33, type: 'naval', fleet: 'US Atlantic Fleet' },
  { name: 'San Diego Naval Base', country: 'US', lat: 32.69, lng: -117.15, type: 'naval', fleet: 'US Pacific Fleet' },
  { name: 'Pearl Harbor', country: 'US', lat: 21.35, lng: -157.97, type: 'naval', fleet: 'US Pacific Fleet' },
  { name: 'Yokosuka', country: 'JP', lat: 35.28, lng: 139.67, type: 'naval', fleet: 'US 7th Fleet' },
  { name: 'Severomorsk', country: 'RU', lat: 69.07, lng: 33.42, type: 'naval', fleet: 'Russian Northern Fleet' },
  { name: 'Tartus', country: 'SY', lat: 34.89, lng: 35.89, type: 'naval', fleet: 'Russian Mediterranean' },
  { name: 'Zhanjiang', country: 'CN', lat: 21.20, lng: 110.39, type: 'naval', fleet: 'PLA Navy South Sea Fleet' },
  { name: 'Qingdao Naval', country: 'CN', lat: 36.09, lng: 120.43, type: 'naval', fleet: 'PLA Navy North Sea Fleet' },
  { name: 'Portsmouth', country: 'GB', lat: 50.80, lng: -1.11, type: 'naval', fleet: 'Royal Navy' },
  { name: 'Toulon', country: 'FR', lat: 43.12, lng: 5.93, type: 'naval', fleet: 'French Navy Mediterranean' },
  { name: 'Changi Naval Base', country: 'SG', lat: 1.33, lng: 104.01, type: 'naval', fleet: 'Republic of Singapore Navy' },
  { name: 'Visakhapatnam', country: 'IN', lat: 17.69, lng: 83.30, type: 'naval', fleet: 'Indian Navy Eastern Command' },
  { name: 'Mumbai Naval', country: 'IN', lat: 18.93, lng: 72.84, type: 'naval', fleet: 'Indian Navy Western Command' },
];

const CHOKEPOINTS = [
  { name: 'Strait of Hormuz', lat: 26.57, lng: 56.25, traffic: '21M bpd oil', risk: 'HIGH' },
  { name: 'Strait of Malacca', lat: 2.50, lng: 101.50, traffic: '16M bpd oil', risk: 'MODERATE' },
  { name: 'Suez Canal', lat: 30.43, lng: 32.34, traffic: '12% world trade', risk: 'ELEVATED' },
  { name: 'Bab el-Mandeb', lat: 12.58, lng: 43.33, traffic: '6.2M bpd oil', risk: 'CRITICAL' },
  { name: 'Panama Canal', lat: 9.08, lng: -79.68, traffic: '5% world trade', risk: 'LOW' },
  { name: 'Turkish Straits', lat: 41.12, lng: 29.07, traffic: '3M bpd oil', risk: 'MODERATE' },
  { name: 'Danish Straits', lat: 55.70, lng: 12.60, traffic: '3.2M bpd oil', risk: 'LOW' },
  { name: 'Cape of Good Hope', lat: -34.36, lng: 18.47, traffic: 'Alt route Suez', risk: 'LOW' },
  { name: 'Taiwan Strait', lat: 24.00, lng: 119.00, traffic: '88% large ships', risk: 'ELEVATED' },
  { name: 'Lombok Strait', lat: -8.47, lng: 115.72, traffic: 'Alt Malacca', risk: 'LOW' },
];

// --- Global AIS Stream Client (In-Memory Cache) ---
// Note: In a true serverless environment, this state would reset per invocation.
// For Next.js dev server or Node.js Docker container, this will persist.

const globalForAis = globalThis as unknown as {
  shipsCache: Map<number, any>;
  shipsHistory: Map<number, any>;
  isAisConnecting: boolean;
};

if (!globalForAis.shipsCache) {
  globalForAis.shipsCache = new Map();
  globalForAis.shipsHistory = new Map();
  globalForAis.isAisConnecting = false;
}

const shipsCache = globalForAis.shipsCache;
const shipsHistory = globalForAis.shipsHistory;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function nearestFeature(point: { lat: number; lng: number }, features: any[]) {
  let nearest: any = null;
  let minKm = Infinity;
  for (const feature of features) {
    const km = distanceKm(point, feature);
    if (km < minKm) {
      minKm = km;
      nearest = feature;
    }
  }
  return nearest ? { ...nearest, distance_km: Math.round(minKm * 10) / 10 } : null;
}

function scoreDarkVessel(ship: any) {
  const reasons: string[] = [];
  let score = 0;
  const point = { lat: ship.lat, lng: ship.lng };
  const nearestPort = nearestFeature(point, PORTS);
  const nearestChokepoint = nearestFeature(point, CHOKEPOINTS);
  const speed = Number(ship.speed || 0);
  const ageMinutes = Math.max(0, Math.round((Date.now() - Number(ship.timestamp || 0)) / 60000));

  if (ageMinutes >= 5) {
    score += 20;
    reasons.push(`stale AIS position ${ageMinutes}m old`);
  }
  if (ship.gap_minutes >= 45) {
    score += 35;
    reasons.push(`AIS gap ${ship.gap_minutes}m before last report`);
  }
  if (ship.implied_speed_kts >= 45) {
    score += 45;
    reasons.push(`impossible jump ${ship.implied_speed_kts}kt implied`);
  }
  if (nearestChokepoint?.distance_km <= 90) {
    score += nearestChokepoint.risk === 'CRITICAL' ? 35 : nearestChokepoint.risk === 'HIGH' ? 25 : 15;
    reasons.push(`near ${nearestChokepoint.name} chokepoint (${nearestChokepoint.distance_km}km)`);
  }
  if (nearestPort?.distance_km <= 35 && speed <= 1.5) {
    score += nearestPort.type === 'energy' || nearestPort.type === 'naval' ? 30 : 18;
    reasons.push(`loitering near ${nearestPort.name} ${nearestPort.type} port (${nearestPort.distance_km}km)`);
  }
  if (!Number.isFinite(Number(ship.heading)) || Number(ship.heading) === 511) {
    score += 8;
    reasons.push('missing/invalid heading');
  }
  if (!ship.name && !ship.imo) {
    score += 7;
    reasons.push('limited identity metadata from public AIS');
  }

  const severity = score >= 80 ? 'CRITICAL' : score >= 55 ? 'HIGH' : score >= 30 ? 'WATCH' : 'LOW';
  return {
    ...ship,
    dark_score: Math.min(100, score),
    severity,
    reasons,
    nearest_port: nearestPort,
    nearest_chokepoint: nearestChokepoint,
    title: `${severity} maritime anomaly — MMSI ${ship.mmsi}`,
  };
}

function connectAisStream() {
  if (globalForAis.isAisConnecting) return;
  const apiKey = process.env.AIS_API_KEY;
  if (!apiKey) return;

  globalForAis.isAisConnecting = true;
  let ws: WebSocket;

  try {
    ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
  } catch (e) {
    globalForAis.isAisConnecting = false;
    return;
  }

  ws.on("open", () => {
    globalForAis.isAisConnecting = false;
    const subscriptionMessage = {
      APIKey: apiKey,
      // Global bounding box to catch major movement
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FilterMessageTypes: ["PositionReport"]
    };
    ws.send(JSON.stringify(subscriptionMessage));
  });

  ws.on("message", (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.MessageType === "PositionReport" && parsed.Message?.PositionReport) {
        const report = parsed.Message.PositionReport;
        const mmsi = parsed.MetaData?.MMSI || report.UserID;
        
        if (!mmsi) return;

        const previous = shipsHistory.get(mmsi) || shipsCache.get(mmsi);
        const timestamp = Date.now();
        const gapMs = previous?.timestamp ? timestamp - previous.timestamp : 0;
        const jumpKm = previous?.lat && previous?.lng ? distanceKm({ lat: previous.lat, lng: previous.lng }, { lat: report.Latitude, lng: report.Longitude }) : 0;
        const impliedSpeedKts = gapMs > 0 ? (jumpKm / (gapMs / 3600000)) / 1.852 : 0;

        const shipRecord = {
          id: mmsi,
          mmsi: mmsi,
          lat: report.Latitude,
          lng: report.Longitude,
          speed: report.Sog,
          heading: report.TrueHeading || report.Cog,
          timestamp,
          gap_minutes: Math.round(gapMs / 60000),
          jump_km: Math.round(jumpKm * 10) / 10,
          implied_speed_kts: Math.round(impliedSpeedKts * 10) / 10,
        };

        shipsCache.set(mmsi, shipRecord);
        shipsHistory.set(mmsi, shipRecord);

        // Limit cache size to prevent memory leak (latest 5000 ships)
        if (shipsCache.size > 5000) {
          const firstKey = shipsCache.keys().next().value;
          if (firstKey) shipsCache.delete(firstKey);
        }
        if (shipsHistory.size > 10000) {
          const firstKey = shipsHistory.keys().next().value;
          if (firstKey) shipsHistory.delete(firstKey);
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  });

  ws.on("close", () => {
    globalForAis.isAisConnecting = false;
    setTimeout(connectAisStream, 5000); // Reconnect
  });

  ws.on("error", () => {
    ws.close();
  });
}

// Start connection process asynchronously
connectAisStream();

export async function GET() {
  // Clean up stale ships (older than 10 minutes)
  const now = Date.now();
  for (const [mmsi, ship] of shipsCache.entries()) {
    if (now - ship.timestamp > 10 * 60 * 1000) {
      shipsCache.delete(mmsi);
    }
  }

  const ships = Array.from(shipsCache.values());
  const darkVessels = ships
    .map(scoreDarkVessel)
    .filter((ship) => ship.dark_score >= 30)
    .sort((a, b) => b.dark_score - a.dark_score)
    .slice(0, 250);

  const darkActivity = darkVessels.map((ship) => ({
    id: `dark-vessel-${ship.mmsi}`,
    lat: ship.lat,
    lng: ship.lng,
    type: 'dark_vessel',
    title: ship.title,
    severity: ship.severity,
    score: ship.dark_score,
    vessel_mmsi: ship.mmsi,
    vessel_count: 1,
    context: ship.reasons.join(' | '),
    source: 'AIS-derived dark vessel heuristic',
    nearest_port: ship.nearest_port?.name,
    nearest_chokepoint: ship.nearest_chokepoint?.name,
  }));

  return NextResponse.json({
    ports: PORTS,
    chokepoints: CHOKEPOINTS,
    ships: ships,
    dark_vessels: darkVessels,
    dark_activity: darkActivity,
    total_ports: PORTS.length,
    total_chokepoints: CHOKEPOINTS.length,
    total_ships: ships.length,
    total_dark_vessels: darkVessels.length,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'Pragma': 'public',
      'Expires': '30',
    }
  });
}
