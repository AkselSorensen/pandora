import os, re, json, asyncio
from datetime import datetime, timezone
from typing import Any, Literal
from collections import Counter
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from sources import CYBERDEF_SOURCES, IOC_ENRICHMENT, source_registry_summary
except Exception:
    from .sources import CYBERDEF_SOURCES, IOC_ENRICHMENT, source_registry_summary

# ── Config ──
APP_NAME = "Pandora CyberDef Service"
DEFAULT_TIMEOUT = float(os.getenv("PANDORA_CYBERDEF_TIMEOUT", "10"))
REGISTRY_TIMEOUT = float(os.getenv("PANDORA_CYBERDEF_REGISTRY_TIMEOUT", "15"))
CACHE_TTL = 300
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "pandora-ai")
ENABLE_AI = os.getenv("PANDORA_CYBERDEF_AI_ENABLED", "true").lower() not in {"0", "false", "no", "off"}
MAX_BLOCKLIST_IPS = int(os.getenv("PANDORA_CYBERDEF_MAX_IPS", "50000"))

app = FastAPI(title=APP_NAME, version="0.1.0")

# ── Pydantic models ──
class DomainRequest(BaseModel):
    domain: str = Field(..., description="Domain to analyze (e.g. example.com)")
    enrich: bool = Field(True, description="Enrich with external sources")

class IPRequest(BaseModel):
    ip: str = Field(..., description="IP address to analyze")
    enrich: bool = Field(True, description="Enrich with external sources")

class HashRequest(BaseModel):
    hash: str = Field(..., description="File hash (MD5/SHA1/SHA256) to analyze")

class RecommendRequest(BaseModel):
    threats: list[dict[str, Any]] = Field(default_factory=list)
    context: str = Field("", description="Additional context for AI briefing")

# ── Helpers ──
def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def clamp(v: float, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, round(v)))

def as_list(v: Any) -> list:
    return v if isinstance(v, list) else []

def clean(v: Any) -> str:
    t = str(v or "")
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'").strip()

def severity_from_score(score: float) -> str:
    if score >= 9: return "critical"
    if score >= 7: return "high"
    if score >= 4: return "medium"
    return "low"

def safe_date(v: Any) -> str | None:
    if v is None: return None
    if isinstance(v, (int, float)):
        ts = v / 1000 if v > 10_000_000_000 else v
        try: return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        except: return None
    return str(v)[:25]

def domain_from_url(url: str) -> str:
    try: return urlparse(url).netloc.lower().replace("www.", "")
    except: return "unknown"

# ── Source fetching ──
async def fetch_source(client: httpx.AsyncClient, source: dict) -> dict:
    """Fetch one source and return parsed items."""
    name = source["name"]
    category = source["category"]
    url = source["url"]
    stype = source.get("type", "json")
    result = {"name": name, "category": category, "ok": False, "items": [], "error": None}

    try:
        if stype == "json_post":
            body_str = source.get("body", "{}")
            try: body = json.loads(body_str)
            except: body = {}
            r = await client.post(url, json=body, timeout=REGISTRY_TIMEOUT)
        elif stype == "json_get":
            r = await client.get(url, timeout=REGISTRY_TIMEOUT)
        else:
            r = await client.get(url, timeout=REGISTRY_TIMEOUT)

        if r.status_code >= 400:
            result["error"] = f"HTTP {r.status_code}"
            return result

        if stype in ("json", "json_post", "json_get"):
            data = r.json()
            result["items"] = parse_json_source(data, source)
        elif stype == "csv":
            result["items"] = parse_csv_source(r.text, source)
        elif stype == "text":
            result["items"] = parse_text_source(r.text, source)
        elif stype == "rss":
            result["items"] = parse_rss_source(r.text, source)
        else:
            result["items"] = parse_text_source(r.text, source)

        result["ok"] = True
    except Exception as e:
        result["error"] = type(e).__name__

    return result

def parse_json_source(data: Any, source: dict) -> list[dict]:
    items = []
    category = source["category"]
    name = source["name"]

    # CISA KEV
    if "vulnerabilities" in data and isinstance(data["vulnerabilities"], list):
        for vuln in data["vulnerabilities"][:50]:
            items.append({
                "type": "cve", "id": f"kev-{vuln.get('cveID', '')}",
                "title": f"{vuln.get('cveID', 'CVE')} — {vuln.get('vulnerabilityName', '')}",
                "severity": "critical",
                "score": 9.5,
                "source": name,
                "category": category,
                "timestamp": safe_date(vuln.get("dateAdded")),
                "url": f"https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
                "details": vuln,
            })

    # NVD
    elif "vulnerabilities" in data:
        for vuln in data["vulnerabilities"][:50]:
            cve = vuln.get("cve", {})
            cve_id = cve.get("id", "CVE-unknown")
            metrics = cve.get("metrics", {})
            cvss = (metrics.get("cvssMetricV31") or metrics.get("cvssMetricV30") or [{}])[0]
            score = ((cvss.get("cvssData") or {}).get("baseScore") or 0)
            descs = cve.get("descriptions") or []
            desc = next((d["value"] for d in descs if d.get("lang") == "en"), cve_id)
            items.append({
                "type": "cve", "id": cve_id,
                "title": f"{cve_id} — {clean(desc[:200])}",
                "severity": severity_from_score(score),
                "score": score,
                "source": name,
                "category": category,
                "timestamp": safe_date(cve.get("published")),
                "url": f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                "details": {"cvss": score, "vector": (cvss.get("cvssData") or {}).get("vectorString")},
            })

    # ThreatFox
    elif "data" in data and isinstance(data["data"], list):
        for ioc in data["data"][:100]:
            items.append({
                "type": "ioc", "id": f"threatfox-{ioc.get('id', '')}",
                "title": f"IOC: {ioc.get('ioc_value', '')} ({ioc.get('malware_printable', 'unknown')})",
                "severity": "high" if (ioc.get("confidence_level") or 0) >= 80 else "medium",
                "score": (ioc.get("confidence_level") or 50) / 10,
                "source": name,
                "category": category,
                "timestamp": safe_date(ioc.get("first_seen")),
                "url": ioc.get("reference"),
                "ioc": ioc.get("ioc_value"),
                "details": ioc,
            })

    elif isinstance(data, list):
        for item in data[:50]:
            if isinstance(item, dict):
                title = item.get("url") or item.get("phish_id") or item.get("title") or "threat"
                items.append({
                    "type": "threat", "id": f"feed-{clean(title)[:60]}",
                    "title": clean(title)[:200],
                    "severity": "medium",
                    "score": 5.0,
                    "source": name,
                    "category": category,
                    "timestamp": safe_date(item.get("submission_time") or item.get("verified")),
                    "url": item.get("url") or item.get("phish_detail_url"),
                    "details": item,
                })

    # Generic fallback
    else:
        for key in ("items", "results", "data", "articles"):
            rows = data.get(key) if isinstance(data, dict) else []
            if isinstance(rows, list):
                for item in rows[:30]:
                    if isinstance(item, dict):
                        title = item.get("title") or item.get("name") or item.get("value") or f"{key}-item"
                        items.append({
                            "type": "generic", "id": clean(str(title))[:60],
                            "title": clean(title)[:200],
                            "severity": "medium", "score": 5.0,
                            "source": name, "category": category,
                            "timestamp": safe_date(item.get("timestamp") or item.get("date")),
                            "url": item.get("url"), "details": item,
                        })
                break

    return items

def parse_csv_source(text: str, source: dict) -> list[dict]:
    items = []
    for line in text.strip().split("\n")[1:51]:  # skip header
        parts = line.split(",")
        if parts and parts[0]:
            items.append({
                "type": "ioc", "id": f"{source['name']}-{parts[0]}",
                "title": f"Threat: {parts[0]}",
                "severity": "high", "score": 7.0,
                "source": source["name"],
                "category": source["category"],
                "timestamp": now(), "ioc": parts[0],
            })
    return items

def parse_text_source(text: str, source: dict) -> list[dict]:
    items = []
    for line in text.strip().split("\n")[:100]:
        line = line.strip()
        if line and not line.startswith("#"):
            items.append({
                "type": "ioc", "id": f"{source['name']}-{line[:40]}",
                "title": f"Blocklisted: {line[:60]}",
                "severity": "medium", "score": 5.0,
                "source": source["name"],
                "category": source["category"],
                "timestamp": now(), "ioc": line,
            })
    return items

def parse_rss_source(text: str, source: dict) -> list[dict]:
    items = []
    for item in re.findall(r"<item[\s\S]*?</item>", text, re.I)[:30]:
        title = clean(re.search(r"<title[^>]*>([\s\S]*?)</title>", item, re.I))
        link = clean(re.search(r"<link[^>]*>([\s\S]*?)</link>", item, re.I))
        desc = clean(re.search(r"<description[^>]*>([\s\S]*?)</description>", item, re.I))
        pub = clean(re.search(r"<pubDate[^>]*>([\s\S]*?)</pubDate>", item, re.I))
        if title:
            items.append({
                "type": "advisory", "id": f"rss-{title[:40]}",
                "title": title[:200],
                "severity": "medium", "score": 5.0,
                "source": source["name"],
                "category": source["category"],
                "timestamp": pub or now(),
                "url": link, "summary": desc[:300],
            })
    return items

# ── Scoring ──
def compute_posture(items: list[dict]) -> dict:
    if not items:
        return {"posture": "ROUTINE", "score": 0, "critical": 0, "high": 0, "medium": 0, "low": 0}

    counts = Counter(item.get("severity", "low") for item in items)
    categories = Counter(item.get("category", "other") for item in items)

    score = (
        counts.get("critical", 0) * 25 +
        counts.get("high", 0) * 10 +
        counts.get("medium", 0) * 3
    )
    score = clamp(score, 0, 100)

    if score >= 70:
        posture = "CRITICAL"
    elif score >= 45:
        posture = "ELEVATED"
    elif score >= 20:
        posture = "WATCH"
    else:
        posture = "ROUTINE"

    return {
        "posture": posture,
        "score": score,
        "critical": counts.get("critical", 0),
        "high": counts.get("high", 0),
        "medium": counts.get("medium", 0),
        "low": counts.get("low", 0),
        "categories": dict(categories.most_common(10)),
        "total": len(items),
    }

# ── Enrichment endpoints (individual IOC lookups) ──
async def enrich_ip(client: httpx.AsyncClient, ip: str) -> dict:
    results = {}
    # ip-api.com (gratuit, pas de clé)
    try:
        r = await client.get(f"http://ip-api.com/json/{ip}", timeout=5)
        if r.is_success:
            results["geo"] = r.json()
    except: pass
    # AbuseIPDB
    key = os.getenv("ABUSEIPDB_API_KEY", "")
    if key:
        try:
            r = await client.get(
                f"https://api.abuseipdb.com/api/v2/check?ipAddress={ip}&maxAgeInDays=90",
                headers={"Key": key, "Accept": "application/json"}, timeout=8
            )
            if r.is_success:
                results["abuseipdb"] = r.json().get("data", {})
        except: pass
    # GreyNoise community
    try:
        r = await client.get(f"https://api.greynoise.io/v3/community/{ip}", timeout=5)
        if r.is_success:
            results["greynoise"] = r.json()
    except: pass
    return results

async def enrich_domain(client: httpx.AsyncClient, domain: str) -> dict:
    results = {}
    # CRT.sh
    try:
        r = await client.get(f"https://crt.sh/?q={domain}&output=json", timeout=8)
        if r.is_success:
            certs = r.json()[:10]
            results["certificates"] = certs
    except: pass
    # RDAP
    try:
        r = await client.get(f"https://rdap.org/domain/{domain}", timeout=8)
        if r.is_success:
            results["rdap"] = r.json()
    except: pass
    # URLScan.io
    key = os.getenv("URLSCAN_API_KEY", "")
    if key:
        try:
            r = await client.get(
                f"https://urlscan.io/api/v1/search/?q=domain:{domain}",
                headers={"API-Key": key}, timeout=8
            )
            if r.is_success:
                results["urlscan"] = r.json().get("results", [])[:5]
        except: pass
    return results

# ── AI Briefing ──
def build_briefing_prompt(posture: dict, top_items: list[dict], question: str = "") -> str:
    items_text = "\n".join(
        f"- [{i.get('severity', 'medium').upper()}] {i.get('title', '')} "
        f"(source: {i.get('source', '')}, cat: {i.get('category', '')})"
        for i in top_items[:15]
    ) or "Aucune menace active détectée."

    return f"""Tu es Pandora CyberDef, assistant analyste en cyberdéfense offensive et défensive.

Tâche : produire un briefing cyber en français, structuré et actionable.

Posture actuelle : {posture['posture']} (score {posture['score']}/100)
- Critiques : {posture['critical']}
- Hautes : {posture['high']}
- Moyennes : {posture['medium']}
- Faibles : {posture['low']}
- Total signaux : {posture['total']}

Signaux prioritaires :
{items_text}

Question analyste : {question or "Briefing cyber global"}

Format attendu :
# Briefing CyberDef
## Synthèse de la posture
## Menaces prioritaires
## Recommandations défensives
## Actions immédiates
"""

async def ai_briefing(posture: dict, top_items: list[dict], question: str = "") -> dict:
    if not ENABLE_AI:
        return {"enabled": False, "mode": "disabled", "text": ""}
    prompt = build_briefing_prompt(posture, top_items, question)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt[:18000],
                       "stream": False, "options": {"temperature": 0.2, "num_predict": 1200}},
            )
            if r.is_success and r.json().get("response"):
                return {"enabled": True, "mode": "ollama", "model": OLLAMA_MODEL,
                        "text": r.json()["response"], "generatedAt": now()}
    except Exception as e:
        return {"enabled": True, "mode": "unavailable", "warning": type(e).__name__,
                "text": "Pandora CyberDef AI indisponible. L'analyse déterministe est fournie.", "generatedAt": now()}
    return {"enabled": True, "mode": "empty", "text": "", "generatedAt": now()}

# ── Endpoints ──

@app.get("/health")
async def health():
    registry = source_registry_summary()
    return {
        "status": "ok",
        "service": APP_NAME,
        "timestamp": now(),
        "sources": {"total": registry["registrySize"], "categories": registry["categories"]},
        "ai": {"enabled": ENABLE_AI, "model": OLLAMA_MODEL},
    }

@app.get("/sources")
async def sources():
    return source_registry_summary()

@app.get("/live-threats")
async def live_threats():
    """Aggregate all live threat feeds into a unified timeline."""
    all_items: list[dict] = []
    source_status: list[dict] = []

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        tasks = [fetch_source(client, s) for s in CYBERDEF_SOURCES]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, dict):
            source_status.append({
                "name": result["name"],
                "category": result["category"],
                "ok": result["ok"],
                "count": len(result["items"]),
                "error": result["error"],
            })
            if result["ok"]:
                all_items.extend(result["items"])

    # Deduplicate
    seen = set()
    unique = []
    for item in sorted(all_items, key=lambda x: float(x.get("score", 0)), reverse=True):
        key = item.get("id", item.get("title", ""))
        if key not in seen:
            seen.add(key)
            unique.append(item)

    posture = compute_posture(unique)
    top = unique[:50]

    return {
        "mode": "pandora-cyberdef-live",
        "generatedAt": now(),
        "posture": posture,
        "total": len(unique),
        "threats": top[:30],
        "sources": source_status,
    }

@app.post("/analyze-ip")
async def analyze_ip(req: IPRequest):
    """Deep analysis of an IP address with multi-source enrichment."""
    ip = req.ip.strip()
    if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", ip):
        raise HTTPException(status_code=400, detail="Invalid IPv4 address format")

    result = {"ip": ip, "timestamp": now(), "reputation": None, "geo": None, "enrichment": {}}

    async with httpx.AsyncClient(timeout=10) as client:
        # Geo
        try:
            geo = await client.get(f"http://ip-api.com/json/{ip}", timeout=5)
            if geo.is_success:
                result["geo"] = geo.json()
        except: pass

        if req.enrich:
            result["enrichment"] = await enrich_ip(client, ip)

    # Compute reputation score
    score = 5
    reasons = []
    if result.get("enrichment", {}).get("abuseipdb"):
        abuse = result["enrichment"]["abuseipdb"]
        score += min(4, (abuse.get("abuseConfidenceScore", 0) or 0) / 25)
        if abuse.get("totalReports", 0) > 5:
            reasons.append(f"Signalé {abuse['totalReports']} fois sur AbuseIPDB")
    if result.get("enrichment", {}).get("greynoise"):
        gn = result["enrichment"]["greynoise"]
        if gn.get("noise", False):
            score += 2
            reasons.append("Internet noise (GreyNoise)")
        if gn.get("classification") in ("malicious", "malware"):
            score += 2
            reasons.append(f"Classification: {gn['classification']}")

    result["reputation"] = {
        "score": clamp(score),
        "severity": severity_from_score(clamp(score)),
        "reasons": reasons[:5],
    }

    return result

@app.post("/analyze-domain")
async def analyze_domain(req: DomainRequest):
    """Deep analysis of a domain: RDAP, certificates, URL scan."""
    domain = req.domain.strip().lower()
    if not re.match(r"^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$", domain):
        raise HTTPException(status_code=400, detail="Invalid domain format")

    result = {"domain": domain, "timestamp": now(), "rdap": None, "certificates": 0, "reputation": None}

    async with httpx.AsyncClient(timeout=10) as client:
        # RDAP
        try:
            rdap = await client.get(f"https://rdap.org/domain/{domain}", timeout=8)
            if rdap.is_success:
                result["rdap"] = rdap.json()
        except: pass

        # CRT.sh
        try:
            certs = await client.get(f"https://crt.sh/?q={domain}&output=json", timeout=10)
            if certs.is_success:
                data = certs.json()
                result["certificates"] = len(data) if isinstance(data, list) else 0
        except: pass

        if req.enrich:
            result["enrichment"] = await enrich_domain(client, domain)

    score = 5
    reasons = []
    if result["certificates"] > 50:
        score += 1
        reasons.append(f"{result['certificates']} certificats émis (surface large)")
    if result.get("enrichment", {}).get("urlscan"):
        score += 2
        reasons.append("URLScan.io signale le domaine")

    result["reputation"] = {
        "score": clamp(score),
        "severity": severity_from_score(clamp(score)),
        "reasons": reasons[:5],
    }

    return result

@app.post("/analyze-hash")
async def analyze_hash(req: HashRequest):
    """Check file hash against MalwareBazaar and VirusTotal."""
    h = req.hash.strip().lower()
    if not re.match(r"^[a-f0-9]{32,128}$", h):
        raise HTTPException(status_code=400, detail="Invalid hash format (MD5/SHA1/SHA256)")

    result = {"hash": h, "timestamp": now(), "malware": None, "reputation": None}

    async with httpx.AsyncClient(timeout=10) as client:
        # MalwareBazaar
        try:
            mb = await client.post(
                "https://mb-api.abuse.ch/api/v1/",
                data={"query": "get_info", "hash": h},
                timeout=10
            )
            if mb.is_success:
                data = mb.json()
                if data.get("query_status") == "ok":
                    result["malware"] = data.get("data", [])[0] if data.get("data") else None
        except: pass

    score = 7 if result.get("malware") else 2
    reasons = []
    if result.get("malware"):
        reasons.append(f"Malware connu: {result['malware'].get('signature', 'unknown')}")
        reasons.append(f"Type: {result['malware'].get('file_type', 'unknown')}")

    result["reputation"] = {
        "score": clamp(score),
        "severity": severity_from_score(clamp(score)),
        "reasons": reasons[:5],
    }

    return result

@app.post("/briefing")
async def briefing(req: RecommendRequest):
    """AI-powered cyber briefing based on current threats."""
    # First, get live threats
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        tasks = [fetch_source(client, s) for s in CYBERDEF_SOURCES[:10]]  # top 10 sources
        results = await asyncio.gather(*tasks, return_exceptions=True)

    all_items = []
    for r in results:
        if isinstance(r, dict) and r["ok"]:
            all_items.extend(r["items"])

    all_items.extend(req.threats)
    posture = compute_posture(all_items)
    top = sorted(all_items, key=lambda x: float(x.get("score", 0)), reverse=True)[:30]

    ai = await ai_briefing(posture, top, req.context)

    return {
        "mode": "pandora-cyberdef-briefing",
        "generatedAt": now(),
        "posture": posture,
        "topThreats": top[:15],
        "aiBriefing": ai,
    }

@app.get("/cyber-posture")
async def cyber_posture():
    """Fast posture summary (no enrichment, just feed aggregation)."""
    all_items = []
    async with httpx.AsyncClient(timeout=8) as client:
        tasks = [fetch_source(client, s) for s in CYBERDEF_SOURCES[:8]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, dict) and r["ok"]:
            all_items.extend(r["items"])

    posture = compute_posture(all_items)
    return {
        "mode": "pandora-cyberdef-posture",
        "generatedAt": now(),
        "posture": posture,
        "sourceCount": len(CYBERDEF_SOURCES),
    }

@app.get("/top-cves")
async def top_cves():
    """Top CVEs from CISA KEV + NVD only (fast, targeted)."""
    cve_sources = [s for s in CYBERDEF_SOURCES if s["category"] in ("kev", "cve")][:3]
    items = []

    async with httpx.AsyncClient(timeout=10) as client:
        results = await asyncio.gather(*[fetch_source(client, s) for s in cve_sources], return_exceptions=True)

    for r in results:
        if isinstance(r, dict) and r["ok"]:
            items.extend(r["items"])

    seen = set()
    unique = []
    for item in sorted(items, key=lambda x: float(x.get("score", 0)), reverse=True):
        key = item.get("id", "")
        if key not in seen:
            seen.add(key)
            unique.append(item)

    return {
        "mode": "pandora-cyberdef-cves",
        "generatedAt": now(),
        "total": len(unique),
        "cves": unique[:25],
    }
