'use client';
import { Plane, Radar, ShieldAlert, Globe, Search, AlertTriangle, Activity, Satellite, MapPin, ChevronDown, ExternalLink, Gem, RotateCw, ServerOff, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

/* ── Types ── */
interface Aircraft {
  icao24: string; callsign: string; lat: number; lng: number;
  alt_m: number; speed_knots: number; heading: number;
  model: string; category: string; registration: string;
  is_military: boolean; is_heli: boolean; is_private: boolean; is_commercial: boolean;
  near_base?: { name: string; distance_km: number };
}

interface Anomaly {
  type: string; severity: string; title: string;
  callsign: string; model: string; lat: number; lng: number; alt_m: number;
  distance_km?: number; base?: string;
}

/* ── Helpers ── */
function catColor(cat: string) {
  return cat === 'military' ? '#FF3D3D' : cat === 'heli' ? '#FF9500' : cat === 'private' || cat === 'jet' ? '#FFD700' : '#00E676';
}
/** Pas d'emojis dans l'interface Pandora : icônes Lucide uniquement. */
function CatIcon({ cat, size = 13, color }: { cat: string; size?: number; color?: string }) {
  const Icon = cat === 'military' ? ShieldAlert : cat === 'heli' ? RotateCw : cat === 'private' || cat === 'jet' ? Gem : Plane;
  return <Icon style={{ width: size, height: size, color }} aria-hidden="true" />;
}
function severityColor(s: string) {
  return s === 'critical' ? '#FF1744' : s === 'high' ? '#FF6B00' : s === 'medium' ? '#FFD700' : '#00E676';
}

export default function AerospacePanel() {
  const [tab, setTab] = useState<'airspace' | 'anomalies' | 'analyze' | 'briefing'>('airspace');
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [total, setTotal] = useState(0);

  // Analyze
  const [searchIcao, setSearchIcao] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Briefing
  const [briefingQ, setBriefingQ] = useState('');
  const [briefingR, setBriefingR] = useState('');
  const [briefingLoad, setBriefingLoad] = useState(false);

  const fetchAirspace = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/aerospace?resource=airspace');
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || `Erreur ${r.status} sur /api/aerospace`);
      setAircraft(d?.aircraft || []);
      setTotal(typeof d?.total === 'number' ? d.total : (d?.aircraft?.length || 0));
      // `source` est renvoyé par le backend : il nomme les sources réelles qui ont répondu.
      setSource(d?.source ? `${d.source}${d.mode === 'direct' ? ' · DIRECT' : ''}` : '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Service aerospace indisponible'); }
    setLoading(false);
  }, []);

  const fetchAnomalies = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/aerospace?resource=anomalies');
      if (r.ok) {
        const d = await r.json();
        setAnomalies(d.anomalies || []);
      }
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'airspace') fetchAirspace();
    else if (tab === 'anomalies') fetchAnomalies();
  }, [tab, fetchAirspace, fetchAnomalies]);

  const handleAnalyze = async () => {
    if (!searchIcao.trim()) return;
    setAnalyzing(true); setAnalyzeResult(null);
    try {
      const r = await fetch('/api/aerospace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icao24: searchIcao.trim() }),
      });
      if (r.ok) setAnalyzeResult(await r.json());
    } catch { /* */ }
    setAnalyzing(false);
  };

  const handleBriefing = async () => {
    setBriefingLoad(true); setBriefingR('');
    try {
      const r = await fetch(`/api/aerospace?resource=briefing&question=${encodeURIComponent(briefingQ)}`);
      if (r.ok) {
        const d = await r.json();
        setBriefingR(d.aiBriefing?.text || 'Briefing non disponible');
      }
    } catch { setBriefingR('Erreur de génération'); }
    setBriefingLoad(false);
  };

  const mil = aircraft.filter(a => a.is_military);
  const heli = aircraft.filter(a => a.is_heli);
  const priv = aircraft.filter(a => a.is_private);
  const comm = aircraft.filter(a => a.is_commercial);

  return (
    <div className="glass-panel">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
        <span className="hud-label truncate" title={source || undefined}>
          {source ? `SOURCE · ${source}` : 'SOURCE · EN ATTENTE'}
        </span>
        <span className="gotham-tag gotham-tag--info flex-shrink-0">
          {total > aircraft.length ? `${aircraft.length} / ${total} A/C` : `${aircraft.length} A/C`}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-[var(--border-primary)]">
        {([
          { id: 'airspace' as const, icon: Plane, label: 'Airspace' },
          { id: 'anomalies' as const, icon: ShieldAlert, label: `Anomalies${anomalies.length ? ` (${anomalies.length})` : ''}` },
          { id: 'analyze' as const, icon: Search, label: 'Analyze' },
          { id: 'briefing' as const, icon: Activity, label: 'Briefing' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono rounded-t transition-colors ${
              tab === t.id ? 'bg-[var(--bg-tertiary)] text-[var(--gold-primary)] border-b-2 border-[var(--gold-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          ><t.icon className="w-3 h-3" />{t.label}</button>
        ))}
      </div>

      <div className="tool-workspace-body">
        {/* ═══════ TAB: AIRSPACE ═══════ */}
        {tab === 'airspace' && (
          <>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="glass-panel-sm p-2 text-center"><Plane className="w-4 h-4 mx-auto mb-1 text-white" /><div className="hud-label text-[9px]">TOTAL</div><div className="text-lg font-bold font-mono">{aircraft.length}</div></div>
              <div className="glass-panel-sm p-2 text-center"><ShieldAlert className="w-4 h-4 mx-auto mb-1 text-[#FF3D3D]" /><div className="hud-label text-[9px]">MILITARY</div><div className="text-lg font-bold font-mono" style={{ color: '#FF3D3D' }}>{mil.length}</div></div>
              <div className="glass-panel-sm p-2 text-center"><RotateCw className="w-4 h-4 mx-auto mb-1 text-[#FF9500]" /><div className="hud-label text-[9px]">HELI</div><div className="text-lg font-bold font-mono" style={{ color: '#FF9500' }}>{heli.length}</div></div>
              <div className="glass-panel-sm p-2 text-center"><Gem className="w-4 h-4 mx-auto mb-1 text-[#FFD700]" /><div className="hud-label text-[9px]">PRIVATE</div><div className="text-lg font-bold font-mono" style={{ color: '#FFD700' }}>{priv.length}</div></div>
            </div>

            <div className="glass-panel-sm flex-1 overflow-y-auto max-h-[380px] styled-scrollbar">
              <div className="flex items-center justify-between mb-1.5">
                <span className="hud-label text-[9px]">LIVE AIRCRAFT ({aircraft.length}{total > aircraft.length ? ` / ${total}` : ''})</span>
                <button onClick={fetchAirspace} className="text-[var(--gold-primary)] hover:underline text-[9px] flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5" /> REFRESH</button>
              </div>
              {loading ? (
                <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" /></div>
              ) : error ? (
                <div className="glass-panel-sm p-3 space-y-2">
                  <div className="flex items-center gap-2 text-[var(--alert-orange)]">
                    <ServerOff className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="hud-label">AIRSPACE INDISPONIBLE</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">{error}</p>
                  <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                    Réponse réelle du service. Aucune donnée synthétique n’est affichée quand la source est muette.
                  </p>
                  <button onClick={fetchAirspace} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--gold-primary)] text-black text-[9px] font-bold font-mono hover:brightness-110">
                    <RefreshCw className="w-3 h-3" /> RÉESSAYER
                  </button>
                </div>
              ) : aircraft.length === 0 ? (
                <div className="glass-panel-sm p-3 text-[10px] text-[var(--text-muted)] text-center leading-relaxed">
                  Aucun aéronef dans les zones interrogées.<br />
                  <span className="text-[9px]">Les six cercles ADSB.lol couvrent l’Amérique du Nord, l’Europe, l’Asie, l’Australie, l’Afrique et l’Amérique du Sud.</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {aircraft.map((a, i) => (
                    <div key={`${a.icao24}-${i}`} className="flex items-start gap-2 p-1.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                      <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: catColor(a.category) }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-[var(--text-primary)] flex items-center gap-1">
                          <CatIcon cat={a.category} color={catColor(a.category)} />
                          <span className="truncate">{a.callsign}</span>
                          {a.near_base && <AlertTriangle className="w-2.5 h-2.5 text-[var(--alert-orange)] flex-shrink-0" aria-label={`Proche de ${a.near_base.name}`} />}
                        </div>
                        <div className="text-[8px] text-[var(--text-muted)]">
                          {a.model} · {a.alt_m ? `${a.alt_m}m` : 'sol'} · {a.speed_knots ? `${a.speed_knots}kt` : 'N/A'}
                          {a.near_base && ` · ${a.near_base.distance_km}km ${a.near_base.name}`}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <span className="text-[8px] font-mono" style={{ color: catColor(a.category) }}>
                          {a.category.toUpperCase()}
                        </span>
                        {a.is_military && <ShieldAlert className="w-2.5 h-2.5 text-[#FF3D3D]" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════ TAB: ANOMALIES ═══════ */}
        {tab === 'anomalies' && (
          <div className="glass-panel-sm flex-1 overflow-y-auto max-h-[440px] styled-scrollbar">
            <div className="flex items-center justify-between mb-1.5">
              <span className="hud-label text-[9px]">ANOMALIES DÉTECTÉES ({anomalies.length})</span>
              <button onClick={fetchAnomalies} className="text-[var(--gold-primary)] hover:underline text-[8px]">REFRESH</button>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" /></div>
            ) : anomalies.length === 0 ? (
              <div className="text-[var(--text-muted)] text-[10px] py-4 text-center">Aucune anomalie détectée</div>
            ) : (
              <div className="space-y-1">
                {anomalies.map((an, i) => (
                  <div key={i} className="flex items-start gap-2 p-1.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                    <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: severityColor(an.severity) }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-[var(--text-primary)] truncate">{an.title}</div>
                      <div className="text-[8px] text-[var(--text-muted)]">
                        {an.callsign} · {an.model} · alt {an.alt_m}m{an.base ? ` · ${an.base}` : ''}{an.distance_km ? ` · ${an.distance_km}km` : ''}
                      </div>
                    </div>
                    <span className={`gotham-tag gotham-tag--${an.severity === 'critical' ? 'critical' : an.severity === 'high' ? 'high' : an.severity === 'medium' ? 'medium' : 'low'}`}>
                      {an.severity.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ TAB: ANALYZE ═══════ */}
        {tab === 'analyze' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input type="text" value={searchIcao} onChange={e => setSearchIcao(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                placeholder="ICAO24 hex (ex: abc123) ou callsign..."
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-3 py-2 text-[11px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]" />
              <button onClick={handleAnalyze} disabled={analyzing}
                className="px-4 py-2 rounded bg-[var(--gold-primary)] text-black text-[10px] font-bold font-mono hover:brightness-110 disabled:opacity-50">
                {analyzing ? '...' : 'TRACK'}
              </button>
            </div>

            {analyzeResult?.aircraft && (
              <div className="glass-panel-sm p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold font-mono flex items-center gap-1">
                    <CatIcon cat={analyzeResult.aircraft.category} color={catColor(analyzeResult.aircraft.category)} />
                    {analyzeResult.aircraft.callsign}
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ backgroundColor: catColor(analyzeResult.aircraft.category) + '22', color: catColor(analyzeResult.aircraft.category), border: `1px solid ${catColor(analyzeResult.aircraft.category)}` }}>
                    {analyzeResult.aircraft.category.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
                  <div><span className="text-[var(--text-muted)]">Model:</span> {analyzeResult.aircraft.model}</div>
                  <div><span className="text-[var(--text-muted)]">ICAO24:</span> {analyzeResult.aircraft.icao24}</div>
                  <div><span className="text-[var(--text-muted)]">Alt:</span> {analyzeResult.aircraft.alt_m}m</div>
                  <div><span className="text-[var(--text-muted)]">Speed:</span> {analyzeResult.aircraft.speed_knots}kt</div>
                  <div><span className="text-[var(--text-muted)]">Heading:</span> {analyzeResult.aircraft.heading}°</div>
                  <div><span className="text-[var(--text-muted)]">Reg:</span> {analyzeResult.aircraft.registration || 'N/A'}</div>
                </div>
                {analyzeResult.aircraft.near_base && (
                  <div className="flex items-center gap-1 text-[9px] text-[var(--alert-orange)]">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Proche de {analyzeResult.aircraft.near_base.name} ({analyzeResult.aircraft.near_base.distance_km}km)
                  </div>
                )}
                {analyzeResult.nearby?.length > 0 && (
                  <>
                    <div className="hud-label text-[8px] mt-2">NEARBY ({analyzeResult.nearby.length})</div>
                    {analyzeResult.nearby.slice(0, 8).map((n: any, i: number) => (
                      <div key={i} className="text-[8px] text-[var(--text-secondary)] flex items-center gap-1">
                        <Plane className="w-2 h-2" style={{ color: catColor(n.category) }} />
                        {n.callsign} · {n.alt_m}m · {n.speed_knots}kt · {(n.category).toUpperCase()}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════ TAB: BRIEFING ═══════ */}
        {tab === 'briefing' && (
          <div className="space-y-3">
            <textarea value={briefingQ} onChange={e => setBriefingQ(e.target.value)}
              placeholder="Question analyste (optionnel)…"
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded p-2.5 text-[11px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)] resize-none h-16" />
            <button onClick={handleBriefing} disabled={briefingLoad}
              className="w-full py-2 rounded bg-[var(--gold-primary)] text-black text-[10px] font-bold font-mono hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2">
              <Activity className="w-3.5 h-3.5" />
              {briefingLoad ? 'ANALYZING...' : 'AIRSPACE BRIEFING'}
            </button>
            {briefingR && (
              <div className="glass-panel-sm p-3 text-[10px] text-[var(--text-primary)] font-mono whitespace-pre-wrap leading-relaxed max-h-[360px] overflow-y-auto styled-scrollbar">
                {briefingR}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
