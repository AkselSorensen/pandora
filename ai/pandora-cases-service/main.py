import os, hashlib
from datetime import datetime, timezone
from typing import Any
import httpx
from fastapi import FastAPI

APP_NAME='Pandora Cases Service'
ONTOLOGY_URL=os.getenv('PANDORA_ONTOLOGY_URL','http://pandora-ontology:7704').rstrip('/')
ALERTS_URL=os.getenv('PANDORA_ALERTS_URL','http://pandora-alerts:7703').rstrip('/')
app=FastAPI(title=APP_NAME,version='0.1.0')

def now(): return datetime.now(timezone.utc).isoformat()
def sid(v): return hashlib.sha1(str(v).encode()).hexdigest()[:10]
async def get_json(client,url):
    r=await client.get(url,headers={'User-Agent':'Pandora-Cases-Service/1.0'}); r.raise_for_status(); d=r.json(); return d if isinstance(d,dict) else {}

def build_cases(ontology:dict[str,Any], alerts:dict[str,Any])->list[dict[str,Any]]:
    rows=[]
    alert_rows=[a for a in alerts.get('alerts',[]) if isinstance(a,dict)]
    # one case per top alert/category cluster
    grouped={}
    for a in alert_rows:
        cat=str(a.get('category') or 'General')
        grouped.setdefault(cat,[]).append(a)
    for cat, items in grouped.items():
        top=items[0]
        level='critical' if any(i.get('level')=='critical' for i in items) else 'high' if any(i.get('level')=='high' for i in items) else 'watch'
        rows.append({
            'id':f'case-{sid(cat+str(top.get("id")))}','title':f'{cat} investigation — {len(items)} alert(s)','status':'open','priority':level,
            'summary':f'Auto-generated analyst case from Pandora alerts for category {cat}.',
            'createdAt':now(),'updatedAt':now(),'alerts':items[:8],
            'timeline':[{'time':i.get('timestamp') or now(),'title':i.get('title'),'source':i.get('source'),'level':i.get('level')} for i in items[:10]],
            'recommendedActions':['Validate primary sources','Attach relevant ontology entities','Prepare short decision brief','Monitor for persistence over next digest cycle'],
            'ontologyRefs':[n.get('id') for n in ontology.get('nodes',[]) if isinstance(n,dict) and str(n.get('label','')).lower().find(cat.lower())>=0][:10]
        })
    return sorted(rows,key=lambda c: {'critical':3,'high':2,'watch':1}.get(c['priority'],0),reverse=True)[:20]

@app.get('/health')
async def health(): return {'status':'ok','service':APP_NAME,'ontology_url':ONTOLOGY_URL,'alerts_url':ALERTS_URL,'timestamp':now()}
@app.get('/cases')
async def cases():
    async with httpx.AsyncClient(timeout=40) as client:
        ontology=await get_json(client,f'{ONTOLOGY_URL}/ontology')
        alerts=await get_json(client,f'{ALERTS_URL}/alerts')
    cases=build_cases(ontology,alerts)
    return {'mode':'pandora-cases-service','generatedAt':now(),'total':len(cases),'cases':cases,'source':{'ontologyNodes':ontology.get('summary',{}).get('nodes'),'alerts':alerts.get('total')}}
