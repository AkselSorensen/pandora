'use client';
import { Globe, AlertTriangle, Activity, TrendingUp, Map, Shield } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

export default function TerritorialPanel() {
  const [tab, setTab] = useState<'riskmap' | 'score' | 'hotspots'>('riskmap');
  const [riskMap, setRiskMap] = useState<any>(null);
  const [riskScore, setRiskScore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchLat, setSearchLat] = useState('48.8566');
  const [searchLng, setSearchLng] = useState('2.3522');

  useEffect(() => {
    fetch('/api/territorial?resource=risk-map').then(r => r.ok && r.json()).then(d => { setRiskMap(d); setLoading(false); }).catch(() => setLoading(false));
    fetch('/api/territorial?resource=hotspots').then(r => r.ok && r.json()).then(d => setRiskMap((prev: any) => ({ ...prev, hotspots: d }))).catch(() => {});
  }, []);

  const searchRisk = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/territorial?resource=risk-score&lat=${searchLat}&lng=${searchLng}`);
      if (r.ok) setRiskScore(await r.json());
    } catch {}
    setLoading(false);
  }, [searchLat, searchLng]);

  const levelColor = (level: string) =>
    level === 'CRITICAL' ? '#FF1744' : level === 'ELEVATED' ? '#FF6B00' : level === 'WATCH' ? '#FFD700' : '#00E676';

  return (
    <div className="glass-panel">
      <div className="tool-workspace-header">
        <div>
          <span className="hud-label">PANDORA TERRITORIAL</span>
          <h2>Global Risk Assessment</h2>
        </div>
        {riskMap && (
          <span className="gotham-tag" style={{ backgroundColor: levelColor(riskMap.level) + '22', color: levelColor(riskMap.level), borderColor: levelColor(riskMap.level) }}>
            {riskMap.level} {riskMap.globalScore}/100
          </span>
        )}
      </div>

      <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-[var(--border-primary)]">
        {([
          { id: 'riskmap' as const, icon: Globe, label: 'Risk Map' },
          { id: 'score' as const, icon: Activity, label: 'Score Zone' },
          { id: 'hotspots' as const, icon: AlertTriangle, label: `Hotspots${riskMap?.hotspots?.hotspots?.length ? ` (${riskMap.hotspots.hotspots.length})` : ''}` },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono rounded-t transition-colors ${
              tab === t.id ? 'bg-[var(--bg-tertiary)] text-[var(--gold-primary)] border-b-2 border-[var(--gold-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          ><t.icon className="w-3 h-3" />{t.label}</button>
        ))}
      </div>

      <div className="tool-workspace-body">
        {tab === 'riskmap' && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="glass-panel-sm p-2.5 text-center">
                <Globe className="w-5 h-5 mx-auto mb-1 text-[var(--gold-primary)]" />
                <div className="hud-label text-[9px]">Score Global</div>
                <div className="text-lg font-bold font-mono">{riskMap?.globalScore || 0}</div>
              </div>
              <div className="glass-panel-sm p-2.5 text-center">
                <Map className="w-5 h-5 mx-auto mb-1 text-[var(--cyan-primary)]" />
                <div className="hud-label text-[9px]">Zones</div>
                <div className="text-lg font-bold font-mono">{riskMap?.totalZones || 0}</div>
              </div>
              <div className="glass-panel-sm p-2.5 text-center">
                <TrendingUp className="w-5 h-5 mx-auto mb-1 text-[var(--alert-orange)]" />
                <div className="hud-label text-[9px]">Niveau</div>
                <div className="text-lg font-bold font-mono" style={{ color: levelColor(riskMap?.level || 'ROUTINE') }}>{riskMap?.level || 'N/A'}</div>
              </div>
            </div>

            <div className="glass-panel-sm flex-1 overflow-y-auto max-h-[380px] styled-scrollbar">
              <div className="hud-label text-[9px] mb-1.5">ZONES DE RISQUE</div>
              <div className="space-y-1">
                {(riskMap?.zones || []).map((z: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: z.color }} />
                    <div className="flex-1">
                      <div className="text-[10px] text-[var(--text-primary)]">{z.name}</div>
                      <div className="text-[8px] text-[var(--text-muted)]">Cyber: {z.drivers?.cyber || 0} · DGSI: {z.drivers?.dgsi || 0}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold font-mono" style={{ color: z.color }}>{z.score}</span>
                      <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: z.color + '22', color: z.color, border: `1px solid ${z.color}` }}>{z.level}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'score' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={searchLat} onChange={e => setSearchLat(e.target.value)} placeholder="Latitude"
                className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]" />
              <input type="text" value={searchLng} onChange={e => setSearchLng(e.target.value)} placeholder="Longitude"
                className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]" />
            </div>
            <button onClick={searchRisk}
              className="w-full py-2 rounded bg-[var(--gold-primary)] text-black text-[10px] font-bold font-mono hover:brightness-110 transition-all flex items-center gap-2 justify-center">
              <Shield className="w-3.5 h-3.5" /> CALCULER LE RISQUE
            </button>

            {loading && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" /></div>}

            {riskScore && (
              <div className="glass-panel-sm p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold font-mono">Score: <span style={{ color: riskScore.color }}>{riskScore.globalScore}/100</span></span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ backgroundColor: riskScore.color + '22', color: riskScore.color, border: `1px solid ${riskScore.color}` }}>{riskScore.level}</span>
                </div>
                {Object.entries(riskScore.drivers || {}).map(([key, val]: any) => (
                  <div key={key} className="flex items-center justify-between text-[9px] font-mono">
                    <span className="text-[var(--text-muted)] uppercase">{key}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, val.score)}%`, backgroundColor: levelColor(val.score >= 70 ? 'CRITICAL' : val.score >= 45 ? 'ELEVATED' : val.score >= 20 ? 'WATCH' : 'ROUTINE') }} />
                      </div>
                      <span className="text-[var(--text-secondary)]">{val.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'hotspots' && (
          <div className="glass-panel-sm flex-1 overflow-y-auto max-h-[440px] styled-scrollbar">
            <div className="hud-label text-[9px] mb-1.5">HOTSPOTS ({riskMap?.hotspots?.total || 0})</div>
            {(riskMap?.hotspots?.hotspots || []).length === 0 ? (
              <div className="text-[var(--text-muted)] text-[10px] py-4 text-center">Aucun hotspot actif</div>
            ) : (
              <div className="space-y-1">
                {(riskMap?.hotspots?.hotspots || []).map((h: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: h.color }} />
                    <div className="flex-1">
                      <div className="text-[10px] text-[var(--text-primary)]">{h.name}</div>
                      <div className="text-[8px] text-[var(--text-muted)]">{h.lat.toFixed(1)}, {h.lng.toFixed(1)}</div>
                    </div>
                    <span className="text-sm font-bold font-mono" style={{ color: h.color }}>{h.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
