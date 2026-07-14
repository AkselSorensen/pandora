"""Public Cyber Defense OSINT source registry for Pandora CyberDef.

Every source listed here is public, free, and requires no API key
or offers a generous free tier. These feeds enrich the live-threats
and IOC analysis endpoints.
"""

from __future__ import annotations
from collections import Counter

Source = dict[str, str]

CYBERDEF_SOURCES: list[Source] = [
    # ── CISA / US Government ──
    {"name": "CISA KEV Catalog", "category": "kev", "type": "json",
     "url": "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"},
    {"name": "CISA Alerts", "category": "advisory", "type": "rss",
     "url": "https://www.cisa.gov/news.xml"},
    {"name": "CISA ICS Advisories", "category": "ics", "type": "rss",
     "url": "https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml"},
    {"name": "NVD Recent CVEs", "category": "cve", "type": "json",
     "url": "https://services.nvd.nist.gov/rest/json/cves/2.0"},

    # ── abuse.ch (feeds gratuits, ultra-fiables) ──
    {"name": "ThreatFox IOC", "category": "ioc", "type": "json_post",
     "url": "https://threatfox-api.abuse.ch/api/v1/",
     "body": '{"query": "get_iocs", "days": 3}'},
    {"name": "Feodo Tracker C&C", "category": "botnet", "type": "json",
     "url": "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json"},
    {"name": "SSL Blacklist", "category": "malicious_ssl", "type": "csv",
     "url": "https://sslbl.abuse.ch/blacklist/sslipblacklist.csv"},
    {"name": "MalwareBazaar", "category": "malware", "type": "json_post",
     "url": "https://mb-api.abuse.ch/api/v1/",
     "body": '{"query": "get_recent", "limit": 50}'},

    # ── Phishing ──
    {"name": "PhishTank Online", "category": "phishing", "type": "json",
     "url": "http://data.phishtank.com/data/online-valid.json"},
    {"name": "OpenPhish Feed", "category": "phishing", "type": "text",
     "url": "https://openphish.com/feed.txt"},

    # ── Blocklists ──
    {"name": "Blocklist.de All", "category": "blocklist", "type": "text",
     "url": "https://lists.blocklist.de/lists/all.txt"},
    {"name": "Tor Exit Nodes", "category": "tor", "type": "text",
     "url": "https://check.torproject.org/exit-addresses"},
    {"name": "Spamhaus DROP", "category": "blocklist", "type": "text",
     "url": "https://www.spamhaus.org/drop/drop.txt"},

    # ── GreyNoise (free tier) ──
    {"name": "GreyNoise GNQL", "category": "noise", "type": "json_get",
     "url": "https://api.greynoise.io/v3/community/"},

    # ── AlienVault OTX ──
    {"name": "AlienVault OTX Pulses", "category": "threat_intel", "type": "json_get",
     "url": "https://otx.alienvault.com/api/v1/pulses/subscribed"},

    # ── Certificates / Exposure ──
    {"name": "CRT.sh Certificate Search", "category": "certificates", "type": "json_get",
     "url": "https://crt.sh/?q="},
    {"name": "URLScan.io", "category": "url_scan", "type": "json_get",
     "url": "https://urlscan.io/api/v1/search/"},

    # ── Ransomware ──
    {"name": "Ransomware.live", "category": "ransomware", "type": "json",
     "url": "https://data.ransomware.live/groups.json"},
    {"name": "Ransomware.live recent", "category": "ransomware", "type": "json",
     "url": "https://data.ransomware.live/recent.json"},

    # ── CIRCL / MISP ──
    {"name": "CIRCL CVE Search", "category": "cve", "type": "json_get",
     "url": "https://cve.circl.lu/api/last"},

    # ── DNS / Infrastructure ──
    {"name": "SecurityTrails", "category": "dns", "type": "json_get",
     "url": "https://api.securitytrails.com/v1/"},
]

# ── IOC enrichment sources (used by analyze-ip / analyze-domain) ──
IOC_ENRICHMENT = {
    "abuseipdb": "https://api.abuseipdb.com/api/v2/check",
    "virustotal": "https://www.virustotal.com/api/v3/",
    "pulsedive": "https://pulsedive.com/api/info.php",
    "shodan": "https://api.shodan.io/shodan/host/",
    "censys": "https://search.censys.io/api/v2/hosts/",
}


def source_categories() -> list[str]:
    return sorted({s["category"] for s in CYBERDEF_SOURCES})


def source_registry_summary() -> dict:
    counts = Counter(s["category"] for s in CYBERDEF_SOURCES)
    return {
        "registrySize": len(CYBERDEF_SOURCES),
        "categories": sorted(counts),
        "categoryCounts": [{"name": name, "count": count} for name, count in sorted(counts.items())],
        "sourceNames": [s["name"] for s in CYBERDEF_SOURCES],
    }
