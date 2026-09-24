'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Gavel, Link2,
  RefreshCw, ScrollText, ShieldAlert, UserCog,
} from 'lucide-react';
import ClearanceSwitcher, { type OperatorProfile } from '@/components/ClearanceSwitcher';

interface GovernancePanelProps {
  /** Onglet affiche au montage. */
  initialTab?: 'journal' | 'profils' | 'posture';
}

interface AuditEntry {
  seq: number;
  at: string;
  actor: string;
  role: string;
  clearance: string;
  action: string;
  resource: string;
  classification: string;
  decision: 'allow' | 'deny';
  reason: string;
  obligations: string;
  prev_hash: string;
  hash: string;
}

interface AuditResponse {
  count: number;
  entries: AuditEntry[];
}

interface VerifyResponse {
  valid: boolean;
  entries: number;
  brokenAtSeq: number | null;
  checkedAt: string;
}

interface PostureResponse {
  total: number;
  denied: number;
  allowed: number;
  byClassification: Record<string, number>;
  byActor: Record<string, number>;
  deniedByReason: Record<string, number>;
  firstEntryAt: string | null;
  lastEntry: { at: string; seq: number } | null;
  operators: OperatorProfile[];
}

interface LabelsResponse {
  classifications: Array<{ id: string; label: string; rank: number; retentionDays: number }>;
  policy: Record<string, unknown>;
  resources: {
    total: number;
    byClassification: Record<string, number>;
    resources: Array<{ path: string; type: string; classification: string; compartments: string[]; retentionDays: number }>;
  };
  enforcement: { mode: string; enforcedBy: string; note: string };
}

const TABS = [
  { id: 'journal', label: 'JOURNAL', icon: ScrollText },
  { id: 'profils', label: 'PROFILS', icon: UserCog },
  { id: 'posture', label: 'POSTURE', icon: Activity },
] as const;

function decisionTagClass(decision: string): string {
  return decision === 'deny' ? 'gotham-tag gotham-tag--critical' : 'gotham-tag gotham-tag--low';
}

function truncateHash(hash: string | undefined): string {
  if (!hash) return '—';
  return hash.length > 14 ? `${hash.slice(0, 14)}…` : hash;
}

function parseObligations(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

function sortedCounts(counts: Record<string, number> | undefined): Array<[string, number]> {
  return Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
}

function GovernancePanel({ initialTab = 'journal' }: GovernancePanelProps) {
  const [tab, setTab] = useState<'journal' | 'profils' | 'posture'>(initialTab);
  const [labels, setLabels] = useState<LabelsResponse | null>(null);
  const [posture, setPosture] = useState<PostureResponse | null>(null);
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [actor, setActor] = useState('');
  const [decision, setDecision] = useState<'all' | 'allow' | 'deny'>('all');
  const [classification, setClassification] = useState('all');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const loadGovernance = useCallback(async () => {
    try {
      const [postureResponse, labelsResponse] = await Promise.all([
        fetch('/api/governance/posture', { cache: 'no-store' }),
        fetch('/api/governance/labels', { cache: 'no-store' }),
      ]);
      if (postureResponse.ok) setPosture((await postureResponse.json()) as PostureResponse);
      else setPosture(null);
      if (labelsResponse.ok) setLabels((await labelsResponse.json()) as LabelsResponse);
      else setLabels(null);
    } catch {
      setPosture(null);
      setLabels(null);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setAuditError(null);
    const params = new URLSearchParams({ limit: '200' });
    if (actor.trim()) params.set('actor', actor.trim());
    if (decision !== 'all') params.set('decision', decision);
    if (classification !== 'all') params.set('classification', classification);
    try {
      const response = await fetch(`/api/governance/audit?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setAudit(null);
        setAuditError(`${response.status} ${payload?.error || payload?.message || 'service gouvernance indisponible'}`);
        return;
      }
      setAudit(payload as AuditResponse);
      setPage(0);
    } catch (error) {
      setAudit(null);
      setAuditError(error instanceof Error ? error.message : 'requete impossible');
    } finally {
      setLoading(false);
    }
  }, [actor, decision, classification]);

  const loadVerify = useCallback(async () => {
    setVerifyError(null);
    try {
      const response = await fetch('/api/governance/audit/verify', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setVerify(null);
        setVerifyError(`${response.status} ${payload?.error || payload?.message || 'verification indisponible'}`);
        return;
      }
      setVerify(payload as VerifyResponse);
    } catch (error) {
      setVerify(null);
      setVerifyError(error instanceof Error ? error.message : 'requete impossible');
    }
  }, []);

  useEffect(() => {
    // Chargement initial differe : le corps de l'effet ne fait aucun setState synchrone.
    queueMicrotask(() => {
      void loadGovernance();
      void loadAudit();
    });
  }, [loadGovernance, loadAudit]);

  const classificationOptions = useMemo(() => {
    const ids = new Set<string>();
    labels?.classifications?.forEach((entry) => ids.add(entry.id));
    audit?.entries?.forEach((entry) => entry.classification && ids.add(entry.classification));
    return [...ids].sort();
  }, [labels, audit]);

  const pageEntries = useMemo(() => {
    const entries = audit?.entries || [];
    return entries.slice(page * pageSize, page * pageSize + pageSize);
  }, [audit, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil((audit?.entries?.length || 0) / pageSize));

  const tabClass = (id: string) =>
    `hud-text flex items-center justify-center gap-1 rounded py-1.5 text-[7px] font-bold ${
      tab === id ? 'bg-[var(--gold-glow)] text-[var(--gold-primary)]' : 'text-[var(--text-muted)]'
    }`;

  const selectClass =
    'rounded border border-[var(--border-secondary)] bg-[var(--bg-void)] px-2 py-1 font-mono text-[9px] text-[var(--text-primary)] outline-none focus:border-[var(--border-active)]';

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel ops-panel p-3 pointer-events-auto">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="ops-orb"><Gavel className="w-4 h-4" /></div>
          <div>
            <div className="hud-text text-[12px] text-[var(--text-primary)]">GOVERNANCE</div>
            <div className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.16em]">JOURNAL · PROFILS · POSTURE</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {labels?.enforcement?.mode && <span className="gotham-tag gotham-tag--high">{labels.enforcement.mode}</span>}
          <button className="aip-mini-button" onClick={() => { void loadGovernance(); void loadAudit(); }}>
            <RefreshCw className="w-3 h-3" /> SYNC
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 mb-3 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-void)] p-[3px]">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          return (
            <button key={entry.id} className={tabClass(entry.id)} onClick={() => setTab(entry.id)}>
              <Icon className="w-3 h-3" /> {entry.label}
            </button>
          );
        })}
      </div>

      {tab === 'journal' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={selectClass} value={actor} onChange={(event) => setActor(event.target.value)} placeholder="acteur (vide = tous)" />
            <select className={selectClass} value={decision} onChange={(event) => setDecision(event.target.value as 'all' | 'allow' | 'deny')}>
              <option value="all">DECISION: TOUTES</option>
              <option value="allow">DECISION: ALLOW</option>
              <option value="deny">DECISION: DENY</option>
            </select>
            <select className={selectClass} value={classification} onChange={(event) => setClassification(event.target.value)}>
              <option value="all">CLASSIFICATION: TOUTES</option>
              {classificationOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select className={selectClass} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>
              {[25, 50, 100, 200].map((value) => <option key={value} value={value}>{value} LIGNES / PAGE</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button className="ops-action" onClick={() => void loadAudit()} disabled={loading}>
              <ScrollText className="w-3 h-3" /> {loading ? 'CHARGEMENT' : 'FILTRER'}
            </button>
            <span className="hud-label">
              {audit ? `${audit.entries?.length || 0} ENTREES CHARGEES / ${audit.count ?? '?'} COTE SERVICE` : 'AUCUNE DONNEE'}
            </span>
          </div>

          {auditError && (
            <div className="aip-list-row">
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--alert-red)]" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-mono text-[var(--text-primary)]">JOURNAL INDISPONIBLE — {auditError}</div>
                <div className="hud-label">GATEWAY /api/governance/audit · SERVICE PANDORA_GOVERNANCE_URL</div>
              </div>
            </div>
          )}

          <div className="max-h-[320px] overflow-y-auto styled-scrollbar space-y-1">
            {pageEntries.map((entry) => {
              const obligations = parseObligations(entry.obligations);
              return (
                <div key={`${entry.seq}-${entry.hash}`} className="aip-list-row">
                  <span className="hud-label w-10 shrink-0">#{entry.seq}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[9px] font-mono text-[var(--text-primary)]">
                      {entry.actor} → {entry.action} · {entry.resource}
                    </div>
                    <div className="hud-label truncate">
                      {entry.at ? new Date(entry.at).toLocaleString() : 'time?'} · {entry.role}/{entry.clearance} · {entry.classification} · {entry.reason || 'no reason'}
                    </div>
                    <div className="hud-label truncate">
                      {truncateHash(entry.hash)} ← {truncateHash(entry.prev_hash)}
                      {obligations.length > 0 ? ` · OBLIGATIONS: ${obligations.join(', ')}` : ''}
                    </div>
                  </div>
                  <span className={decisionTagClass(entry.decision)}>{entry.decision}</span>
                </div>
              );
            })}
            {audit && pageEntries.length === 0 && !auditError && <div className="hud-label">AUCUNE ENTREE POUR CES FILTRES</div>}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button className="aip-mini-button" onClick={() => setPage((prev) => Math.max(0, prev - 1))} disabled={page === 0}>
              <ChevronLeft className="w-3 h-3" /> PRECEDENT
            </button>
            <span className="hud-label">PAGE {page + 1} / {pageCount}</span>
            <button className="aip-mini-button" onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))} disabled={page >= pageCount - 1}>
              SUIVANT <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {tab === 'profils' && (
        <div className="space-y-3">
          <div className="max-h-[180px] overflow-y-auto styled-scrollbar space-y-1">
            {(posture?.operators || []).map((entry) => (
              <div key={entry.operator} className="aip-list-row">
                <UserCog className="w-3.5 h-3.5" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[9px] font-mono text-[var(--text-primary)]">{entry.operator}</div>
                  <div className="hud-label truncate">
                    {entry.role} · {entry.clearance} · COMPARTIMENTS: {(entry.compartments || []).join(', ') || 'aucun'} · {entry.no_export ? 'NO EXPORT' : 'EXPORT AUTORISE'}
                  </div>
                </div>
                <span className="hud-label">{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '—'}</span>
              </div>
            ))}
            {(!posture || (posture.operators || []).length === 0) && (
              <div className="hud-label">
                AUCUN PROFIL ENREGISTRE — /api/governance/posture (PUT /api/governance/operators/&#123;operator&#125; pour creer)
              </div>
            )}
          </div>
          <ClearanceSwitcher operators={posture?.operators || []} onSaved={() => void loadGovernance()} />
        </div>
      )}

      {tab === 'posture' && (
        <div className="space-y-3">
          <div className="public-intel-stats">
            <div><span>TOTAL</span><strong>{posture?.total ?? 0}</strong></div>
            <div><span>ALLOWED</span><strong>{posture?.allowed ?? 0}</strong></div>
            <div><span>DENIED</span><strong>{posture?.denied ?? 0}</strong></div>
            <div><span>OPERATEURS</span><strong>{posture?.operators?.length ?? 0}</strong></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="hud-label mb-1">REPARTITION PAR CLASSIFICATION</div>
              <div className="space-y-1">
                {sortedCounts(posture?.byClassification).map(([key, value]) => (
                  <div key={key} className="aip-list-row"><span className="truncate flex-1 text-[9px] font-mono">{key}</span><strong className="hud-value">{value}</strong></div>
                ))}
                {sortedCounts(posture?.byClassification).length === 0 && <div className="hud-label">AUCUNE ENTREE</div>}
              </div>
            </div>
            <div>
              <div className="hud-label mb-1">REFUS PAR RAISON</div>
              <div className="space-y-1">
                {sortedCounts(posture?.deniedByReason).map(([key, value]) => (
                  <div key={key} className="aip-list-row"><span className="truncate flex-1 text-[9px] font-mono">{key}</span><strong className="hud-value">{value}</strong></div>
                ))}
                {sortedCounts(posture?.deniedByReason).length === 0 && <div className="hud-label">AUCUN REFUS ENREGISTRE</div>}
              </div>
            </div>
          </div>

          <div>
            <div className="hud-label mb-1">REPARTITION PAR ACTEUR</div>
            <div className="max-h-[140px] overflow-y-auto styled-scrollbar space-y-1">
              {sortedCounts(posture?.byActor).map(([key, value]) => (
                <div key={key} className="aip-list-row"><span className="truncate flex-1 text-[9px] font-mono">{key}</span><strong className="hud-value">{value}</strong></div>
              ))}
              {sortedCounts(posture?.byActor).length === 0 && <div className="hud-label">AUCUN ACTEUR ENREGISTRE</div>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="ops-action flex-1" onClick={() => void loadVerify()}><Link2 className="w-3 h-3" /> VERIFIER LA CHAINE</button>
            <a className="aip-mini-button" href="/api/governance/audit/verify" target="_blank" rel="noopener noreferrer">/api/governance/audit/verify</a>
          </div>

          {verify && (
            <div className="aip-list-row">
              {verify.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--alert-green)]" /> : <AlertTriangle className="w-3.5 h-3.5 text-[var(--alert-red)]" />}
              <div className="min-w-0 flex-1">
                <span className={verify.valid ? 'gotham-tag gotham-tag--low' : 'gotham-tag gotham-tag--critical'}>
                  {verify.valid ? `CHAINE INTEGRE (${verify.entries} ENTREES)` : `RUPTURE AU SEQ ${verify.brokenAtSeq ?? '?'}`}
                </span>
                <div className="hud-label">VERIFIE: {verify.checkedAt ? new Date(verify.checkedAt).toLocaleString() : '—'}</div>
              </div>
            </div>
          )}
          {verifyError && <div className="hud-label">VERIFICATION INDISPONIBLE — {verifyError}</div>}

          <div className="hud-label">
            REGLE FAIL-CLOSED — UNE ACTION NON AUTORISEE EST REFUSEE PAR DEFAUT ({labels?.enforcement?.enforcedBy || 'src/proxy.ts'}).
            DERNIER EVENEMENT: {posture?.lastEntry ? `#${posture.lastEntry.seq} · ${new Date(posture.lastEntry.at).toLocaleString()}` : 'AUCUN'}
            {posture?.firstEntryAt ? ` · PREMIER: ${new Date(posture.firstEntryAt).toLocaleString()}` : ''}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default memo(GovernancePanel);
