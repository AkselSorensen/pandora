import os
from datetime import datetime, timezone
from typing import Any
import httpx
from fastapi import FastAPI, Response

PANDORA_BASE_URL=os.getenv('PANDORA_BASE_URL','http://pandora:3000').rstrip('/')
DIGEST_URL=os.getenv('PANDORA_DIGEST_URL','http://pandora-digest:7702').rstrip('/')
ALERTS_URL=os.getenv('PANDORA_ALERTS_URL','http://pandora-alerts:7703').rstrip('/')
ONTOLOGY_URL=os.getenv('PANDORA_ONTOLOGY_URL','http://pandora-ontology:7704').rstrip('/')
CASES_URL=os.getenv('PANDORA_CASES_URL','http://pandora-cases:7705').rstrip('/')
HOTSPOTS_URL=os.getenv('PANDORA_HOTSPOTS_URL','http://pandora-hotspots:7706').rstrip('/')
RISK_URL=os.getenv('PANDORA_RISK_URL','http://pandora-risk:7708').rstrip('/')
app=FastAPI(title='Pandora Metrics Exporter',version='0.1.0')

def esc(v:Any)->str: return str(v or '').replace('\\','\\\\').replace('"','\\"').replace('\n',' ')
def metric(name, value, labels=None):
    labels=labels or {}
    l='{' + ','.join(f'{k}="{esc(v)}"' for k,v in labels.items()) + '}' if labels else ''
    try: val=float(value or 0)
    except Exception: val=0
    return f'{name}{l} {val}'
async def get(client,url):
    try:
        r=await client.get(url,timeout=75); r.raise_for_status(); d=r.json(); return d if isinstance(d,dict) else {}
    except Exception as e:
        return {'_error':str(e)}
@app.get('/health')
async def health(): return {'status':'ok','service':'Pandora Metrics Exporter','base_url':PANDORA_BASE_URL,'timestamp':datetime.now(timezone.utc).isoformat()}
@app.get('/metrics')
async def metrics():
    async with httpx.AsyncClient() as client:
        digest=await get(client,f'{DIGEST_URL}/digest'); alerts=await get(client,f'{ALERTS_URL}/alerts'); ontology=await get(client,f'{ONTOLOGY_URL}/ontology'); cases=await get(client,f'{CASES_URL}/cases'); hotspots=await get(client,f'{HOTSPOTS_URL}/hotspots'); risk=await get(client,f'{RISK_URL}/risk')
    lines=['# HELP pandora_info Pandora exporter info','# TYPE pandora_info gauge',metric('pandora_info',1,{'service':'pandora-metrics'})]
    lines += ['# HELP pandora_digest_risk_score Current digest risk score','# TYPE pandora_digest_risk_score gauge',metric('pandora_digest_risk_score',digest.get('riskScore'),{'posture':digest.get('posture'),'mode':digest.get('mode')})]
    for sev,count in (digest.get('counts') or {}).items():
        if sev in ['critical','high','medium','low']: lines.append(metric('pandora_digest_items_total',count,{'severity':sev}))
    lines += ['# HELP pandora_alerts_total Current alerts by level','# TYPE pandora_alerts_total gauge']
    for lvl,count in (alerts.get('counts') or {}).items(): lines.append(metric('pandora_alerts_total',count,{'level':lvl}))
    lines.append(metric('pandora_alerts_open_total',alerts.get('total'),{'mode':alerts.get('mode')}))
    s=ontology.get('summary') or {}; lines += ['# HELP pandora_ontology_nodes_total Ontology nodes','# TYPE pandora_ontology_nodes_total gauge',metric('pandora_ontology_nodes_total',s.get('nodes')),metric('pandora_ontology_edges_total',s.get('edges'))]
    for typ,count in (s.get('types') or {}).items(): lines.append(metric('pandora_ontology_type_total',count,{'type':typ}))
    lines += [metric('pandora_cases_total',cases.get('total'),{'mode':cases.get('mode')})]
    for c in cases.get('cases') or []: lines.append(metric('pandora_case_priority_total',1,{'priority':c.get('priority'),'status':c.get('status')}))
    lines.append(metric('pandora_hotspots_total',hotspots.get('total'),{'mode':hotspots.get('mode')}))
    for h in hotspots.get('hotspots') or []: lines.append(metric('pandora_hotspot_score',h.get('score'),{'level':h.get('level'),'label':h.get('label')}))
    lines += ['# HELP pandora_risk_engine_score Risk engine global score','# TYPE pandora_risk_engine_score gauge',metric('pandora_risk_engine_score',risk.get('score'),{'level':risk.get('level'),'mode':risk.get('mode')})]
    for k,v in (risk.get('drivers') or {}).items(): lines.append(metric('pandora_risk_driver_score',v,{'driver':k}))
    for name,d in [('digest',digest),('alerts',alerts),('ontology',ontology),('cases',cases),('hotspots',hotspots),('risk',risk)]: lines.append(metric('pandora_api_up',0 if d.get('_error') else 1,{'api':name}))
    return Response('\n'.join(lines)+'\n', media_type='text/plain; version=0.0.4')
