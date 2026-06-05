import os, re, hashlib
from datetime import datetime, timezone
from typing import Any
import httpx
from fastapi import FastAPI
APP_NAME='Pandora Hotspots Service'
ONTOLOGY_URL=os.getenv('PANDORA_ONTOLOGY_URL','http://pandora-ontology:7704').rstrip('/')
app=FastAPI(title=APP_NAME,version='0.1.0')
def now(): return datetime.now(timezone.utc).isoformat()
def sid(v): return hashlib.sha1(str(v).encode()).hexdigest()[:10]
def coords(label):
    m=re.match(r'^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$',str(label or ''))
    return (float(m.group(1)),float(m.group(2))) if m else None
async def get_json(client,url):
    r=await client.get(url,headers={'User-Agent':'Pandora-Hotspots-Service/1.0'}); r.raise_for_status(); d=r.json(); return d if isinstance(d,dict) else {}
def build(ontology):
    nodes=ontology.get('nodes',[]) if isinstance(ontology.get('nodes'),list) else []
    edges=ontology.get('edges',[]) if isinstance(ontology.get('edges'),list) else []
    byid={n.get('id'):n for n in nodes if isinstance(n,dict)}
    out=[]
    for n in nodes:
        if not isinstance(n,dict): continue
        c=coords(n.get('label'))
        if not c and n.get('type') not in {'Location','GeoPoint','Category'}: continue
        related=[e for e in edges if e.get('source')==n.get('id') or e.get('target')==n.get('id')]
        related_nodes=[byid.get(e.get('source') if e.get('target')==n.get('id') else e.get('target')) for e in related]
        risk=max([float(n.get('risk') or 0)]+[float(r.get('risk') or 0) for r in related_nodes if r])
        score=min(100, round(risk + min(25,len(related)*3)))
        if score < 45: continue
        lat,lng=c if c else (0,0)
        out.append({'id':f'hotspot-{sid(n.get("id"))}','label':n.get('label'),'lat':lat,'lng':lng,'score':score,'level':'critical' if score>=85 else 'high' if score>=65 else 'watch','drivers':sorted(set([str(r.get('type')) for r in related_nodes if r]))[:6],'entityId':n.get('id'),'relationCount':len(related),'explanation':f"{len(related)} ontology relation(s), max risk {round(risk)}"})
    return sorted(out,key=lambda h:h['score'],reverse=True)[:50]
@app.get('/health')
async def health(): return {'status':'ok','service':APP_NAME,'ontology_url':ONTOLOGY_URL,'timestamp':now()}
@app.get('/hotspots')
async def hotspots():
    async with httpx.AsyncClient(timeout=40) as client: ontology=await get_json(client,f'{ONTOLOGY_URL}/ontology')
    hs=build(ontology)
    return {'mode':'pandora-hotspots-service','generatedAt':now(),'total':len(hs),'hotspots':hs,'source':ontology.get('summary',{})}
