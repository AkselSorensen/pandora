'use client';
import { Shield, MapPin, Building, Activity, Globe, Search, ChevronDown, ExternalLink } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

export default function DGSIPanel() {
  const [tab, setTab] = useState<'dashboard' | 'zone' | 'infra'>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [zoneResult, setZoneResult] = useState<any>(null);
  const [infraResult, setInfraResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchLat, setSearchLat] = useState('48.8566');
  const [searchLng, setSearchLng] = useState('2.3522');
  const [searchRadius, setSearchRadius] = useState('5');

  useEffect(() => {
    fetch('/api/dgsi?resource=dashboard').then(r => r.ok && r.json()).then(d => { setDashboard(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const searchZone = useCallback(async (type: 'zone-intel' | 'zone-infra') => {
    setLoading(true);
    try {
      const r = await fetch(`/api/dgsi?resource=${type}&lat=${searchLat}&lng=${searchLng}&radius=${searchRadius}`);
      if (r.ok) {
        const d = await r.json();
        if (type === 'zone-intel') setZoneResult(d);
        else setInfraResult(d);
      }
    } catch { }
    setLoading(false);
  }, [searchLat, searchLng, searchRadius]);

  return (
    <div className="glass-panel">
      <div className="tool-workspace-header">
        <div>
          <span className="hud-label">PANDORA DGSI</span>
          <h2>Renseignement Territorial</h2>
        </div>
        <span className="gotham-tag gotham-tag--info">{dashboard?.monitoredZones || '---'} ZONES</span>
      </div>

      <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-[var(--border-primary)]">
        {([
          { id: 'dashboard' as const, icon: Activity, label: 'Dashboard' },
          { id: 'zone' as const, icon: MapPin, label: 'Zone Intel' },
          { id: 'infra' as const, icon: Building, label: 'Infrastructure' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono rounded-t transition-colors ${
              tab === t.id ? 'bg-[var(--bg-tertiary)] text-[var(--gold-primary)] border-b-2 border-[var(--gold-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          ><t.icon className="w-3 h-3" />{t.label}</button>
        ))}
      </div>

      <div className="tool-workspace-body">
        {tab === 'dashboard' && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="glass-panel-sm p-2.5 text-center">
                <MapPin className="w-5 h-5 mx-auto mb-1 text-[var(--gold-primary)]" />
                <div className="hud-label text-[9px]">Zones surveillées</div>
                <div className="text-lg font-bold font-mono">{dashboard?.monitoredZones || 0}</div>
              </div>
              <div className="glass-panel-sm p-2.5 text-center">
                <Building className="w-5 h-5 mx-auto mb-1 text-[var(--cyan-primary)]" />
                <div className="hud-label text-[9px]">Types infra</div>
                <div className="text-lg font-bold font-mono">{dashboard?.infrastructureTypes || 0}</div>
              </div>
              <div className="glass-panel-sm p-2.5 text-center">
                <Shield className="w-5 h-5 mx-auto mb-1 text-[var(--alert-red)]" />
                <div className="hud-label text-[9px]">Départements</div>
                <div className="text-lg font-bold font-mono">{dashboard?.departments || 0}</div>
              </div>
            </div>

            <div className="glass-panel-sm p-3">
              <div className="hud-label text-[9px] mb-1.5">ZONES PRIORITAIRES</div>
              <div className="space-y-1 max-h-[320px] overflow-y-auto styled-scrollbar">
                {(dashboard?.zones || []).map((z: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                    <div className={`w-2 h-2 rounded-full ${z.priority === 'critical' ? 'bg-[#FF1744]' : z.priority === 'high' ? 'bg-[#FF6B00]' : 'bg-[#FFD700]'}`} />
                    <div className="flex-1">
                      <div className="text-[10px] text-[var(--text-primary)]">{z.name}</div>
                      <div className="text-[8px] text-[var(--text-muted)]">{z.lat.toFixed(2)}, {z.lng.toFixed(2)} · {z.radius_km}km</div>
                    </div>
                    <span className="text-[8px] font-mono uppercase" style={{ color: z.priority === 'critical' ? '#FF1744' : z.priority === 'high' ? '#FF6B00' : '#FFD700' }}>{z.priority}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'zone' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <input type="text" value={searchLat} onChange={e => setSearchLat(e.target.value)}
                placeholder="Latitude" className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]" />
              <input type="text" value={searchLng} onChange={e => setSearchLng(e.target.value)}
                placeholder="Longitude" className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]" />
              <input type="text" value={searchRadius} onChange={e => setSearchRadius(e.target.value)}
                placeholder="Rayon km" className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]" />
            </div>
            <button onClick={() => searchZone('zone-intel')}
              className="w-full py-2 rounded bg-[var(--gold-primary)] text-black text-[10px] font-bold font-mono hover:brightness-110 transition-all flex items-center justify-center gap-2">
              <Globe className="w-3.5 h-3.5" /> ANALYSER LA ZONE
            </button>

            {loading && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" /></div>}

            {zoneResult?.location && (
              <div className="glass-panel-sm p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[var(--gold-primary)]" />
                  <div>
                    <div className="text-[11px] font-bold font-mono">{zoneResult.location.city}</div>
                    <div className="text-[8px] text-[var(--text-muted)]">{zoneResult.location.country}</div>
                  </div>
                </div>
                {zoneResult.location.department && (
                  <div className="text-[9px] text-[var(--text-secondary)]">
                    Département: {zoneResult.location.department.name} ({zoneResult.location.department.num}) · {zoneResult.location.department.region}
                  </div>
                )}
                {zoneResult.wiki_summary && (
                  <div className="text-[9px] text-[var(--text-secondary)] leading-relaxed">{zoneResult.wiki_summary.slice(0, 300)}</div>
                )}
                {zoneResult.nearby_zones?.length > 0 && (
                  <div>
                    <div className="hud-label text-[8px] mb-1">ZONES À PROXIMITÉ</div>
                    {zoneResult.nearby_zones.map((z: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5 text-[8px] text-[var(--text-muted)]">
                        <div className={`w-1.5 h-1.5 rounded-full ${z.priority === 'critical' ? 'bg-[#FF1744]' : z.priority === 'high' ? 'bg-[#FF6B00]' : 'bg-[#FFD700]'}`} />
                        {z.name} · {z.priority.toUpperCase()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'infra' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <input type="text" value={searchLat} onChange={e => setSearchLat(e.target.value)} placeholder="Latitude"
                className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]" />
              <input type="text" value={searchLng} onChange={e => setSearchLng(e.target.value)} placeholder="Longitude"
                className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]" />
              <input type="text" value={searchRadius} onChange={e => setSearchRadius(e.target.value)} placeholder="Rayon km"
                className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]" />
            </div>
            <button onClick={() => searchZone('zone-infra')}
              className="w-full py-2 rounded bg-[var(--gold-primary)] text-black text-[10px] font-bold font-mono hover:brightness-110 transition-all flex items-center gap-2 justify-center">
              <Building className="w-3.5 h-3.5" /> SCAN INFRASTRUCTURE
            </button>

            {loading && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" /></div>}

            {infraResult?.breakdown && (
              <div className="space-y-2 max-h-[380px] overflow-y-auto styled-scrollbar">
                {Object.entries(infraResult.breakdown).map(([type, count]) => {
                  const items = infraResult.infrastructure?.[type] || [];
                  return (
                    <div key={type} className="glass-panel-sm p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-mono font-bold uppercase">{type}</span>
                        <span className="text-[9px] font-mono text-[var(--gold-primary)]">{count as number}</span>
                      </div>
                      {items.slice(0, 5).map((item: any, i: number) => (
                        <div key={i} className="flex items-center gap-1.5 text-[8px] text-[var(--text-muted)] py-0.5">
                          <span>{item.icon}</span>
                          <span className="truncate">{item.name}</span>
                          <span className="text-[var(--text-muted)]/50 ml-auto">{item.lat.toFixed(3)}, {item.lng.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
