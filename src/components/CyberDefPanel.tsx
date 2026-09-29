'use client';
import { Shield, AlertTriangle, Globe, Search, Radar, ExternalLink, Server, Hash, FileText, Brain, Activity, Cpu, Wifi } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

/* ── Types ── */
interface Posture {
  posture: string; score: number; critical: number; high: number; medium: number; low: number;
  categories: Record<string, number>; total: number;
}

interface Threat {
  id: string; title: string; source: string; severity: string; score: number;
  category: string; timestamp?: string; url?: string; ioc?: string;
}

interface SourceStatus {
  name: string; category: string; ok: boolean; count: number; error?: string;
}

interface LiveThreatsResponse {
  posture: Posture; total: number; threats: Threat[]; sources: SourceStatus[];
}

interface AnalyzeResult {
  ip?: string; domain?: string; hash?: string;
  timestamp: string; geo?: any; reputation?: { score: number; severity: string; reasons: string[] };
  rdap?: any; certificates?: number; malware?: any; enrichment?: any;
}

/* ── Helpers ── */
function severityColor(s: string) {
  return s === 'critical' ? '#FF1744' : s === 'high' ? '#FF6B00' : s === 'medium' ? '#FFD700' : '#00E676';
}

function severityTag(s: string) {
  const cls = s === 'critical' ? 'gotham-tag--critical' : s === 'high' ? 'gotham-tag--high' : s === 'medium' ? 'gotham-tag--medium' : 'gotham-tag--low';
  return <span className={`gotham-tag ${cls}`}>{s.toUpperCase()}</span>;
}

/* ── Component ── */
export default function CyberDefPanel() {
  const [liveData, setLiveData] = useState<LiveThreatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'threats' | 'analyze' | 'cves' | 'briefing'>('threats');

  // Analyse
  const [analyzeType, setAnalyzeType] = useState<'ip' | 'domain' | 'hash'>('ip');
  const [analyzeInput, setAnalyzeInput] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Briefing
  const [briefingContext, setBriefingContext] = useState('');
  const [briefingResult, setBriefingResult] = useState('');
  const [briefingLoading, setBriefingLoading] = useState(false);

  // CVEs
  const [cves, setCves] = useState<any[]>([]);
  const [cvesLoading, setCvesLoading] = useState(false);

  // ── Fetch live threats ──
  const fetchThreats = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/cyberdef?resource=threats');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setLiveData(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CyberDef API unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchThreats(); }, [fetchThreats]);

  // ── Fetch CVEs ──
  const fetchCVEs = useCallback(async () => {
    setCvesLoading(true);
    try {
      const r = await fetch('/api/cyberdef?resource=cves');
      if (r.ok) {
        const data = await r.json();
        setCves(data.cves || []);
      }
    } catch { /* ignore */ }
    setCvesLoading(false);
  }, []);

  useEffect(() => { if (tab === 'cves') fetchCVEs(); }, [tab, fetchCVEs]);

  // ── Analyze IOC ──
  const handleAnalyze = async () => {
    if (!analyzeInput.trim()) return;
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const r = await fetch('/api/cyberdef', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: `analyze-${analyzeType}`, [analyzeType]: analyzeInput.trim() }),
      });
      if (r.ok) {
        setAnalyzeResult(await r.json());
      }
    } catch { /* ignore */ }
    setAnalyzing(false);
  };

  // ── AI Briefing ──
  const handleBriefing = async () => {
    setBriefingLoading(true);
    setBriefingResult('');
    try {
      const r = await fetch('/api/cyberdef', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'briefing', context: briefingContext }),
      });
      if (r.ok) {
        const data = await r.json();
        setBriefingResult(data.aiBriefing?.text || 'Briefing non disponible');
      }
    } catch { setBriefingResult('Erreur de génération'); }
    setBriefingLoading(false);
  };

  const posture = liveData?.posture;
  const threats = liveData?.threats || [];
  const sources = liveData?.sources || [];
  const postureColor = posture?.posture === 'CRITICAL' ? '#FF1744' : posture?.posture === 'ELEVATED' ? '#FF6B00' : posture?.posture === 'WATCH' ? '#FFD700' : '#00E676';

  return (
    <div className="glass-panel">
      <div className="tool-workspace-header">
        <div>
          <span className="hud-label">PANDORA CYBERDEF</span>
          <h2>Cyber Defence Operations</h2>
        </div>
        <span className="gotham-tag gotham-tag--critical" style={{ backgroundColor: postureColor + '22', color: postureColor, borderColor: postureColor }}>
          {posture?.posture || 'N/A'} {posture?.score != null ? `${posture.score}/100` : ''}
        </span>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-[var(--border-primary)]">
        {([
          { id: 'threats' as const, icon: Radar, label: 'Live Threats' },
          { id: 'analyze' as const, icon: Search, label: 'Analyze IOC' },
          { id: 'cves' as const, icon: FileText, label: 'Top CVEs' },
          { id: 'briefing' as const, icon: Brain, label: 'AI Briefing' },
        ]).map((t) => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono rounded-t transition-colors ${
              tab === t.id ? 'bg-[var(--bg-tertiary)] text-[var(--gold-primary)] border-b-2 border-[var(--gold-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="tool-workspace-body">
        {/* ══════════════ TAB: THREATS ══════════════ */}
        {tab === 'threats' && (
          <>
            {/* Posture summary cards */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="glass-panel-sm p-2.5 text-center">
                <AlertTriangle className="w-5 h-5 mx-auto mb-1" style={{ color: severityColor('critical') }} />
                <div className="hud-label text-[9px]">Critical</div>
                <div className="text-lg font-bold font-mono" style={{ color: severityColor('critical') }}>{posture?.critical || 0}</div>
              </div>
              <div className="glass-panel-sm p-2.5 text-center">
                <Activity className="w-5 h-5 mx-auto mb-1" style={{ color: severityColor('high') }} />
                <div className="hud-label text-[9px]">High</div>
                <div className="text-lg font-bold font-mono" style={{ color: severityColor('high') }}>{posture?.high || 0}</div>
              </div>
              <div className="glass-panel-sm p-2.5 text-center">
                <Shield className="w-5 h-5 mx-auto mb-1" style={{ color: severityColor('medium') }} />
                <div className="hud-label text-[9px]">Medium</div>
                <div className="text-lg font-bold font-mono" style={{ color: severityColor('medium') }}>{posture?.medium || 0}</div>
              </div>
              <div className="glass-panel-sm p-2.5 text-center">
                <Globe className="w-5 h-5 mx-auto mb-1" style={{ color: '#00E676' }} />
                <div className="hud-label text-[9px]">Sources</div>
                <div className="text-lg font-bold font-mono" style={{ color: '#00E676' }}>{sources.filter(s => s.ok).length}/{sources.length}</div>
              </div>
            </div>

            {/* Categories */}
            {posture?.categories && Object.keys(posture.categories).length > 0 && (
              <div className="glass-panel-sm p-2 mb-3">
                <div className="hud-label text-[9px] mb-1.5">CATEGORIES</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(posture.categories).slice(0, 10).map(([cat, count]) => (
                    <span key={cat} className="px-2 py-0.5 rounded text-[9px] font-mono bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]">
                      {cat.toUpperCase()} <span className="text-[var(--gold-primary)]">{count as number}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Threats list */}
            <div className="glass-panel-sm flex-1 overflow-y-auto max-h-[320px] styled-scrollbar">
              <div className="hud-label text-[9px] mb-1.5 flex items-center justify-between">
                <span>LIVE THREATS ({threats.length})</span>
                <button onClick={fetchThreats} className="text-[var(--gold-primary)] hover:underline text-[8px]">REFRESH</button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : error ? (
                <div className="text-[var(--alert-orange)] text-[10px] p-2">{error}</div>
              ) : threats.length === 0 ? (
                <div className="text-[var(--text-muted)] text-[10px] py-4 text-center">No threats detected</div>
              ) : (
                <div className="space-y-1">
                  {threats.slice(0, 40).map((t) => (
                    <div key={t.id} className="flex items-start gap-2 p-1.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                      <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: severityColor(t.severity) }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-[var(--text-primary)] truncate">{t.title}</div>
                        <div className="text-[8px] text-[var(--text-muted)]">
                          {t.source} · {t.category}
                          {t.timestamp && ` · ${new Date(t.timestamp).toISOString().slice(0, 19)}`}
                        </div>
                      </div>
                      <div className="flex-shrink-0">{severityTag(t.severity)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════ TAB: ANALYZE IOC ══════════════ */}
        {tab === 'analyze' && (
          <div className="space-y-3">
            <div className="flex gap-1">
              {(['ip', 'domain', 'hash'] as const).map((t) => (
                <button key={t}
                  onClick={() => setAnalyzeType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono rounded transition-colors ${
                    analyzeType === t ? 'bg-[var(--gold-primary)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                  }`}
                >
                  {t === 'ip' ? <Server className="w-3 h-3" /> : t === 'domain' ? <Globe className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={analyzeInput}
                onChange={(e) => setAnalyzeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                placeholder={analyzeType === 'ip' ? '8.8.8.8' : analyzeType === 'domain' ? 'example.com' : 'sha256 hash...'}
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-3 py-2 text-[11px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)]"
              />
              <button onClick={handleAnalyze} disabled={analyzing}
                className="px-4 py-2 rounded bg-[var(--gold-primary)] text-black text-[10px] font-bold font-mono hover:brightness-110 transition-all disabled:opacity-50"
              >
                {analyzing ? '...' : 'SCAN'}
              </button>
            </div>

            {analyzeResult && (
              <div className="glass-panel-sm p-3 space-y-2">
                {/* Reputation */}
                {analyzeResult.reputation && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">Reputation Score</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono" style={{ color: severityColor(analyzeResult.reputation.severity) }}>
                        {analyzeResult.reputation.score}/100
                      </span>
                      {severityTag(analyzeResult.reputation.severity)}
                    </div>
                  </div>
                )}

                {/* Reasons */}
                {(analyzeResult.reputation?.reasons ?? []).length > 0 && (
                  <div className="space-y-1">
                    <div className="hud-label text-[8px]">SIGNALS</div>
                    {(analyzeResult.reputation?.reasons ?? []).map((r, i) => (
                      <div key={i} className="text-[9px] text-[var(--text-secondary)] flex items-start gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 text-[var(--alert-orange)] flex-shrink-0" />
                        {r}
                      </div>
                    ))}
                  </div>
                )}

                {/* Geo */}
                {analyzeResult.geo && (
                  <div className="text-[9px] text-[var(--text-secondary)] flex items-center gap-1">
                    <Globe className="w-2.5 h-2.5 text-[var(--cyan-primary)]" />
                    {[analyzeResult.geo.city, analyzeResult.geo.regionName, analyzeResult.geo.country].filter(Boolean).join(', ')}
                    {analyzeResult.geo.isp && ` · ${analyzeResult.geo.isp}`}
                  </div>
                )}

                {/* Malware */}
                {analyzeResult.malware && (
                  <div className="text-[9px] text-[var(--alert-red)]">
                    <AlertTriangle className="w-2.5 h-2.5 inline mr-1" />
                    MALWARE: {analyzeResult.malware.signature || 'unknown'} · type: {analyzeResult.malware.file_type || '?'}
                  </div>
                )}

                {/* Certificates */}
                {analyzeResult.certificates != null && (
                  <div className="text-[9px] text-[var(--text-secondary)] flex items-center gap-1">
                    <FileText className="w-2.5 h-2.5" />
                    {analyzeResult.certificates} certificates émis
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ TAB: CVEs ══════════════ */}
        {tab === 'cves' && (
          <div className="glass-panel-sm flex-1 overflow-y-auto max-h-[400px] styled-scrollbar">
            <div className="flex items-center justify-between mb-2">
              <span className="hud-label text-[9px]">TOP CVEs (CISA KEV + NVD)</span>
              <button onClick={fetchCVEs} className="text-[var(--gold-primary)] hover:underline text-[8px]">REFRESH</button>
            </div>
            {cvesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : cves.length === 0 ? (
              <div className="text-[var(--text-muted)] text-[10px] py-4 text-center">
                {error || 'No CVEs retrieved'}
              </div>
            ) : (
              <div className="space-y-1">
                {cves.map((cve: any) => (
                  <div key={cve.id} className="flex items-start gap-2 p-1.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                    <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: severityColor(cve.severity) }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-[var(--text-primary)] truncate">{cve.title}</div>
                      <div className="text-[8px] text-[var(--text-muted)]">{cve.source} · CVSS {cve.score}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {severityTag(cve.severity)}
                      {cve.url && (
                        <a href={cve.url} target="_blank" rel="noopener noreferrer" className="text-[var(--text-muted)] hover:text-[var(--gold-primary)]">
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ TAB: AI BRIEFING ══════════════ */}
        {tab === 'briefing' && (
          <div className="space-y-3">
            <textarea
              value={briefingContext}
              onChange={(e) => setBriefingContext(e.target.value)}
              placeholder="Question analyste (optionnel)…"
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded p-2.5 text-[11px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--gold-primary)] resize-none h-16"
            />
            <button onClick={handleBriefing} disabled={briefingLoading}
              className="w-full py-2 rounded bg-[var(--gold-primary)] text-black text-[10px] font-bold font-mono hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Brain className="w-3.5 h-3.5" />
              {briefingLoading ? 'GENERATING...' : 'GENERATE AI BRIEFING'}
            </button>
            {briefingResult && (
              <div className="glass-panel-sm p-3 text-[10px] text-[var(--text-primary)] font-mono whitespace-pre-wrap leading-relaxed max-h-[360px] overflow-y-auto styled-scrollbar">
                {briefingResult}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
