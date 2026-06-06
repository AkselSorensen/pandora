import os
import re
from datetime import datetime, timezone
from math import log10
from time import time
from typing import Literal
from urllib.parse import quote_plus

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

APP_NAME = "Pandora Nuclear Strategic Simulator"
RESTCOUNTRIES_URL = "https://restcountries.com/v3.1/all?fields=name,region,subregion,population,area"
GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
GOOGLE_NEWS_RSS_URL = "https://news.google.com/rss/search"
PUBLIC_TIMEOUT = float(os.getenv("PANDORA_NUCLEAR_TIMEOUT", "8"))
CACHE_TTL = 1800
MAX_ANALYZED_ARTICLES = int(os.getenv("PANDORA_NUCLEAR_MAX_ARTICLES", "300"))
MAX_ARTICLES_PER_QUERY = int(os.getenv("PANDORA_NUCLEAR_PER_QUERY_LIMIT", "75"))

app = FastAPI(title=APP_NAME, version="0.2.0")
_countries_cache = {"ts": 0.0, "items": []}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clamp(value: float, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, round(value)))


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


STRATEGIC_OVERLAYS = {
    "france": ("medium", "~200-300", 62, 82, 78, 84, 75, 70, 72, 72, 74),
    "united_states": ("very_high", "thousands", 96, 94, 92, 90, 88, 58, 68, 96, 82),
    "russia": ("very_high", "thousands", 92, 90, 88, 82, 42, 38, 36, 82, 52),
    "china": ("high", "hundreds", 78, 80, 82, 84, 48, 64, 50, 88, 58),
    "united_kingdom": ("medium", "~200-300", 54, 78, 76, 82, 82, 66, 72, 66, 76),
    "india": ("medium", "~100-200", 58, 62, 64, 70, 44, 72, 38, 76, 50),
    "pakistan": ("medium", "~100-200", 44, 48, 52, 62, 36, 34, 30, 54, 38),
    "north_korea": ("low", "dozens", 22, 24, 44, 52, 18, 20, 22, 42, 18),
    "israel": ("undeclared", "not officially declared", 46, 58, 66, 76, 62, 54, 28, 72, 40),
}
ALIASES = {
    "usa": "united_states", "us": "united_states", "united_states_of_america": "united_states",
    "uk": "united_kingdom", "great_britain": "united_kingdom", "russian_federation": "russia",
    "democratic_people_s_republic_of_korea": "north_korea", "korea_democratic_people_s_republic_of": "north_korea",
}
FIELDS = ["arsenal_band", "estimated_warheads_band", "triad_maturity", "second_strike", "survivability", "command_control", "alliance_support", "doctrine_restraint", "regional_stability", "conventional_power", "crisis_communication"]

SCENARIO_WEIGHTS = {
    "diplomatic_crisis": {"label": "Diplomatic crisis", "intensity": 18, "ambiguity": 22, "shock": 12},
    "deterrence_signal": {"label": "Deterrence signal", "intensity": 28, "ambiguity": 35, "shock": 18},
    "limited_abstract_strike": {"label": "Limited abstract strike", "intensity": 72, "ambiguity": 44, "shock": 70},
    "major_escalation": {"label": "Major escalation", "intensity": 92, "ambiguity": 55, "shock": 92},
    "accidental_launch_fear": {"label": "Accidental launch fear", "intensity": 64, "ambiguity": 82, "shock": 58},
}


class DeterrenceRequest(BaseModel):
    actor: str = Field(...)
    target: str = Field(...)
    tension: int = Field(45, ge=0, le=100)
    alliance_involvement: int = Field(40, ge=0, le=100)
    communication_quality: int = Field(55, ge=0, le=100)
    use_live_sources: bool = True


class ScenarioRequest(DeterrenceRequest):
    scenario: Literal["diplomatic_crisis", "deterrence_signal", "limited_abstract_strike", "major_escalation", "accidental_launch_fear"] = "diplomatic_crisis"
    region_focus: str | None = Field(None, description="Broad region label only. Exact targeting coordinates are intentionally unsupported.")


def overlay_for(name: str) -> dict:
    key = ALIASES.get(slug(name), slug(name))
    values = STRATEGIC_OVERLAYS.get(key)
    return dict(zip(FIELDS, values)) if values else {}


def generated_profile(name: str, region: str = "Unknown", subregion: str = "", population: int = 0, area: float = 0) -> dict:
    pop_score = clamp(log10(max(int(population or 1), 1)) * 9)
    area_score = clamp(log10(max(float(area or 1), 1)) * 10)
    base = clamp(pop_score * 0.55 + area_score * 0.25 + 18)
    stability = {"Europe": 68, "Americas": 58, "Oceania": 70, "Asia": 48, "Africa": 42}.get(region, 45)
    profile = {
        "key": slug(name), "name": name, "region": region or "Unknown", "subregion": subregion or region or "Unknown",
        "population": population or 0, "area": area or 0,
        "arsenal_band": "none/unknown", "estimated_warheads_band": "none declared / not applicable",
        "triad_maturity": 0, "second_strike": 0, "survivability": clamp(base * 0.35), "command_control": clamp(base * 0.55),
        "alliance_support": 45 if region in ["Europe", "Americas", "Oceania"] else 32, "doctrine_restraint": 62,
        "regional_stability": stability, "conventional_power": base, "crisis_communication": 52,
    }
    profile.update(overlay_for(name))
    return profile


async def get_countries() -> list[dict]:
    if _countries_cache["items"] and time() - _countries_cache["ts"] < CACHE_TTL:
        return _countries_cache["items"]
    try:
        async with httpx.AsyncClient(timeout=PUBLIC_TIMEOUT) as client:
            r = await client.get(RESTCOUNTRIES_URL, headers={"User-Agent": "Pandora-Nuclear/0.2"})
            r.raise_for_status()
            raw = r.json()
        items = [generated_profile((c.get("name") or {}).get("common") or "Unknown", c.get("region") or "Unknown", c.get("subregion") or "", c.get("population") or 0, c.get("area") or 0) for c in raw]
        items = sorted([c for c in items if c["name"] != "Unknown"], key=lambda x: x["name"])
    except Exception:
        items = [generated_profile(k.replace("_", " ").title(), "Strategic") for k in STRATEGIC_OVERLAYS]
    _countries_cache.update({"ts": time(), "items": items})
    return items


async def profile(key: str) -> dict:
    normalized = ALIASES.get(slug(key), slug(key))
    for c in await get_countries():
        aliases = {slug(c["name"]), c["key"], ALIASES.get(c["key"], c["key"])}
        if normalized in aliases:
            return c
    return generated_profile(key.replace("_", " ").title())


def count_keywords(text: str, words: list[str]) -> int:
    lower = text.lower()
    return sum(1 for w in words if w in lower)


KEYWORDS = {
    "military": [
        "military", "missile", "troops", "strike", "war", "drone", "forces", "army", "defense", "defence", "nato", "weapon",
        "militaire", "armée", "armee", "défense", "defense", "frappe", "guerre", "forces", "missiles", "otan", "arme",
        "военн", "ракета", "удар", "война", "армия", "силы", "нато",
    ],
    "nuclear": [
        "nuclear", "atomic", "warhead", "deterrence", "icbm", "strategic forces", "nuke",
        "nucléaire", "nucleaire", "atomique", "ogive", "dissuasion", "forces stratégiques", "forces strategiques",
        "ядер", "атом", "сдерживан",
    ],
    "diplomacy": [
        "talk", "talks", "diplomacy", "diplomatic", "summit", "ceasefire", "negotiation", "dialogue", "meeting", "envoy",
        "diplomatie", "diplomatique", "sommet", "cessez-le-feu", "cessez le feu", "négociation", "negociation", "dialogue", "rencontre",
        "диплом", "переговор", "саммит", "диалог", "встреч",
    ],
    "sanction": [
        "sanction", "sanctions", "embargo", "condemn", "resolution", "blacklist", "export ban",
        "sanction", "sanctions", "embargo", "condamn", "résolution", "resolution", "liste noire",
        "санкц", "эмбарго", "осужд", "резолюц",
    ],
}


def clean_xml(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value or "")).replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'").strip()


def xml_tag(item: str, tag: str) -> str:
    match = re.search(rf"<{tag}[^>]*>([\s\S]*?)</{tag}>", item, re.I)
    return clean_xml(match.group(1) if match else "")


def dedupe_articles(articles: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for article in articles:
        key = (article.get("url") or article.get("title") or "").lower().split("?")[0]
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(article)
    return out


def source_counts(articles: list[dict]) -> list[dict]:
    counts: dict[str, int] = {}
    for article in articles:
        source = clean_xml(article.get("domain") or article.get("connector") or "Source inconnue")
        counts[source] = counts.get(source, 0) + 1
    return [{"name": name, "count": count} for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0].lower()))]


def nuclear_capability(country: dict) -> int:
    return clamp(
        (country.get("triad_maturity") or 0) * 0.35
        + (country.get("second_strike") or 0) * 0.30
        + (country.get("survivability") or 0) * 0.18
        + (country.get("command_control") or 0) * 0.17
    )


def nuclear_status(country: dict) -> str:
    capability = nuclear_capability(country)
    arsenal = str(country.get("arsenal_band") or "").lower()
    if "none" in arsenal or capability < 15:
        return "non_nuclear"
    if "undeclared" in arsenal:
        return "undeclared_or_ambiguous"
    if capability >= 70:
        return "major_nuclear_power"
    return "nuclear_power"


def pair_nuclear_context(actor: dict, target: dict) -> dict:
    actor_capability = nuclear_capability(actor)
    target_capability = nuclear_capability(target)
    actor_status = nuclear_status(actor)
    target_status = nuclear_status(target)
    actor_is_nuclear = actor_status != "non_nuclear"
    target_is_nuclear = target_status != "non_nuclear"
    if actor_is_nuclear and target_is_nuclear:
        pair_type = "nuclear_vs_nuclear"
        factor = 1.0
        label = "Les deux pays disposent d'une capacité nucléaire ou assimilée : le score représente un risque nucléaire bilatéral."
    elif actor_is_nuclear or target_is_nuclear:
        pair_type = "nuclear_vs_non_nuclear"
        factor = 0.32
        label = "Un seul des deux pays dispose d'une capacité nucléaire : le risque nucléaire direct est fortement réduit, sauf signaux OSINT nucléaires explicites ou implication d'alliances."
    else:
        pair_type = "non_nuclear_vs_non_nuclear"
        factor = 0.08
        label = "Aucun des deux pays n'a de capacité nucléaire déclarée : le score nucléaire direct doit rester faible hors signaux OSINT exceptionnels."
    return {
        "pairType": pair_type,
        "nuclearPairFactor": factor,
        "actorNuclearCapability": actor_capability,
        "targetNuclearCapability": target_capability,
        "actorNuclearStatus": actor_status,
        "targetNuclearStatus": target_status,
        "summary": label,
    }


async def fetch_gdelt_articles(client: httpx.AsyncClient, query: str, limit: int = 12) -> list[dict]:
    url = f"{GDELT_DOC_URL}?query={quote_plus(query)}&mode=ArtList&format=json&maxrecords={min(limit, 250)}&sort=HybridRel&timespan=7d"
    r = await client.get(url, headers={"User-Agent": "Pandora-Nuclear-GDELT/0.3"})
    if r.status_code >= 400:
        return []
    data = r.json()
    return [
        {"title": a.get("title"), "domain": a.get("domain") or "GDELT", "url": a.get("url"), "seenDate": a.get("seendate"), "connector": "GDELT"}
        for a in (data.get("articles") or [])[:limit]
        if a.get("title") and a.get("url")
    ]


async def fetch_google_news_articles(client: httpx.AsyncClient, query: str, limit: int = 12) -> list[dict]:
    url = f"{GOOGLE_NEWS_RSS_URL}?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"
    r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 Pandora-Nuclear-RSS/0.3"})
    if r.status_code >= 400:
        return []
    xml = r.text
    items = re.findall(r"<item[\s\S]*?</item>", xml, re.I)[:limit]
    articles = []
    for item in items:
        title = xml_tag(item, "title")
        link = xml_tag(item, "link")
        pub = xml_tag(item, "pubDate")
        source = xml_tag(item, "source") or "Google News"
        if title and link:
            articles.append({"title": title, "domain": source, "url": link, "seenDate": pub, "connector": "Google News RSS"})
    return articles


def local_fallback_signals(actor: dict, target: dict) -> dict:
    strategic_delta = abs((actor.get("conventional_power") or 0) - (target.get("conventional_power") or 0))
    nuclear_weight = max(actor.get("triad_maturity") or 0, target.get("triad_maturity") or 0, actor.get("second_strike") or 0, target.get("second_strike") or 0)
    regional_friction = max(0, 70 - min(actor.get("regional_stability") or 45, target.get("regional_stability") or 45))
    military_mentions = clamp(strategic_delta / 12 + regional_friction / 18, 0, 8)
    nuclear_mentions = clamp(nuclear_weight / 25, 0, 6)
    diplomacy_mentions = clamp(((actor.get("crisis_communication") or 50) + (target.get("crisis_communication") or 50)) / 35, 0, 6)
    sanction_mentions = clamp((100 - min(actor.get("alliance_support") or 40, target.get("alliance_support") or 40)) / 30, 0, 5)
    fallback_articles = [
        {"title": f"Google News search — {actor['name']} {target['name']} nuclear deterrence", "domain": "Google News", "url": f"https://news.google.com/search?q={quote_plus(actor['name'] + ' ' + target['name'] + ' nuclear deterrence')}", "connector": "source-search"},
        {"title": f"GDELT DOC search — {actor['name']} {target['name']} military crisis", "domain": "GDELT", "url": f"https://api.gdeltproject.org/api/v2/doc/doc?query={quote_plus(actor['name'] + ' ' + target['name'] + ' military crisis')}&mode=ArtList&format=html", "connector": "source-search"},
        {"title": "SIPRI Yearbook / nuclear forces reference", "domain": "SIPRI", "url": "https://www.sipri.org/yearbook", "connector": "reference-source"},
    ]
    counts = source_counts(fallback_articles)
    return {
        "enabled": True,
        "source": "Pandora local OSINT fallback + strategic country profiles",
        "query": f'{actor["name"]} {target["name"]}',
        "articleCount": 0,
        "militaryMentions": military_mentions,
        "nuclearMentions": nuclear_mentions,
        "diplomacyMentions": diplomacy_mentions,
        "sanctionMentions": sanction_mentions,
        "communicationMentions": diplomacy_mentions,
        "sourceCount": len(counts),
        "sourceNames": [item["name"] for item in counts],
        "sourceCounts": counts,
        "topArticles": fallback_articles,
        "sourceStatus": "ok",
        "sourceMode": "local_fallback",
        "summary": "Aucune dépendance web obligatoire : l'analyse reste opérationnelle via les profils pays et les heuristiques OSINT locales.",
    }


async def fetch_live_signals(actor: dict, target: dict, scenario: str | None) -> dict:
    actor_name = actor["name"]
    target_name = target["name"]
    queries = [
        f'{actor_name} {target_name} nuclear',
        f'{actor_name} {target_name} missile',
        f'{actor_name} {target_name} military',
        f'{actor_name} {target_name} sanctions',
        f'{actor_name} {target_name} diplomacy',
        f'{actor_name} {target_name} crisis',
        f'{actor_name} {target_name}',
    ]
    query = " | ".join(queries[:6])
    signals = {"enabled": True, "source": "GDELT 2.1 DOC API + REST Countries", "query": query, "articleCount": 0, "sourceCount": 0, "sourceNames": [], "sourceCounts": [], "militaryMentions": 0, "nuclearMentions": 0, "diplomacyMentions": 0, "sanctionMentions": 0, "communicationMentions": 0, "topArticles": [], "sourceStatus": "ok", "sourceMode": "live_web", "scenarioContext": scenario, "maxAnalyzedArticles": MAX_ANALYZED_ARTICLES}
    try:
        async with httpx.AsyncClient(timeout=PUBLIC_TIMEOUT) as client:
            articles = []
            connectors = []
            for q in queries:
                gdelt = await fetch_gdelt_articles(client, q, MAX_ARTICLES_PER_QUERY)
                if gdelt:
                    connectors.append("GDELT")
                articles.extend(gdelt)
                if len(dedupe_articles(articles)) >= MAX_ANALYZED_ARTICLES:
                    break
            if len(dedupe_articles(articles)) < MAX_ANALYZED_ARTICLES:
                for q in queries[:4]:
                    gnews = await fetch_google_news_articles(client, q, MAX_ARTICLES_PER_QUERY)
                    if gnews:
                        connectors.append("Google News RSS")
                    articles.extend(gnews)
                    if len(dedupe_articles(articles)) >= MAX_ANALYZED_ARTICLES:
                        break
            if len(dedupe_articles(articles)) < MAX_ANALYZED_ARTICLES:
                broad_queries = [
                    f'{actor_name} nuclear deterrence',
                    f'{target_name} nuclear deterrence',
                    f'{actor_name} missile military diplomacy',
                    f'{target_name} missile military diplomacy',
                    'nuclear deterrence international security',
                    'nuclear weapons military diplomacy sanctions',
                ]
                for q in broad_queries:
                    broad = await fetch_google_news_articles(client, q, MAX_ARTICLES_PER_QUERY)
                    if broad:
                        connectors.append("Google News RSS broad-context")
                    articles.extend(broad)
                    if len(dedupe_articles(articles)) >= MAX_ANALYZED_ARTICLES:
                        signals["sourceMode"] = "live_web_broad_context"
                        break
            articles = dedupe_articles(articles)[:MAX_ANALYZED_ARTICLES]
            if connectors:
                signals["source"] = " + ".join(sorted(set(connectors))) + " + REST Countries"
        signals["articleCount"] = len(articles)
        for article in articles:
            text = f"{article.get('title', '')} {article.get('domain', '')} {article.get('url', '')} {article.get('connector', '')}"
            signals["militaryMentions"] += count_keywords(text, KEYWORDS["military"])
            signals["nuclearMentions"] += count_keywords(text, KEYWORDS["nuclear"])
            signals["diplomacyMentions"] += count_keywords(text, KEYWORDS["diplomacy"])
            signals["sanctionMentions"] += count_keywords(text, KEYWORDS["sanction"])
        signals["communicationMentions"] = signals["diplomacyMentions"]
        counts = source_counts(articles)
        signals["sourceCount"] = len(counts)
        signals["sourceNames"] = [item["name"] for item in counts]
        signals["sourceCounts"] = counts
        signals["topArticles"] = articles
        if not articles:
            fallback = local_fallback_signals(actor, target)
            signals.update({k: fallback[k] for k in ["militaryMentions", "nuclearMentions", "diplomacyMentions", "sanctionMentions", "communicationMentions", "sourceCount", "sourceNames", "sourceCounts", "topArticles"]})
            signals["sourceMode"] = "live_web_no_articles_reference_links"
            signals["source"] = "GDELT + Google News RSS search links + REST Countries"
    except Exception as exc:
        signals = local_fallback_signals(actor, target)
        signals["sourceMode"] = "local_fallback_after_web_failure"
        signals["sourceError"] = type(exc).__name__
    return signals


def adjust_inputs(req: DeterrenceRequest, signals: dict) -> dict:
    return {
        "tension": clamp(req.tension + signals["articleCount"] * 0.4 + signals["militaryMentions"] * 1.8 + signals["nuclearMentions"] * 2.8 + signals["sanctionMentions"] * 1.2 - signals["diplomacyMentions"]),
        "communication_quality": clamp(req.communication_quality + signals["diplomacyMentions"] * 2.2 + signals["communicationMentions"] * 0.8 - signals["militaryMentions"] * 0.8),
        "alliance_involvement": clamp(req.alliance_involvement + signals["sanctionMentions"] * 1.5 + signals["articleCount"] * 0.15),
    }


async def deterrence_metrics(req: DeterrenceRequest, scenario_key: str | None = None) -> dict:
    actor = await profile(req.actor)
    target = await profile(req.target)
    if slug(actor["name"]) == slug(target["name"]):
        raise HTTPException(status_code=400, detail="Actor and target must be different profiles")
    signals = await fetch_live_signals(actor, target, scenario_key) if req.use_live_sources else local_fallback_signals(actor, target)
    if not req.use_live_sources:
        signals["sourceMode"] = "local_fallback_live_disabled"
        signals["source"] = "Pandora local strategic analysis"
    adjusted = adjust_inputs(req, signals) if req.use_live_sources else {"tension": req.tension, "communication_quality": req.communication_quality, "alliance_involvement": req.alliance_involvement}
    nuclear_context = pair_nuclear_context(actor, target)

    actor_firepower = 18 * log10(max(10, actor["conventional_power"] * 8)) + actor["triad_maturity"] * 0.32 + actor["command_control"] * 0.24
    target_deterrent = target["second_strike"] * 0.34 + target["survivability"] * 0.26 + target["command_control"] * 0.16 + target["alliance_support"] * 0.14 + target["doctrine_restraint"] * 0.10
    credibility = clamp(target_deterrent)
    pressure = clamp(actor_firepower * 0.62 + adjusted["tension"] * 0.34 + adjusted["alliance_involvement"] * 0.12 - target_deterrent * 0.18)
    miscalculation = clamp(adjusted["tension"] * 0.40 + (100 - adjusted["communication_quality"]) * 0.36 + (100 - actor["doctrine_restraint"]) * 0.12 + (100 - target["regional_stability"]) * 0.12)
    strategic_escalation = clamp(pressure * 0.48 + miscalculation * 0.36 + (100 - target_deterrent) * 0.16)
    explicit_nuclear_signal = clamp(signals.get("nuclearMentions", 0) * 3.2 + signals.get("militaryMentions", 0) * 0.45 + adjusted["alliance_involvement"] * 0.12, 0, 35)
    nuclear_floor = 8 if nuclear_context["pairType"] == "non_nuclear_vs_non_nuclear" else 18 if nuclear_context["pairType"] == "nuclear_vs_non_nuclear" else 0
    escalation = clamp(strategic_escalation * nuclear_context["nuclearPairFactor"] + explicit_nuclear_signal + nuclear_floor)
    second_strike = clamp(target["second_strike"] * 0.42 + target["survivability"] * 0.38 + target["command_control"] * 0.20)
    stability = clamp(100 - escalation * 0.45 - miscalculation * 0.25 + adjusted["communication_quality"] * 0.18 + min(actor["doctrine_restraint"], target["doctrine_restraint"]) * 0.12)
    recommendations = ["Analysis is always produced with live OSINT when available, otherwise Pandora local fallback is used.", "Cross-check public signals before drawing conclusions.", "Educational strategic simulation only; not predictive or operational."]
    if nuclear_context["pairType"] != "nuclear_vs_nuclear":
        recommendations.insert(0, nuclear_context["summary"])
    if signals.get("sourceMode", "").startswith("local_fallback"):
        recommendations.insert(0, "Live web sources were not required for continuity: Pandora used local strategic fallback signals.")
    if escalation >= 70:
        recommendations.insert(0, "High escalation index: prioritize de-escalation channels and third-party verification.")
    return {"mode": "pandora-nuclear-deterrence-live", "generatedAt": now(), "actor": actor, "target": target, "scores": {"deterrenceCredibility": credibility, "escalationRisk": escalation, "strategicStabilityRisk": strategic_escalation, "secondStrikeConfidence": second_strike, "strategicStability": stability, "miscalculationRisk": miscalculation}, "drivers": {"actorPressure": pressure, "targetDeterrenceCredibility": credibility, "miscalculationRisk": miscalculation, "secondStrikeConfidence": second_strike, "crisisCommunication": adjusted["communication_quality"], "allianceInvolvement": adjusted["alliance_involvement"], "liveAdjustedTension": adjusted["tension"], "rawStrategicEscalation": strategic_escalation, "explicitNuclearSignal": explicit_nuclear_signal}, "nuclearContext": nuclear_context, "liveSignals": signals, "inputAdjustments": {"original": {"tension": req.tension, "communication_quality": req.communication_quality, "alliance_involvement": req.alliance_involvement}, "used": adjusted}, "recommendations": recommendations, "safetyNotice": "Educational strategic simulation only. Exact target coordinates, weapon effects, and operational strike planning are intentionally unsupported."}


@app.get("/health")
async def health():
    return {"status": "ok", "service": APP_NAME, "timestamp": now(), "liveSources": ["REST Countries", "GDELT 2.1 DOC API"]}


@app.get("/countries")
async def countries():
    items = await get_countries()
    return {"countries": [{"key": c["key"], "name": c["name"], "region": c["region"], "arsenal_band": c["arsenal_band"], "estimated_warheads_band": c["estimated_warheads_band"]} for c in items], "total": len(items), "source": "REST Countries API + Pandora strategic overlays", "safetyNotice": "Country data is coarse and suitable only for educational risk modelling."}


@app.post("/deterrence")
async def deterrence(req: DeterrenceRequest):
    return await deterrence_metrics(req)


@app.post("/scenario")
async def scenario(req: ScenarioRequest):
    base = await deterrence_metrics(req, req.scenario)
    weights = SCENARIO_WEIGHTS[req.scenario]
    s = base["scores"]
    escalation_after_event = clamp(s["escalationRisk"] * 0.55 + weights["intensity"] * 0.34 + weights["ambiguity"] * 0.11)
    humanitarian_stress = clamp(weights["shock"] * 0.54 + escalation_after_event * 0.22 + base["drivers"]["liveAdjustedTension"] * 0.16 + (100 - s["strategicStability"]) * 0.08)
    diplomatic_fallout = clamp(weights["intensity"] * 0.42 + base["drivers"]["allianceInvolvement"] * 0.28 + escalation_after_event * 0.20 + weights["ambiguity"] * 0.10)
    environmental_concern = clamp(weights["shock"] * 0.48 + escalation_after_event * 0.22)
    riposte_pressure = clamp((100 - s["deterrenceCredibility"]) * 0.10 + s["secondStrikeConfidence"] * 0.28 + escalation_after_event * 0.44 + base["drivers"]["liveAdjustedTension"] * 0.18)
    base["mode"] = "pandora-nuclear-scenario-live"
    base["scenario"] = {"key": req.scenario, "label": weights["label"], "regionFocus": req.region_focus or "broad strategic theatre", "note": "Region focus is descriptive only; exact geospatial targeting is intentionally unsupported."}
    base["scenarioScores"] = {"postEventEscalation": escalation_after_event, "humanitarianStress": humanitarian_stress, "diplomaticFallout": diplomatic_fallout, "environmentalConcern": environmental_concern, "ripostePressure": riposte_pressure, "strategicChaos": clamp(escalation_after_event * 0.42 + humanitarian_stress * 0.22 + diplomatic_fallout * 0.18 + s["miscalculationRisk"] * 0.18)}
    base["recommendations"] = ["Do not interpret this as a strike model; it is an abstract crisis-risk simulator.", *base["recommendations"]]
    return base