'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, ShieldAlert, UserCog, X } from 'lucide-react';

export const OPERATOR_ROLES = ['observer', 'auditor', 'analyst', 'lead'] as const;
export const OPERATOR_CLEARANCES = ['public', 'diffusion_restreinte', 'confidentiel', 'secret'] as const;
export const OPERATOR_COMPARTMENTS = ['investigation', 'nuclear', 'recon', 'audit'] as const;

export type OperatorRole = (typeof OPERATOR_ROLES)[number];
export type OperatorClearance = (typeof OPERATOR_CLEARANCES)[number];

export interface OperatorProfile {
  operator: string;
  role: string;
  clearance: string;
  compartments: string[];
  no_export: boolean;
  updatedAt?: string;
}

interface ClearanceSwitcherProps {
  /** Profils deja enregistres (donnee reelle : /api/governance/posture). */
  operators?: OperatorProfile[];
  /** Appele apres un enregistrement reussi du profil. */
  onSaved?: () => void;
}

const COOKIE_OPERATOR = 'pandora_operator';
const COOKIE_ROLE = 'pandora_role';
const COOKIE_CLEARANCE = 'pandora_clearance';
const COOKIE_COMPARTMENTS = 'pandora_compartments';
const ATTESTATION_KEY = 'pandora:operator-attestation:v1';

const SELECT_CLASS =
  'w-full rounded border border-[var(--border-secondary)] bg-[var(--bg-void)] px-2 py-1 font-mono text-[9px] tracking-[0.08em] text-[var(--text-primary)] outline-none focus:border-[var(--border-active)]';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const hit = document.cookie.split('; ').find((entry) => entry.startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

function readCompartments(): string[] {
  const raw = readCookie(COOKIE_COMPARTMENTS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function ClearanceSwitcher({ operators = [], onSaved }: ClearanceSwitcherProps) {
  const [operator, setOperator] = useState('');
  const [role, setRole] = useState<OperatorRole>('observer');
  const [clearance, setClearance] = useState<OperatorClearance>('public');
  const [compartments, setCompartments] = useState<string[]>([]);
  const [noExport, setNoExport] = useState(true);
  const [draftCompartment, setDraftCompartment] = useState<string>('investigation');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Lecture des cookies apres montage (stockage navigateur, absent du rendu serveur).
    const sync = () => {
      const storedOperator = readCookie(COOKIE_OPERATOR);
      const storedRole = readCookie(COOKIE_ROLE) as OperatorRole | null;
      const storedClearance = readCookie(COOKIE_CLEARANCE) as OperatorClearance | null;
      if (storedOperator) setOperator(storedOperator);
      if (storedRole && OPERATOR_ROLES.includes(storedRole)) setRole(storedRole);
      if (storedClearance && OPERATOR_CLEARANCES.includes(storedClearance)) setClearance(storedClearance);
      setCompartments(readCompartments());
    };
    queueMicrotask(sync);
  }, []);
  const knownOperators = useMemo(
    () => operators.map((entry) => entry.operator).filter((value, index, all) => value && all.indexOf(value) === index),
    [operators],
  );

  const applyLocalProfile = useCallback(
    (id: string, nextRole: OperatorRole, nextClearance: OperatorClearance, nextCompartments: string[], nextNoExport: boolean) => {
      writeCookie(COOKIE_OPERATOR, id);
      writeCookie(COOKIE_ROLE, nextRole);
      writeCookie(COOKIE_CLEARANCE, nextClearance);
      writeCookie(COOKIE_COMPARTMENTS, JSON.stringify(nextCompartments));
      try {
        window.sessionStorage.setItem(
          ATTESTATION_KEY,
          JSON.stringify({
            sessionId: crypto.randomUUID(),
            at: new Date().toISOString(),
            operator: id,
            role: nextRole,
            clearance: nextClearance,
            compartments: nextCompartments,
            no_export: nextNoExport,
          }),
        );
      } catch {
        setStatus('SESSION STORAGE INDISPONIBLE — ATTESTATION NON ECRITE');
        return false;
      }
      return true;
    },
    [],
  );

  const selectOperator = useCallback(
    (value: string) => {
      setOperator(value);
      const known = operators.find((entry) => entry.operator === value);
      if (known) {
        const knownRole = OPERATOR_ROLES.includes(known.role as OperatorRole) ? (known.role as OperatorRole) : role;
        const knownClearance = OPERATOR_CLEARANCES.includes(known.clearance as OperatorClearance)
          ? (known.clearance as OperatorClearance)
          : clearance;
        setRole(knownRole);
        setClearance(knownClearance);
        setCompartments(known.compartments || []);
        setNoExport(known.no_export !== false);
      }
      setStatus(null);
    },
    [operators, role, clearance],
  );

  const toggleCompartment = useCallback((value: string, add: boolean) => {
    setCompartments((prev) => (add ? (prev.includes(value) ? prev : [...prev, value]) : prev.filter((entry) => entry !== value)));
  }, []);

  const apply = useCallback(() => {
    const id = operator.trim();
    if (!id) {
      setStatus('OPERATEUR REQUIS');
      return;
    }
    if (applyLocalProfile(id, role, clearance, compartments, noExport)) {
      setStatus(`PROFIL LOCAL APPLIQUE — ${id} · ${role} · ${clearance}`);
    }
  }, [operator, role, clearance, compartments, noExport, applyLocalProfile]);

  const save = useCallback(async () => {
    const id = operator.trim();
    if (!id) {
      setStatus('OPERATEUR REQUIS');
      return;
    }
    setSaving(true);
    setStatus('ENREGISTREMENT...');
    try {
      const response = await fetch(`/api/governance/operators/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, clearance, compartments, no_export: noExport }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus(`ECHEC ${response.status} — ${payload?.error || payload?.message || 'refus du service gouvernance'}`);
        return;
      }
      applyLocalProfile(id, role, clearance, compartments, noExport);
      setStatus(`PROFIL ENREGISTRE — ${id}`);
      onSaved?.();
    } catch (error) {
      setStatus(`ERREUR RESEAU — ${error instanceof Error ? error.message : 'requete impossible'}`);
    } finally {
      setSaving(false);
    }
  }, [operator, role, clearance, compartments, noExport, applyLocalProfile, onSaved]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="gotham-tag gotham-tag--critical">PROFIL OPERATEUR LOCAL — NON AUTHENTIFIANT</div>
        <span className="hud-label">COOKIES + SESSION STORAGE</span>
      </div>

      <div className="foundry-source-row">
        <UserCog className="w-3.5 h-3.5" />
        <select className={SELECT_CLASS} value={knownOperators.includes(operator) ? operator : ''} onChange={(event) => selectOperator(event.target.value)}>
          <option value="">— SELECTIONNER UN PROFIL ENREGISTRE —</option>
          {knownOperators.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="hud-label mb-1">OPERATEUR (IDENTIFIANT)</div>
          <input className={SELECT_CLASS} value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="analyste-01" />
        </div>
        <div>
          <div className="hud-label mb-1">ROLE</div>
          <select className={SELECT_CLASS} value={role} onChange={(event) => setRole(event.target.value as OperatorRole)}>
            {OPERATOR_ROLES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div>
          <div className="hud-label mb-1">CLEARANCE</div>
          <select className={SELECT_CLASS} value={clearance} onChange={(event) => setClearance(event.target.value as OperatorClearance)}>
            {OPERATOR_CLEARANCES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div>
          <div className="hud-label mb-1">EXPORT DE DONNEES</div>
          <select className={SELECT_CLASS} value={noExport ? 'interdit' : 'autorise'} onChange={(event) => setNoExport(event.target.value === 'interdit')}>
            <option value="interdit">NO EXPORT (INTERDIT)</option>
            <option value="autorise">EXPORT AUTORISE</option>
          </select>
        </div>
      </div>

      <div>
        <div className="hud-label mb-1">COMPARTIMENTS</div>
        <div className="flex items-center gap-2">
          <select className={SELECT_CLASS} value={draftCompartment} onChange={(event) => setDraftCompartment(event.target.value)}>
            {OPERATOR_COMPARTMENTS.map((value) => (
              <option key={value} value={value}>{compartments.includes(value) ? `[X] ${value}` : `[ ] ${value}`}</option>
            ))}
          </select>
          <button className="aip-mini-button" onClick={() => toggleCompartment(draftCompartment, true)}><Plus className="w-3 h-3" /> AJOUTER</button>
          <button className="aip-mini-button" onClick={() => toggleCompartment(draftCompartment, false)}><X className="w-3 h-3" /> RETIRER</button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {compartments.length === 0 && <span className="hud-label">AUCUN COMPARTIMENT</span>}
          {compartments.map((value) => (
            <button key={value} className="aip-mini-button" onClick={() => toggleCompartment(value, false)}>
              {value} <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="ops-action flex-1" onClick={apply}><ShieldAlert className="w-3 h-3" /> APPLIQUER EN LOCAL</button>
        <button className="ops-action flex-1" onClick={save} disabled={saving}><Save className="w-3 h-3" /> {saving ? 'ENREGISTREMENT' : 'ENREGISTRER PROFIL'}</button>
      </div>

      {status && <div className="hud-label">{status}</div>}
    </div>
  );
}

export default memo(ClearanceSwitcher);
