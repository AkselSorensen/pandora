import os
from datetime import datetime, timezone
from typing import Any
import httpx
from fastapi import FastAPI
APP_NAME='Pandora Risk Engine'
DIGEST_URL=os.getenv('PANDORA_DIGEST_URL','http://pandora-digest:7702').rstrip('/')
ALERTS_URL=os.getenv('PANDORA_ALERTS_URL','http://pandora-alerts:7703').rstrip('/')
HOTSPOTS_URL=os.getenv('PANDORA_HOTSPOTS_URL','http://pandora-hotspots:7706').rstrip('/')
app=FastAPI(title=APP_NAME,version='0.1.0')
def now(): return datetime.now(timezone.utc).isoformat()
async def get_json(client,url):
    r=await client.get(url,headers={'User-Agent':'Pandora-Risk-Service/1.0'}); r.raise_for_status(); d=r.json(); return d if isinstance(d,dict) else {}
def lvl(s): return 'critical' if s>=85 else 'high' if s>=65 else 'watch' if s>=40 else 'routine'
@app.get('/health')
async def health(): return {'status':'ok','service':APP_NAME,'timestamp':now()}
@app.get('/risk')
async def risk():
    async with httpx.AsyncClient(timeout=40) as client:
        digest=await get_json(client,f'{DIGEST_URL}/digest'); alerts=await get_json(client,f'{ALERTS_URL}/alerts')
        try: hotspots=await get_json(client,f'{HOTSPOTS_URL}/hotspots')
        except Exception: hotspots={'hotspots':[]}
    counts=alerts.get('counts') or {}; hs=hotspots.get('hotspots') or []
    cyber=sum(1 for a in alerts.get('alerts',[]) if a.get('category')=='Cyber')*12
    geo=sum(1 for a in alerts.get('alerts',[]) if a.get('category')=='Geopolitical')*12
    hazard=sum(1 for a in alerts.get('alerts',[]) if a.get('category')=='Natural Hazard')*10
    hotspot=max([h.get('score',0) for h in hs] or [0])
    base=int(digest.get('riskScore') or 0)
    score=min(100,round(base*.45 + hotspot*.25 + cyber*.12 + geo*.1 + hazard*.08 + int(counts.get('critical',0))*8))
    drivers={'digest':base,'hotspots':hotspot,'cyber':min(100,cyber),'geopolitical':min(100,geo),'naturalHazard':min(100,hazard),'criticalAlerts':counts.get('critical',0)}
    rec=['Review critical alerts','Open cases for persistent high-risk categories','Validate sources before action','Monitor hotspots for score changes']
    return {'mode':'pandora-risk-engine','generatedAt':now(),'score':score,'level':lvl(score),'drivers':drivers,'recommendations':rec,'hotspots':hs[:10],'source':{'digest':digest.get('generatedAt'),'alerts':alerts.get('total')}}
