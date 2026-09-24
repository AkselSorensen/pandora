'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, AlertTriangle, Ban, Check, ClipboardList, Copy, Download, FileText,
  Fingerprint, FolderOpen, FolderPlus, Hash, Layers, Loader2, Lock, RefreshCw,
  Save, Send, ShieldAlert, ShieldCheck, Sparkles, User, XCircle,
} from 'lucide-react';

type PanelTab = 'cases' | 'detail' | 'evidence';

interface EvidenceItem {
  id: string;
  kind?: string;
  label?: string;
  source_url?: string | null;
  payload?: unknown;
  payload_hash?: string | null;
  collected_at?: string | null;
  collected_by?: string | null;
}

interface CaseEvent {
  id: string;
  at?: string | null;
  actor?: string | null;
  kind?: string | null;
  body?: unknown;
}

interface CustodyStep {
  at?: string | null;
  actor?: string | null;
  step?: string | null;
  detail?: string | null;
  ref?: string | null;
  hash?: string | null;
}

interface IntegrityReport {
  checked?: number;
  valid?: number;
  brokenEvidence?: unknown[];
}

interface AnalystCase {
  id: string;
  title: string;
  summary?: string;
  hypothesis?: string;
  status?: string;
  priority?: string;
  classification?: string;
  compartments?: string[];
  owner?: string;
  origin?: string;
  auditSeq?: number | null;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
  evidenceCount?: number;
  evidence?: EvidenceItem[];
  events?: CaseEvent[];
  custody?: CustodyStep[];
  evidenceIntegrity?: IntegrityReport;
}

interface CaseStats {
  cases?: number;
  evidence?: number;
  events?: number;
  byStatus?: Record<string, number>;
  byPriority?: Record<string, number>;
}

interface Notice {
  kind: 'ok' | 'error' | 'warn';
  text: string;
}

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'cases', label: 'DOSSIERS' },
  { id: 'detail', label: 'DETAIL' },
  { id: 'evidence', label: 'PREUVE' },
];

const BASE_STATUSES = ['open', 'active', 'monitoring', 'closed'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const EVIDENCE_KINDS = ['source_ref', 'entity', 'alert', 'note'];

const PRIORITY_TAG: Record<string, string> = {
  critical: 'gotham-tag--critical',
  high: 'gotham-tag--high',
  medium: 'gotham-tag--info',
  low: 'gotham-tag--low',
};

const INPUT_CLASS =
  'w-full rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1.5 font-mono text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Never invent a message: relay whatever the service said, plus the status code. */
function problem(payload: unknown, status: number): string {
  const body = asRecord(payload);
  const detail = body.detail;
  if (detail && typeof detail === 'object') {
    const record = asRecord(detail);
    const reason = record.reason || record.error;
    return typeof reason === 'string' && reason ? reason : `HTTP ${status}`;
  }
  if (typeof detail === 'string' && detail) return detail;
  if (typeof body.error === 'string' && body.error) return body.error;
  if (typeof body.hint === 'string' && body.hint) return body.hint;
  return `HTTP ${status}`;
}

function entryText(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  const parts = ['source', 'service', 'error', 'reason', 'detail', 'id']
    .map(key => (typeof record[key] === 'string' ? String(record[key]) : ''))
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : JSON.stringify(value);
}

function shortHash(value?: string | null): string {
  if (!value) return '—';
  return value.length > 16 ? `${value.slice(0, 10)}…${value.slice(-4)}` : value;
}

function stamp(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function eventText(body: unknown): string {
  if (typeof body === 'string') return body;
  const record = asRecord(body);
  if (typeof record.text === 'string') return record.text;
  return JSON.stringify(body ?? null);
}

function tagForPriority(priority?: string): string {
  return `gotham-tag ${PRIORITY_TAG[priority || ''] || 'gotham-tag--info'}`;
}

function CasesPanel() {
  const [tab, setTab] = useState<PanelTab>('cases');
  const [statusFilter, setStatusFilter] = useState('');
  const [cases, setCases] = useState<AnalystCase[]>([]);
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [governanceDown, setGovernanceDown] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnalystCase | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);

  const [hypothesisDraft, setHypothesisDraft] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<string | null>(null);
  const [priorityDraft, setPriorityDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const [createForm, setCreateForm] = useState({
    title: '', summary: '', hypothesis: '', priority: 'medium', status: 'open',
    owner: '', classification: '', compartments: '',
  });
  const [evidenceForm, setEvidenceForm] = useState({
    kind: 'source_ref', label: '', source_url: '', payload: '{}', entity_id: '',
  });

  const loadCases = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const query = `?limit=50${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ''}`;
      const response = await fetch(`/api/cases${query}`, { cache: 'no-store' });
      const payload = await readBody(response);
      if (response.status === 503) {
        setGovernanceDown(true);
        setCases([]);
        setStats(null);
        setListError(problem(payload, 503));
        return;
      }
      if (!response.ok) {
        setCases([]);
        setStats(null);
        setListError(problem(payload, response.status));
        return;
      }
      const body = asRecord(payload);
      setCases(Array.isArray(body.cases) ? (body.cases as AnalystCase[]) : []);
      setStats((body.stats as CaseStats) || null);
    } catch (error) {
      setCases([]);
      setStats(null);
      setListError(error instanceof Error ? error.message : 'API injoignable');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const payload = await readBody(response);
      if (response.status === 503) {
        setGovernanceDown(true);
        setDetail(null);
        setDetailError(problem(payload, 503));
        return;
      }
      if (!response.ok) {
        setDetail(null);
        setDetailError(problem(payload, response.status));
        return;
      }
      const body = payload as AnalystCase;
      setDetail(body);
      setIntegrity(body.evidenceIntegrity || null);
    } catch (error) {
      setDetail(null);
      setDetailError(error instanceof Error ? error.message : 'API injoignable');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCases(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCases]);

  const statusOptions = useMemo(() => {
    const seen = new Set(BASE_STATUSES);
    Object.keys(stats?.byStatus || {}).forEach(key => seen.add(key));
    return Array.from(seen);
  }, [stats]);

  const detailStatusOptions = useMemo(() => {
    const seen = new Set(statusOptions);
    if (detail?.status) seen.add(detail.status);
    return Array.from(seen);
  }, [statusOptions, detail]);

  const orderedCases = useMemo(() => {
    const rank = (priority?: string) => {
      const index = PRIORITIES.indexOf(priority || '');
      return index < 0 ? PRIORITIES.length : index;
    };
    return [...cases].sort((a, b) => {
      const byPriority = rank(a.priority) - rank(b.priority);
      if (byPriority !== 0) return byPriority;
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
    });
  }, [cases]);

  const openCase = (id: string) => {
    setSelectedId(id);
    setTab('detail');
    setNotice(null);
    setHypothesisDraft(null);
    setStatusDraft(null);
    setPriorityDraft(null);
    setNoteDraft('');
    void loadDetail(id);
  };

  /** Single funnel for every write: 503 locks the panel, 403 shows the ABAC reason. */
  const guard = (status: number, payload: unknown): string | null => {
    if (status === 503) {
      setGovernanceDown(true);
      return problem(payload, 503);
    }
    if (status === 403) return `REFUS ABAC — ${problem(payload, 403)}`;
    if (status >= 400) return problem(payload, status);
    return null;
  };

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      setNotice({ kind: 'error', text: 'PRESSE-PAPIERS INDISPONIBLE' });
    }
  };

  const generateFromAlerts = async () => {
    setBusy('generate');
    setNotice(null);
    try {
      const response = await fetch('/api/cases/generate', { method: 'POST' });
      const payload = await readBody(response);
      const blocked = guard(response.status, payload);
      if (blocked) {
        setNotice({ kind: 'error', text: blocked });
        return;
      }
      const body = asRecord(payload);
      const degraded = Array.isArray(body.degraded) ? body.degraded : [];
      const lines = [
        `CREES ${typeof body.created === 'number' ? body.created : 0}`,
        `DEJA CONNUS ${typeof body.alreadyKnown === 'number' ? body.alreadyKnown : 0}`,
      ];
      if (degraded.length) lines.push(`DEGRADE ${degraded.map(entryText).join(' | ')}`);
      setNotice({ kind: degraded.length ? 'warn' : 'ok', text: lines.join(' — ') });
      await loadCases();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'API injoignable' });
    } finally {
      setBusy('');
    }
  };

  const createCase = async () => {
    if (!createForm.title.trim()) {
      setNotice({ kind: 'error', text: 'TITRE OBLIGATOIRE' });
      return;
    }
    setBusy('create');
    setNotice(null);
    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title.trim(),
          summary: createForm.summary.trim(),
          hypothesis: createForm.hypothesis.trim(),
          priority: createForm.priority,
          status: createForm.status,
          owner: createForm.owner.trim(),
          classification: createForm.classification.trim(),
          compartments: createForm.compartments.split(',').map(item => item.trim()).filter(Boolean),
        }),
      });
      const payload = await readBody(response);
      const blocked = guard(response.status, payload);
      if (blocked) {
        setNotice({ kind: 'error', text: blocked });
        return;
      }
      const created = asRecord(asRecord(payload).case) as unknown as AnalystCase;
      setNotice({ kind: 'ok', text: `DOSSIER CREE ${created.id || ''}`.trim() });
      setCreateForm({ title: '', summary: '', hypothesis: '', priority: 'medium', status: 'open', owner: '', classification: '', compartments: '' });
      await loadCases();
      if (created.id) openCase(created.id);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'API injoignable' });
    } finally {
      setBusy('');
    }
  };

  const patchCase = async (patch: Record<string, unknown>, label: string) => {
    if (!detail) return;
    setBusy(label);
    setNotice(null);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(detail.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await readBody(response);
      const blocked = guard(response.status, payload);
      if (blocked) {
        setNotice({ kind: 'error', text: blocked });
        return;
      }
      const decision = asRecord(asRecord(payload).auditDecision);
      const seq = typeof decision.seq === 'number' ? decision.seq : '—';
      const reason = typeof decision.reason === 'string' && decision.reason ? ` — ${decision.reason}` : '';
      setNotice({ kind: 'ok', text: `${label} — AUDIT #${seq}${reason}` });
      setHypothesisDraft(null);
      setStatusDraft(null);
      setPriorityDraft(null);
      await loadDetail(detail.id);
      await loadCases();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'API injoignable' });
    } finally {
      setBusy('');
    }
  };

  const submitStatusPriority = async () => {
    if (!detail) return;
    const patch: Record<string, unknown> = {};
    if (statusDraft && statusDraft !== detail.status) patch.status = statusDraft;
    if (priorityDraft && priorityDraft !== detail.priority) patch.priority = priorityDraft;
    if (!Object.keys(patch).length) {
      setNotice({ kind: 'warn', text: 'AUCUNE MODIFICATION A APPLIQUER' });
      return;
    }
    await patchCase(patch, 'STATUT/PRIORITE');
  };

  const addNote = async () => {
    if (!detail || !noteDraft.trim()) {
      setNotice({ kind: 'error', text: 'NOTE VIDE' });
      return;
    }
    setBusy('note');
    setNotice(null);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(detail.id)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'note', body: { text: noteDraft.trim() } }),
      });
      const payload = await readBody(response);
      const blocked = guard(response.status, payload);
      if (blocked) {
        setNotice({ kind: 'error', text: blocked });
        return;
      }
      setNotice({ kind: 'ok', text: 'NOTE AJOUTEE' });
      setNoteDraft('');
      await loadDetail(detail.id);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'API injoignable' });
    } finally {
      setBusy('');
    }
  };

  const addEvidence = async () => {
    if (!selectedId) {
      setNotice({ kind: 'error', text: 'AUCUN DOSSIER SELECTIONNE' });
      return;
    }
    if (!evidenceForm.label.trim()) {
      setNotice({ kind: 'error', text: 'LIBELLE OBLIGATOIRE' });
      return;
    }
    let payload: Record<string, unknown>;
    try {
      payload = asRecord(JSON.parse(evidenceForm.payload || '{}'));
    } catch {
      setNotice({ kind: 'error', text: 'PAYLOAD JSON INVALIDE' });
      return;
    }
    if (evidenceForm.entity_id.trim()) payload.entity_id = evidenceForm.entity_id.trim();
    setBusy('evidence');
    setNotice(null);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(selectedId)}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: evidenceForm.kind,
          label: evidenceForm.label.trim(),
          source_url: evidenceForm.source_url.trim(),
          payload,
        }),
      });
      const body = await readBody(response);
      const blocked = guard(response.status, body);
      if (blocked) {
        setNotice({ kind: 'error', text: blocked });
        return;
      }
      const created = asRecord(asRecord(body).evidence);
      const hash = typeof created.payload_hash === 'string' ? created.payload_hash : '';
      setNotice({ kind: 'ok', text: `PREUVE AJOUTEE — HASH ${shortHash(hash)}` });
      setEvidenceForm({ kind: 'source_ref', label: '', source_url: '', payload: '{}', entity_id: '' });
      await loadDetail(selectedId);
      await loadCases();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'API injoignable' });
    } finally {
      setBusy('');
    }
  };

  const verifyEvidence = async () => {
    if (!detail) return;
    setBusy('verify');
    setNotice(null);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(detail.id)}/verify`, { cache: 'no-store' });
      const payload = await readBody(response);
      if (response.status === 503) {
        setGovernanceDown(true);
        setNotice({ kind: 'error', text: problem(payload, 503) });
        return;
      }
      if (!response.ok) {
        setNotice({ kind: 'error', text: problem(payload, response.status) });
        return;
      }
      const report = payload as IntegrityReport;
      setIntegrity(report);
      const broken = Array.isArray(report.brokenEvidence) ? report.brokenEvidence.length : 0;
      setNotice({ kind: broken ? 'error' : 'ok', text: `INTEGRITE — ${report.valid ?? 0}/${report.checked ?? 0} VALIDES` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'API injoignable' });
    } finally {
      setBusy('');
    }
  };

  const exportMarkdown = async () => {
    if (!detail) return;
    setBusy('export');
    setNotice(null);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(detail.id)}/export?format=md`, { cache: 'no-store' });
      if (!response.ok) {
        const payload = await readBody(response);
        if (response.status === 503) setGovernanceDown(true);
        setNotice({ kind: 'error', text: problem(payload, response.status) });
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${detail.id}-export.md`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice({ kind: 'ok', text: 'EXPORT MD TELECHARGE' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'API injoignable' });
    } finally {
      setBusy('');
    }
  };

  const writeLocked = governanceDown;
  const evidence = detail?.evidence || [];
  const events = detail?.events || [];
  const custody = detail?.custody || [];
  const brokenCount = Array.isArray(integrity?.brokenEvidence) ? integrity!.brokenEvidence!.length : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="glass-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[var(--gold-primary)]" />
          <div>
            <div className="hud-text text-[12px] text-[var(--text-primary)] tracking-widest">CASES LEDGER</div>
            <div className="font-mono text-[8px] text-[var(--text-muted)] tracking-[0.18em]">DOSSIERS · PREUVES · TRACABILITE</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats && (
            <>
              <span className="gotham-tag gotham-tag--info">DOSSIERS {stats.cases ?? 0}</span>
              <span className="gotham-tag gotham-tag--low">PREUVES {stats.evidence ?? 0}</span>
              <span className="gotham-tag gotham-tag--low">EVENTS {stats.events ?? 0}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => { void loadCases(); if (selectedId) void loadDetail(selectedId); }}
            className="glass-panel flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-[var(--gold-primary)]"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> RAFRAICHIR
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`gotham-tag cursor-pointer ${tab === item.id ? 'gotham-tag--info' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {governanceDown && (
        <div className="mb-3 flex items-center gap-2 rounded border border-[var(--alert-red)] bg-[var(--bg-tertiary)] px-3 py-2">
          <ShieldAlert className="h-3.5 w-3.5 text-[var(--alert-red)]" />
          <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--alert-red)]">
            GOUVERNANCE INDISPONIBLE — ECRITURE DESACTIVEE
          </span>
        </div>
      )}

      {notice && (
        <div className="mb-3 flex items-start gap-2 rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2">
          {notice.kind === 'ok' && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--alert-green)]" />}
          {notice.kind === 'warn' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--alert-orange)]" />}
          {notice.kind === 'error' && <Ban className="h-3.5 w-3.5 shrink-0 text-[var(--alert-red)]" />}
          <span className={`font-mono text-[10px] tracking-[0.08em] ${notice.kind === 'ok' ? 'text-[var(--alert-green)]' : notice.kind === 'warn' ? 'text-[var(--alert-orange)]' : 'text-[var(--alert-red)]'}`}>
            {notice.text}
          </span>
        </div>
      )}

      {tab === 'cases' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="flex flex-col gap-1">
              <span className="hud-label">FILTRE STATUT</span>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={INPUT_CLASS}>
                <option value="">TOUS</option>
                {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => { void generateFromAlerts(); }}
              disabled={writeLocked || busy === 'generate'}
              className="glass-panel flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'generate' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              GENERER DEPUIS LES ALERTES
            </button>
          </div>

          {listError && (
            <div className="flex items-start gap-2 rounded border border-[var(--alert-red)] bg-[var(--bg-tertiary)] px-3 py-2">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[var(--alert-red)]" />
              <span className="font-mono text-[10px] text-[var(--alert-red)]">ERREUR API — {listError}</span>
            </div>
          )}

          {loading && !orderedCases.length && (
            <div className="flex items-center gap-2 py-6 font-mono text-[10px] text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> CHARGEMENT DES DOSSIERS
            </div>
          )}

          {!loading && !listError && !orderedCases.length && (
            <div className="flex flex-col items-center gap-3 rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] py-8">
              <FolderOpen className="h-5 w-5 text-[var(--text-muted)]" />
              <span className="hud-text text-[11px] text-[var(--text-secondary)]">AUCUN DOSSIER</span>
              <span className="font-mono text-[9px] text-[var(--text-muted)]">
                Aucun dossier stocke cote service pour ce filtre.
              </span>
              <button
                type="button"
                onClick={() => { void generateFromAlerts(); }}
                disabled={writeLocked || busy === 'generate'}
                className="glass-panel flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" /> GENERER DEPUIS LES ALERTES
              </button>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {orderedCases.map(item => (
              <article key={item.id} className="glass-panel p-4">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className={tagForPriority(item.priority)}>{item.priority || 'PRIORITE INCONNUE'}</span>
                  <span className="gotham-tag gotham-tag--low">{item.status || 'STATUT INCONNU'}</span>
                  <span className="gotham-tag gotham-tag--info">{item.classification || 'NON RENSEIGNE'}</span>
                </div>
                <h3 className="text-sm font-bold text-[var(--text-heading)]">{item.title}</h3>
                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{item.summary || 'RESUME NON RENSEIGNE'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[8px] tracking-[0.12em] text-[var(--text-muted)]">
                  <span className="flex items-center gap-1"><Hash className="h-2.5 w-2.5" /> {item.id}</span>
                  <span className="flex items-center gap-1"><Fingerprint className="h-2.5 w-2.5" /> {item.evidenceCount ?? 0} PREUVES</span>
                  <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> {item.owner || 'NON ASSIGNE'}</span>
                  <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" /> {stamp(item.updatedAt || item.createdAt)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 font-mono text-[8px] text-[var(--text-muted)]">
                    <Layers className="h-2.5 w-2.5" /> {item.origin || 'ORIGINE INCONNUE'}
                  </span>
                  <button
                    type="button"
                    onClick={() => openCase(item.id)}
                    className="glass-panel flex items-center gap-1.5 px-2.5 py-1 font-mono text-[9px] text-[var(--gold-primary)]"
                  >
                    <FileText className="h-2.5 w-2.5" /> OUVRIR
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="glass-panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <FolderPlus className="h-3.5 w-3.5 text-[var(--gold-primary)]" />
              <span className="hud-label">CREATION MANUELLE DE DOSSIER</span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="hud-label">TITRE</span>
                <input value={createForm.title} onChange={event => setCreateForm({ ...createForm, title: event.target.value })} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="hud-label">OWNER</span>
                <input value={createForm.owner} onChange={event => setCreateForm({ ...createForm, owner: event.target.value })} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-3">
                <span className="hud-label">RESUME</span>
                <textarea rows={2} value={createForm.summary} onChange={event => setCreateForm({ ...createForm, summary: event.target.value })} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-3">
                <span className="hud-label">HYPOTHESE</span>
                <textarea rows={2} value={createForm.hypothesis} onChange={event => setCreateForm({ ...createForm, hypothesis: event.target.value })} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="hud-label">PRIORITE</span>
                <select value={createForm.priority} onChange={event => setCreateForm({ ...createForm, priority: event.target.value })} className={INPUT_CLASS}>
                  {PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="hud-label">STATUT</span>
                <select value={createForm.status} onChange={event => setCreateForm({ ...createForm, status: event.target.value })} className={INPUT_CLASS}>
                  {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="hud-label">CLASSIFICATION</span>
                <input value={createForm.classification} onChange={event => setCreateForm({ ...createForm, classification: event.target.value })} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="hud-label">COMPARTIMENTS (SEPARES PAR VIRGULE)</span>
                <input value={createForm.compartments} onChange={event => setCreateForm({ ...createForm, compartments: event.target.value })} className={INPUT_CLASS} />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => { void createCase(); }}
                  disabled={writeLocked || busy === 'create'}
                  className="glass-panel flex w-full items-center justify-center gap-1.5 px-3 py-2 font-mono text-[10px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === 'create' ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderPlus className="h-3 w-3" />}
                  CREER LE DOSSIER
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'detail' && (
        <div className="space-y-3">
          {!selectedId && (
            <div className="glass-panel px-3 py-6 text-center font-mono text-[10px] text-[var(--text-secondary)]">
              AUCUN DOSSIER SELECTIONNE — OUVRIR UN DOSSIER DEPUIS L ONGLET DOSSIERS
            </div>
          )}
          {selectedId && detailLoading && (
            <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> CHARGEMENT DU DOSSIER {selectedId}
            </div>
          )}
          {detailError && (
            <div className="flex items-start gap-2 rounded border border-[var(--alert-red)] bg-[var(--bg-tertiary)] px-3 py-2">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[var(--alert-red)]" />
              <span className="font-mono text-[10px] text-[var(--alert-red)]">ERREUR API — {detailError}</span>
            </div>
          )}

          {detail && (
            <>
              <div className="glass-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className={tagForPriority(detail.priority)}>{detail.priority || 'PRIORITE INCONNUE'}</span>
                      <span className="gotham-tag gotham-tag--low">{detail.status || 'STATUT INCONNU'}</span>
                      <span className="gotham-tag gotham-tag--info">{detail.classification || 'NON RENSEIGNE'}</span>
                    </div>
                    <h3 className="text-base font-bold text-[var(--text-heading)]">{detail.title}</h3>
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{detail.summary || 'RESUME NON RENSEIGNE'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void verifyEvidence(); }}
                      disabled={busy === 'verify'}
                      className="glass-panel flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[9px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === 'verify' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ShieldCheck className="h-2.5 w-2.5" />} VERIFIER
                    </button>
                    <button
                      type="button"
                      onClick={() => { void exportMarkdown(); }}
                      disabled={busy === 'export'}
                      className="glass-panel flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[9px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === 'export' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />} EXPORT MD
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 font-mono text-[8px] tracking-[0.12em] text-[var(--text-muted)] md:grid-cols-3">
                  <span>ID {detail.id}</span>
                  <span>ORIGINE {detail.origin || '—'}</span>
                  <span>OWNER {detail.owner || '—'}</span>
                  <span>AUDIT SEQ {detail.auditSeq ?? '—'}</span>
                  <span>CREE {stamp(detail.createdAt)}</span>
                  <span>MAJ {stamp(detail.updatedAt)}</span>
                  <span>CLOTURE {stamp(detail.closedAt)}</span>
                  <span>PREUVES {detail.evidenceCount ?? evidence.length}</span>
                  <span className="flex items-center gap-1"><Layers className="h-2.5 w-2.5" /> {(detail.compartments || []).join(' / ') || 'AUCUN COMPARTIMENT'}</span>
                </div>
              </div>

              <div className="glass-panel p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="hud-label">HYPOTHESE</span>
                  <span className="font-mono text-[8px] text-[var(--text-muted)]">EDITION EN PLACE · PATCH</span>
                </div>
                <textarea
                  rows={3}
                  value={hypothesisDraft ?? detail.hypothesis ?? ''}
                  onChange={event => setHypothesisDraft(event.target.value)}
                  className={INPUT_CLASS}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[8px] text-[var(--text-muted)]">
                    VALEUR SERVICE {detail.hypothesis ? 'RENSEIGNEE' : 'VIDE'}
                  </span>
                  <button
                    type="button"
                    onClick={() => { void patchCase({ hypothesis: hypothesisDraft }, 'HYPOTHESE'); }}
                    disabled={writeLocked || busy === 'HYPOTHESE'}
                    className="glass-panel flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[9px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'HYPOTHESE' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />} SAUVEGARDER
                  </button>
                </div>
              </div>

              <div className="glass-panel p-4">
                <div className="mb-2 hud-label">STATUT / PRIORITE</div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="hud-label">STATUT</span>
                    <select value={statusDraft ?? detail.status ?? ''} onChange={event => setStatusDraft(event.target.value)} className={INPUT_CLASS}>
                      {detailStatusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="hud-label">PRIORITE</span>
                    <select value={priorityDraft ?? detail.priority ?? ''} onChange={event => setPriorityDraft(event.target.value)} className={INPUT_CLASS}>
                      {PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => { void submitStatusPriority(); }}
                    disabled={writeLocked || busy === 'STATUT/PRIORITE'}
                    className="glass-panel flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'STATUT/PRIORITE' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />} APPLIQUER
                  </button>
                  <button
                    type="button"
                    onClick={() => { void patchCase({ status: 'closed' }, 'CLOTURE'); }}
                    disabled={writeLocked || busy === 'CLOTURE' || detail.status === 'closed'}
                    className="glass-panel flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] text-[var(--alert-red)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'CLOTURE' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Lock className="h-2.5 w-2.5" />} CLOTURER LE DOSSIER
                  </button>
                </div>
              </div>

              <div className="glass-panel p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="hud-label">INTEGRITE DES PREUVES</span>
                  {integrity ? (
                    <span className={`gotham-tag ${brokenCount ? 'gotham-tag--critical' : 'gotham-tag--low'}`}>
                      {brokenCount ? 'RUPTURE' : 'CHAINE VALIDE'}
                    </span>
                  ) : (
                    <span className="gotham-tag gotham-tag--info">NON VERIFIEE</span>
                  )}
                </div>
                {integrity ? (
                  <>
                    <div className="flex flex-wrap gap-4 font-mono text-[9px]">
                      <span className="text-[var(--text-secondary)]">VERIFIEES {integrity.checked ?? 0}</span>
                      <span className="text-[var(--alert-green)]">VALIDES {integrity.valid ?? 0}</span>
                      <span className={brokenCount ? 'text-[var(--alert-red)]' : 'text-[var(--text-muted)]'}>RUPTURES {brokenCount}</span>
                    </div>
                    {(integrity.brokenEvidence || []).map((item, index) => (
                      <div key={`broken-${index}`} className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-[var(--alert-red)]">
                        <XCircle className="h-2.5 w-2.5" /> {entryText(item)}
                      </div>
                    ))}
                  </>
                ) : (
                  <span className="font-mono text-[9px] text-[var(--text-muted)]">LANCER VERIFIER POUR RECALCULER LES HASH</span>
                )}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="glass-panel p-4">
                  <div className="mb-2 hud-label">TIMELINE DES EVENTS</div>
                  {!events.length && <span className="font-mono text-[9px] text-[var(--text-muted)]">AUCUN EVENT ENREGISTRE</span>}
                  <div className="styled-scrollbar max-h-64 space-y-2 overflow-y-auto">
                    {events.map(event => (
                      <div key={event.id} className="border-l border-[var(--border-primary)] pl-3">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[8px] text-[var(--text-muted)]">
                          <span>{stamp(event.at)}</span>
                          <span>{event.actor || 'ACTEUR INCONNU'}</span>
                          <span className="gotham-tag gotham-tag--info">{event.kind || 'event'}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--text-secondary)]">{eventText(event.body)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <span className="hud-label">AJOUTER UNE NOTE ANALYSTE</span>
                    <textarea rows={2} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} className={INPUT_CLASS} />
                    <button
                      type="button"
                      onClick={() => { void addNote(); }}
                      disabled={writeLocked || busy === 'note'}
                      className="glass-panel flex items-center justify-center gap-1.5 px-3 py-1.5 font-mono text-[9px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === 'note' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />} AJOUTER LA NOTE
                    </button>
                  </div>
                </div>

                <div className="glass-panel p-4">
                  <div className="mb-2 hud-label">CHAINE DE TRACABILITE</div>
                  {!custody.length && <span className="font-mono text-[9px] text-[var(--text-muted)]">AUCUNE ETAPE DE GARDE ENREGISTREE</span>}
                  <ol className="relative space-y-3 border-l border-[var(--border-primary)] pl-4">
                    {custody.map((step, index) => (
                      <li key={`${step.ref || step.step || 'step'}-${index}`} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[var(--gold-primary)]" />
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[8px] text-[var(--text-muted)]">
                          <span>{stamp(step.at)}</span>
                          <span>{step.actor || 'ACTEUR INCONNU'}</span>
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)]">{step.step || 'ETAPE INCONNUE'}</div>
                        {step.detail && <div className="text-[9px] text-[var(--text-muted)]">{step.detail}</div>}
                        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[8px] text-[var(--text-muted)]">
                          {step.ref && <span>REF {step.ref}</span>}
                          {step.hash && (
                            <button type="button" onClick={() => { void copy(String(step.hash), `custody-${index}`); }} className="flex items-center gap-1 text-[var(--gold-primary)]">
                              {copied === `custody-${index}` ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />} {shortHash(step.hash)}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="glass-panel p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="hud-label">LISTE DES PREUVES</span>
                  <span className="gotham-tag gotham-tag--info">{evidence.length}</span>
                </div>
                {!evidence.length && <span className="font-mono text-[9px] text-[var(--text-muted)]">AUCUNE PREUVE RATTACHEE</span>}
                <div className="space-y-2">
                  {evidence.map(item => (
                    <div key={item.id} className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="gotham-tag gotham-tag--info">{item.kind || 'kind'}</span>
                          <span className="text-[10px] text-[var(--text-primary)]">{item.label || 'LIBELLE NON RENSEIGNE'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { void copy(String(item.payload_hash || ''), `hash-${item.id}`); }}
                          disabled={!item.payload_hash}
                          className="flex items-center gap-1 font-mono text-[8px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {copied === `hash-${item.id}` ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                          {shortHash(item.payload_hash)}
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[8px] text-[var(--text-muted)]">
                        <span>{item.id}</span>
                        <span>{item.collected_by || 'COLLECTEUR INCONNU'}</span>
                        <span>{stamp(item.collected_at)}</span>
                        {item.source_url && (
                          <a href={item.source_url} target="_blank" rel="noreferrer" className="text-[var(--gold-primary)] underline">
                            {item.source_url}
                          </a>
                        )}
                      </div>
                      {item.payload !== undefined && item.payload !== null && (
                        <pre className="styled-scrollbar mt-1 max-h-32 overflow-auto font-mono text-[8px] text-[var(--text-muted)]">
                          {JSON.stringify(item.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'evidence' && (
        <div className="space-y-3">
          <div className="glass-panel p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Fingerprint className="h-3.5 w-3.5 text-[var(--gold-primary)]" />
                <span className="hud-label">AJOUTER UNE PREUVE</span>
              </div>
              <span className="font-mono text-[8px] text-[var(--text-muted)]">
                DOSSIER CIBLE {selectedId || '—'}
              </span>
            </div>
            {!selectedId && (
              <div className="mb-2 font-mono text-[9px] text-[var(--alert-orange)]">
                AUCUN DOSSIER SELECTIONNE — OUVRIR UN DOSSIER POUR RATTACHER UNE PREUVE
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="hud-label">TYPE DE PREUVE</span>
                <select value={evidenceForm.kind} onChange={event => setEvidenceForm({ ...evidenceForm, kind: event.target.value })} className={INPUT_CLASS}>
                  {EVIDENCE_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="hud-label">LIBELLE</span>
                <input value={evidenceForm.label} onChange={event => setEvidenceForm({ ...evidenceForm, label: event.target.value })} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="hud-label">URL SOURCE</span>
                <input value={evidenceForm.source_url} onChange={event => setEvidenceForm({ ...evidenceForm, source_url: event.target.value })} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="hud-label">ENTITY ID (GRAPHE)</span>
                <input value={evidenceForm.entity_id} onChange={event => setEvidenceForm({ ...evidenceForm, entity_id: event.target.value })} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="hud-label">PAYLOAD JSON LIBRE</span>
                <textarea rows={4} value={evidenceForm.payload} onChange={event => setEvidenceForm({ ...evidenceForm, payload: event.target.value })} className={INPUT_CLASS} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => { void addEvidence(); }}
                disabled={writeLocked || busy === 'evidence' || !selectedId}
                className="glass-panel flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'evidence' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Fingerprint className="h-3 w-3" />}
                RATTACHER LA PREUVE
              </button>
              <span className="font-mono text-[8px] text-[var(--text-muted)]">
                LE HASH EST CALCULE COTE SERVICE
              </span>
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-[var(--gold-primary)]" />
              <span className="hud-label">PREUVES DU DOSSIER {selectedId || '—'}</span>
            </div>
            {!selectedId && <span className="font-mono text-[9px] text-[var(--text-muted)]">SELECTIONNER UN DOSSIER</span>}
            {selectedId && !evidence.length && <span className="font-mono text-[9px] text-[var(--text-muted)]">AUCUNE PREUVE RATTACHEE A CE DOSSIER</span>}
            <div className="space-y-1.5">
              {evidence.map(item => (
                <div key={`ev-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border-primary)] px-2.5 py-1.5">
                  <span className="text-[10px] text-[var(--text-primary)]">{item.label || 'LIBELLE NON RENSEIGNE'}</span>
                  <span className="flex items-center gap-2 font-mono text-[8px] text-[var(--text-muted)]">
                    <span className="gotham-tag gotham-tag--info">{item.kind || 'kind'}</span>
                    {shortHash(item.payload_hash)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default memo(CasesPanel);
