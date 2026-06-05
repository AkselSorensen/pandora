'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  RefreshCw,
  Shield,
  Signal,
  XCircle,
} from 'lucide-react';

type Severity = 'critical' | 'high' | 'medium' | 'low';

type DigestItem = {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  source: string;
  timestamp?: string;
  location?: string;
  url?: string;
  summary?: string;
  confidence: number;
  tags: string[];
};

type SourceStatus = {
  key: string;
  label: string;
  ok: boolean;
  count: number;
  error?: string;
};

type Digest = {
  generatedAt: string;
  posture: string;
  riskScore: number;
  executiveSummary: string[];
  priorityItems: DigestItem[];
  counts: Record<string, number>;
  recommendedActions: string[];
  sourceStatus: SourceStatus[];
  markdown: string;
};

const severityClass: Record<Severity, string> = {
  critical: 'gotham-tag--critical',
  high: 'gotham-tag--high',
  medium: 'gotham-tag--info',
  low: 'gotham-tag--low',
};

function formatTime(value?: string) {
  if (!value) return 'TIME N/A';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function downloadMarkdown(markdown: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pandora-threat-digest-${new Date().toISOString().slice(0, 10)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function DigestPage() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadDigest = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/digest', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Digest API HTTP ${response.status}`);
      const data = await response.json();
      setDigest(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Digest unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDigest();
  }, [loadDigest]);

  const dominantCategories = useMemo(() => {
    if (!digest) return [];
    return Object.entries(digest.counts)
      .filter(([key]) => !['critical', 'high', 'medium', 'low'].includes(key))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [digest]);

  const copyMarkdown = async () => {
    if (!digest?.markdown) return;
    await navigator.clipboard.writeText(digest.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="h-screen overflow-y-auto styled-scrollbar bg-[var(--bg-void)] text-[var(--text-primary)]">
      <div className="fixed inset-0 pointer-events-none opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(191,164,106,0.12),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(143,167,160,0.10),transparent_28%)]" />
        <div className="absolute inset-0 crt-scanlines opacity-[0.03]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 md:px-8 md:py-8">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="glass-panel p-2.5 transition hover:border-[var(--gold-primary)]/50" title="Back to Atlas">
              <ArrowLeft className="h-4 w-4 text-[var(--gold-primary)]" />
            </Link>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="gotham-tag gotham-tag--info">
                  <Brain className="h-3 w-3" /> AI DIGEST
                </span>
                <span className="gotham-tag gotham-tag--low">DEFENSIVE OSINT</span>
              </div>
              <h1 className="font-mono text-2xl font-bold uppercase tracking-[0.28em] text-[var(--text-heading)] md:text-4xl">
                Threat Intel Digest
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)] md:text-sm">
                Briefing généré depuis les connecteurs Pandora : cyber, incidents globaux, risques naturels, météo sévère et météo spatiale.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadDigest}
              disabled={loading}
              className="glass-panel inline-flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold-primary)] transition hover:border-[var(--gold-primary)]/50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={copyMarkdown}
              disabled={!digest}
              className="glass-panel inline-flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--cyan-primary)] transition hover:border-[var(--cyan-primary)]/50 disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy MD'}
            </button>
            <button
              onClick={() => digest && downloadMarkdown(digest.markdown)}
              disabled={!digest}
              className="glass-panel inline-flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--alert-green)] transition hover:border-[var(--alert-green)]/50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </header>

        {error && (
          <div className="glass-panel mb-4 flex items-center gap-3 border-[var(--alert-red)]/40 p-4 text-sm text-[var(--alert-red)]">
            <AlertTriangle className="h-5 w-5" /> {error}
          </div>
        )}

        {loading && !digest ? (
          <div className="glass-panel flex min-h-[55vh] flex-col items-center justify-center gap-4 p-10 text-center">
            <div className="relative h-16 w-16 rounded-full border border-[var(--gold-primary)]/30">
              <div className="absolute inset-2 rounded-full border border-[var(--cyan-primary)]/20" />
              <RefreshCw className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-[var(--gold-primary)]" />
            </div>
            <div className="hud-text text-xs text-[var(--text-secondary)]">Collecting public intelligence feeds...</div>
          </div>
        ) : digest ? (
          <div className="grid gap-4 pb-10 lg:grid-cols-[0.9fr_1.4fr]">
            <div className="space-y-4">
              <div className="glass-panel p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="hud-label mb-1">GLOBAL POSTURE</div>
                    <div className="font-mono text-3xl font-bold tracking-[0.18em] text-[var(--gold-primary)]">{digest.posture}</div>
                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">Generated {formatTime(digest.generatedAt)}</div>
                  </div>
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-[var(--border-primary)] bg-black/20">
                    <div className="absolute inset-2 rounded-full border border-[var(--gold-primary)]/20" />
                    <div className="text-center">
                      <div className="font-mono text-2xl font-bold text-[var(--text-heading)]">{digest.riskScore}</div>
                      <div className="hud-label">RISK</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['critical', 'high', 'medium', 'low'] as Severity[]).map((severity) => (
                    <div key={severity} className="glass-panel-sm p-2 text-center">
                      <div className="hud-label">{severity}</div>
                      <div className="hud-value text-base">{digest.counts[severity] || 0}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-5">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[var(--gold-primary)]" />
                  <h2 className="hud-text text-xs text-[var(--text-heading)]">Executive Summary</h2>
                </div>
                <ul className="space-y-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {digest.executiveSummary.map((line) => (
                    <li key={line} className="flex gap-2">
                      <Signal className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cyan-primary)]" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="glass-panel p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--gold-primary)]" />
                  <h2 className="hud-text text-xs text-[var(--text-heading)]">Dominant Categories</h2>
                </div>
                <div className="space-y-2">
                  {dominantCategories.map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between rounded border border-[var(--border-secondary)] bg-black/20 px-3 py-2">
                      <span className="text-xs text-[var(--text-secondary)]">{category}</span>
                      <span className="hud-value">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[var(--alert-green)]" />
                  <h2 className="hud-text text-xs text-[var(--text-heading)]">Source Health</h2>
                </div>
                <div className="space-y-2">
                  {digest.sourceStatus.map((source) => (
                    <div key={source.key} className="flex items-center justify-between gap-3 rounded border border-[var(--border-secondary)] bg-black/20 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {source.ok ? <CheckCircle2 className="h-4 w-4 text-[var(--alert-green)]" /> : <XCircle className="h-4 w-4 text-[var(--alert-red)]" />}
                        <div className="min-w-0">
                          <div className="truncate text-xs text-[var(--text-primary)]">{source.label}</div>
                          {source.error && <div className="truncate text-[9px] text-[var(--alert-red)]">{source.error}</div>}
                        </div>
                      </div>
                      <span className="hud-value">{source.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="glass-panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="hud-label">PRIORITY QUEUE</div>
                    <h2 className="font-mono text-lg font-bold uppercase tracking-[0.18em] text-[var(--text-heading)]">Signals to review</h2>
                  </div>
                  <span className="gotham-tag gotham-tag--info">{digest.priorityItems.length} ITEMS</span>
                </div>
                <div className="space-y-3">
                  {digest.priorityItems.map((item, index) => (
                    <article key={`${item.id}-${index}`} className="rounded-lg border border-[var(--border-secondary)] bg-black/20 p-4 transition hover:border-[var(--border-primary)]">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`gotham-tag ${severityClass[item.severity]}`}>{item.severity}</span>
                        <span className="gotham-tag gotham-tag--info">{item.category}</span>
                        <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">CONF {item.confidence}%</span>
                      </div>
                      <h3 className="text-sm font-semibold leading-snug text-[var(--text-heading)] md:text-base">{item.title}</h3>
                      {item.summary && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">{item.summary}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--text-muted)]">
                        <span>SRC: {item.source}</span>
                        <span>{formatTime(item.timestamp)}</span>
                        {item.location && <span>LOC: {item.location}</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {(item.tags || []).slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded border border-[var(--border-secondary)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">#{tag}</span>
                          ))}
                        </div>
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--gold-primary)] hover:text-[var(--gold-light)]">
                            Source <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-5">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[var(--gold-primary)]" />
                  <h2 className="hud-text text-xs text-[var(--text-heading)]">Recommended Analyst Actions</h2>
                </div>
                <ol className="space-y-2">
                  {digest.recommendedActions.map((action, index) => (
                    <li key={action} className="flex gap-3 rounded border border-[var(--border-secondary)] bg-black/20 p-3 text-sm text-[var(--text-secondary)]">
                      <span className="hud-value shrink-0">{String(index + 1).padStart(2, '0')}</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}