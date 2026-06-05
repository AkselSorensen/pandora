'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Siren,
  Zap,
} from 'lucide-react';

type AlertLevel = 'critical' | 'high' | 'medium' | 'low';

type PandoraAlert = {
  id: string;
  level: AlertLevel;
  status: string;
  title: string;
  category: string;
  source: string;
  timestamp?: string;
  location?: string;
  url?: string;
  confidence?: number;
  reasons?: string[];
  recommendedAction?: string;
};

type AlertsPayload = {
  mode: string;
  generatedAt: string;
  total: number;
  counts: Record<string, number>;
  alerts: PandoraAlert[];
  sourceDigest?: {
    posture?: string;
    riskScore?: number;
    generatedAt?: string;
    mode?: string;
  };
  warning?: string;
  error?: string;
};

const levelClass: Record<AlertLevel, string> = {
  critical: 'gotham-tag--critical',
  high: 'gotham-tag--high',
  medium: 'gotham-tag--info',
  low: 'gotham-tag--low',
};

function formatTime(value?: string) {
  if (!value) return 'TIME N/A';
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AlertsPage() {
  const [payload, setPayload] = useState<AlertsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/alerts', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Alerts API HTTP ${response.status}`);
      setPayload(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alerts unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const topLevel = useMemo(() => {
    if (!payload?.alerts?.length) return 'ROUTINE';
    if (payload.alerts.some((alert) => alert.level === 'critical')) return 'CRITICAL';
    if (payload.alerts.some((alert) => alert.level === 'high')) return 'ELEVATED';
    return 'WATCH';
  }, [payload]);

  return (
    <main className="h-screen overflow-y-auto styled-scrollbar bg-[var(--bg-void)] text-[var(--text-primary)]">
      <div className="fixed inset-0 pointer-events-none opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(198,93,78,0.12),transparent_26%),radial-gradient(circle_at_82%_0%,rgba(191,164,106,0.10),transparent_30%)]" />
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
                <span className="gotham-tag gotham-tag--critical">
                  <Siren className="h-3 w-3" /> ALERTS
                </span>
                <span className="gotham-tag gotham-tag--info">MICROSERVICE</span>
              </div>
              <h1 className="font-mono text-2xl font-bold uppercase tracking-[0.28em] text-[var(--text-heading)] md:text-4xl">
                Pandora Alerts
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)] md:text-sm">
                Alertes opérationnelles générées par le microservice `pandora-alerts` à partir du Threat Intel Digest.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/digest" className="glass-panel inline-flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--cyan-primary)] transition hover:border-[var(--cyan-primary)]/50">
              <ShieldAlert className="h-3.5 w-3.5" /> Open Digest
            </Link>
            <button
              onClick={loadAlerts}
              disabled={loading}
              className="glass-panel inline-flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold-primary)] transition hover:border-[var(--gold-primary)]/50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        {(error || payload?.warning || payload?.error) && (
          <div className="glass-panel mb-4 flex items-center gap-3 border-[var(--alert-orange)]/40 p-4 text-sm text-[var(--alert-orange)]">
            <AlertTriangle className="h-5 w-5" /> {error || payload?.warning || payload?.error}
          </div>
        )}

        {loading && !payload ? (
          <div className="glass-panel flex min-h-[55vh] flex-col items-center justify-center gap-4 p-10 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-[var(--gold-primary)]" />
            <div className="hud-text text-xs text-[var(--text-secondary)]">Loading alert stream...</div>
          </div>
        ) : payload ? (
          <div className="grid gap-4 pb-10 lg:grid-cols-[0.75fr_1.6fr]">
            <aside className="space-y-4">
              <div className="glass-panel p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="hud-label mb-1">ALERT POSTURE</div>
                    <div className="font-mono text-3xl font-bold tracking-[0.18em] text-[var(--alert-red)]">{topLevel}</div>
                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">Generated {formatTime(payload.generatedAt)}</div>
                  </div>
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-[var(--border-primary)] bg-black/20">
                    <BellRing className="h-8 w-8 text-[var(--gold-primary)]" />
                    <span className="absolute -right-1 -top-1 rounded-full border border-[var(--alert-red)]/40 bg-[var(--alert-red)]/20 px-2 py-1 font-mono text-xs font-bold text-[var(--alert-red)]">
                      {payload.total}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['critical', 'high', 'medium', 'low'] as AlertLevel[]).map((level) => (
                    <div key={level} className="glass-panel-sm p-2 text-center">
                      <div className="hud-label">{level}</div>
                      <div className="hud-value text-base">{payload.counts?.[level] || 0}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-[var(--gold-primary)]" />
                  <h2 className="hud-text text-xs text-[var(--text-heading)]">Source Digest</h2>
                </div>
                <div className="space-y-2 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between rounded border border-[var(--border-secondary)] bg-black/20 px-3 py-2"><span>Posture</span><span className="hud-value">{payload.sourceDigest?.posture || 'N/A'}</span></div>
                  <div className="flex justify-between rounded border border-[var(--border-secondary)] bg-black/20 px-3 py-2"><span>Risk</span><span className="hud-value">{payload.sourceDigest?.riskScore ?? 'N/A'}</span></div>
                  <div className="rounded border border-[var(--border-secondary)] bg-black/20 px-3 py-2">
                    <div className="text-[var(--text-muted)]">Mode</div>
                    <div className="mt-1 font-mono text-[10px] text-[var(--cyan-primary)]">{payload.mode}</div>
                  </div>
                </div>
              </div>
            </aside>

            <section className="glass-panel p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="hud-label">ACTIVE QUEUE</div>
                  <h2 className="font-mono text-lg font-bold uppercase tracking-[0.18em] text-[var(--text-heading)]">Alerts to triage</h2>
                </div>
                <span className="gotham-tag gotham-tag--info">{payload.alerts.length} OPEN</span>
              </div>

              <div className="space-y-3">
                {payload.alerts.map((alert, index) => (
                  <article key={`${alert.id}-${index}`} className="rounded-lg border border-[var(--border-secondary)] bg-black/20 p-4 transition hover:border-[var(--border-primary)]">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`gotham-tag ${levelClass[alert.level] || 'gotham-tag--info'}`}>{alert.level}</span>
                      <span className="gotham-tag gotham-tag--info">{alert.category}</span>
                      <span className="gotham-tag gotham-tag--low">{alert.status}</span>
                      {typeof alert.confidence === 'number' && <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">CONF {Math.round(alert.confidence)}%</span>}
                    </div>
                    <h3 className="text-sm font-semibold leading-snug text-[var(--text-heading)] md:text-base">{alert.title}</h3>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      <span>SRC: {alert.source}</span>
                      <span>{formatTime(alert.timestamp)}</span>
                      {alert.location && <span>LOC: {alert.location}</span>}
                    </div>
                    {!!alert.reasons?.length && (
                      <ul className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                        {alert.reasons.slice(0, 4).map((reason) => (
                          <li key={reason} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--alert-green)]" />{reason}</li>
                        ))}
                      </ul>
                    )}
                    {alert.recommendedAction && (
                      <div className="mt-3 rounded border border-[var(--border-secondary)] bg-[var(--gold-primary)]/5 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                        <strong className="text-[var(--gold-primary)]">Action:</strong> {alert.recommendedAction}
                      </div>
                    )}
                    {alert.url && (
                      <div className="mt-3 flex justify-end">
                        <a href={alert.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--gold-primary)] hover:text-[var(--gold-light)]">
                          Source <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </article>
                ))}

                {!payload.alerts.length && (
                  <div className="rounded-lg border border-[var(--border-secondary)] bg-black/20 p-8 text-center text-sm text-[var(--text-secondary)]">
                    Aucun signal ne dépasse les seuils d’alerte actuellement.
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}