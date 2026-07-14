"""Territorial risk scoring sources for Pandora Territorial service.

This service does NOT fetch external APIs directly — it calls other
Pandora microservices to aggregate their data into unified risk scores.
"""

from __future__ import annotations

# ── Risk scoring weights ──
RISK_WEIGHTS: dict[str, float] = {
    "cyber": 0.25,
    "aerospace": 0.15,
    "dgsi": 0.15,
    "natural": 0.20,
    "news": 0.15,
    "nuclear": 0.10,
}

SEVERITY_SCORE: dict[str, int] = {
    "critical": 100,
    "high": 70,
    "medium": 40,
    "low": 15,
    "routine": 0,
}

LEVEL_THRESHOLDS: list[dict] = [
    {"min": 75, "level": "CRITICAL", "color": "#FF1744"},
    {"min": 50, "level": "ELEVATED", "color": "#FF6B00"},
    {"min": 25, "level": "WATCH", "color": "#FFD700"},
    {"min": 0, "level": "ROUTINE", "color": "#00E676"},
]

# ── Global risk grid (0.5° resolution, major zones) ──
RISK_GRID: list[dict] = [
    {"name": "Europe", "lat": 50.0, "lng": 10.0, "radius_km": 1000},
    {"name": "Moyen-Orient", "lat": 30.0, "lng": 45.0, "radius_km": 800},
    {"name": "Asie du Sud-Est", "lat": 15.0, "lng": 110.0, "radius_km": 800},
    {"name": "Caucase", "lat": 42.0, "lng": 45.0, "radius_km": 400},
    {"name": "Mer de Chine", "lat": 15.0, "lng": 115.0, "radius_km": 500},
    {"name": "Corne de l'Afrique", "lat": 5.0, "lng": 45.0, "radius_km": 500},
    {"name": "Sahel", "lat": 15.0, "lng": 5.0, "radius_km": 500},
    {"name": "Amérique Latine", "lat": -10.0, "lng": -60.0, "radius_km": 600},
    {"name": "Arctique", "lat": 75.0, "lng": 0.0, "radius_km": 800},
]


def score_to_level(score: int) -> dict:
    for t in LEVEL_THRESHOLDS:
        if score >= t["min"]:
            return {"level": t["level"], "color": t["color"]}
    return {"level": "ROUTINE", "color": "#00E676"}
