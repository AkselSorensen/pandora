'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Activity, ArrowLeft, Download, Radio, RefreshCw, Satellite, Shield, TriangleAlert, Zap } from 'lucide-react';

type Country = { key: string; name: string; region: string; arsenal_band: string; estimated_warheads_band: string };
type SourceItem = { title?: string; domain?: string; url?: string; connector?: string; category?: string; sourceType?: string };
type TimelineSourceItem = SourceItem & { seenDate?: string; pubDate?: string };
type SourceCount = { name: string; count: number };
type NuclearContext = {
  pairType?: 'nuclear_vs_nuclear' | 'nuclear_vs_non_nuclear' | 'non_nuclear_vs_non_nuclear';
  nuclearPairFactor?: number;
  actorNuclearCapability?: number;
  targetNuclearCapability?: number;
  actorNuclearStatus?: string;
  targetNuclearStatus?: string;
  summary?: string;
};
type Result = {
  generatedAt?: string;
  scores?: Record<string, number>;
  scenario?: { key?: string; label?: string; regionFocus?: string; note?: string };
  scenarioScores?: Record<string, number>;
  aiAssessment?: {
    enabled?: boolean;
    mode?: string;
    model?: string;
    generatedAt?: string;
    warning?: string;
    text?: string;
  };
  recommendations?: string[];
  nuclearContext?: NuclearContext;
  liveSignals?: {
    source?: string;
    articleCount?: number;
    militaryMentions?: number;
    nuclearMentions?: number;
    diplomacyMentions?: number;
    sanctionMentions?: number;
    sourceCount?: number;
    sourceNames?: string[];
    sourceCounts?: SourceCount[];
    sourceCategories?: string[];
    sourceCategoryCounts?: SourceCount[];
    connectorCounts?: SourceCount[];
    sourceRegistrySize?: number;
    sourceRegistryCategories?: string[];
    maxAnalyzedArticles?: number;
    topArticles?: TimelineSourceItem[];
  };
};

type LoadingStage = {
  id: 'idle' | 'prepare' | 'collect' | 'receive' | 'parse' | 'render' | 'done';
  label: string;
  progress: number;
};

type DeterrenceHistoryItem = {
  id: string;
  generatedAt: string;
  actor: string;
  target: string;
  actorName: string;
  targetName: string;
  escalation: number;
  stability: number;
  deterrence: number;
  miscalc: number;
  nuclearMentions: number;
  militaryMentions: number;
  sourceCount: number;
  articleCount: number;
  level: number;
  levelLabel: string;
};

type TimelineFilter = 'all' | 'nuclear' | 'military' | 'diplomacy' | 'sanctions' | 'high_trust' | 'institutional';
type WatchlistItem = { actor: string; target: string; label: string; addedAt: string };
type AlertThresholds = { risk: number; nuclearMentions: number; delta: number; minSources: number };

const LOADING_STAGES: LoadingStage[] = [
  { id: 'prepare', label: 'Préparation requête', progress: 8 },
  { id: 'collect', label: 'Collecte sources web', progress: 34 },
  { id: 'receive', label: 'Réception réponse OSINT', progress: 64 },
  { id: 'parse', label: 'Lecture du renseignement', progress: 82 },
  { id: 'render', label: 'Calcul du risque nucléaire', progress: 94 },
  { id: 'done', label: 'Analyse terminée', progress: 100 },
];

const IDLE_LOADING_STAGE: LoadingStage = { id: 'idle', label: 'En attente', progress: 0 };

const SCENARIO_OPTIONS = [
  { key: 'diplomatic_crisis', label: 'Crise diplomatique' },
  { key: 'deterrence_signal', label: 'Signal de dissuasion' },
  { key: 'accidental_launch_fear', label: 'Crainte de lancement accidentel' },
  { key: 'major_escalation', label: 'Escalade majeure' },
] as const;

const CRISIS_PRESETS = [
  { label: 'Baltique / OTAN-Russie', actor: 'france', target: 'russia', note: 'Flanc Est européen' },
  { label: 'Taïwan / USA-Chine', actor: 'united_states', target: 'china', note: 'Indo-Pacifique' },
  { label: 'Inde-Pakistan', actor: 'india', target: 'pakistan', note: 'Dissuasion régionale' },
  { label: 'Corée du Nord-USA', actor: 'north_korea', target: 'united_states', note: 'Missiles / garanties' },
  { label: 'France-Russie', actor: 'france', target: 'russia', note: 'Europe stratégique' },
] as const;

const HISTORY_STORAGE_KEY = 'pandora.deterrence.history.v1';
const WATCHLIST_STORAGE_KEY = 'pandora.deterrence.watchlist.v1';
const ALERT_THRESHOLDS_STORAGE_KEY = 'pandora.deterrence.thresholds.v1';

const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = { risk: 65, nuclearMentions: 2, delta: 10, minSources: 3 };
const AUTO_REFRESH_OPTIONS = [0, 5, 15, 30] as const;

const TIMELINE_FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'nuclear', label: 'Nucléaire' },
  { key: 'military', label: 'Militaire' },
  { key: 'diplomacy', label: 'Diplomatie' },
  { key: 'sanctions', label: 'Sanctions' },
  { key: 'high_trust', label: 'Haute confiance' },
  { key: 'institutional', label: 'Institutionnel' },
];

const loadingStageById = LOADING_STAGES.reduce<Record<LoadingStage['id'], LoadingStage>>(
  (acc, stage) => ({ ...acc, [stage.id]: stage }),
  { idle: IDLE_LOADING_STAGE } as Record<LoadingStage['id'], LoadingStage>
);

function riskLabel(score: number) {
  if (score >= 75) return 'Risque nucléaire élevé';
  if (score >= 50) return 'Risque nucléaire possible / sous surveillance';
  if (score >= 30) return 'Risque nucléaire faible à modéré';
  return 'Risque nucléaire faible';
}

function nuclearStatusLabel(status?: string) {
  if (status === 'major_nuclear_power') return 'puissance nucléaire majeure';
  if (status === 'nuclear_power') return 'puissance nucléaire';
  if (status === 'undeclared_or_ambiguous') return 'capacité non déclarée / ambiguë';
  return 'sans capacité nucléaire déclarée';
}

function riskColor(score: number) {
  if (score >= 75) return 'var(--alert-red)';
  if (score >= 50) return '#C18447';
  if (score >= 30) return 'var(--gold-primary)';
  return 'var(--alert-green)';
}

function formatElapsed(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDelta(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function strategicLevel(score: number) {
  if (score >= 80) {
    return { level: 1, label: 'Crise majeure', detail: 'Score d’escalade très élevé sur les données reçues.', color: 'var(--alert-red)' };
  }
  if (score >= 60) {
    return { level: 2, label: 'Escalade critique', detail: 'Risque stratégique élevé nécessitant une surveillance renforcée.', color: 'var(--alert-red)' };
  }
  if (score >= 40) {
    return { level: 3, label: 'Risque stratégique actif', detail: 'Plusieurs indicateurs justifient un suivi analytique actif.', color: '#C18447' };
  }
  if (score >= 20) {
    return { level: 4, label: 'Tension stratégique faible', detail: 'Tension présente mais contenue par les indicateurs actuels.', color: 'var(--gold-primary)' };
  }
  return { level: 5, label: 'Surveillance normale', detail: 'Aucun signal critique dominant dans les données reçues.', color: 'var(--alert-green)' };
}

function pairTypeLabel(pairType?: NuclearContext['pairType']) {
  if (pairType === 'nuclear_vs_nuclear') return 'Nucléaire ↔ nucléaire';
  if (pairType === 'nuclear_vs_non_nuclear') return 'Nucléaire ↔ non nucléaire';
  if (pairType === 'non_nuclear_vs_non_nuclear') return 'Non nucléaire ↔ non nucléaire';
  return 'Contexte paire non fourni';
}

function coverageAssessment(articleCount: number, sourceCount: number, hasNuclearContext: boolean) {
  const coverageScore = Math.min(100, articleCount * 4 + sourceCount * 8 + (hasNuclearContext ? 20 : 0));
  if (coverageScore >= 75) return { label: 'Couverture OSINT forte', score: coverageScore, detail: `${articleCount} article(s), ${sourceCount} source(s) unique(s), contexte nucléaire disponible.` };
  if (coverageScore >= 45) return { label: 'Couverture OSINT correcte', score: coverageScore, detail: `${articleCount} article(s), ${sourceCount} source(s) unique(s) exploité(s).` };
  if (coverageScore > 0) return { label: 'Couverture OSINT limitée', score: coverageScore, detail: `${articleCount} article(s), ${sourceCount} source(s) unique(s) : prudence sur l’interprétation.` };
  return { label: 'Couverture OSINT absente', score: 0, detail: 'Aucun article/source direct reçu par l’interface pour cette analyse.' };
}

function sourceCredibility(source: { name?: string; domain?: string; connector?: string; category?: string }) {
  const raw = `${source.name || source.domain || ''} ${source.connector || ''} ${source.category || ''}`.toLowerCase();
  if (/sipri|iaea|un|nato|gov|defense|defence|reuters|ap news|associated press|afp|bbc|france24|dw|rfi|nuclear_institutional|nuclear_regulator|nuclear_safety|nonproliferation|defense_research|institutional/.test(raw)) {
    return { type: 'Haute confiance', score: 90, detail: 'Institutionnel ou média international reconnu', color: 'var(--alert-green)' };
  }
  if (/gdelt|google news|rss|search/.test(raw)) {
    return { type: 'Agrégateur / index', score: 68, detail: 'Connecteur de collecte ou agrégateur OSINT', color: 'var(--gold-primary)' };
  }
  if (/blog|wordpress|substack|unknown|inconnue/.test(raw)) {
    return { type: 'Confiance limitée', score: 42, detail: 'Source peu qualifiée par les métadonnées reçues', color: '#C18447' };
  }
  return { type: 'Confiance standard', score: 58, detail: 'Domaine média/source sans classification spéciale', color: 'var(--text-secondary)' };
}

function scenarioPostEventScore(scenario?: Result) {
  return scenario?.scenarioScores?.postEventEscalation ?? scenario?.scores?.escalationRisk ?? 0;
}

function formatSourceDate(value?: string) {
  if (!value) return 'date non fournie';
  const normalized = /^\d{14}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}Z`
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function compactDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function trendLabel(delta: number) {
  if (delta >= 10) return 'Hausse forte';
  if (delta >= 3) return 'Hausse modérée';
  if (delta <= -10) return 'Baisse forte';
  if (delta <= -3) return 'Baisse modérée';
  return 'Stable';
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function loadJsonArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadJsonObject<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function sourceSearchText(source: SourceItem) {
  return `${source.title || ''} ${source.domain || ''} ${source.connector || ''} ${source.category || ''} ${source.sourceType || ''}`.toLowerCase();
}

function sourceTags(source: SourceItem) {
  const raw = sourceSearchText(source);
  const credibility = sourceCredibility(source);
  const tags: string[] = [];
  if (/nuclear|warhead|atomic|missile|icbm|deterrence|nucléaire/.test(raw)) tags.push('NUCLEAR');
  if (/military|troop|army|navy|air force|defense|defence|strike|drill|exercice|militaire/.test(raw)) tags.push('MILITARY');
  if (/diplomacy|talks|summit|minister|treaty|negotiation|diplomatie/.test(raw)) tags.push('DIPLOMACY');
  if (/sanction|embargo|restriction/.test(raw)) tags.push('SANCTIONS');
  if (credibility.score >= 80) tags.push('HIGH TRUST');
  if (/sipri|iaea|un|nato|gov|defense|defence|nuclear_institutional|nuclear_regulator|institutional/.test(raw)) tags.push('INSTITUTIONAL');
  if (/gdelt|google news|rss|search|registry|atom|json/.test(raw)) tags.push('AGGREGATOR');
  if (/cyber_critical_infra|cisa|nvd|cert|enisa|anssi|ncsc/.test(raw)) tags.push('CYBER/INFRA');
  if (/crisis_hazards|earthquake|gdacs|reliefweb|copernicus/.test(raw)) tags.push('CRISIS');
  return tags.length ? tags : ['OSINT'];
}

function sourceMatchesFilter(source: SourceItem, filter: TimelineFilter) {
  if (filter === 'all') return true;
  const tags = sourceTags(source);
  if (filter === 'nuclear') return tags.includes('NUCLEAR');
  if (filter === 'military') return tags.includes('MILITARY');
  if (filter === 'diplomacy') return tags.includes('DIPLOMACY');
  if (filter === 'sanctions') return tags.includes('SANCTIONS');
  if (filter === 'high_trust') return tags.includes('HIGH TRUST');
  if (filter === 'institutional') return tags.includes('INSTITUTIONAL');
  return true;
}

function FactorList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
      <h3 className="font-mono text-xs uppercase tracking-[.25em]" style={{ color }}>{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreLine({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
        <span>{label}</span>
        <span style={{ color }}>{value}/100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-[var(--border-secondary)]">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
      </div>
    </div>
  );
}

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="deterrence-gauge glass-panel p-4">
      <div className="hud-label">{label}</div>
      <div className="mt-2 text-4xl font-bold font-mono" style={{ color }}>{value}</div>
      <div className="mt-3 h-2 rounded bg-black/40">
        <div className="h-2 rounded" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
    </div>
  );
}

/**
 * Turn a governance refusal into an actionable message.
 * The deterrence route is classified SECRET (compartment `nuclear`) — a confidentiel profile
 * is refused with 403 clearance_insufficient, which is the intended behaviour.
 */
function describeAccessError(status: number, payload: unknown): string {
  const body = (payload ?? {}) as { error?: string; reason?: string; detail?: string; hint?: string };
  if (status === 403 && (body.error === 'abac_denied' || body.reason)) {
    return `Accès refusé par la politique ABAC (${body.reason || 'abac_denied'}). Ce module est classé SECRET — compartiment « nuclear » requis. Ouvre l'outil GOUVERNANCE pour élever le profil opérateur.`;
  }
  if (status === 503) {
    return `Service de gouvernance indisponible (${body.error || 'governance_unavailable'}) — aucun accès classifié sans journal d'audit.`;
  }
  return body.detail || body.error || `Analyse impossible (HTTP ${status})`;
}

export default function DeterrencePage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [actor, setActor] = useState('france');
  const [target, setTarget] = useState('russia');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(IDLE_LOADING_STAGE);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [loadingStats, setLoadingStats] = useState({ articles: 0, sources: 0, status: 'Initialisation' });
  const [scenarioResults, setScenarioResults] = useState<Result[]>([]);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioError, setScenarioError] = useState('');
  const [animatedScores, setAnimatedScores] = useState({ escalation: 0, stability: 0, deterrence: 0, miscalc: 0 });
  const [analysisCompleteFlash, setAnalysisCompleteFlash] = useState(false);
  const [history, setHistory] = useState<DeterrenceHistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    } catch {
      return [];
    }
  });
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => loadJsonArray<WatchlistItem>(WATCHLIST_STORAGE_KEY).slice(0, 8));
  const [alertThresholds, setAlertThresholds] = useState<AlertThresholds>(() => loadJsonObject(ALERT_THRESHOLDS_STORAGE_KEY, DEFAULT_ALERT_THRESHOLDS));
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState<(typeof AUTO_REFRESH_OPTIONS)[number]>(0);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [error, setError] = useState('');
  const activeAnalysisRef = useRef(0);
  const activePairRef = useRef({ actor, target });
  const persistedResultRef = useRef<string | null>(null);

  async function loadCountries() {
    const r = await fetch('/api/deterrence?resource=countries', { cache: 'no-store' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(describeAccessError(r.status, d));
      return;
    }
    const d = await r.json();
    if (Array.isArray(d.countries)) setCountries(d.countries);
  }

  async function analyze(nextActor = actor, nextTarget = target) {
    const analysisId = activeAnalysisRef.current + 1;
    activeAnalysisRef.current = analysisId;
    activePairRef.current = { actor: nextActor, target: nextTarget };
    // eslint-disable-next-line react-hooks/purity
    const startedAt = Date.now();
    setLoading(true);
    setLoadingStartedAt(startedAt);
    setElapsedMs(0);
    setLoadingStage(loadingStageById.prepare);
    setLoadingStats({ articles: 0, sources: 0, status: 'Préparation du payload' });
    setError('');
    try {
      const payload = {
        action: 'deterrence',
        actor: nextActor,
        target: nextTarget,
        tension: 50,
        alliance_involvement: 50,
        communication_quality: 50,
        use_live_sources: true,
      };

      setLoadingStage(loadingStageById.collect);
      setLoadingStats({ articles: 0, sources: 0, status: 'Requête envoyée au moteur nucléaire' });
      const r = await fetch('/api/deterrence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (activeAnalysisRef.current !== analysisId) return;

      setLoadingStage(loadingStageById.receive);
      setLoadingStats((prev) => ({ ...prev, status: `Réponse HTTP ${r.status}` }));
      const text = await r.text();
      if (activeAnalysisRef.current !== analysisId) return;

      setLoadingStage(loadingStageById.parse);
      setLoadingStats((prev) => ({ ...prev, status: 'Décodage JSON et déduplication UI' }));
      const d = text ? JSON.parse(text) : {};
      if (!r.ok) throw new Error(describeAccessError(r.status, d));

      const liveSignals = d.liveSignals || {};
      const articles = liveSignals.articleCount ?? liveSignals.topArticles?.length ?? 0;
      const sourcesCount = liveSignals.sourceCount ?? liveSignals.sourceCounts?.length ?? 0;
      setLoadingStage(loadingStageById.render);
      setLoadingStats({ articles, sources: sourcesCount, status: 'Hydratation des jauges et du résumé' });
      setResult(d);
      setAnalysisCompleteFlash(true);
      setLoadingStage(loadingStageById.done);
      setLoadingStats({ articles, sources: sourcesCount, status: 'Résultat prêt' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      if (activeAnalysisRef.current === analysisId) {
        setLoading(false);
        setLoadingStage(IDLE_LOADING_STAGE);
        setLoadingStartedAt(null);
      }
    }
  }

  function applyPreset(preset: typeof CRISIS_PRESETS[number]) {
    setActor(preset.actor);
    setTarget(preset.target);
    setScenarioResults([]);
    setScenarioError('');
    analyze(preset.actor, preset.target);
  }

  function clearHistory() {
    setHistory([]);
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
  }

  function toggleWatchlist() {
    const key = `${actor}:${target}`;
    setWatchlist((prev) => {
      const exists = prev.some((item) => `${item.actor}:${item.target}` === key);
      const next = exists
        ? prev.filter((item) => `${item.actor}:${item.target}` !== key)
        : [{ actor, target, label: `${actorName} → ${targetName}`, addedAt: new Date().toISOString() }, ...prev].slice(0, 8);
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function updateThreshold<K extends keyof AlertThresholds>(key: K, value: number) {
    setAlertThresholds((prev) => {
      const next = { ...prev, [key]: value };
      window.localStorage.setItem(ALERT_THRESHOLDS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function analyzeWatchlist() {
    const first = watchlist[0];
    if (!first || loading) return;
    setActor(first.actor);
    setTarget(first.target);
    analyze(first.actor, first.target);
  }

  async function compareScenarios() {
    setScenarioLoading(true);
    setScenarioError('');
    try {
      const responses = await Promise.all(
        SCENARIO_OPTIONS.map(async (scenario) => {
          const r = await fetch('/api/deterrence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'scenario',
              scenario: scenario.key,
              actor,
              target,
              tension: 50,
              alliance_involvement: 50,
              communication_quality: 50,
              use_live_sources: true,
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.detail || d.error || `Scénario ${scenario.label} impossible`);
          return d as Result;
        })
      );
      setScenarioResults(responses);
    } catch (e) {
      setScenarioError(e instanceof Error ? e.message : 'Comparaison de scénarios impossible');
    } finally {
      setScenarioLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCountries().catch(() => setError('Impossible de charger les pays'));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (countries.length) analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries.length]);

  useEffect(() => {
    if (!loading || !loadingStartedAt) return;
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - loadingStartedAt);
    }, 120);
    return () => window.clearInterval(timer);
  }, [loading, loadingStartedAt]);

  useEffect(() => {
    if (!autoRefreshMinutes || loading || actor === target) return;
    const timer = window.setInterval(() => {
      analyze();
    }, autoRefreshMinutes * 60 * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshMinutes, loading, actor, target]);

  const actorName = countries.find((c) => c.key === actor)?.name || actor;
  const targetName = countries.find((c) => c.key === target)?.name || target;
  const scores = useMemo(() => result?.scores || {}, [result]);
  const escalation = scores.escalationRisk || 0;
  const stability = scores.strategicStability || 0;
  const deterrence = scores.deterrenceCredibility || 0;
  const miscalc = scores.miscalculationRisk || 0;

  useEffect(() => {
    if (!result) return;
    const duration = 900;
    const startedAt = performance.now();

    let frame = 0;
    const animate = (nowMs: number) => {
      const ratio = Math.min(1, (nowMs - startedAt) / duration);
      const eased = 1 - Math.pow(1 - ratio, 3);
      setAnimatedScores({
        escalation: Math.round(escalation * eased),
        stability: Math.round(stability * eased),
        deterrence: Math.round(deterrence * eased),
        miscalc: Math.round(miscalc * eased),
      });
      if (ratio < 1) frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    const flashTimer = window.setTimeout(() => setAnalysisCompleteFlash(false), 1400);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(flashTimer);
    };
  }, [result, escalation, stability, deterrence, miscalc]);

  const signals = result?.liveSignals;
  const nuclearContext = result?.nuclearContext;
  const aiAssessment = result?.aiAssessment;
  const sources = useMemo(() => signals?.topArticles || [], [signals]);
  const sourceCounts = useMemo(() => signals?.sourceCounts || [], [signals]);
  const uniqueSourceCount = signals?.sourceCount ?? sourceCounts.length;
  const loadingStageIndex = LOADING_STAGES.findIndex((stage) => stage.id === loadingStage.id);
  const animatedLoadingProgress = useMemo(() => {
    if (!loading) return loadingStage.progress;
    if (loadingStage.id === 'done') return 100;

    const stageFloors: Record<LoadingStage['id'], number> = {
      idle: 0,
      prepare: 4,
      collect: 18,
      receive: 58,
      parse: 72,
      render: 88,
      done: 100,
    };

    const elapsedProgress = 96 * (1 - Math.exp(-elapsedMs / 7200));
    const stageProgress = Math.max(stageFloors[loadingStage.id], loadingStage.progress - 8);
    return Math.min(99, Math.max(stageProgress, Math.round(elapsedProgress)));
  }, [elapsedMs, loading, loadingStage.id, loadingStage.progress]);
  const articleCount = signals?.articleCount ?? sources.length;
  const nuclearMentions = signals?.nuclearMentions ?? 0;
  const militaryMentions = signals?.militaryMentions ?? 0;
  const diplomacyMentions = signals?.diplomacyMentions ?? 0;
  const sanctionMentions = signals?.sanctionMentions ?? 0;
  const pandoraLevel = strategicLevel(escalation);
  const osintCoverage = coverageAssessment(articleCount, uniqueSourceCount, Boolean(nuclearContext));
  const pairFactorScore = Math.min(100, Math.round((nuclearContext?.nuclearPairFactor ?? 0) * 100));

  useEffect(() => {
    if (!result) return;
    const pair = activePairRef.current;
    const generatedAt = result.generatedAt || new Date().toISOString();
    const persistKey = `${pair.actor}:${pair.target}:${generatedAt}:${escalation}:${articleCount}:${uniqueSourceCount}`;
    if (persistedResultRef.current === persistKey) return;
    persistedResultRef.current = persistKey;
    setCurrentHistoryId(persistKey);

    const item: DeterrenceHistoryItem = {
      id: persistKey,
      generatedAt,
      actor: pair.actor,
      target: pair.target,
      actorName: countries.find((c) => c.key === pair.actor)?.name || pair.actor,
      targetName: countries.find((c) => c.key === pair.target)?.name || pair.target,
      escalation,
      stability,
      deterrence,
      miscalc,
      nuclearMentions,
      militaryMentions,
      sourceCount: uniqueSourceCount,
      articleCount,
      level: pandoraLevel.level,
      levelLabel: pandoraLevel.label,
    };

    setHistory((prev) => {
      const next = [item, ...prev.filter((entry) => entry.id !== item.id)].slice(0, 12);
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [result, countries, escalation, stability, deterrence, miscalc, nuclearMentions, militaryMentions, uniqueSourceCount, articleCount, pandoraLevel.level, pandoraLevel.label]);

  const previousPairAnalysis = useMemo(() => {
    if (!history.length) return null;
    return history.find((entry) => entry.actor === actor && entry.target === target && entry.id !== currentHistoryId) || null;
  }, [history, actor, target, currentHistoryId]);

  const trendDelta = previousPairAnalysis ? escalation - previousPairAnalysis.escalation : 0;
  const trendColor = trendDelta > 0 ? 'var(--alert-red)' : trendDelta < 0 ? 'var(--alert-green)' : 'var(--gold-primary)';

  const aggravatingFactors = useMemo(() => {
    const factors: string[] = [];
    if (escalation >= 50) factors.push(`Risque d’escalade mesuré à ${escalation}/100.`);
    if (miscalc >= 50) factors.push(`Risque de mauvais calcul élevé : ${miscalc}/100.`);
    if (stability > 0 && stability < 45) factors.push(`Stabilité stratégique basse : ${stability}/100.`);
    if (nuclearContext?.pairType === 'nuclear_vs_nuclear') factors.push('Paire nucléaire contre nucléaire détectée par le contexte réel.');
    if (nuclearMentions > 0) factors.push(`${nuclearMentions} mention(s) nucléaire(s) détectée(s) dans les signaux OSINT.`);
    if (militaryMentions > 0) factors.push(`${militaryMentions} mention(s) militaire(s) détectée(s) dans les signaux OSINT.`);
    if (sanctionMentions > 0) factors.push(`${sanctionMentions} mention(s) liées aux sanctions détectée(s).`);
    return factors.length ? factors : ['Aucun facteur aggravant fort dans les champs reçus par cette analyse.'];
  }, [escalation, miscalc, stability, nuclearContext, nuclearMentions, militaryMentions, sanctionMentions]);

  const stabilizingFactors = useMemo(() => {
    const factors: string[] = [];
    if (stability >= 55) factors.push(`Stabilité stratégique favorable : ${stability}/100.`);
    if (deterrence >= 55) factors.push(`Crédibilité de dissuasion élevée : ${deterrence}/100.`);
    if (nuclearContext?.pairType === 'nuclear_vs_non_nuclear') factors.push('La paire n’est pas symétriquement nucléaire selon le contexte fourni.');
    if (nuclearContext?.pairType === 'non_nuclear_vs_non_nuclear') factors.push('Aucune capacité nucléaire déclarée dans la paire analysée.');
    if (nuclearMentions === 0) factors.push('Aucune mention nucléaire directe détectée dans les signaux OSINT reçus.');
    if (diplomacyMentions > 0) factors.push(`${diplomacyMentions} mention(s) diplomatique(s) détectée(s).`);
    if (uniqueSourceCount >= 5) factors.push(`${uniqueSourceCount} source(s) unique(s), ce qui renforce la couverture de l’analyse.`);
    return factors.length ? factors : ['Aucun facteur stabilisant fort dans les champs reçus par cette analyse.'];
  }, [stability, deterrence, nuclearContext, nuclearMentions, diplomacyMentions, uniqueSourceCount]);

  const contradictionSignals = useMemo(() => {
    const items: string[] = [];
    if (diplomacyMentions > 0 && militaryMentions > 0) {
      items.push(`Signaux mixtes : ${diplomacyMentions} mention(s) diplomatique(s) coexistent avec ${militaryMentions} mention(s) militaire(s).`);
    }
    if (deterrence >= 65 && escalation >= 55) {
      items.push(`Dissuasion élevée (${deterrence}/100) mais escalade aussi élevée (${escalation}/100), possible tension malgré crédibilité stratégique.`);
    }
    if (stability >= 60 && miscalc >= 55) {
      items.push(`Stabilité globale correcte (${stability}/100) mais risque de mauvais calcul élevé (${miscalc}/100).`);
    }
    if (nuclearContext?.pairType !== 'nuclear_vs_nuclear' && nuclearMentions > 0) {
      items.push(`La paire n’est pas nucléaire contre nucléaire, mais ${nuclearMentions} mention(s) nucléaire(s) ont été détectée(s).`);
    }
    if (articleCount === 0 && (nuclearMentions + militaryMentions + diplomacyMentions + sanctionMentions) > 0) {
      items.push('Signaux présents sans article direct : l’analyse repose sur les liens de recherche/références retournés par le service.');
    }
    return items;
  }, [diplomacyMentions, militaryMentions, deterrence, escalation, stability, miscalc, nuclearContext, nuclearMentions, articleCount, sanctionMentions]);

  const timelineItems = useMemo(() => {
    return sources.slice(0, 8).map((source, index) => ({
      ...source,
      displayDate: formatSourceDate(source.seenDate || source.pubDate),
      rank: index + 1,
    }));
  }, [sources]);

  const sourceCredibilityItems = useMemo(() => {
    const byName = new Map<string, { name: string; count: number; credibility: ReturnType<typeof sourceCredibility> }>();
    const baseSources = sourceCounts.length > 0
      ? sourceCounts.map((source) => ({ name: source.name, count: source.count, connector: '' }))
      : sources.map((source) => ({ name: source.domain || source.connector || 'Source inconnue', count: 1, connector: source.connector || '' }));

    for (const source of baseSources) {
      const current = byName.get(source.name);
      if (current) {
        current.count += source.count;
      } else {
        byName.set(source.name, { name: source.name, count: source.count, credibility: sourceCredibility(source) });
      }
    }

    return Array.from(byName.values()).sort((a, b) => b.credibility.score - a.credibility.score || b.count - a.count).slice(0, 9);
  }, [sourceCounts, sources]);

  const currentPairKey = `${actor}:${target}`;
  const isWatchlisted = watchlist.some((item) => `${item.actor}:${item.target}` === currentPairKey);
  const highTrustSourceCount = sourceCredibilityItems.filter((item) => item.credibility.score >= 80).length;
  const sourceDiversityScore = clampScore(uniqueSourceCount * 9 + highTrustSourceCount * 10 - Math.max(0, articleCount - uniqueSourceCount) * 2);
  const analyticalConfidence = clampScore(
    osintCoverage.score * 0.45 +
    sourceDiversityScore * 0.25 +
    highTrustSourceCount * 8 +
    (nuclearContext ? 12 : 0) -
    contradictionSignals.length * 8
  );
  const confidenceLabel = analyticalConfidence >= 75 ? 'Confiance forte' : analyticalConfidence >= 50 ? 'Confiance moyenne' : 'Confiance faible';
  const activeAlerts = [
    escalation >= alertThresholds.risk ? `Risque ${escalation}/100 supérieur au seuil ${alertThresholds.risk}.` : '',
    nuclearMentions >= alertThresholds.nuclearMentions ? `${nuclearMentions} mention(s) nucléaire(s), seuil ${alertThresholds.nuclearMentions}.` : '',
    previousPairAnalysis && Math.abs(trendDelta) >= alertThresholds.delta ? `Variation de risque ${formatDelta(trendDelta)}, seuil ±${alertThresholds.delta}.` : '',
    escalation >= alertThresholds.risk && uniqueSourceCount <= alertThresholds.minSources ? `Risque élevé avec seulement ${uniqueSourceCount} source(s) unique(s).` : '',
  ].filter(Boolean);
  const heatmapSignals = [
    { label: 'Nucléaire', value: clampScore(nuclearMentions * 18), detail: `${nuclearMentions} mention(s)`, color: 'var(--gold-primary)' },
    { label: 'Militaire', value: clampScore(militaryMentions * 14), detail: `${militaryMentions} mention(s)`, color: '#C18447' },
    { label: 'Diplomatie', value: clampScore(diplomacyMentions * 18), detail: `${diplomacyMentions} mention(s)`, color: 'var(--alert-green)' },
    { label: 'Sanctions', value: clampScore(sanctionMentions * 18), detail: `${sanctionMentions} mention(s)`, color: 'var(--text-secondary)' },
    { label: 'Stabilité', value: stability, detail: `${stability}/100`, color: 'var(--gold-primary)' },
    { label: 'Mauvais calcul', value: miscalc, detail: `${miscalc}/100`, color: '#C18447' },
    { label: 'Couverture', value: osintCoverage.score, detail: osintCoverage.label, color: 'var(--gold-primary)' },
    { label: 'Dissuasion', value: deterrence, detail: `${deterrence}/100`, color: 'var(--alert-green)' },
  ];
  const filteredTimelineItems = useMemo(() => timelineItems.filter((item) => sourceMatchesFilter(item, timelineFilter)), [timelineItems, timelineFilter]);
  const whatChanged = previousPairAnalysis ? [
    `Risque : ${previousPairAnalysis.escalation} → ${escalation} (${formatDelta(trendDelta)}).`,
    `Mentions nucléaire/militaire : ${previousPairAnalysis.nuclearMentions + previousPairAnalysis.militaryMentions} → ${nuclearMentions + militaryMentions}.`,
    `Sources uniques : ${previousPairAnalysis.sourceCount} → ${uniqueSourceCount}.`,
    `Niveau stratégique précédent : ${previousPairAnalysis.level} — ${previousPairAnalysis.levelLabel}.`,
  ] : ['Aucun snapshot précédent pour cette paire : tendance locale en cours de constitution.'];
  const escalationLadder = [
    { level: 1, label: 'Crise majeure' },
    { level: 2, label: 'Escalade critique' },
    { level: 3, label: 'Risque actif' },
    { level: 4, label: 'Tension faible' },
    { level: 5, label: 'Surveillance normale' },
  ];

  const scenarioDashboard = useMemo(() => {
    if (!scenarioResults.length) return null;
    const sorted = [...scenarioResults].sort((a, b) => scenarioPostEventScore(a) - scenarioPostEventScore(b));
    const deescalation = sorted[0];
    const escalationScenario = sorted[sorted.length - 1];
    return {
      current: escalation,
      deescalation,
      escalationScenario,
      deescalationScore: scenarioPostEventScore(deescalation),
      escalationScore: scenarioPostEventScore(escalationScenario),
    };
  }, [scenarioResults, escalation]);

  const summary = (() => {
    if (!result) return 'Sélectionne deux pays puis lance l’analyse OSINT.';
    const articles = signals?.articleCount ?? sources.length;
    const nuclear = signals?.nuclearMentions ?? 0;
    const military = signals?.militaryMentions ?? 0;
    const diplomacy = signals?.diplomacyMentions ?? 0;
    const sanctions = signals?.sanctionMentions ?? 0;
    const detectedSignals = nuclear + military + diplomacy + sanctions;
    const sourceCountText = uniqueSourceCount > 0 ? `, issus de ${uniqueSourceCount} média(s)/source(s) unique(s)` : '';
    const pairContext = nuclearContext?.summary ? `${nuclearContext.summary} ` : '';
    const why = escalation >= 50
      ? detectedSignals > 0
        ? `Le risque nucléaire est à ${escalation}/100 après pondération des capacités nucléaires réelles des deux pays, des signaux OSINT détectés et des profils stratégiques.`
        : `Le risque nucléaire est à ${escalation}/100 après pondération des capacités nucléaires réelles des deux pays ; aucun mot-clé nucléaire/militaire fort n’a été détecté dans les titres collectés.`
      : `Le risque paraît contenu car le score d’escalade reste à ${escalation}/100 et la stabilité stratégique est à ${stability}/100.`;
    const sourceText = articles > 0
      ? `${articles} article(s)/source(s) OSINT ont été analysé(s)${sourceCountText}.`
      : `Aucun article direct fort n’a été trouvé, le moteur utilise alors des recherches OSINT de référence listées ci-dessous.`;
    return `${riskLabel(escalation)} entre ${actorName} et ${targetName}. ${pairContext}${why} Indicateurs pris en compte : ${nuclear} mention(s) nucléaire(s), ${military} mention(s) militaire(s), ${diplomacy} mention(s) diplomatique(s), ${sanctions} mention(s) sanctions. ${sourceText}`;
  })();

  const briefingMarkdown = (() => {
    const lines = [
      `# Briefing Pandora Nuclear — ${actorName} → ${targetName}`,
      '',
      `- Généré : ${result?.generatedAt ? formatSourceDate(result.generatedAt) : formatSourceDate(new Date().toISOString())}`,
      `- Niveau stratégique : Niveau ${pandoraLevel.level} — ${pandoraLevel.label}`,
      `- Risque d’escalade : ${escalation}/100`,
      `- Stabilité stratégique : ${stability}/100`,
      `- Dissuasion : ${deterrence}/100`,
      `- Mauvais calcul : ${miscalc}/100`,
      `- Couverture OSINT : ${osintCoverage.label} (${osintCoverage.score}/100)`,
      '',
      '## Résumé',
      summary,
      '',
      '## Analyse Pandora Nuclear AI',
      aiAssessment?.text || 'Analyse IA non disponible dans cette réponse.',
      '',
      '## Contexte nucléaire',
      `- Type de paire : ${pairTypeLabel(nuclearContext?.pairType)}`,
      `- Capacité acteur : ${nuclearContext?.actorNuclearCapability ?? 0}/100 (${nuclearStatusLabel(nuclearContext?.actorNuclearStatus)})`,
      `- Capacité cible : ${nuclearContext?.targetNuclearCapability ?? 0}/100 (${nuclearStatusLabel(nuclearContext?.targetNuclearStatus)})`,
      nuclearContext?.summary ? `- Synthèse : ${nuclearContext.summary}` : '- Synthèse : non fournie',
      '',
      '## Signaux OSINT',
      `- Articles : ${articleCount}`,
      `- Sources uniques : ${uniqueSourceCount}`,
      `- Mentions nucléaires : ${nuclearMentions}`,
      `- Mentions militaires : ${militaryMentions}`,
      `- Mentions diplomatiques : ${diplomacyMentions}`,
      `- Mentions sanctions : ${sanctionMentions}`,
      '',
      '## Facteurs aggravants',
      ...aggravatingFactors.map((item) => `- ${item}`),
      '',
      '## Facteurs stabilisants',
      ...stabilizingFactors.map((item) => `- ${item}`),
      '',
      '## Contradictions / tensions analytiques',
      ...(contradictionSignals.length ? contradictionSignals.map((item) => `- ${item}`) : ['- Aucune contradiction forte détectée dans les champs reçus.']),
      '',
      '## Sources principales',
      ...(sources.slice(0, 10).map((source) => `- ${source.title || source.domain || 'Source'} — ${source.domain || source.connector || 'source inconnue'}${source.url ? ` (${source.url})` : ''}`)),
    ];
    return lines.join('\n');
  })();

  function downloadBriefing() {
    const blob = new Blob([briefingMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pandora-nuclear-${actor}-${target}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const payload = {
      generatedAt: result?.generatedAt || new Date().toISOString(),
      actor: { key: actor, name: actorName },
      target: { key: target, name: targetName },
      scores: { escalation, stability, deterrence, miscalc, level: pandoraLevel },
      confidence: { analyticalConfidence, confidenceLabel, sourceDiversityScore, highTrustSourceCount },
      alerts: activeAlerts,
      trend: { previous: previousPairAnalysis, delta: trendDelta, whatChanged },
      signals: { articleCount, uniqueSourceCount, nuclearMentions, militaryMentions, diplomacyMentions, sanctionMentions },
      nuclearContext,
      aiAssessment,
      recommendations: result?.recommendations || [],
      sources,
      dataProvenance: {
        scores: '/api/deterrence action=deterrence',
        sources: 'result.liveSignals.topArticles/sourceCounts',
        history: 'localStorage pandora.deterrence.history.v1',
        scenarios: '/api/deterrence action=scenario',
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pandora-nuclear-${actor}-${target}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1200');
    if (!printWindow) return;
    const html = briefingMarkdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .split('\n')
      .map((line) => {
        if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
        if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
        if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
        if (!line.trim()) return '<br />';
        return `<p>${line}</p>`;
      })
      .join('\n');
    printWindow.document.write(`<!doctype html><html><head><title>Pandora Nuclear Briefing</title><style>body{font-family:Inter,Arial,sans-serif;background:#0b0f16;color:#111;padding:32px;line-height:1.5}h1,h2{font-family:monospace;text-transform:uppercase;letter-spacing:.08em}h1{font-size:24px}h2{font-size:16px;margin-top:26px;border-top:1px solid #ccc;padding-top:14px}li{margin:6px 0}p{margin:8px 0}@media print{body{background:#fff;color:#111}}</style></head><body>${html}<script>window.onload=()=>{window.print();}</script></body></html>`);
    printWindow.document.close();
  }

  return (
    <main className="deterrence-page fixed inset-0 h-dvh overflow-y-scroll styled-scrollbar bg-[var(--bg-void)] text-[var(--text-primary)]">
      {loading && (
        <div className="deterrence-loader fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4 backdrop-blur-2xl">
          <div className="deterrence-loader-grid" />
          <div className="deterrence-loader-noise" />
          <div className="deterrence-loader-scan" />

          <div className="nuclear-sim-frame absolute inset-4 overflow-hidden rounded-sm border border-red-300/25 sm:inset-7">
            <div className="nuclear-sim-map" />
            <div className="nuclear-sim-vignette" />
            <div className="nuclear-sim-hud-lines" />
            <div className="nuclear-sim-corner nuclear-sim-corner--tl" />
            <div className="nuclear-sim-corner nuclear-sim-corner--tr" />
            <div className="nuclear-sim-corner nuclear-sim-corner--bl" />
            <div className="nuclear-sim-corner nuclear-sim-corner--br" />

            <div className="nuclear-sim-title">
              <h2>GLOBAL NUCLEAR<br className="hidden sm:block" /> STRIKE SIMULATION LOADER</h2>
              
            </div>

            <div className="nuclear-sim-alert nuclear-sim-alert--left">
              <strong>GLOBAL STRIKE DETECTED</strong>
              <span>ATMOSPHERIC RISK ANALYSIS</span>
              <span>OSINT SIGNAL FUSION</span>
              <span>ESCALATION MODEL ACTIVE</span>
            </div>
            <div className="nuclear-sim-alert nuclear-sim-alert--right">
              <span>MIRV COUNT:</span> <b>{Math.max(1400, loadingStats.articles * 100)}</b>
            </div>

            <div className="nuclear-sim-orbit">
              <div className="nuclear-sim-gif-shell">
                <Image src="/asset/nuclear.gif" alt="Simulation nucléaire" width={620} height={420} unoptimized className="nuclear-sim-gif" />
              </div>
              <div className="nuclear-sim-gif-glow" />
            </div>

            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((arc) => <span key={arc} className={`nuclear-sim-arc nuclear-sim-arc--${arc}`} />)}
            {['na', 'eu', 'ru', 'in', 'cn', 'pac'].map((dot) => <span key={dot} className={`nuclear-sim-dot nuclear-sim-dot--${dot}`} />)}

            <div className="nuclear-sim-percent"><b>{animatedLoadingProgress}%</b> COMPLETE</div>
            <div className="nuclear-sim-bottom-left">
              <strong>GLOBAL STRIKE DETECTED</strong>
              <span>MIRV COUNT: {Math.max(1400, loadingStats.sources * 280)}</span>
            </div>
            <div className="nuclear-sim-bottom-center">
              <span>{loadingStats.status || loadingStage.label}</span>
              <div className="nuclear-sim-progress"><i style={{ width: `${animatedLoadingProgress}%` }} /></div>
            </div>
            <div className="nuclear-sim-stage-list">
              {LOADING_STAGES.filter((stage) => stage.id !== 'done').map((stage, index) => {
                const isDone = index < loadingStageIndex || loadingStage.id === 'done';
                const isActive = stage.id === loadingStage.id;
                return <span key={stage.id} className={isActive ? 'is-active' : isDone ? 'is-done' : ''}>{stage.label}</span>;
              })}
            </div>
          </div>

          <div className="deterrence-loader-frame relative w-full max-w-7xl overflow-hidden rounded-[34px]">
            <div className="deterrence-loader-topline" />
            <div className="grid min-h-[650px] lg:grid-cols-[1.05fr_.95fr]">
              <div className="relative hidden overflow-hidden border-r border-[var(--gold-primary)]/15 bg-black/30 lg:block">
                <div className="deterrence-containment-shell">
                  <div className="deterrence-containment-aura" />
                  <div className="deterrence-energy-band deterrence-energy-band--top" />
                  <div className="deterrence-energy-band deterrence-energy-band--bottom" />
                  <div className="deterrence-energy-column deterrence-energy-column--left" />
                  <div className="deterrence-energy-column deterrence-energy-column--right" />
                  <div className="deterrence-particle-field" />
                  <div className="deterrence-core-card">
                    <div className="deterrence-core-corner deterrence-core-corner--tl" />
                    <div className="deterrence-core-corner deterrence-core-corner--tr" />
                    <div className="deterrence-core-corner deterrence-core-corner--bl" />
                    <div className="deterrence-core-corner deterrence-core-corner--br" />
                    <Image src="/asset/nuclear.gif" alt="Analyse nucléaire en cours" width={520} height={360} unoptimized className="h-full w-full scale-110 object-cover opacity-90 saturate-75 contrast-125" />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.60),transparent_22%,transparent_78%,rgba(0,0,0,0.62)),radial-gradient(circle_at_50%_48%,transparent_28%,rgba(0,0,0,0.60)_82%)]" />
                    <div className="deterrence-core-glass" />
                    <div className="deterrence-core-scanline" />
                  </div>
                  <div className="deterrence-reactor-caption">
                    <span>Containment chamber</span>
                    <strong>NUCLEAR SIGNAL FUSION</strong>
                  </div>
                </div>

                <div className="absolute left-8 top-8 rounded-2xl border border-[var(--gold-primary)]/25 bg-black/45 p-4 font-mono backdrop-blur">
                  <div className="text-[10px] uppercase tracking-[.32em] text-[var(--text-muted)]">Corridor stratégique</div>
                  <div className="mt-2 flex items-center gap-3 text-sm uppercase tracking-[.24em] text-[var(--gold-light)]">
                    <Radio className="h-4 w-4 animate-pulse" /> {actorName} <span className="text-[var(--text-muted)]">→</span> {targetName}
                  </div>
                </div>

                <div className="absolute bottom-8 left-8 right-8 grid grid-cols-3 gap-3 font-mono">
                  <div className="deterrence-loader-stat"><span>Articles</span><strong>{loadingStats.articles}</strong></div>
                  <div className="deterrence-loader-stat"><span>Sources</span><strong>{loadingStats.sources}</strong></div>
                  <div className="deterrence-loader-stat"><span>Chrono</span><strong>{formatElapsed(elapsedMs)}</strong></div>
                </div>
              </div>

              <div className="relative flex flex-col justify-center p-6 sm:p-10 lg:p-14">
                <div className="mb-7 inline-flex w-fit items-center gap-3 rounded-full border border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[.28em] text-[var(--gold-light)] shadow-[0_0_34px_rgba(191,164,106,0.12)]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--gold-light)] shadow-[0_0_18px_var(--gold-light)]" /> Live deterrence engine
                </div>

                <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[.55em] text-[var(--text-muted)]">Pandora nuclear OSINT</div>
                    <h2 className="deterrence-loader-title mt-4 font-mono text-5xl font-black uppercase leading-[.92] tracking-[.18em] text-[var(--text-heading)] sm:text-7xl">
                      Analyse<br />Nucléaire
                    </h2>
                    <p className="mt-5 font-mono text-sm uppercase tracking-[.38em] text-[var(--gold-primary)]">{actorName} → {targetName}</p>
                  </div>
                  <div className="deterrence-loader-percent font-mono">
                    <div className="text-[10px] uppercase tracking-[.3em] text-[var(--text-muted)]">Progression</div>
                    <div className="mt-1 text-6xl font-black text-[var(--gold-light)]">{animatedLoadingProgress}<span className="text-2xl">%</span></div>
                  </div>
                </div>

                <p className="mt-7 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
                  Collecte OSINT en direct, déduplication des sources, extraction des signaux militaires/nucléaires et pondération par capacités stratégiques réelles.
                </p>

                <div className="mt-9 space-y-3">
                  {LOADING_STAGES.filter((stage) => stage.id !== 'done').map((stage, index) => {
                    const isDone = index < loadingStageIndex || loadingStage.id === 'done';
                    const isActive = stage.id === loadingStage.id;
                    return (
                      <div key={stage.id} className={`deterrence-stage-row ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}>
                        <div className="flex min-w-0 items-center gap-4">
                          <span className="deterrence-stage-dot" />
                          <span className="truncate">{stage.label}</span>
                        </div>
                        <div className="flex min-w-0 items-center gap-4 text-right">
                          <span className="hidden max-w-[260px] truncate sm:inline">{isDone ? 'Validé' : isActive ? loadingStats.status : 'Standby'}</span>
                          <b>{stage.progress}%</b>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-9 rounded-3xl border border-[var(--gold-primary)]/20 bg-black/35 p-5 shadow-[0_0_50px_rgba(0,0,0,0.35)]">
                  <div className="mb-4 flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[.28em] text-[var(--text-muted)]">
                    <span>{loadingStage.label}</span><span>{formatElapsed(elapsedMs)}</span>
                  </div>
                  <div className="deterrence-progress-track">
                    <div className="deterrence-progress-fill" style={{ width: `${loadingStage.progress}%` }} />
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 font-mono text-[10px] uppercase tracking-widest sm:grid-cols-3 lg:hidden">
                    <div className="deterrence-loader-stat"><span>Articles</span><strong>{loadingStats.articles}</strong></div>
                    <div className="deterrence-loader-stat"><span>Sources</span><strong>{loadingStats.sources}</strong></div>
                    <div className="deterrence-loader-stat"><span>État</span><strong className="truncate text-sm">{loadingStats.status}</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="deterrence-bg-grid pointer-events-none fixed inset-0" />
      <div className="deterrence-bg-orb deterrence-bg-orb--gold pointer-events-none fixed" />
      <div className="deterrence-bg-orb deterrence-bg-orb--red pointer-events-none fixed" />
      <section className="deterrence-shell relative z-10 mx-auto max-w-[1500px] p-5 pb-24 sm:p-7">
        {analysisCompleteFlash && (
          <div className="pointer-events-none fixed inset-x-0 top-6 z-40 mx-auto w-fit rounded border border-[var(--gold-primary)]/60 bg-black/80 px-6 py-3 font-mono text-xs uppercase tracking-[.35em] text-[var(--gold-primary)] shadow-2xl shadow-[var(--gold-primary)]/20 backdrop-blur">
            Analyse complete · Scores synchronisés
          </div>
        )}
        <header className="deterrence-hero mb-6 overflow-hidden rounded-[28px] border border-[var(--gold-primary)]/20 p-5 sm:p-7">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <Link href="/" className="deterrence-icon-btn"><ArrowLeft className="h-4 w-4" /></Link>
                <span className="gotham-tag gotham-tag--critical"><Shield className="h-3 w-3" /> PANDORA-NUCLEAR OSINT</span>
                <span className="gotham-tag gotham-tag--info"><Satellite className="h-3 w-3" /> Sources live</span>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[.5em] text-[var(--text-muted)]">Strategic deterrence command room</p>
              <h1 className="mt-3 font-mono text-4xl font-black uppercase leading-[.95] tracking-[.18em] text-[var(--text-heading)] sm:text-6xl">
                Nuclear Risk<br />Summary
              </h1>
              <div className="mt-5 flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-[.26em] text-[var(--gold-primary)]">
                <Radio className="h-4 w-4 animate-pulse" />
                <span>{actorName}</span>
                <span className="text-[var(--text-muted)]">→</span>
                <span>{targetName}</span>
              </div>
            </div>

            <div className="grid min-w-[min(100%,520px)] gap-3 sm:grid-cols-3">
              <div className="deterrence-hero-stat"><Activity className="h-4 w-4" /><span>Escalade</span><strong style={{ color: riskColor(escalation) }}>{escalation}</strong></div>
              <div className="deterrence-hero-stat"><TriangleAlert className="h-4 w-4" /><span>Mentions</span><strong>{nuclearMentions + militaryMentions}</strong></div>
              <div className="deterrence-hero-stat"><Zap className="h-4 w-4" /><span>Niveau</span><strong>{pandoraLevel.level}</strong></div>
              <button disabled={loading || actor === target} onClick={() => analyze()} className="deterrence-primary-action sm:col-span-3">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Relancer l’analyse live
              </button>
            </div>
          </div>
        </header>



        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <aside className="deterrence-control-panel glass-panel p-5 xl:sticky xl:top-7 xl:self-start">
            <h2 className="hud-text mb-4 text-sm">Pays à comparer</h2>
            <div className="space-y-4">
              <label className="block text-xs uppercase tracking-widest text-[var(--text-muted)]">Pays acteur</label>
              <select value={actor} onChange={(e) => setActor(e.target.value)} className="w-full rounded border border-[var(--border-secondary)] bg-black/50 p-3 font-mono text-sm">
                {countries.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
              <label className="block text-xs uppercase tracking-widest text-[var(--text-muted)]">Pays cible / dissuadé</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded border border-[var(--border-secondary)] bg-black/50 p-3 font-mono text-sm">
                {countries.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
              <button disabled={loading || actor === target} onClick={() => analyze()} className="deterrence-primary-action w-full justify-center">Analyser le risque</button>
              {error && <p className="text-xs text-[var(--alert-red)]">{error}</p>}
              <div className="rounded-2xl border border-[var(--gold-primary)]/25 bg-[var(--gold-primary)]/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-mono text-[10px] uppercase tracking-[.25em] text-[var(--gold-primary)]">Presets crise</div>
                  <span className="rounded border border-[var(--gold-primary)]/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Quick launch</span>
                </div>
                <div className="space-y-2">
                  {CRISIS_PRESETS.map((preset) => {
                    const isActive = actor === preset.actor && target === preset.target;
                    return (
                      <button
                        key={preset.label}
                        disabled={loading}
                        onClick={() => applyPreset(preset)}
                        className={`w-full rounded border px-3 py-2 text-left transition-colors disabled:opacity-40 ${isActive ? 'border-[var(--gold-primary)] bg-[var(--gold-primary)]/15' : 'border-[var(--border-secondary)] bg-black/25 hover:border-[var(--gold-primary)]/50'}`}
                      >
                        <span className="block font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">{preset.label}</span>
                        <span className="mt-1 block text-xs text-[var(--text-muted)]">{preset.note}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border-secondary)] bg-black/25 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[.25em] text-[var(--text-muted)]">Canal actif</div>
                <div className="mt-3 flex items-center justify-between gap-3 font-mono text-xs uppercase tracking-widest text-[var(--gold-primary)]">
                  <span>{actorName}</span><span>→</span><span>{targetName}</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/60"><div className="h-full rounded-full bg-[var(--gold-primary)]" style={{ width: `${Math.max(8, osintCoverage.score)}%` }} /></div>
              </div>
              <div className="rounded-2xl border border-[var(--border-secondary)] bg-black/25 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-mono text-[10px] uppercase tracking-[.25em] text-[var(--text-muted)]">Watchlist</div>
                  <button onClick={toggleWatchlist} className="rounded border border-[var(--gold-primary)]/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-[var(--gold-primary)]">
                    {isWatchlisted ? 'Retirer' : 'Épingler'}
                  </button>
                </div>
                <div className="space-y-2">
                  {watchlist.length > 0 ? watchlist.slice(0, 4).map((item) => (
                    <button key={`${item.actor}:${item.target}`} onClick={() => { setActor(item.actor); setTarget(item.target); }} className="w-full rounded border border-[var(--border-secondary)]/70 bg-black/20 px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:border-[var(--gold-primary)]/50">
                      {item.label}
                    </button>
                  )) : <p className="text-xs text-[var(--text-muted)]">Aucune paire épinglée.</p>}
                </div>
                <button disabled={!watchlist.length || loading} onClick={analyzeWatchlist} className="mt-3 w-full rounded border border-[var(--border-secondary)] bg-black/30 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)] disabled:opacity-40">Analyser la première paire</button>
              </div>
              <div className="rounded-2xl border border-[var(--border-secondary)] bg-black/25 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[.25em] text-[var(--text-muted)]">Auto-refresh</div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {AUTO_REFRESH_OPTIONS.map((minutes) => (
                    <button key={minutes} onClick={() => setAutoRefreshMinutes(minutes)} className={`rounded border px-2 py-2 font-mono text-[10px] uppercase tracking-widest ${autoRefreshMinutes === minutes ? 'border-[var(--gold-primary)] bg-[var(--gold-primary)]/15 text-[var(--gold-primary)]' : 'border-[var(--border-secondary)] bg-black/20 text-[var(--text-muted)]'}`}>
                      {minutes ? `${minutes}m` : 'Off'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <section className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <Gauge label="Probabilité / Risque" value={animatedScores.escalation || escalation} color={riskColor(escalation)} />
              <Gauge label="Stabilité" value={animatedScores.stability || stability} color="var(--gold-primary)" />
              <Gauge label="Dissuasion" value={animatedScores.deterrence || deterrence} color="var(--alert-green)" />
              <Gauge label="Mauvais calcul" value={animatedScores.miscalc || miscalc} color="#C18447" />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_.9fr]">
              <div className="glass-panel p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="hud-text text-sm">War Room Briefing</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                      Décision : <b style={{ color: riskColor(escalation) }}>{pandoraLevel.label}</b>. {activeAlerts.length ? activeAlerts[0] : 'Aucune alerte locale prioritaire.'} Confiance : {confidenceLabel.toLowerCase()}.
                    </p>
                  </div>
                  <div className="rounded border px-4 py-3 text-center font-mono" style={{ borderColor: riskColor(escalation), color: riskColor(escalation) }}>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Verdict</div>
                    <div className="mt-1 text-xl font-black uppercase">Niveau {pandoraLevel.level}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded border border-[var(--border-secondary)] bg-black/25 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Confiance analytique</div>
                    <div className="mt-2 text-3xl font-mono font-black text-[var(--gold-primary)]">{analyticalConfidence}</div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{confidenceLabel}</p>
                  </div>
                  <div className="rounded border border-[var(--border-secondary)] bg-black/25 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Diversité sources</div>
                    <div className="mt-2 text-3xl font-mono font-black text-[var(--text-secondary)]">{sourceDiversityScore}</div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{highTrustSourceCount} haute confiance</p>
                  </div>
                  <div className="rounded border border-[var(--border-secondary)] bg-black/25 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Prochaine action</div>
                    <div className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">{escalation >= 60 ? 'Comparer les scénarios et exporter le briefing.' : 'Surveiller la tendance et les nouvelles sources.'}</div>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-5">              
                <div className="mt-4 space-y-2">
                  {activeAlerts.length > 0 ? activeAlerts.map((alert) => (
                    <div key={alert} className="rounded border border-[var(--alert-red)]/35 bg-[var(--alert-red)]/10 p-3 text-sm text-[var(--text-secondary)]">{alert}</div>
                  )) : <div className="rounded border border-[var(--alert-green)]/30 bg-[var(--alert-green)]/10 p-3 text-sm text-[var(--text-secondary)]">Aucune alerte locale active.</div>}
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_.75fr]">
              <div className="glass-panel p-5">
                <h2 className="hud-text text-sm">Heatmap des signaux</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {heatmapSignals.map((signal) => (
                    <div key={signal.label} className="rounded border border-[var(--border-secondary)] bg-black/25 p-3">
                      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]"><span>{signal.label}</span><span>{signal.value}</span></div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/50"><div className="h-full rounded-full" style={{ width: `${signal.value}%`, background: signal.color }} /></div>
                      <p className="mt-2 line-clamp-1 text-xs text-[var(--text-muted)]">{signal.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass-panel p-5">
                <h2 className="hud-text text-sm">Graphe d’escalade</h2>
                <div className="mt-4 space-y-2">
                  {escalationLadder.map((step) => (
                    <div key={step.level} className={`flex items-center justify-between rounded border px-3 py-2 ${step.level === pandoraLevel.level ? 'border-[var(--gold-primary)] bg-[var(--gold-primary)]/15' : 'border-[var(--border-secondary)] bg-black/20'}`}>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">N{step.level} · {step.label}</span>
                      {step.level === pandoraLevel.level && <span className="h-2 w-2 rounded-full bg-[var(--gold-primary)] shadow-[0_0_12px_var(--gold-primary)]" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
              <div className="glass-panel p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="hud-text text-sm">Tendance locale</h2>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">Compare l’analyse actuelle avec le dernier snapshot sauvegardé pour cette même paire.</p>
                  </div>
                  <span className="rounded border px-3 py-1 font-mono text-xs uppercase tracking-widest" style={{ color: trendColor, borderColor: trendColor }}>
                    {previousPairAnalysis ? trendLabel(trendDelta) : 'Baseline'}
                  </span>
                </div>
                {previousPairAnalysis ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded border border-[var(--border-secondary)] bg-black/25 p-4">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Delta risque</div>
                      <div className="mt-2 text-3xl font-mono font-black" style={{ color: trendColor }}>{formatDelta(trendDelta)}</div>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">vs {compactDateTime(previousPairAnalysis.generatedAt)}</p>
                    </div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/25 p-4">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Mentions N/M</div>
                      <div className="mt-2 text-3xl font-mono font-black text-[var(--gold-primary)]">
                        {formatDelta((nuclearMentions + militaryMentions) - (previousPairAnalysis.nuclearMentions + previousPairAnalysis.militaryMentions))}
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">nucléaire + militaire</p>
                    </div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/25 p-4">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Sources</div>
                      <div className="mt-2 text-3xl font-mono font-black text-[var(--text-secondary)]">{formatDelta(uniqueSourceCount - previousPairAnalysis.sourceCount)}</div>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">couverture unique</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded border border-[var(--border-secondary)] bg-black/25 p-4 text-sm text-[var(--text-muted)]">
                    Première mesure locale pour {actorName} → {targetName}. Relance plus tard pour obtenir une tendance.
                  </div>
                )}
              </div>

              <div className="glass-panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="hud-text text-sm">Historique local</h2>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">Derniers snapshots conservés dans ce navigateur uniquement.</p>
                  </div>
                  <button
                    disabled={!history.length}
                    onClick={clearHistory}
                    className="rounded border border-[var(--border-secondary)] bg-black/30 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)] disabled:opacity-40"
                  >
                    Vider
                  </button>
                </div>
                <div className="max-h-[250px] space-y-2 overflow-y-auto pr-1 styled-scrollbar">
                  {history.length > 0 ? history.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { setActor(item.actor); setTarget(item.target); }}
                      className="w-full rounded border border-[var(--border-secondary)] bg-black/20 p-3 text-left transition-colors hover:border-[var(--gold-primary)]/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">{item.actorName} → {item.targetName}</span>
                        <span className="shrink-0 font-mono text-lg font-black" style={{ color: riskColor(item.escalation) }}>{item.escalation}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                        <span>{compactDateTime(item.generatedAt)}</span>
                        <span>·</span>
                        <span>Niveau {item.level}</span>
                        <span>·</span>
                        <span>{item.sourceCount} source(s)</span>
                      </div>
                    </button>
                  )) : (
                    <p className="rounded border border-[var(--border-secondary)] bg-black/20 p-4 text-sm text-[var(--text-muted)]">Aucun historique local pour le moment.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="glass-panel p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="hud-text text-sm">Résumé IA du risque nucléaire</h2>
                <div className="flex items-center gap-2">
                  <button
                    disabled={!result}
                    onClick={downloadBriefing}
                    className="rounded border border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-[var(--gold-primary)] disabled:opacity-40"
                  >
                    <Download className="mr-1 inline h-3 w-3" /> Export MD
                  </button>
                  <button
                    disabled={!result}
                    onClick={exportPdf}
                    className="rounded border border-[var(--border-secondary)] bg-black/30 px-3 py-1 font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] disabled:opacity-40"
                  >
                    Export PDF
                  </button>
                  <button
                    disabled={!result}
                    onClick={exportJson}
                    className="rounded border border-[var(--border-secondary)] bg-black/30 px-3 py-1 font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] disabled:opacity-40"
                  >
                    Export JSON
                  </button>
                  <span className="rounded border px-3 py-1 text-xs font-bold uppercase tracking-widest" style={{ color: riskColor(escalation), borderColor: riskColor(escalation) }}>{riskLabel(escalation)}</span>
                </div>
              </div>
              <p className="text-base leading-relaxed text-[var(--text-secondary)]">{summary}</p>
            </div>

            <div className="glass-panel p-6">
              <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <span className="gotham-tag">OLLAMA · {aiAssessment?.model || 'pandora-nuclear-ai'}</span>
                  <h2 className="hud-text mt-2 text-sm">Pandora Nuclear AI — analyse augmentée live</h2>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Fusion IA des scores déterministes, du pack OSINT public multi-sources (~100 flux), de GDELT/Google News, du contexte pays et des capacités nucléaires.
                  </p>
                </div>
                <span className={`rounded border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${aiAssessment?.mode === 'ollama-pandora-nuclear-ai' ? 'border-[var(--alert-green)]/40 text-[var(--alert-green)]' : 'border-[#C18447]/40 text-[#C18447]'}`}>
                  {aiAssessment?.mode === 'ollama-pandora-nuclear-ai' ? 'IA active' : aiAssessment?.mode || 'IA standby'}
                </span>
              </div>
              <div className="rounded border border-[var(--border-secondary)] bg-black/25 p-4">
                {aiAssessment?.warning && (
                  <p className="mb-3 rounded border border-[#C18447]/40 bg-[#C18447]/10 p-3 text-xs text-[#C18447]">
                    Avertissement IA: {aiAssessment.warning}
                  </p>
                )}
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
                  {aiAssessment?.text || 'Analyse IA non encore disponible. Lance une analyse pour interroger Pandora Nuclear AI avec les sources live.'}
                </div>
              </div>
            </div>

            <div className="glass-panel overflow-hidden p-0">
              <div className="border-b border-[var(--border-secondary)] bg-black/30 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <span className="gotham-tag">PANDORA STRATEGIC LEVEL</span>
                    <h2 className="mt-3 font-mono text-2xl font-black uppercase tracking-[.2em]" style={{ color: pandoraLevel.color }}>
                      Niveau {pandoraLevel.level} — {pandoraLevel.label}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">{pandoraLevel.detail}</p>
                  </div>
                  <div className="rounded border px-5 py-3 text-center font-mono" style={{ borderColor: pandoraLevel.color, color: pandoraLevel.color }}>
                    <div className="text-[10px] uppercase tracking-[.25em] text-[var(--text-muted)]">Escalade</div>
                    <div className="text-4xl font-black">{escalation}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-0 xl:grid-cols-[1fr_.85fr]">
                <div className="space-y-5 border-b border-[var(--border-secondary)] p-5 xl:border-b-0 xl:border-r">
                  <div>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="hud-text text-sm">Décomposition réelle du score</h3>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Aucune donnée simulée</span>
                    </div>
                    <div className="space-y-4">
                      <ScoreLine label="Risque d’escalade" value={escalation} color={riskColor(escalation)} />
                      <ScoreLine label="Stabilité stratégique" value={stability} color="var(--gold-primary)" />
                      <ScoreLine label="Crédibilité dissuasion" value={deterrence} color="var(--alert-green)" />
                      <ScoreLine label="Risque mauvais calcul" value={miscalc} color="#C18447" />
                      <ScoreLine label="Capacité nucléaire acteur" value={nuclearContext?.actorNuclearCapability ?? 0} color="var(--gold-primary)" />
                      <ScoreLine label="Capacité nucléaire cible" value={nuclearContext?.targetNuclearCapability ?? 0} color="var(--gold-primary)" />
                      <ScoreLine label="Facteur paire nucléaire" value={pairFactorScore} color={riskColor(pairFactorScore)} />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Type de paire</div>
                      <div className="mt-2 text-sm font-bold text-[var(--gold-primary)]">{pairTypeLabel(nuclearContext?.pairType)}</div>
                    </div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Acteur</div>
                      <div className="mt-2 text-sm font-bold text-[var(--text-secondary)]">{nuclearStatusLabel(nuclearContext?.actorNuclearStatus)}</div>
                    </div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Cible</div>
                      <div className="mt-2 text-sm font-bold text-[var(--text-secondary)]">{nuclearStatusLabel(nuclearContext?.targetNuclearStatus)}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5">
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="hud-text text-sm">Couverture OSINT</h3>
                      <span className="font-mono text-xs font-bold text-[var(--gold-primary)]">{osintCoverage.score}/100</span>
                    </div>
                    <p className="mt-2 font-mono text-xs uppercase tracking-widest text-[var(--gold-primary)]">{osintCoverage.label}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{osintCoverage.detail}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-[var(--border-secondary)]">
                      <div className="h-full rounded-full bg-[var(--gold-primary)]" style={{ width: `${osintCoverage.score}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Nucléaire</div>
                      <div className="mt-1 text-2xl font-mono font-bold text-[var(--gold-primary)]">{nuclearMentions}</div>
                    </div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Militaire</div>
                      <div className="mt-1 text-2xl font-mono font-bold text-[#C18447]">{militaryMentions}</div>
                    </div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Diplomatie</div>
                      <div className="mt-1 text-2xl font-mono font-bold text-[var(--alert-green)]">{diplomacyMentions}</div>
                    </div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Sanctions</div>
                      <div className="mt-1 text-2xl font-mono font-bold text-[var(--text-secondary)]">{sanctionMentions}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 border-t border-[var(--border-secondary)] p-5 lg:grid-cols-2">
                <FactorList title="Facteurs aggravants" items={aggravatingFactors} color="var(--alert-red)" />
                <FactorList title="Facteurs stabilisants" items={stabilizingFactors} color="var(--alert-green)" />
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_.9fr]">
              <div className="glass-panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="hud-text text-sm">Timeline OSINT réelle</h2>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">Articles/liens réellement retournés par le service, triés selon l’ordre de pertinence reçu.</p>
                  </div>
                  <span className="rounded border border-[var(--border-secondary)] px-3 py-1 font-mono text-xs uppercase tracking-widest text-[var(--gold-primary)]">{filteredTimelineItems.length}/{timelineItems.length}</span>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {TIMELINE_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      onClick={() => setTimelineFilter(filter.key)}
                      className={`rounded border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${timelineFilter === filter.key ? 'border-[var(--gold-primary)] bg-[var(--gold-primary)]/15 text-[var(--gold-primary)]' : 'border-[var(--border-secondary)] bg-black/25 text-[var(--text-muted)] hover:border-[var(--gold-primary)]/50'}`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {filteredTimelineItems.length > 0 ? filteredTimelineItems.map((item) => (
                    <a
                      key={`${item.url || item.title}-${item.rank}`}
                      href={item.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded border border-[var(--border-secondary)] bg-black/20 p-3 transition-colors hover:border-[var(--gold-primary)]/50"
                    >
                      <div className="flex items-start gap-3">
                        <span className="rounded border border-[var(--gold-primary)]/30 px-2 py-1 font-mono text-[10px] text-[var(--gold-primary)]">#{item.rank}</span>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-sm font-semibold text-[var(--text-secondary)]">{item.title || item.domain || 'Source sans titre'}</div>
                          <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                            <span>{item.domain || item.connector || 'Source inconnue'}</span>
                            <span>·</span>
                            <span>{item.displayDate}</span>
                            {item.connector && <><span>·</span><span>{item.connector}</span></>}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {sourceTags(item).map((tag) => (
                              <span key={tag} className="rounded border border-[var(--gold-primary)]/25 bg-[var(--gold-primary)]/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-[var(--gold-primary)]">{tag}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </a>
                  )) : (
                    <p className="rounded border border-[var(--border-secondary)] bg-black/20 p-4 text-sm text-[var(--text-muted)]">Aucun article direct dans la réponse actuelle.</p>
                  )}
                </div>
              </div>

              <div className="glass-panel p-5">
                <h2 className="hud-text text-sm">Contradictions analytiques</h2>
                <p className="mt-2 text-xs text-[var(--text-muted)]">Détection dérivée uniquement des compteurs et scores reçus.</p>
                <div className="mt-4 space-y-3">
                  {contradictionSignals.length > 0 ? contradictionSignals.map((item) => (
                    <div key={item} className="rounded border border-[#C18447]/40 bg-[#C18447]/10 p-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {item}
                    </div>
                  )) : (
                    <div className="rounded border border-[var(--alert-green)]/30 bg-[var(--alert-green)]/10 p-3 text-sm text-[var(--text-secondary)]">
                      Aucune contradiction forte détectée dans les champs reçus.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="glass-panel p-5">
              <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="hud-text text-sm">Crédibilité détaillée des sources</h2>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">Classification déterministe depuis les vrais domaines/connecteurs reçus. Aucun score manuel inventé par source.</p>
                </div>
                <span className="rounded border border-[var(--border-secondary)] px-3 py-1 font-mono text-xs uppercase tracking-widest text-[var(--gold-primary)]">
                  {sourceCredibilityItems.length} source(s)
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sourceCredibilityItems.length > 0 ? sourceCredibilityItems.map((item) => (
                  <div key={item.name} className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--text-secondary)]" title={item.name}>{item.name}</div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest" style={{ color: item.credibility.color }}>{item.credibility.type}</div>
                      </div>
                      <span className="rounded border border-[var(--gold-primary)]/30 px-2 py-0.5 font-mono text-xs text-[var(--gold-primary)]">{item.count}</span>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{item.credibility.detail}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/50">
                      <div className="h-full rounded-full" style={{ width: `${item.credibility.score}%`, background: item.credibility.color }} />
                    </div>
                  </div>
                )) : (
                  <p className="col-span-full rounded border border-[var(--border-secondary)] bg-black/20 p-4 text-sm text-[var(--text-muted)]">Aucune source qualifiable dans la réponse actuelle.</p>
                )}
              </div>
            </div>

            <div className="glass-panel p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="hud-text text-sm">Comparaison de scénarios réels</h2>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">Appelle `/api/deterrence` avec `action: scenario` pour chaque scénario. Pas de simulation front inventée.</p>
                </div>
                <button
                  disabled={scenarioLoading || loading || actor === target}
                  onClick={compareScenarios}
                  className="rounded border border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 px-4 py-2 font-mono text-xs uppercase tracking-widest text-[var(--gold-primary)] disabled:opacity-40"
                >
                  <RefreshCw className={`mr-2 inline h-3 w-3 ${scenarioLoading ? 'animate-spin' : ''}`} /> Comparer
                </button>
              </div>
              {scenarioError && <p className="mb-3 text-xs text-[var(--alert-red)]">{scenarioError}</p>}
              {scenarioDashboard && (
                <div className="mb-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Actuel</div>
                    <div className="mt-2 text-3xl font-mono font-black" style={{ color: riskColor(scenarioDashboard.current) }}>{scenarioDashboard.current}</div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Score de l’analyse courante</p>
                  </div>
                  <div className="rounded border border-[var(--alert-green)]/30 bg-[var(--alert-green)]/10 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Désescalade relative</div>
                    <div className="mt-2 text-3xl font-mono font-black text-[var(--alert-green)]">{scenarioDashboard.deescalationScore}</div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{scenarioDashboard.deescalation?.scenario?.label || 'Scénario le plus bas'}</p>
                  </div>
                  <div className="rounded border border-[var(--alert-red)]/30 bg-[var(--alert-red)]/10 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Escalade relative</div>
                    <div className="mt-2 text-3xl font-mono font-black text-[var(--alert-red)]">{scenarioDashboard.escalationScore}</div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{scenarioDashboard.escalationScenario?.scenario?.label || 'Scénario le plus haut'}</p>
                  </div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {scenarioResults.length > 0 ? scenarioResults.map((scenario) => {
                  const postEvent = scenario.scenarioScores?.postEventEscalation ?? 0;
                  const chaos = scenario.scenarioScores?.strategicChaos ?? 0;
                  return (
                    <div key={scenario.scenario?.key || scenario.scenario?.label} className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{scenario.scenario?.label || 'Scénario'}</div>
                      <div className="mt-3 text-3xl font-mono font-black" style={{ color: riskColor(postEvent) }}>{postEvent}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">Escalade post-événement</div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/50">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, postEvent)}%`, background: riskColor(postEvent) }} />
                      </div>
                      <div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                        <span>Chaos</span><span>{chaos}/100</span>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="col-span-full rounded border border-[var(--border-secondary)] bg-black/20 p-4 text-sm text-[var(--text-muted)]">Lance la comparaison pour recevoir les scores de scénarios depuis l’API.</p>
                )}
              </div>
            </div>

            {nuclearContext && (
              <div className="glass-panel p-5">
                <h2 className="hud-text mb-4 text-sm">Contexte nucléaire réel</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                    <div className="text-xs uppercase tracking-widest text-[var(--text-muted)]">{actorName}</div>
                    <div className="mt-2 font-mono text-2xl font-bold text-[var(--gold-primary)]">{nuclearContext.actorNuclearCapability ?? 0}/100</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">{nuclearStatusLabel(nuclearContext.actorNuclearStatus)}</div>
                  </div>
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                    <div className="text-xs uppercase tracking-widest text-[var(--text-muted)]">{targetName}</div>
                    <div className="mt-2 font-mono text-2xl font-bold text-[var(--gold-primary)]">{nuclearContext.targetNuclearCapability ?? 0}/100</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">{nuclearStatusLabel(nuclearContext.targetNuclearStatus)}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  {nuclearContext.summary} Le score affiché est maintenant pondéré par ce contexte : France → Afghanistan ne doit donc plus être traité comme France → Russie.
                </p>
              </div>
            )}

            <div className="glass-panel p-5">
              <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="hud-text text-sm">Toutes les sources analysées</h2>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {signals?.articleCount ?? sources.length} article(s) analysé(s)
                    {uniqueSourceCount ? ` · ${uniqueSourceCount} média(s)/source(s) unique(s)` : ''}
                    {signals?.sourceRegistrySize ? ` · registre ${signals.sourceRegistrySize} source(s)` : ''}
                    {signals?.maxAnalyzedArticles ? ` · plafond actuel ${signals.maxAnalyzedArticles}` : ''}
                  </p>
                </div>
                <span className="rounded border border-[var(--border-secondary)] px-3 py-1 font-mono text-xs uppercase tracking-widest text-[var(--gold-primary)]">
                  noms uniquement
                </span>
              </div>

              <div className="max-h-[420px] overflow-y-auto styled-scrollbar rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                {sourceCounts.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {sourceCounts.map((source) => (
                      <div key={source.name} className="flex items-center justify-between gap-3 rounded border border-[var(--border-secondary)]/70 bg-black/30 px-3 py-2 text-sm">
                        <span className="truncate font-semibold text-[var(--text-secondary)]" title={source.name}>{source.name}</span>
                        <span className="shrink-0 rounded border border-[var(--gold-primary)]/30 px-2 py-0.5 font-mono text-xs text-[var(--gold-primary)]">{source.count}</span>
                      </div>
                    ))}
                  </div>
                ) : sources.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from(new Set(sources.map((source) => source.domain || source.connector || 'Source inconnue'))).map((name) => (
                      <div key={name} className="rounded border border-[var(--border-secondary)]/70 bg-black/30 px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">{name}</div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">Aucune source web directe à afficher.</p>
                )}
              </div>

              {(signals?.sourceCategoryCounts?.length || signals?.connectorCounts?.length) ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                    <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Catégories OSINT</div>
                    <div className="flex flex-wrap gap-2">
                      {(signals?.sourceCategoryCounts || []).slice(0, 12).map((category) => (
                        <span key={category.name} className="rounded border border-[var(--gold-primary)]/25 bg-[var(--gold-primary)]/10 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-[var(--gold-primary)]">
                          {category.name} · {category.count}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">
                    <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Connecteurs actifs</div>
                    <div className="flex flex-wrap gap-2">
                      {(signals?.connectorCounts || []).slice(0, 12).map((connector) => (
                        <span key={connector.name} className="rounded border border-[var(--border-secondary)] bg-black/30 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">
                          {connector.name} · {connector.count}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_.85fr]">
              <div className="glass-panel p-5">
                <h2 className="hud-text text-sm">Rapport analyste structuré</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--gold-primary)]">Situation</div>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{actorName} → {targetName}, niveau {pandoraLevel.level} ({pandoraLevel.label}), risque {escalation}/100.</p>
                  </div>
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--gold-primary)]">Évaluation</div>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{confidenceLabel} · couverture {osintCoverage.label.toLowerCase()} · diversité sources {sourceDiversityScore}/100.</p>
                  </div>
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--alert-red)]">Indicateurs d’escalade</div>
                    <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">{aggravatingFactors.slice(0, 3).map((item) => <li key={item}>• {item}</li>)}</ul>
                  </div>
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--alert-green)]">Stabilisation</div>
                    <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">{stabilizingFactors.slice(0, 3).map((item) => <li key={item}>• {item}</li>)}</ul>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="glass-panel p-5">
                  <h2 className="hud-text text-sm">What changed?</h2>
                  <div className="mt-4 space-y-2">
                    {whatChanged.map((item) => (
                      <div key={item} className="rounded border border-[var(--border-secondary)] bg-black/20 p-3 text-sm text-[var(--text-secondary)]">{item}</div>
                    ))}
                  </div>
                </div>
                <div className="glass-panel p-5">
                  <h2 className="hud-text text-sm">Data provenance</h2>
                  <div className="mt-4 space-y-2 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">Scores · /api/deterrence action=deterrence</div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">Sources · liveSignals.topArticles/sourceCounts/sourceCategoryCounts</div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">Historique/watchlist · localStorage navigateur</div>
                    <div className="rounded border border-[var(--border-secondary)] bg-black/20 p-3">Scénarios · /api/deterrence action=scenario</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-panel p-5">
              <h2 className="hud-text mb-3 text-sm">Pourquoi ce score ?</h2>
              <ol className="space-y-2">
                {(result?.recommendations || []).slice(0, 4).map((r, i) => <li key={r} className="rounded border border-[var(--border-secondary)] bg-black/20 p-3 text-sm"><b>{i + 1}.</b> {r}</li>)}
              </ol>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}