export type PublicIntelCategory = 'satellite' | 'camera' | 'weather' | 'disaster' | 'maritime' | 'aviation' | 'cyber' | 'geospatial';

export interface PublicIntelSource {
  id: string;
  name: string;
  category: PublicIntelCategory;
  scope: string;
  region: string;
  country?: string;
  url: string;
  apiUrl?: string;
  access: 'open' | 'free-key' | 'mixed' | 'portal';
  freshness: string;
  confidence: number;
  description: string;
  tags: string[];
}

export const PUBLIC_INTEL_SOURCES: PublicIntelSource[] = [
  {
    id: 'sentinel-hub-browser', name: 'Copernicus Sentinel Hub EO Browser', category: 'satellite', scope: 'global', region: 'World',
    url: 'https://browser.dataspace.copernicus.eu/', access: 'open', freshness: 'near-real-time / archive', confidence: 94,
    description: 'Sentinel-1/2/3/5P public satellite imagery, radar, optical, atmospheric products.', tags: ['sentinel', 'sar', 'optical', 'copernicus'],
  },
  {
    id: 'nasa-worldview', name: 'NASA Worldview', category: 'satellite', scope: 'global', region: 'World',
    url: 'https://worldview.earthdata.nasa.gov/', access: 'open', freshness: 'daily / near-real-time', confidence: 95,
    description: 'MODIS, VIIRS, fires, aerosol, weather and disaster layers from NASA EOSDIS.', tags: ['nasa', 'modis', 'viirs', 'fires'],
  },
  {
    id: 'usgs-earth-explorer', name: 'USGS EarthExplorer', category: 'satellite', scope: 'global', region: 'World',
    url: 'https://earthexplorer.usgs.gov/', access: 'open', freshness: 'archive / periodic', confidence: 93,
    description: 'Landsat and remote sensing archive for historical imagery and change analysis.', tags: ['landsat', 'archive', 'imagery'],
  },
  {
    id: 'firms', name: 'NASA FIRMS', category: 'disaster', scope: 'global', region: 'World',
    url: 'https://firms.modaps.eosdis.nasa.gov/map/', apiUrl: 'https://firms.modaps.eosdis.nasa.gov/', access: 'open', freshness: 'near-real-time', confidence: 91,
    description: 'Active fire and thermal anomaly monitoring from MODIS/VIIRS.', tags: ['fires', 'thermal', 'nasa'],
  },
  {
    id: 'gdacs', name: 'GDACS Disaster Alerts', category: 'disaster', scope: 'global', region: 'World',
    url: 'https://www.gdacs.org/', access: 'open', freshness: 'near-real-time', confidence: 88,
    description: 'Global Disaster Alert and Coordination System for earthquakes, cyclones, floods and volcanoes.', tags: ['disaster', 'alerts', 'hazards'],
  },
  {
    id: 'reliefweb', name: 'ReliefWeb', category: 'disaster', scope: 'global', region: 'World',
    url: 'https://reliefweb.int/', apiUrl: 'https://api.reliefweb.int/', access: 'open', freshness: 'live', confidence: 84,
    description: 'Humanitarian reports, emergencies, maps and situation updates.', tags: ['humanitarian', 'reports', 'crisis'],
  },
  {
    id: 'noaa-nowcoast', name: 'NOAA nowCOAST', category: 'weather', scope: 'us/global', region: 'World',
    url: 'https://nowcoast.noaa.gov/', access: 'open', freshness: 'near-real-time', confidence: 90,
    description: 'Weather radar, warnings, ocean and environmental observations.', tags: ['weather', 'radar', 'warnings'],
  },
  {
    id: 'windy', name: 'Windy', category: 'weather', scope: 'global', region: 'World',
    url: 'https://www.windy.com/', access: 'mixed', freshness: 'live', confidence: 78,
    description: 'Weather visualization, wind, storms, webcams and model layers.', tags: ['weather', 'webcams', 'wind'],
  },
  {
    id: 'adsb-lol', name: 'ADSB.lol', category: 'aviation', scope: 'global', region: 'World',
    url: 'https://globe.adsb.lol/', access: 'open', freshness: 'live', confidence: 74,
    description: 'Open ADS-B aircraft tracking globe.', tags: ['adsb', 'aircraft', 'live'],
  },
  {
    id: 'opensky', name: 'OpenSky Network', category: 'aviation', scope: 'global', region: 'World',
    url: 'https://opensky-network.org/', apiUrl: 'https://opensky-network.org/apidoc/', access: 'mixed', freshness: 'live', confidence: 82,
    description: 'Academic aircraft state vectors and aviation API.', tags: ['aviation', 'api', 'states'],
  },
  {
    id: 'marinetraffic', name: 'MarineTraffic', category: 'maritime', scope: 'global', region: 'World',
    url: 'https://www.marinetraffic.com/', access: 'mixed', freshness: 'live', confidence: 78,
    description: 'AIS vessel positions, ports and maritime intelligence portal.', tags: ['ais', 'ships', 'ports'],
  },
  {
    id: 'aisstream', name: 'AISStream', category: 'maritime', scope: 'global', region: 'World',
    url: 'https://aisstream.io/', access: 'free-key', freshness: 'live', confidence: 76,
    description: 'Live AIS websocket stream with free API key.', tags: ['ais', 'websocket', 'ships'],
  },
  {
    id: 'insecam', name: 'Insecam public camera index', category: 'camera', scope: 'global', region: 'World',
    url: 'http://www.insecam.org/', access: 'portal', freshness: 'mixed', confidence: 35,
    description: 'Publicly indexed camera pages. Use only lawful/public feeds and respect privacy.', tags: ['cameras', 'public-index', 'privacy-risk'],
  },
  {
    id: 'earthcam', name: 'EarthCam', category: 'camera', scope: 'global', region: 'World',
    url: 'https://www.earthcam.com/', access: 'portal', freshness: 'live', confidence: 70,
    description: 'Curated public tourism/city webcams worldwide.', tags: ['webcams', 'cities', 'tourism'],
  },
  {
    id: 'webcamtaxi', name: 'WebcamTaxi', category: 'camera', scope: 'global', region: 'World',
    url: 'https://www.webcamtaxi.com/', access: 'portal', freshness: 'live', confidence: 66,
    description: 'Directory of public webcams by country and city.', tags: ['webcams', 'directory', 'country'],
  },
  {
    id: 'skylinewebcams', name: 'SkylineWebcams', category: 'camera', scope: 'global', region: 'World',
    url: 'https://www.skylinewebcams.com/', access: 'portal', freshness: 'live', confidence: 68,
    description: 'Public live webcams, beaches, monuments and cities.', tags: ['webcams', 'live', 'tourism'],
  },
  {
    id: 'tfl-jamcams', name: 'Transport for London JamCams', category: 'camera', scope: 'city', region: 'Europe', country: 'UK',
    url: 'https://api.tfl.gov.uk/Place/Type/JamCam', access: 'open', freshness: 'live-ish', confidence: 82,
    description: 'London traffic camera public API already integrated in Pandora CCTV.', tags: ['traffic', 'london', 'api'],
  },
  {
    id: '511-cameras', name: 'North America 511 camera portals', category: 'camera', scope: 'regional', region: 'North America', country: 'US/Canada',
    url: 'https://511.org/', access: 'open', freshness: 'live-ish', confidence: 75,
    description: 'Public traffic camera systems across states/provinces; many are already partially integrated.', tags: ['traffic', '511', 'cameras'],
  },
  {
    id: 'shodan', name: 'Shodan InternetDB', category: 'cyber', scope: 'global', region: 'World',
    url: 'https://www.shodan.io/', apiUrl: 'https://internetdb.shodan.io/', access: 'mixed', freshness: 'live-ish', confidence: 72,
    description: 'Internet exposure intelligence for defensive asset review.', tags: ['cyber', 'exposure', 'internetdb'],
  },
  {
    id: 'censys', name: 'Censys Search', category: 'cyber', scope: 'global', region: 'World',
    url: 'https://search.censys.io/', access: 'mixed', freshness: 'live-ish', confidence: 78,
    description: 'Internet-wide host and certificate search.', tags: ['cyber', 'certs', 'hosts'],
  },
  {
    id: 'osm', name: 'OpenStreetMap / Overpass', category: 'geospatial', scope: 'global', region: 'World',
    url: 'https://www.openstreetmap.org/', apiUrl: 'https://overpass-turbo.eu/', access: 'open', freshness: 'live-ish', confidence: 80,
    description: 'Global open geospatial data for roads, ports, hospitals, infrastructure and amenities.', tags: ['osm', 'overpass', 'infrastructure'],
  },
];

export const CAMERA_COUNTRY_PORTALS = [
  { region: 'Europe', label: 'European motorway / city CCTV portals', countries: ['UK', 'France', 'Germany', 'Italy', 'Spain', 'Austria', 'Bulgaria', 'Greece', 'Romania', 'Serbia', 'Turkey'], url: 'https://www.webcamtaxi.com/en/europe.html' },
  { region: 'North America', label: '511 traffic camera networks', countries: ['US', 'Canada'], url: 'https://ops.fhwa.dot.gov/511/' },
  { region: 'Asia', label: 'Public tourism/traffic webcam portals', countries: ['Japan', 'South Korea', 'Singapore', 'Thailand', 'India'], url: 'https://www.webcamtaxi.com/en/asia.html' },
  { region: 'Oceania', label: 'Australia/NZ road and surf cameras', countries: ['Australia', 'New Zealand'], url: 'https://www.webcamtaxi.com/en/oceania.html' },
  { region: 'South America', label: 'City, tourism and traffic webcams', countries: ['Brazil', 'Argentina', 'Chile', 'Peru'], url: 'https://www.webcamtaxi.com/en/south-america.html' },
  { region: 'Africa', label: 'Tourism, wildlife and city webcams', countries: ['South Africa', 'Morocco', 'Egypt', 'Kenya'], url: 'https://www.webcamtaxi.com/en/africa.html' },
];

export function getPublicIntelCatalog() {
  const categories = PUBLIC_INTEL_SOURCES.reduce<Record<string, number>>((acc, source) => {
    acc[source.category] = (acc[source.category] || 0) + 1;
    return acc;
  }, {});
  const averageConfidence = Math.round(PUBLIC_INTEL_SOURCES.reduce((sum, source) => sum + source.confidence, 0) / PUBLIC_INTEL_SOURCES.length);
  return {
    generatedAt: new Date().toISOString(),
    sources: PUBLIC_INTEL_SOURCES,
    cameraPortals: CAMERA_COUNTRY_PORTALS,
    summary: { total: PUBLIC_INTEL_SOURCES.length, categories, averageConfidence },
  };
}