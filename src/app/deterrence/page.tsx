'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw, Shield } from 'lucide-react';

type Country = { key: string; name: string; region: string; arsenal_band: string; estimated_warheads_band: string };
type SourceItem = { title?: string; domain?: string; url?: string; connector?: string };
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
  scores?: Record<string, number>;
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
    maxAnalyzedArticles?: number;
    topArticles?: SourceItem[];
  };
};

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

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass-panel p-4">
      <div className="hud-label">{label}</div>
      <div className="mt-2 text-4xl font-bold font-mono" style={{ color }}>{value}</div>
      <div className="mt-3 h-2 rounded bg-black/40">
        <div className="h-2 rounded" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
    </div>
  );
}

export default function DeterrencePage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [actor, setActor] = useState('france');
  const [target, setTarget] = useState('russia');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadCountries() {
    const r = await fetch('/api/deterrence?resource=countries', { cache: 'no-store' });
    const d = await r.json();
    if (Array.isArray(d.countries)) setCountries(d.countries);
  }

  async function analyze() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/deterrence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deterrence',
          actor,
          target,
          tension: 50,
          alliance_involvement: 50,
          communication_quality: 50,
          use_live_sources: true,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.error || 'Analyse impossible');
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
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

  const actorName = countries.find((c) => c.key === actor)?.name || actor;
  const targetName = countries.find((c) => c.key === target)?.name || target;
  const scores = useMemo(() => result?.scores || {}, [result]);
  const escalation = scores.escalationRisk || 0;
  const stability = scores.strategicStability || 0;
  const deterrence = scores.deterrenceCredibility || 0;
  const miscalc = scores.miscalculationRisk || 0;
  const signals = result?.liveSignals;
  const nuclearContext = result?.nuclearContext;
  const sources = signals?.topArticles || [];
  const sourceCounts = signals?.sourceCounts || [];
  const uniqueSourceCount = signals?.sourceCount ?? sourceCounts.length;

  const summary = useMemo(() => {
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
  }, [result, signals, sources.length, escalation, stability, actorName, targetName, uniqueSourceCount, nuclearContext]);

  return (
    <main className="fixed inset-0 h-dvh overflow-y-scroll styled-scrollbar bg-[var(--bg-void)] text-[var(--text-primary)]">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/90 p-4 backdrop-blur-xl">
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(216,162,74,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(216,162,74,0.12)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-[var(--gold-primary)]/10 blur-3xl" />
          <div className="absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-[var(--alert-red)]/10 blur-3xl" />

          <div className="glass-panel relative w-full max-w-4xl overflow-hidden border-[var(--gold-primary)]/50 p-0 text-center shadow-2xl shadow-[var(--gold-primary)]/20">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--gold-primary)] to-transparent" />
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--gold-primary)]/10 to-transparent" />

            <div className="grid gap-0 lg:grid-cols-[1.2fr_.8fr]">
              <div className="relative flex min-h-[520px] items-center justify-center overflow-hidden border-b border-[var(--border-secondary)] bg-black/60 p-6 lg:border-b-0 lg:border-r">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(216,162,74,0.18),transparent_58%)]" />
                <div className="absolute inset-x-0 top-1/2 h-px animate-pulse bg-[var(--gold-primary)]/50 shadow-[0_0_30px_var(--gold-primary)]" />
                <div className="relative rounded-2xl border border-[var(--gold-primary)]/40 bg-black/70 p-5 shadow-2xl shadow-[var(--gold-primary)]/20">
                  <img src="/asset/nuclear.gif" alt="Analyse  nucléaire en cours" className="mx-auto h-[360px] w-[360px] object-contain md:h-[430px] md:w-[430px]" />
                </div>
              </div>

              <div className="relative flex flex-col justify-center p-8 text-left">
                <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[.25em] text-[var(--gold-primary)]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--gold-primary)]" /> Live analysis
                </div>
                <h2 className="font-mono text-3xl font-black uppercase tracking-[.18em] text-[var(--text-primary)] md:text-4xl">
                  Analyse Nucléaire
                </h2>
                <p className="mt-3 text-sm uppercase tracking-[.35em] text-[var(--gold-primary)]">
                  {actorName} → {targetName}
                </p>
                <p className="mt-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Collecte des sources ouvertes, déduplication des articles, extraction des signaux militaires/nucléaires et pondération du contexte stratégique réel.
                </p>

                <div className="mt-7 space-y-3 font-mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
                  <div className="flex items-center justify-between rounded border border-[var(--border-secondary)] bg-black/30 px-3 py-2">
                    <span>Sources web</span><span className="text-[var(--gold-primary)]">Collecte</span>
                  </div>
                  <div className="flex items-center justify-between rounded border border-[var(--border-secondary)] bg-black/30 px-3 py-2">
                    <span>Signaux OSINT</span><span className="text-[var(--gold-primary)]">Analyse Nucléaire</span>
                  </div>
                  <div className="flex items-center justify-between rounded border border-[var(--border-secondary)] bg-black/30 px-3 py-2">
                    <span>Risque nucléaire</span><span className="text-[var(--gold-primary)]">Calcul</span>
                  </div>
                </div>

                <div className="mt-8">
                  <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[.25em] text-[var(--text-muted)]">
                    <span>Traitement en cours</span><span>Veuillez patienter</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/60 ring-1 ring-[var(--gold-primary)]/20">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-[var(--gold-primary)] via-white to-[var(--gold-primary)] shadow-[0_0_24px_var(--gold-primary)]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <section className="mx-auto max-w-7xl p-6 pb-20">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="glass-panel p-2"><ArrowLeft className="h-4 w-4 text-[var(--gold-primary)]" /></Link>
            <div>
              <span className="gotham-tag gotham-tag--critical"><Shield className="h-3 w-3" /> PANDORA-NUCLEAR OSINT</span>
              <h1 className="mt-2 font-mono text-3xl font-bold uppercase tracking-[.25em]">Nuclear Risk Summary</h1>
            </div>
          </div>
          <button onClick={analyze} className="glass-panel px-4 py-2 font-mono text-xs text-[var(--gold-primary)]">
            <RefreshCw className={`mr-2 inline h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Analyser Le Pays
          </button>
        </header>



        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="glass-panel p-5">
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
              <button disabled={loading || actor === target} onClick={analyze} className="w-full rounded border border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 px-4 py-3 font-mono text-xs uppercase tracking-widest text-[var(--gold-primary)] disabled:opacity-40">Analyser le risque</button>
              {error && <p className="text-xs text-[var(--alert-red)]">{error}</p>}
            </div>
          </aside>

          <section className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <Gauge label="Probabilité / Risque" value={escalation} color={riskColor(escalation)} />
              <Gauge label="Stabilité" value={stability} color="var(--gold-primary)" />
              <Gauge label="Dissuasion" value={deterrence} color="var(--alert-green)" />
              <Gauge label="Mauvais calcul" value={miscalc} color="#C18447" />
            </div>

            <div className="glass-panel p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="hud-text text-sm">Résumé IA du risque nucléaire</h2>
                <span className="rounded border px-3 py-1 text-xs font-bold uppercase tracking-widest" style={{ color: riskColor(escalation), borderColor: riskColor(escalation) }}>{riskLabel(escalation)}</span>
              </div>
              <p className="text-base leading-relaxed text-[var(--text-secondary)]">{summary}</p>
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