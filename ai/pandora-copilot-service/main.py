import os
from datetime import datetime, timezone
from typing import Any
import httpx
from fastapi import FastAPI
from pydantic import BaseModel
APP_NAME='Pandora Copilot Service'
DIGEST_URL=os.getenv('PANDORA_DIGEST_URL','http://pandora-digest:7702').rstrip('/')
ALERTS_URL=os.getenv('PANDORA_ALERTS_URL','http://pandora-alerts:7703').rstrip('/')
ONTOLOGY_URL=os.getenv('PANDORA_ONTOLOGY_URL','http://pandora-ontology:7704').rstrip('/')
OLLAMA_URL=os.getenv('OLLAMA_BASE_URL','http://host.docker.internal:11434').rstrip('/')
OLLAMA_MODEL=os.getenv('OLLAMA_MODEL','pandora-ai')
app=FastAPI(title=APP_NAME,version='0.1.0')
class Ask(BaseModel): question:str='Briefing global'; max_tokens:int=500

def now(): return datetime.now(timezone.utc).isoformat()
async def get_json(client,url):
    r=await client.get(url,headers={'User-Agent':'Pandora-Copilot-Service/1.0'}); r.raise_for_status(); d=r.json(); return d if isinstance(d,dict) else {}
def local_answer(q,d,a,o):
    top=(a.get('alerts') or [])[:5]; nodes=(o.get('nodes') or [])[:6]
    lines=[f"# Pandora Copilot\nQuestion: {q}",f"Posture: {d.get('posture')} risk {d.get('riskScore')}/100.","## Alertes prioritaires"]
    lines += [f"- [{x.get('level')}] {x.get('title')} — {x.get('recommendedAction','review')}" for x in top] or ['- Aucune alerte active.']
    lines += ["## Entités clés"]+[f"- {n.get('type')}: {n.get('label')} (risk {n.get('risk')})" for n in nodes]
    lines += ["## Recommandation", "Valider les sources primaires, ouvrir un case si le signal persiste, et suivre les changements dans alerts/digest."]
    return '\n'.join(lines)
@app.get('/health')
async def health(): return {'status':'ok','service':APP_NAME,'model':OLLAMA_MODEL,'timestamp':now()}
@app.post('/ask')
async def ask(payload:Ask):
    async with httpx.AsyncClient(timeout=45) as client:
        digest=await get_json(client,f'{DIGEST_URL}/digest'); alerts=await get_json(client,f'{ALERTS_URL}/alerts'); ontology=await get_json(client,f'{ONTOLOGY_URL}/ontology')
        prompt=f"Tu es Pandora Copilot, assistant analyste OSINT défensif. Réponds en français avec sources, incertitudes et actions défensives. Question: {payload.question}\nDigest:{digest}\nAlerts:{alerts}\nOntology summary:{ontology.get('summary')}"
        try:
            r=await client.post(f'{OLLAMA_URL}/api/generate',json={'model':OLLAMA_MODEL,'prompt':prompt[:18000],'stream':False,'options':{'temperature':0.2,'num_predict':payload.max_tokens}},timeout=35)
            if r.is_success and r.json().get('response'):
                return {'mode':'pandora-copilot-service','generatedAt':now(),'answer':r.json()['response'],'sources':{'digest':digest.get('generatedAt'),'alerts':alerts.get('total'),'ontology':ontology.get('summary')}}
        except Exception: pass
    return {'mode':'pandora-copilot-local','generatedAt':now(),'answer':local_answer(payload.question,digest,alerts,ontology),'sources':{'digest':digest.get('generatedAt'),'alerts':alerts.get('total'),'ontology':ontology.get('summary')}}
