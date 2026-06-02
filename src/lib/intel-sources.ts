export type NewsRegion = 'global' | 'europe' | 'middle-east' | 'africa' | 'asia' | 'americas' | 'balkans' | 'finance' | 'disaster' | 'cyber';

export interface RssFeedSource {
  name: string;
  url: string;
  region: NewsRegion;
  category: 'world' | 'conflict' | 'finance' | 'disaster' | 'cyber' | 'regional' | 'government';
  language?: string;
}

export interface LiveNewsFeedSource {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  url: string;
  embed_allowed: boolean;
  category: 'mainstream' | 'government' | 'finance' | 'conflict' | 'state' | 'regional';
  language: string;
  region: NewsRegion;
}

export interface ReconSource {
  id: string;
  name: string;
  url: string;
  tool: 'dns' | 'rdap' | 'bgp' | 'certs' | 'cve' | 'threats' | 'exposure' | 'tor';
  auth?: 'none' | 'optional';
}

export const GLOBAL_NEWS_FEEDS: RssFeedSource[] = [
  // Global / wire services / international broadcasters
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', region: 'global', category: 'world', language: 'en' },
  { name: 'BBC Europe', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', region: 'europe', category: 'regional', language: 'en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', region: 'global', category: 'world', language: 'en' },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', region: 'global', category: 'world', language: 'en' },
  { name: 'NYTimes World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', region: 'global', category: 'world', language: 'en' },
  { name: 'Washington Post World', url: 'https://feeds.washingtonpost.com/rss/world', region: 'global', category: 'world', language: 'en' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', region: 'global', category: 'world', language: 'en' },
  { name: 'CNN World', url: 'http://rss.cnn.com/rss/edition_world.rss', region: 'global', category: 'world', language: 'en' },
  { name: 'ABC News International', url: 'https://abcnews.go.com/abcnews/internationalheadlines', region: 'global', category: 'world', language: 'en' },
  { name: 'CBS World', url: 'https://www.cbsnews.com/latest/rss/world', region: 'global', category: 'world', language: 'en' },
  { name: 'NBC World', url: 'https://feeds.nbcnews.com/nbcnews/public/world', region: 'global', category: 'world', language: 'en' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', region: 'global', category: 'world', language: 'en' },
  { name: 'DW World', url: 'https://rss.dw.com/xml/rss-en-world', region: 'global', category: 'world', language: 'en' },
  { name: 'Euronews', url: 'https://www.euronews.com/rss?level=theme&name=news', region: 'europe', category: 'regional', language: 'en' },
  { name: 'TRT World', url: 'https://www.trtworld.com/rss', region: 'middle-east', category: 'world', language: 'en' },
  { name: 'NHK World', url: 'https://www3.nhk.or.jp/nhkworld/rss/world.xml', region: 'asia', category: 'world', language: 'en' },
  { name: 'CNA World', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml', region: 'asia', category: 'world', language: 'en' },
  { name: 'The Hindu International', url: 'https://www.thehindu.com/news/international/feeder/default.rss', region: 'asia', category: 'world', language: 'en' },
  { name: 'SCMP World', url: 'https://www.scmp.com/rss/91/feed', region: 'asia', category: 'world', language: 'en' },
  { name: 'AfricaNews', url: 'https://www.africanews.com/feed/rss', region: 'africa', category: 'regional', language: 'en' },
  { name: 'AllAfrica', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', region: 'africa', category: 'regional', language: 'en' },
  { name: 'VOA News', url: 'https://www.voanews.com/api/z-$omekvi_', region: 'global', category: 'world', language: 'en' },
  { name: 'Radio Free Europe', url: 'https://www.rferl.org/api/zrqiteuuir', region: 'europe', category: 'regional', language: 'en' },

  // Conflict / security / crisis
  { name: 'ReliefWeb Disasters', url: 'https://reliefweb.int/disasters/rss.xml', region: 'global', category: 'disaster', language: 'en' },
  { name: 'ReliefWeb Updates', url: 'https://reliefweb.int/updates/rss.xml', region: 'global', category: 'disaster', language: 'en' },
  { name: 'GDACS', url: 'https://www.gdacs.org/xml/rss.xml', region: 'global', category: 'disaster', language: 'en' },
  { name: 'FEMA Updates', url: 'https://www.fema.gov/about/news-multimedia/news/rss', region: 'americas', category: 'government', language: 'en' },
  { name: 'NASA Earth Observatory', url: 'https://earthobservatory.nasa.gov/feeds/earth-observatory.rss', region: 'global', category: 'disaster', language: 'en' },
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', region: 'global', category: 'government', language: 'en' },
  { name: 'NATO News', url: 'https://www.nato.int/cps/en/natohq/news.xml', region: 'europe', category: 'government', language: 'en' },
  { name: 'EU External Action', url: 'https://www.eeas.europa.eu/rss_en', region: 'europe', category: 'government', language: 'en' },

  // Europe / Balkans
  { name: 'Politico Europe', url: 'https://www.politico.eu/feed/', region: 'europe', category: 'regional', language: 'en' },
  { name: 'EU Observer', url: 'https://euobserver.com/rss.xml', region: 'europe', category: 'regional', language: 'en' },
  { name: 'Balkan Insight', url: 'https://balkaninsight.com/feed/', region: 'balkans', category: 'regional', language: 'en' },
  { name: 'Sofia Globe', url: 'https://sofiaglobe.com/feed/', region: 'balkans', category: 'regional', language: 'en' },
  { name: 'Dnevnik BG', url: 'https://www.dnevnik.bg/rss/', region: 'balkans', category: 'regional', language: 'bg' },
  { name: 'Actualno BG', url: 'https://www.actualno.com/rss/actualno.xml', region: 'balkans', category: 'regional', language: 'bg' },
  { name: 'Mediapool BG', url: 'https://www.mediapool.bg/rss/', region: 'balkans', category: 'regional', language: 'bg' },
  { name: 'Novinite BG', url: 'https://www.novinite.com/rss', region: 'balkans', category: 'regional', language: 'en' },
  { name: 'BTA English', url: 'https://www.bta.bg/en/rss/news', region: 'balkans', category: 'regional', language: 'en' },
  { name: 'Greek Reporter', url: 'https://greekreporter.com/feed/', region: 'balkans', category: 'regional', language: 'en' },
  { name: 'Romania Insider', url: 'https://www.romania-insider.com/rss.xml', region: 'balkans', category: 'regional', language: 'en' },

  // Middle East / Africa / Asia / Americas regional
  { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/', region: 'middle-east', category: 'regional', language: 'en' },
  { name: 'Jerusalem Post', url: 'https://www.jpost.com/rss/rssfeedsheadlines.aspx', region: 'middle-east', category: 'regional', language: 'en' },
  { name: 'Arab News', url: 'https://www.arabnews.com/rss.xml', region: 'middle-east', category: 'regional', language: 'en' },
  { name: 'The National UAE', url: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/', region: 'middle-east', category: 'regional', language: 'en' },
  { name: 'Middle East Monitor', url: 'https://www.middleeastmonitor.com/feed/', region: 'middle-east', category: 'regional', language: 'en' },
  { name: 'Japan Times', url: 'https://www.japantimes.co.jp/feed/', region: 'asia', category: 'regional', language: 'en' },
  { name: 'Korea Herald', url: 'https://www.koreaherald.com/common/rss_xml.php?ct=020000000000.xml', region: 'asia', category: 'regional', language: 'en' },
  { name: 'Taipei Times', url: 'https://www.taipeitimes.com/xml/index.rss', region: 'asia', category: 'regional', language: 'en' },
  { name: 'Bangkok Post World', url: 'https://www.bangkokpost.com/rss/data/world.xml', region: 'asia', category: 'regional', language: 'en' },
  { name: 'Sydney Morning Herald World', url: 'https://www.smh.com.au/rss/world.xml', region: 'asia', category: 'world', language: 'en' },
  { name: 'CBC World', url: 'https://www.cbc.ca/cmlink/rss-world', region: 'americas', category: 'world', language: 'en' },
  { name: 'Mexico News Daily', url: 'https://mexiconewsdaily.com/feed/', region: 'americas', category: 'regional', language: 'en' },
  { name: 'Buenos Aires Times', url: 'https://www.batimes.com.ar/feed', region: 'americas', category: 'regional', language: 'en' },

  // Finance / markets
  { name: 'Financial Times World', url: 'https://www.ft.com/world?format=rss', region: 'global', category: 'finance', language: 'en' },
  { name: 'MarketWatch Top Stories', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', region: 'global', category: 'finance', language: 'en' },
  { name: 'Investing.com News', url: 'https://www.investing.com/rss/news.rss', region: 'global', category: 'finance', language: 'en' },
  { name: 'IMF News', url: 'https://www.imf.org/en/News/RSS', region: 'global', category: 'finance', language: 'en' },
  { name: 'World Bank News', url: 'https://www.worldbank.org/en/news/all/rss', region: 'global', category: 'finance', language: 'en' },
];

export const CYBER_RSS_FEEDS: RssFeedSource[] = [
  { name: 'CISA Cybersecurity Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'CISA Alerts', url: 'https://www.cisa.gov/news-events/cybersecurity-advisories.xml', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'BleepingComputer Security', url: 'https://www.bleepingcomputer.com/feed/', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'KrebsOnSecurity', url: 'https://krebsonsecurity.com/feed/', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Naked Security', url: 'https://nakedsecurity.sophos.com/feed/', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'SANS ISC Diary', url: 'https://isc.sans.edu/rssfeed_full.xml', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Microsoft Security Response Center', url: 'https://msrc.microsoft.com/blog/feed', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Google Online Security Blog', url: 'https://security.googleblog.com/feeds/posts/default', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Cloudflare Blog Security', url: 'https://blog.cloudflare.com/tag/security/rss/', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Cisco Talos', url: 'https://blog.talosintelligence.com/rss/', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Palo Alto Unit 42', url: 'https://unit42.paloaltonetworks.com/feed/', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Mandiant Blog', url: 'https://www.mandiant.com/resources/blog/rss.xml', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Recorded Future Blog', url: 'https://www.recordedfuture.com/blog/feed', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'Malwarebytes Labs', url: 'https://www.malwarebytes.com/blog/feed', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'WeLiveSecurity', url: 'https://www.welivesecurity.com/feed/', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'CERT-FR Alerts', url: 'https://www.cert.ssi.gouv.fr/alerte/feed/', region: 'cyber', category: 'cyber', language: 'fr' },
  { name: 'CERT-FR Avis', url: 'https://www.cert.ssi.gouv.fr/avis/feed/', region: 'cyber', category: 'cyber', language: 'fr' },
  { name: 'JPCERT/CC Alerts', url: 'https://www.jpcert.or.jp/english/rss/jpcert.rdf', region: 'cyber', category: 'cyber', language: 'en' },
  { name: 'US-CERT ICS Advisories', url: 'https://www.cisa.gov/uscert/ics/advisories/advisories.xml', region: 'cyber', category: 'cyber', language: 'en' },
];

export const LIVE_NEWS_FEEDS: LiveNewsFeedSource[] = [
  { id: 'nbcnews', name: 'NBC News NOW', city: 'New York', country: 'US', lat: 40.759, lng: -73.98, url: 'https://www.youtube.com/channel/UCeY0bbntWzzVIaj2z3QigXg/live', embed_allowed: false, category: 'mainstream', language: 'en', region: 'americas' },
  { id: 'cbsnews', name: 'CBS News 24/7', city: 'New York', country: 'US', lat: 40.764, lng: -73.973, url: 'https://www.youtube.com/channel/UC8p1vwvWtl6T73JiExfWs1g/live', embed_allowed: false, category: 'mainstream', language: 'en', region: 'americas' },
  { id: 'abcnews', name: 'ABC News Live', city: 'New York', country: 'US', lat: 40.763, lng: -73.979, url: 'https://www.youtube.com/channel/UCBi2mrWuNuyYy4gbM6fU18Q/live', embed_allowed: false, category: 'mainstream', language: 'en', region: 'americas' },
  { id: 'bloomberg', name: 'Bloomberg TV', city: 'New York', country: 'US', lat: 40.756, lng: -73.988, url: 'https://www.youtube.com/channel/UCIALMKvObZNtJ6AmdCLP7Lg/live', embed_allowed: false, category: 'finance', language: 'en', region: 'americas' },
  { id: 'cspan', name: 'C-SPAN', city: 'Washington DC', country: 'US', lat: 38.897, lng: -77.036, url: 'https://www.youtube.com/channel/UCb--64Gl51jIEVE-GLDAVTg/live', embed_allowed: false, category: 'government', language: 'en', region: 'americas' },
  { id: 'cbc', name: 'CBC News', city: 'Toronto', country: 'CA', lat: 43.644, lng: -79.387, url: 'https://www.youtube.com/channel/UCKy1dAqELon0zgzZPOz9SVw/live', embed_allowed: false, category: 'mainstream', language: 'en', region: 'americas' },
  { id: 'skynews', name: 'Sky News', city: 'London', country: 'GB', lat: 51.5, lng: -0.118, url: 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNGwb-UYkQ&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'europe' },
  { id: 'france24en', name: 'France 24 EN', city: 'Paris', country: 'FR', lat: 48.83, lng: 2.28, url: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'europe' },
  { id: 'dwnews', name: 'DW News', city: 'Berlin', country: 'DE', lat: 52.508, lng: 13.376, url: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'europe' },
  { id: 'euronews', name: 'Euronews', city: 'Lyon', country: 'FR', lat: 45.764, lng: 4.836, url: 'https://www.youtube.com/embed/live_stream?channel=UCtUbOIRGKZkW7555n6x6q6g&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'europe' },
  { id: 'trtworld', name: 'TRT World', city: 'Istanbul', country: 'TR', lat: 41.008, lng: 28.978, url: 'https://www.youtube.com/embed/live_stream?channel=UC7fWeaHZQg1p9-4v98L1D1A&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'middle-east' },
  { id: 'ukrinform', name: 'UKRINFORM', city: 'Kyiv', country: 'UA', lat: 50.45, lng: 30.523, url: 'https://www.youtube.com/embed/live_stream?channel=UCaDkCK6iFHPE0lmpaYL-WxQ&autoplay=1&mute=1', embed_allowed: true, category: 'conflict', language: 'en', region: 'europe' },
  { id: 'aljazeera', name: 'Al Jazeera EN', city: 'Doha', country: 'QA', lat: 25.286, lng: 51.534, url: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'middle-east' },
  { id: 'almayadeen', name: 'Al Mayadeen', city: 'Beirut', country: 'LB', lat: 33.888, lng: 35.495, url: 'https://www.youtube.com/embed/live_stream?channel=UCZCFHCU-2eGF7V5ciMkoPHw&autoplay=1&mute=1', embed_allowed: true, category: 'conflict', language: 'ar', region: 'middle-east' },
  { id: 'lbcilebanon', name: 'LBCI Lebanon', city: 'Beirut', country: 'LB', lat: 33.893, lng: 35.501, url: 'https://www.youtube.com/embed/live_stream?channel=UCpE6gpKewomi17XDyPfpFjA&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'ar', region: 'middle-east' },
  { id: 'africanews', name: 'Africanews', city: 'Pointe-Noire', country: 'CG', lat: -4.778, lng: 11.865, url: 'https://www.youtube.com/embed/live_stream?channel=UC5T2fB_W0Z31T0c8yN36a8A&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'africa' },
  { id: 'sabcnews', name: 'SABC News', city: 'Johannesburg', country: 'ZA', lat: -26.204, lng: 28.047, url: 'https://www.youtube.com/embed/live_stream?channel=UC8yH-uI81UUtEMDsowQyx1g&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'africa' },
  { id: 'nhkworld', name: 'NHK World', city: 'Tokyo', country: 'JP', lat: 35.69, lng: 139.692, url: 'https://www.youtube.com/embed/live_stream?channel=UCSPEjw8F2nQDtmUKPFNF7_A&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'asia' },
  { id: 'cna', name: 'CNA 24/7', city: 'Singapore', country: 'SG', lat: 1.29, lng: 103.852, url: 'https://www.youtube.com/embed/live_stream?channel=UC83jt4dlz1Gjl58fzQrrKZg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'asia' },
  { id: 'wion', name: 'WION', city: 'New Delhi', country: 'IN', lat: 28.614, lng: 77.209, url: 'https://www.youtube.com/embed/live_stream?channel=UC_gUM8rL-Lrg6O3adPW9K1g&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'asia' },
  { id: 'abcau', name: 'ABC Australia', city: 'Sydney', country: 'AU', lat: -33.867, lng: 151.207, url: 'https://www.youtube.com/embed/live_stream?channel=UC5iLnYoF4Ryb63YdGD9RfWQ&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'asia' },
  { id: 'arirang', name: 'Arirang TV', city: 'Seoul', country: 'KR', lat: 37.566, lng: 126.978, url: 'https://www.youtube.com/embed/live_stream?channel=UCw9-5Y1CjW7Qy1Yf5q1y2-Q&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'asia' },
  { id: 'cgtn', name: 'CGTN', city: 'Beijing', country: 'CN', lat: 39.904, lng: 116.407, url: 'https://www.youtube.com/channel/UCgrNz-aDmcr2uuto8_DL2jg/live', embed_allowed: false, category: 'state', language: 'en', region: 'asia' },
  { id: 'telesur', name: 'teleSUR EN', city: 'Caracas', country: 'VE', lat: 10.491, lng: -66.902, url: 'https://www.youtube.com/embed/live_stream?channel=UCmuTmpLY35O3csvhyA6vrkg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en', region: 'americas' },
  { id: 'rt', name: 'RT News', city: 'Moscow', country: 'RU', lat: 55.755, lng: 37.617, url: 'https://rumble.com/c/RTNewsEN', embed_allowed: false, category: 'state', language: 'en', region: 'europe' },
];

export const RECON_OSINT_SOURCES: ReconSource[] = [
  { id: 'google-doh', name: 'Google DNS-over-HTTPS', url: 'https://dns.google/resolve', tool: 'dns', auth: 'none' },
  { id: 'rdap-org', name: 'RDAP.org', url: 'https://rdap.org', tool: 'rdap', auth: 'none' },
  { id: 'bgpview', name: 'BGPView API', url: 'https://api.bgpview.io', tool: 'bgp', auth: 'none' },
  { id: 'crtsh', name: 'crt.sh Certificate Transparency', url: 'https://crt.sh', tool: 'certs', auth: 'none' },
  { id: 'mitre-cve', name: 'MITRE CVE API', url: 'https://cveawg.mitre.org/api/cve', tool: 'cve', auth: 'none' },
  { id: 'circl-cve', name: 'CIRCL CVE fallback', url: 'https://cve.circl.lu/api/cve', tool: 'cve', auth: 'none' },
  { id: 'nvd', name: 'NVD CVE 2.0', url: 'https://services.nvd.nist.gov/rest/json/cves/2.0', tool: 'cve', auth: 'none' },
  { id: 'otx-public', name: 'AlienVault OTX Public Pulses', url: 'https://otx.alienvault.com/api/v1', tool: 'threats', auth: 'optional' },
  { id: 'urlhaus', name: 'abuse.ch URLhaus', url: 'https://urlhaus.abuse.ch', tool: 'threats', auth: 'none' },
  { id: 'threatfox', name: 'abuse.ch ThreatFox', url: 'https://threatfox-api.abuse.ch/api/v1/', tool: 'threats', auth: 'none' },
  { id: 'tor-exits', name: 'Tor Bulk Exit List', url: 'https://check.torproject.org/torbulkexitlist', tool: 'tor', auth: 'none' },
  { id: 'internetdb', name: 'Shodan InternetDB', url: 'https://internetdb.shodan.io', tool: 'exposure', auth: 'none' },
];
