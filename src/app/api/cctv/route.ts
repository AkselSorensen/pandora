import { NextResponse } from 'next/server';
import { fetchAsfinagCameras } from './asfinag';
import { fetchBulgariaCameras } from './bulgaria';
import { fetchGreeceCameras } from './greece';
import { fetchSerbiaCameras } from './serbia';
import { fetchMacedoniaCameras } from './macedonia';
import { fetchTurkeyCameras } from './turkey';
import { fetchRomaniaCameras } from './romania';
import { fetchAustraliaCameras } from './australia';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * PANDORA — Worldwide CCTV Camera API v2
 * Viewport-aware: pass ?region=xx to load cameras for specific regions
 * Supports: uk, us-east, us-west, us-central, canada, europe, asia
 * Or pass ?lat=x&lng=y&radius=5 for proximity-based loading
 */

// ═══ CAMERA SOURCE DEFINITIONS ═══

type CameraApiV2Source = {
  id: string;
  url: string;
  city: string;
  country: string;
  source: string;
};

const NORTH_AMERICA_CAMERA_API_V2: CameraApiV2Source[] = [
  // Public 511-style camera APIs. Some providers may temporarily block or rate-limit;
  // each source is isolated with timeouts and failures are ignored.
  { id: 'mn511', url: 'https://511mn.org/api/v2/get/cameras', city: 'Minnesota', country: 'US', source: 'MN 511' },
  { id: 'ia511', url: 'https://511ia.org/api/v2/get/cameras', city: 'Iowa', country: 'US', source: 'Iowa 511' },
  { id: 'kandrive', url: 'https://www.kandrive.gov/api/v2/get/cameras', city: 'Kansas', country: 'US', source: 'KanDrive' },
  { id: 'ne511', url: 'https://new.511.nebraska.gov/api/v2/get/cameras', city: 'Nebraska', country: 'US', source: 'Nebraska 511' },
  { id: 'wi511', url: 'https://511wi.gov/api/v2/get/cameras', city: 'Wisconsin', country: 'US', source: 'Wisconsin 511' },
  { id: 'az511', url: 'https://www.az511.gov/api/v2/get/cameras', city: 'Arizona', country: 'US', source: 'Arizona 511' },
  { id: 'cotrip', url: 'https://www.cotrip.org/api/v2/get/cameras', city: 'Colorado', country: 'US', source: 'COtrip' },
  { id: 'udot', url: 'https://www.udottraffic.utah.gov/api/v2/get/cameras', city: 'Utah', country: 'US', source: 'UDOT Traffic' },
  { id: 'id511', url: 'https://511.idaho.gov/api/v2/get/cameras', city: 'Idaho', country: 'US', source: 'Idaho 511' },
  { id: 'nvroads', url: 'https://www.nvroads.com/api/v2/get/cameras', city: 'Nevada', country: 'US', source: 'NV Roads' },
  { id: 'newengland511', url: 'https://newengland511.org/api/v2/get/cameras', city: 'New England', country: 'US', source: 'New England 511' },
  { id: 'mb511', url: 'https://www.manitoba511.ca/api/v2/get/cameras', city: 'Manitoba', country: 'Canada', source: 'Manitoba 511' },
  { id: 'nb511', url: 'https://511.gnb.ca/api/v2/get/cameras', city: 'New Brunswick', country: 'Canada', source: 'New Brunswick 511' },
];

function firstString(...values: any[]) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
}

function firstNumber(...values: any[]) {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value || ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeCameraApiV2Item(cam: any, source: CameraApiV2Source, index: number) {
  const lat = firstNumber(cam.Latitude, cam.latitude, cam.Lat, cam.lat, cam.Location?.Latitude, cam.location?.latitude);
  const lng = firstNumber(cam.Longitude, cam.longitude, cam.Lon, cam.lng, cam.Location?.Longitude, cam.location?.longitude);
  const view = Array.isArray(cam.Views) ? cam.Views[0] : Array.isArray(cam.views) ? cam.views[0] : null;
  const feedUrl = firstString(
    view?.Url, view?.url, view?.ImageUrl, view?.imageUrl,
    cam.ImageURL, cam.ImageUrl, cam.imageUrl, cam.Url, cam.url,
    cam.CctvUrl, cam.cctvUrl, cam.SnapshotUrl, cam.snapshotUrl,
  );

  if (lat === null || lng === null || !feedUrl) return null;

  return {
    id: `${source.id}-${cam.Id || cam.ID || cam.id || cam.CameraID || index}`,
    lat,
    lng,
    name: firstString(cam.Name, cam.name, cam.Location, cam.location, cam.Description, cam.description, cam.Title, cam.title) || `${source.source} Camera`,
    city: source.city,
    country: source.country,
    feed_url: feedUrl,
    source: source.source,
  };
}

async function fetchCameraApiV2Sources(sources: CameraApiV2Source[]): Promise<any[]> {
  const settled = await Promise.allSettled(sources.map(async (source) => {
    const res = await fetch(source.url, { signal: AbortSignal.timeout(9000), headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.cameras) ? data.cameras : Array.isArray(data?.Cameras) ? data.Cameras : [];
    return list
      .slice(0, 1200)
      .map((cam: any, index: number) => normalizeCameraApiV2Item(cam, source, index))
      .filter(Boolean);
  }));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

function cameraApiV2ByIds(ids: string[]) {
  const wanted = new Set(ids);
  return NORTH_AMERICA_CAMERA_API_V2.filter((source) => wanted.has(source.id));
}

const COUNTRY_WEBCAM_FALLBACK = [
  ['Afghanistan', 33.9391, 67.71], ['Albania', 41.1533, 20.1683], ['Algeria', 28.0339, 1.6596], ['Andorra', 42.5063, 1.5218],
  ['Angola', -11.2027, 17.8739], ['Argentina', -38.4161, -63.6167], ['Armenia', 40.0691, 45.0382], ['Australia', -25.2744, 133.7751],
  ['Austria', 47.5162, 14.5501], ['Azerbaijan', 40.1431, 47.5769], ['Bahamas', 25.0343, -77.3963], ['Bahrain', 25.9304, 50.6378],
  ['Bangladesh', 23.685, 90.3563], ['Belgium', 50.5039, 4.4699], ['Belize', 17.1899, -88.4976], ['Benin', 9.3077, 2.3158],
  ['Bhutan', 27.5142, 90.4336], ['Bolivia', -16.2902, -63.5887], ['Bosnia and Herzegovina', 43.9159, 17.6791], ['Botswana', -22.3285, 24.6849],
  ['Brazil', -14.235, -51.9253], ['Bulgaria', 42.7339, 25.4858], ['Cambodia', 12.5657, 104.991], ['Cameroon', 7.3697, 12.3547],
  ['Canada', 56.1304, -106.3468], ['Chile', -35.6751, -71.543], ['China', 35.8617, 104.1954], ['Colombia', 4.5709, -74.2973],
  ['Costa Rica', 9.7489, -83.7534], ['Croatia', 45.1, 15.2], ['Cyprus', 35.1264, 33.4299], ['Czechia', 49.8175, 15.473],
  ['Denmark', 56.2639, 9.5018], ['Dominican Republic', 18.7357, -70.1627], ['Ecuador', -1.8312, -78.1834], ['Egypt', 26.8206, 30.8025],
  ['Estonia', 58.5953, 25.0136], ['Ethiopia', 9.145, 40.4897], ['Finland', 61.9241, 25.7482], ['France', 46.2276, 2.2137],
  ['Georgia', 42.3154, 43.3569], ['Germany', 51.1657, 10.4515], ['Ghana', 7.9465, -1.0232], ['Greece', 39.0742, 21.8243],
  ['Greenland', 71.7069, -42.6043], ['Guatemala', 15.7835, -90.2308], ['Hungary', 47.1625, 19.5033], ['Iceland', 64.9631, -19.0208],
  ['India', 20.5937, 78.9629], ['Indonesia', -0.7893, 113.9213], ['Ireland', 53.1424, -7.6921], ['Israel', 31.0461, 34.8516],
  ['Italy', 41.8719, 12.5674], ['Japan', 36.2048, 138.2529], ['Jordan', 30.5852, 36.2384], ['Kazakhstan', 48.0196, 66.9237],
  ['Kenya', -0.0236, 37.9062], ['Latvia', 56.8796, 24.6032], ['Lebanon', 33.8547, 35.8623], ['Lithuania', 55.1694, 23.8813],
  ['Luxembourg', 49.8153, 6.1296], ['Malaysia', 4.2105, 101.9758], ['Maldives', 3.2028, 73.2207], ['Malta', 35.9375, 14.3754],
  ['Mexico', 23.6345, -102.5528], ['Moldova', 47.4116, 28.3699], ['Monaco', 43.7384, 7.4246], ['Mongolia', 46.8625, 103.8467],
  ['Montenegro', 42.7087, 19.3744], ['Morocco', 31.7917, -7.0926], ['Nepal', 28.3949, 84.124], ['Netherlands', 52.1326, 5.2913],
  ['New Zealand', -40.9006, 174.886], ['Nigeria', 9.082, 8.6753], ['North Macedonia', 41.6086, 21.7453], ['Norway', 60.472, 8.4689],
  ['Pakistan', 30.3753, 69.3451], ['Panama', 8.538, -80.7821], ['Peru', -9.19, -75.0152], ['Philippines', 12.8797, 121.774],
  ['Poland', 51.9194, 19.1451], ['Portugal', 39.3999, -8.2245], ['Qatar', 25.3548, 51.1839], ['Romania', 45.9432, 24.9668],
  ['Serbia', 44.0165, 21.0059], ['Singapore', 1.3521, 103.8198], ['Slovakia', 48.669, 19.699], ['Slovenia', 46.1512, 14.9955],
  ['South Africa', -30.5595, 22.9375], ['South Korea', 35.9078, 127.7669], ['Spain', 40.4637, -3.7492], ['Sri Lanka', 7.8731, 80.7718],
  ['Sweden', 60.1282, 18.6435], ['Switzerland', 46.8182, 8.2275], ['Taiwan', 23.6978, 120.9605], ['Thailand', 15.87, 100.9925],
  ['Tunisia', 33.8869, 9.5375], ['Turkey', 38.9637, 35.2433], ['Ukraine', 48.3794, 31.1656], ['United Arab Emirates', 23.4241, 53.8478],
  ['United Kingdom', 55.3781, -3.436], ['United States', 37.0902, -95.7129], ['Uruguay', -32.5228, -55.7658], ['Vietnam', 14.0583, 108.2772],
];

function webcamPortalUrl(countryName: string) {
  return `https://www.windy.com/webcams?${new URLSearchParams({ q: countryName }).toString()}`;
}

async function fetchGlobalPublicWebcamPortals(): Promise<any[]> {
  try {
    const res = await fetch('https://restcountries.com/v3.1/all?fields=name,latlng,cca2', { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    if (res.ok) {
      const countries = await res.json();
      return (countries || []).flatMap((country: any) => {
        const lat = Number(country.latlng?.[0]);
        const lng = Number(country.latlng?.[1]);
        const name = country.name?.common;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name) return [];
        return [{
          id: `world-webcam-${country.cca2 || name}`,
          lat,
          lng,
          name: `${name} public webcam portal`,
          city: name,
          country: name,
          external_url: webcamPortalUrl(name),
          source: 'Windy public webcam portal',
        }];
      });
    }
  } catch { /* fallback below */ }

  return COUNTRY_WEBCAM_FALLBACK.map(([name, lat, lng]) => ({
    id: `world-webcam-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    lat,
    lng,
    name: `${name} public webcam portal`,
    city: name,
    country: name,
    external_url: webcamPortalUrl(String(name)),
    source: 'Windy public webcam portal',
  }));
}

async function fetchCustomCctvCatalog(): Promise<any[]> {
  try {
    const filePath = path.join(process.cwd(), 'public', 'cctv-sources.json');
    const raw = await readFile(filePath, 'utf8');
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];

    return items.flatMap((cam: any, index: number) => {
      const lat = Number(cam.lat);
      const lng = Number(cam.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      if (!cam.feed_url && !cam.external_url && !cam.stream_url) return [];

      return [{
        id: String(cam.id || `custom-${index}`),
        lat,
        lng,
        name: String(cam.name || 'Custom public camera'),
        city: String(cam.city || cam.country || 'Unknown'),
        country: String(cam.country || 'Unknown'),
        feed_url: cam.feed_url,
        stream_url: cam.stream_url,
        external_url: cam.external_url,
        category: cam.category || 'custom',
        access: cam.access || (cam.feed_url || cam.stream_url ? 'direct' : 'external-only'),
        source: cam.source || 'Custom public CCTV catalog',
      }];
    });
  } catch {
    return [];
  }
}

// ── UK: Transport for London JamCams (~900) ──
async function fetchTfLCameras(): Promise<any[]> {
  try {
    const res = await fetch('https://api.tfl.gov.uk/Place/Type/JamCam', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((cam: any) => {
      const imgProp = cam.additionalProperties?.find((p: any) => p.key === 'imageUrl');
      const camId = cam.id?.replace('JamCams_', '') || '';
      return {
        id: `tfl-${cam.id}`, lat: cam.lat, lng: cam.lon,
        name: cam.commonName || 'London JamCam', city: 'London', country: 'UK',
        feed_url: imgProp?.value || `https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/${camId}.jpg`,
        source: 'TfL',
      };
    }).filter((c: any) => c.lat && c.lng);
  } catch { return []; }
}

// ── US-WEST: WSDOT Washington State (~500) ──
async function fetchWSDOTCameras(): Promise<any[]> {
  try {
    const res = await fetch('https://data.wsdot.wa.gov/log/public/cameras.json', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((cam: any) => ({
      id: `wsdot-${cam.CameraID}`, lat: cam.CameraLocation?.Latitude, lng: cam.CameraLocation?.Longitude,
      name: cam.Title || 'WSDOT Camera', city: 'Washington', country: 'US',
      feed_url: cam.ImageURL || '', source: 'WSDOT',
    })).filter((c: any) => c.lat && c.lng && c.feed_url);
  } catch { return []; }
}

// ── US-WEST: Caltrans California Districts ──
async function fetchCaltransCameras(): Promise<any[]> {
  const allCams: any[] = [];
  for (const dist of ['d03', 'd04', 'd05', 'd06', 'd07', 'd08', 'd10', 'd11', 'd12']) {
    try {
      const res = await fetch(`https://cwwp2.dot.ca.gov/data/${dist}/cctv/cctvStatus${dist.toUpperCase()}.json`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      for (const cam of (data?.data || [])) {
        const lat = parseFloat(cam.location?.latitude);
        const lng = parseFloat(cam.location?.longitude);
        const url = cam.cctv?.imageData?.static?.currentImageURL;
        if (!lat || !lng || !url) continue;
        allCams.push({ id: `cal-${allCams.length}`, lat, lng, name: cam.location?.locationName || 'Caltrans', city: 'California', country: 'US', feed_url: url, source: 'Caltrans' });
      }
    } catch { /* silent */ }
  }
  return allCams;
}

// ── CANADA: Ottawa, Toronto, Montreal ──
async function fetchCanadaCameras(): Promise<any[]> {
  const cams: any[] = [];

  // Ottawa MTO Highway Cameras
  try {
    const res = await fetch('https://511on.ca/api/v2/get/cameras', { signal: AbortSignal.timeout(10000), headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || [])) {
        if (!cam.latitude || !cam.longitude) continue;
        cams.push({
          id: `on-${cam.id || cams.length}`, lat: cam.latitude, lng: cam.longitude,
          name: cam.description || cam.name || 'Ontario Camera', city: 'Ontario', country: 'Canada',
          feed_url: cam.imageUrl || cam.url || '', source: '511 Ontario',
        });
      }
    }
  } catch { /* silent */ }

  // Ville de Montréal cameras
  try {
    const res = await fetch('https://ville.montreal.qc.ca/circulation/sites/ville.montreal.qc.ca.circulation/files/cameras.json', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || [])) {
        cams.push({
          id: `mtl-${cams.length}`, lat: cam.latitude || cam.lat, lng: cam.longitude || cam.lng,
          name: cam.description || cam.name || 'Montréal Camera', city: 'Montréal', country: 'Canada',
          feed_url: cam.url || cam.imageUrl || '', source: 'Ville MTL',
        });
      }
    }
  } catch { /* silent */ }

  // Curated Ottawa/Toronto cameras from known public feeds
  const curated = [
    { id: 'ott-1', lat: 45.4215, lng: -75.6972, name: 'Parliament Hill / Wellington', city: 'Ottawa', country: 'Canada', feed_url: 'https://traffic.ottawa.ca/map/camera?id=1', source: 'Ottawa' },
    { id: 'ott-2', lat: 45.4231, lng: -75.6831, name: 'Rideau / Sussex', city: 'Ottawa', country: 'Canada', feed_url: 'https://traffic.ottawa.ca/map/camera?id=2', source: 'Ottawa' },
    { id: 'ott-3', lat: 45.4195, lng: -75.7009, name: 'Bank / Sparks', city: 'Ottawa', country: 'Canada', feed_url: 'https://traffic.ottawa.ca/map/camera?id=3', source: 'Ottawa' },
    { id: 'ott-4', lat: 45.4249, lng: -75.6950, name: 'King Edward / Rideau', city: 'Ottawa', country: 'Canada', feed_url: 'https://traffic.ottawa.ca/map/camera?id=4', source: 'Ottawa' },
    { id: 'ott-5', lat: 45.3968, lng: -75.7398, name: 'Merivale / Baseline', city: 'Ottawa', country: 'Canada', feed_url: 'https://traffic.ottawa.ca/map/camera?id=5', source: 'Ottawa' },
    { id: 'ott-6', lat: 45.3484, lng: -75.7580, name: 'Fallowfield / Woodroffe', city: 'Ottawa', country: 'Canada', feed_url: 'https://traffic.ottawa.ca/map/camera?id=6', source: 'Ottawa' },
    { id: 'ott-7', lat: 45.4012, lng: -75.6518, name: 'Hwy 417 / Vanier Pkwy', city: 'Ottawa', country: 'Canada', feed_url: 'https://traffic.ottawa.ca/map/camera?id=7', source: 'Ottawa' },
    { id: 'ott-8', lat: 45.4475, lng: -75.4822, name: 'Innes / Orleans Blvd', city: 'Ottawa', country: 'Canada', feed_url: 'https://traffic.ottawa.ca/map/camera?id=8', source: 'Ottawa' },
    { id: 'tor-1', lat: 43.6532, lng: -79.3832, name: 'Yonge / Dundas Square', city: 'Toronto', country: 'Canada', feed_url: 'https://511on.ca/api/v2/get/cameras', source: '511 Ontario' },
    { id: 'tor-2', lat: 43.6426, lng: -79.3871, name: 'CN Tower / Lakeshore', city: 'Toronto', country: 'Canada', feed_url: 'https://511on.ca/api/v2/get/cameras', source: '511 Ontario' },
    { id: 'tor-3', lat: 43.6711, lng: -79.3868, name: 'Bloor / Yonge', city: 'Toronto', country: 'Canada', feed_url: 'https://511on.ca/api/v2/get/cameras', source: '511 Ontario' },
  ];
  cams.push(...curated);

  // Alberta 511
  try {
    const res = await fetch('https://511.alberta.ca/api/v2/get/cameras', { signal: AbortSignal.timeout(10000), headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || [])) {
        if (!cam.Latitude || !cam.Longitude || !cam.Views?.[0]?.Url) continue;
        cams.push({
          id: `ab-${cam.Id || cams.length}`, lat: cam.Latitude, lng: cam.Longitude,
          name: cam.Location || 'Alberta Camera', city: 'Alberta', country: 'Canada',
          feed_url: cam.Views[0].Url, source: 'Alberta 511',
        });
      }
    }
  } catch { /* silent */ }

  return cams.filter((c: any) => c.lat && c.lng);
}

// ── US-CENTRAL: Chicago, Houston, Dallas, Denver ──
async function fetchUSCentralCameras(): Promise<any[]> {
  const cams: any[] = [];
  // Illinois DOT
  try {
    const res = await fetch('https://www.travelmidwest.com/lmiga/cameraReport.json', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data?.cameraReports || data || []).slice(0, 800)) {
        if (!cam.latitude || !cam.longitude) continue;
        cams.push({
          id: `ildot-${cams.length}`, lat: cam.latitude, lng: cam.longitude,
          name: cam.cameraName || cam.description || 'IDOT Camera', city: 'Illinois', country: 'US',
          feed_url: cam.imageUrl || cam.url || '', source: 'IDOT',
        });
      }
    }
  } catch { /* silent */ }

  return cams.filter((c: any) => c.lat && c.lng);
}

// ── US-EAST: OH, DC, Florida, Georgia ──
async function fetchUSEastCameras(): Promise<any[]> {
  const cams: any[] = [];

  // Butler County, OH (from redhunt45 fork)
  cams.push(
    {
      id: 'butler-oh-hamilton', lat: 39.3988617, lng: -84.5595353,
      name: 'Hamilton, OH', city: 'Hamilton', country: 'US',
      feed_url: 'https://gsccam.butlersheriff.org/axis-cgi/jpg/image.cgi',
      external_url: 'https://gsccam.butlersheriff.org/camera/index.html#/video',
      source: 'Butler County, OH',
    },
    {
      id: 'butler-oh-129-747', lat: 39.381435, lng: -84.438423,
      name: 'OH-129 at 747', city: 'Butler County', country: 'US',
      feed_url: 'https://towercam.butlersheriff.org/axis-cgi/jpg/image.cgi',
      external_url: 'https://towercam.butlersheriff.org/aca/index.html#view',
      source: 'Butler County, OH',
    },
  );

  // Cincinnati, OH (from redhunt45 fork)
  cams.push(
    {
      id: 'cincinnati-cincyvision-yt', lat: 39.089101, lng: -84.527943,
      name: 'CincyVision YT', city: 'Cincinnati', country: 'US',
      external_url: 'https://www.youtube.com/@AaronPreslin/live',
      source: 'Cincinnati, OH',
    },
    {
      id: 'cincinnati-covington-earthcam', lat: 39.090510, lng: -84.510413,
      name: 'Cincinnati-Covington EarthCam', city: 'Covington', country: 'US',
      external_url: 'https://www.earthcam.com/usa/kentucky/covington/?cam=covington',
      source: 'Cincinnati, OH',
    },
  );
  // Florida 511
  try {
    const res = await fetch('https://fl511.com/api/v2/cameras', { signal: AbortSignal.timeout(8000), headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || []).slice(0, 800)) {
        if (!cam.latitude || !cam.longitude) continue;
        cams.push({
          id: `fl-${cams.length}`, lat: cam.latitude, lng: cam.longitude,
          name: cam.description || 'FL-511 Camera', city: 'Florida', country: 'US',
          feed_url: cam.imageUrl || '', source: 'FL-511',
        });
      }
    }
  } catch { /* silent */ }

  return cams.filter((c: any) => c.lat && c.lng);
}

// ── EUROPE: Netherlands, Germany, France ──
async function fetchFranceCameras(): Promise<any[]> {
  // France has fewer stable public raw camera APIs than North American 511 feeds.
  // These are public camera/traffic portals exposed as external-only entries so
  // Pandora opens the official/public page instead of hotlinking protected media.
  const portals = [
    { id: 'fr-sytadin-idf', lat: 48.8566, lng: 2.3522, name: 'Île-de-France traffic cameras / Sytadin', city: 'Paris / Île-de-France', external_url: 'https://www.sytadin.fr/', source: 'Sytadin' },
    { id: 'fr-bison-fute', lat: 46.6034, lng: 1.8883, name: 'France national road traffic webcams / Bison Futé', city: 'France', external_url: 'https://www.bison-fute.gouv.fr/', source: 'Bison Futé' },
    { id: 'fr-paris-earthcam', lat: 48.8584, lng: 2.2945, name: 'Paris Eiffel Tower public webcam', city: 'Paris', external_url: 'https://www.earthcam.com/world/france/paris/?cam=eiffeltower_hd', source: 'EarthCam public' },
    { id: 'fr-paris-skyline', lat: 48.8566, lng: 2.3522, name: 'Paris public webcam', city: 'Paris', external_url: 'https://www.skylinewebcams.com/en/webcam/france/ile-de-france/paris.html', source: 'SkylineWebcams public' },
    { id: 'fr-nice-promenade', lat: 43.695, lng: 7.265, name: 'Nice Promenade public webcam', city: 'Nice', external_url: 'https://www.skylinewebcams.com/en/webcam/france/provence-alpes-cote-d-azur/nice.html', source: 'SkylineWebcams public' },
    { id: 'fr-marseille-vieux-port', lat: 43.2965, lng: 5.3698, name: 'Marseille public webcam portal', city: 'Marseille', external_url: 'https://www.viewsurf.com/', source: 'Viewsurf public portal' },
    { id: 'fr-lyon', lat: 45.764, lng: 4.8357, name: 'Lyon public webcam portal', city: 'Lyon', external_url: 'https://www.viewsurf.com/', source: 'Viewsurf public portal' },
    { id: 'fr-bordeaux', lat: 44.8378, lng: -0.5792, name: 'Bordeaux public webcam portal', city: 'Bordeaux', external_url: 'https://www.viewsurf.com/', source: 'Viewsurf public portal' },
    { id: 'fr-toulouse', lat: 43.6047, lng: 1.4442, name: 'Toulouse public webcam portal', city: 'Toulouse', external_url: 'https://www.viewsurf.com/', source: 'Viewsurf public portal' },
    { id: 'fr-lille', lat: 50.6292, lng: 3.0573, name: 'Lille public webcam portal', city: 'Lille', external_url: 'https://www.viewsurf.com/', source: 'Viewsurf public portal' },
    { id: 'fr-strasbourg', lat: 48.5734, lng: 7.7521, name: 'Strasbourg public webcam portal', city: 'Strasbourg', external_url: 'https://www.viewsurf.com/', source: 'Viewsurf public portal' },
    { id: 'fr-nantes', lat: 47.2184, lng: -1.5536, name: 'Nantes public webcam portal', city: 'Nantes', external_url: 'https://www.viewsurf.com/', source: 'Viewsurf public portal' },
    { id: 'fr-grenoble', lat: 45.1885, lng: 5.7245, name: 'Grenoble / Alps public webcam portal', city: 'Grenoble', external_url: 'https://www.viewsurf.com/', source: 'Viewsurf public portal' },
    { id: 'fr-chamonix', lat: 45.9237, lng: 6.8694, name: 'Chamonix Mont-Blanc public webcams', city: 'Chamonix', external_url: 'https://www.chamonix.com/webcams', source: 'Chamonix public' },
    { id: 'fr-cannes', lat: 43.5528, lng: 7.0174, name: 'Cannes public webcam portal', city: 'Cannes', external_url: 'https://www.viewsurf.com/', source: 'Viewsurf public portal' },
  ];

  return portals.map((cam) => ({ ...cam, country: 'France' }));
}

async function fetchEuropeCameras(): Promise<any[]> {
  const cams: any[] = [];

  // Netherlands Rijkswaterstaat
  try {
    const res = await fetch('https://opendata.ndw.nu/cameras.json', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || []).slice(0, 1000)) {
        if (!cam.lat || !cam.lng) continue;
        cams.push({
          id: `nl-${cams.length}`, lat: cam.lat, lng: cam.lng,
          name: cam.name || 'NL Camera', city: 'Netherlands', country: 'NL',
          feed_url: cam.imageUrl || '', source: 'RWS',
        });
      }
    }
  } catch { /* silent */ }

  cams.push(...await fetchAsfinagCameras());
  cams.push(...await fetchFranceCameras());

  return cams.filter((c: any) => c.lat && c.lng);
}

// ── ASIA/PACIFIC ──
async function fetchAsiaCameras(): Promise<any[]> {
  const cams: any[] = [];

  // Singapore Live Traffic Images
  try {
    const res = await fetch('https://api.data.gov.sg/v1/transport/traffic-images', { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      const items = data.items?.[0]?.cameras || [];
      for (const cam of items) {
        if (!cam.location?.latitude || !cam.location?.longitude || !cam.image) continue;
        cams.push({
          id: `sin-${cam.camera_id}`,
          lat: cam.location.latitude,
          lng: cam.location.longitude,
          name: `Camera ${cam.camera_id}`,
          city: 'Singapore',
          country: 'Singapore',
          feed_url: cam.image,
          source: 'LTA Singapore'
        });
      }
    }
  } catch { /* silent */ }

  return cams;
}


// ═══ REGION MAPPING ═══
const REGION_FETCHERS: Record<string, () => Promise<any[]>> = {
  'custom': fetchCustomCctvCatalog,
  'world': fetchGlobalPublicWebcamPortals,
  'uk': fetchTfLCameras,
  'us-west': async () => [
    ...await fetchWSDOTCameras(),
    ...await fetchCaltransCameras(),
    ...await fetchCameraApiV2Sources(cameraApiV2ByIds(['az511', 'cotrip', 'udot', 'id511', 'nvroads'])),
  ],
  'us-east': async () => [
    ...await fetchUSEastCameras(),
    ...await fetchCameraApiV2Sources(cameraApiV2ByIds(['newengland511'])),
  ],
  'us-central': async () => [
    ...await fetchUSCentralCameras(),
    ...await fetchCameraApiV2Sources(cameraApiV2ByIds(['mn511', 'ia511', 'kandrive', 'ne511', 'wi511'])),
  ],
  'canada': async () => [
    ...await fetchCanadaCameras(),
    ...await fetchCameraApiV2Sources(cameraApiV2ByIds(['mb511', 'nb511'])),
  ],
  'france': fetchFranceCameras,
  'europe': fetchEuropeCameras,
  'asia': fetchAsiaCameras,
  'bulgaria': fetchBulgariaCameras,
  'greece': fetchGreeceCameras,
  'serbia': fetchSerbiaCameras,
  'macedonia': fetchMacedoniaCameras,
  'turkey': fetchTurkeyCameras,
  'romania': fetchRomaniaCameras,
  'australia': fetchAustraliaCameras,
};

// Determine which regions to fetch based on viewport bounds
function getRegionsForBounds(lat: number, lng: number, radius: number): string[] {
  const regions: string[] = [];
  // UK
  if (lat > 49 && lat < 61 && lng > -8 && lng < 2) regions.push('uk');
  // US-East
  if (lat > 24 && lat < 49 && lng > -85 && lng < -66) regions.push('us-east');
  // US-West
  if (lat > 24 && lat < 49 && lng > -125 && lng < -100) regions.push('us-west');
  // US-Central
  if (lat > 24 && lat < 49 && lng > -105 && lng < -80) regions.push('us-central');
  // Canada
  if (lat > 42 && lat < 70 && lng > -141 && lng < -52) regions.push('canada');
  // Europe
  const inBulgaria = lat > 41 && lat < 44.5 && lng > 22 && lng < 29.5;
  const inGreece = lat > 34.5 && lat < 41.8 && lng > 19 && lng < 30;
  const inSerbia = lat > 42 && lat < 46.5 && lng > 18.8 && lng < 23.3;
  const inMacedonia = lat > 40.8 && lat < 42.8 && lng > 20.4 && lng < 23.2;
  const inRomania = lat > 43.5 && lat < 48.5 && lng > 20 && lng < 29.8;
  const inTurkey = lat > 35.5 && lat < 42.5 && lng > 25.5 && lng < 45;
  const inFrance = lat > 41 && lat < 51.5 && lng > -5.5 && lng < 10;
  const inBalkans = inBulgaria || inGreece || inSerbia || inMacedonia || inRomania || inTurkey;

  if (lat > 35 && lat < 72 && lng > -11 && lng < 40 && !inBalkans && !inFrance) {
    regions.push('europe');
  }
  if (inFrance) regions.push('france');
  if (inBulgaria) regions.push('bulgaria');
  if (inGreece) regions.push('greece');
  if (inSerbia) regions.push('serbia');
  if (inMacedonia) regions.push('macedonia');
  if (inRomania) regions.push('romania');
  if (inTurkey) regions.push('turkey');

  // Asia (includes Middle East, SE Asia, overriding parts of china but that's ok they can both load)
  if ((lat > -10 && lat < 60 && lng > 60 && lng < 150)) regions.push('asia');
  // Australia explicitly
  if (lat > -45 && lat < -10 && lng > 110 && lng < 155) regions.push('asia');

  return regions.length > 0 ? regions : ['world']; // Default fallback: one public webcam portal per country
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radius = parseFloat(searchParams.get('radius') || '10');

    let regionsToFetch: string[];

    if (region === 'all') {
      regionsToFetch = Object.keys(REGION_FETCHERS);
    } else if (region) {
      regionsToFetch = region.split(',').filter(r => r in REGION_FETCHERS);
    } else if (lat !== 0 || lng !== 0) {
      regionsToFetch = getRegionsForBounds(lat, lng, radius);
    } else {
      // Default: load all regions for global coverage
      regionsToFetch = Object.keys(REGION_FETCHERS);
    }

    const results = await Promise.allSettled(
      regionsToFetch.map(r => REGION_FETCHERS[r]())
    );

    const allCameras: any[] = [];
    const sources: Record<string, number> = {};

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const cam of result.value) {
          allCameras.push(cam);
          sources[cam.source] = (sources[cam.source] || 0) + 1;
        }
      }
    }

    const unique = new Map<string, any>();
    for (const cam of allCameras) {
      const key = String(cam.id || cam.external_url || cam.feed_url || `${cam.lat},${cam.lng},${cam.name}`);
      if (!unique.has(key)) unique.set(key, cam);
    }
    const cameras = Array.from(unique.values());

    return NextResponse.json({
      cameras,
      total: cameras.length,
      sources,
      regions: regionsToFetch,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('CCTV fetch error:', error);
    return NextResponse.json({ cameras: [], error: 'Failed' }, { status: 500 });
  }
}
