'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, CheckCircle2, Database, FileWarning, Globe2, Landmark, Link2,
  Lock, RefreshCw, ScrollText, Shield, ShieldCheck,
} from 'lucide-react';

interface AuditHost {
  host: string;
  jurisdiction: string;
  occurrences: number;
  files: string[];
}

interface AuditPayload {
  generatedAt: string;
  filesScanned: number;
  scannedTargets?: string[];
  hosts: AuditHost[];
  totals: Record<string, number>;
  totalsOccurrences?: Record<string, number>;
  note: string;
  deploymentProfile?: string | null;
}

interface SovereigntyError {
  error?: string;
  message?: string;
  command?: string;
}

interface LabelsPayload {
  classifications: Array<{ id: string; label: string; rank: number; retentionDays: number }>;
  resources: {
    total: number;
    byClassification: Record<string, number>;
    resources: Array<{ path: string; type: string; classification: string; compartments: string[]; retentionDays: number }>;
  };
  enforcement: { mode: string; enforcedBy: string; note: string };
}

interface PosturePayload {
  total: number;
  denied: number;
  allowed: number;
  firstEntryAt: string | null;
  lastEntry: { at: string; seq: number } | null;
}

interface VerifyPayload {
  valid: boolean;
  entries: number;
  brokenAtSeq: number | null;
  checkedAt: string;
}

const JURISDICTION_ORDER = ['FR', 'EU', 'US', 'UK', 'INTL', 'UNDETERMINED'];

const JURISDICTION_TAG: Record<string, string> = {
  FR: 'gotham-tag gotham-tag--low',
  EU: 'gotham-tag gotham-tag--info',
  US: 'gotham-tag gotham-tag--high',
  UK: 'gotham-tag gotham-tag--high',
  INTL: 'gotham-tag gotham-tag--high',
  UNDETERMINED: 'gotham-tag gotham-tag--critical',
};

const JURISDICTION_LABEL: Record<string, string> = {
  FR: 'FRANCE',
  EU: 'UNION EUROPEENNE (HORS FR)',
  US: 'ETATS-UNIS',
  UK: 'ROYAUME-UNI',
  INTL: 'HORS UE / US / UK — ORGANISATIONS INTERNATIONALES',
  UNDETERMINED: 'NON ATTRIBUABLE',
};

function tagFor(jurisdiction: string): string {
  return JURISDICTION_TAG[jurisdiction] || 'gotham-tag gotham-tag--info';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function SovereigntyPage() {
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [auditError, setAuditError] = useState<SovereigntyError | null>(null);
  const [labels, setLabels] = useState<LabelsPayload | null>(null);
  const [posture, setPosture] = useState<PosturePayload | null>(null);
  const [verify, setVerify] = useState<VerifyPayload | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSovereignty = useCallback(async () => {
    setLoading(true);
    setAuditError(null);
    try {
      const response = await fetch('/api/sovereignty', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setAudit(null);
        setAuditError((payload as SovereigntyError) || { error: `http_${response.status}`, message: 'reponse illisible' });
        return;
      }
      setAudit(payload as AuditPayload);
    } catch (error) {
      setAudit(null);
      setAuditError({ error: 'network_error', message: error instanceof Error ? error.message : 'requete impossible' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGovernance = useCallback(async () => {
    try {
      const [labelsResponse, postureResponse] = await Promise.all([
        fetch('/api/governance/labels', { cache: 'no-store' }),
        fetch('/api/governance/posture', { cache: 'no-store' }),
      ]);
      if (labelsResponse.ok) setLabels((await labelsResponse.json()) as LabelsPayload);
      else setLabels(null);
      if (postureResponse.ok) setPosture((await postureResponse.json()) as PosturePayload);
      else setPosture(null);
    } catch {
      setLabels(null);
      setPosture(null);
    }
  }, []);

  const verifyChain = useCallback(async () => {
    setVerifyError(null);
    try {
      const response = await fetch('/api/governance/audit/verify', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setVerify(null);
        setVerifyError(`${response.status} — verification indisponible`);
        return;
      }
      setVerify(payload as VerifyPayload);
    } catch (error) {
      setVerify(null);
      setVerifyError(error instanceof Error ? error.message : 'requete impossible');
    }
  }, []);

  useEffect(() => {
    // Chargement initial differe : le corps de l'effet ne fait aucun setState synchrone.
    queueMicrotask(() => {
      void loadSovereignty();
      void loadGovernance();
    });
  }, [loadSovereignty, loadGovernance]);

  const hosts = useMemo(() => audit?.hosts || [], [audit]);

  const nonEuHosts = useMemo(
    () => hosts.filter((host) => host.jurisdiction !== 'FR' && host.jurisdiction !== 'EU'),
    [hosts],
  );

  const reachability = useMemo(() => {
    const totalOccurrences = hosts.reduce((sum, host) => sum + host.occurrences, 0);
    const euOccurrences = hosts
      .filter((host) => host.jurisdiction === 'FR' || host.jurisdiction === 'EU')
      .reduce((sum, host) => sum + host.occurrences, 0);
    const nonEuOccurrences = totalOccurrences - euOccurrences;
    return { totalOccurrences, euOccurrences, nonEuOccurrences };
  }, [hosts]);

  const resources = useMemo(() => labels?.resources?.resources || [], [labels]);

  const blockClass = 'glass-panel p-3';
  const rowClass = 'aip-list-row';

  return (
    <div className="h-screen w-full overflow-y-auto styled-scrollbar bg-[var(--bg-void)] p-4">
      <div className="mx-auto max-w-[1200px] space-y-3">
        <div className={`${blockClass} flex items-start justify-between gap-3`}>
          <div className="flex items-center gap-2">
            <div className="mission-reticle"><Landmark className="w-4 h-4" /></div>
            <div>
              <h1 className="hud-text text-[16px] text-[var(--text-heading)]">SOUVERAINETE & RESIDENCE</h1>
              <p className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.16em]">
                DEPENDANCES SORTANTES · CLASSIFICATION D&apos;ACCES · INTEGRITE DU JOURNAL
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {labels?.enforcement?.mode && <span className="gotham-tag gotham-tag--high">{labels.enforcement.mode}</span>}
            <button className="ops-action" onClick={() => { void loadSovereignty(); void loadGovernance(); }}>
              <RefreshCw className="w-3 h-3" /> RECHARGER
            </button>
          </div>
        </div>

        {auditError && (
          <div className={`${blockClass} space-y-2`}>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--alert-red)]" />
              <span className="gotham-tag gotham-tag--critical">AUDIT NON DISPONIBLE — {auditError.error || 'inconnu'}</span>
            </div>
            {auditError.message && <div className="hud-label">{auditError.message}</div>}
            <div className={rowClass}>
              <ScrollText className="w-3.5 h-3.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-mono text-[var(--text-primary)]">COMMANDE A LANCER — aucune juridiction n&apos;est affichee tant que le scan n&apos;a pas tourne.</div>
                <div className="hud-label truncate">{auditError.command || 'node scripts/dependency-audit.mjs'}</div>
              </div>
            </div>
          </div>
        )}

        <motion.section initial={false} animate={{ opacity: 1, y: 0 }} className={`${blockClass} space-y-2`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <h2 className="hud-text text-[11px] text-[var(--text-primary)]">1 · PROFIL DE DEPLOIEMENT</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="hud-label">PANDORA_DEPLOYMENT_PROFILE</span>
            {audit?.deploymentProfile
              ? <span className="gotham-tag gotham-tag--low">{audit.deploymentProfile}</span>
              : <span className="gotham-tag gotham-tag--critical">NON DEFINI</span>}
          </div>
          {!audit?.deploymentProfile && (
            <div className="hud-label">
              VARIABLE NON DEFINIE DANS CETTE INSTANCE — DEFINIR PANDORA_DEPLOYMENT_PROFILE=&lt;profil&gt; POUR PUBLIER LE PROFIL ACTIF.
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="foundry-metric"><span>HOSTS PRESENTS DANS LE CODE</span><strong>{hosts.length}</strong></div>
            <div className="foundry-metric"><span>APPELS SORTANTS RESOLUS</span><strong>{reachability.totalOccurrences}</strong></div>
            <div className="foundry-metric"><span>DONT HORS UE (APPELS)</span><strong>{reachability.nonEuOccurrences}</strong></div>
          </div>
          <div className="hud-label">
            CE QUI RESTE JOIGNABLE = TOUS LES HOSTS CI-DESSOUS SONT REFERENCABLES A L&apos;EXECUTION.
            {loading ? ' CHARGEMENT...' : ` SURFACE UE: ${reachability.euOccurrences} APPELS · SURFACE HORS UE: ${reachability.nonEuOccurrences} APPELS.`}
          </div>
        </motion.section>

        <motion.section initial={false} animate={{ opacity: 1, y: 0 }} className={`${blockClass} space-y-2`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Globe2 className="w-4 h-4" />
              <h2 className="hud-text text-[11px] text-[var(--text-primary)]">2 · RESIDENCE &amp; DEPENDANCES</h2>
            </div>
            <div className="hud-label">
              {audit ? `${audit.filesScanned} FICHIERS SCANNES · ${formatDate(audit.generatedAt)}` : 'AUCUN SCAN'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {JURISDICTION_ORDER.map((jurisdiction) => (
              <div key={jurisdiction} className="foundry-metric">
                <span>{JURISDICTION_LABEL[jurisdiction] || jurisdiction}</span>
                <strong>{audit?.totals?.[jurisdiction] ?? 0}</strong>
                <span>{audit?.totalsOccurrences?.[jurisdiction] ?? 0} APPELS</span>
              </div>
            ))}
          </div>

          <div className="hud-label">HOSTS HORS UE — TRIES PAR OCCURRENCES ({nonEuHosts.length} HOSTS)</div>
          <div className="max-h-[320px] space-y-1 overflow-y-auto styled-scrollbar">
            {nonEuHosts.map((entry) => (
              <div key={entry.host} className={rowClass}>
                <span className={tagFor(entry.jurisdiction)}>{entry.jurisdiction}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[9px] font-mono text-[var(--text-primary)]">{entry.host}</div>
                  <div className="hud-label truncate">{(entry.files || []).join(', ') || 'fichier non conserve'}</div>
                </div>
                <strong className="hud-value">{entry.occurrences}</strong>
              </div>
            ))}
            {!loading && nonEuHosts.length === 0 && (
              <div className="hud-label">AUCUN HOST HORS UE DANS LE DERNIER SCAN.</div>
            )}
          </div>
          {audit?.note && <div className="hud-label">{audit.note}</div>}
        </motion.section>

        <motion.section initial={false} animate={{ opacity: 1, y: 0 }} className={`${blockClass} space-y-2`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <h2 className="hud-text text-[11px] text-[var(--text-primary)]">3 · CLASSIFICATION &amp; ACCES</h2>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(labels?.classifications || []).map((entry) => (
                <span key={entry.id} className="gotham-tag gotham-tag--info">{entry.label} · r{entry.rank} · {entry.retentionDays}j</span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="foundry-metric"><span>RESSOURCES CLASSIFIEES</span><strong>{labels?.resources?.total ?? 0}</strong></div>
            {Object.entries(labels?.resources?.byClassification || {}).slice(0, 2).map(([key, value]) => (
              <div key={key} className="foundry-metric"><span>{key}</span><strong>{value}</strong></div>
            ))}
          </div>

          <div className="max-h-[280px] space-y-1 overflow-y-auto styled-scrollbar">
            {resources.map((resource) => (
              <div key={resource.path} className={rowClass}>
                <Database className="w-3.5 h-3.5" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[9px] font-mono text-[var(--text-primary)]">{resource.path}</div>
                  <div className="hud-label truncate">
                    {resource.type} · COMPARTIMENTS: {(resource.compartments || []).join(', ') || 'aucun'} · RETENTION {resource.retentionDays}J
                  </div>
                </div>
                <span className="gotham-tag gotham-tag--info">{resource.classification}</span>
              </div>
            ))}
            {resources.length === 0 && (
              <div className="hud-label">AUCUNE RESSOURCE CLASSIFIEE (GET /api/governance/labels INDISPONIBLE OU VIDE).</div>
            )}
          </div>

          <div className="flex items-start gap-2">
            <FileWarning className="w-3.5 h-3.5 text-[var(--alert-orange)] shrink-0" />
            <div className="hud-label">
              REGLE FAIL-CLOSED : MODE {labels?.enforcement?.mode || 'fail_closed'} — APPLIQUE PAR {labels?.enforcement?.enforcedBy || 'src/proxy.ts'}.
              {' '}{labels?.enforcement?.note || 'Toute requete non explicitement autorisee est refusee ; un refus est journalise et n\'est jamais contournable cote UI.'}
            </div>
          </div>
        </motion.section>

        <motion.section initial={false} animate={{ opacity: 1, y: 0 }} className={`${blockClass} space-y-2`}>
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4" />
            <h2 className="hud-text text-[11px] text-[var(--text-primary)]">4 · JOURNAL &amp; INTEGRITE</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="foundry-metric"><span>ENTREES</span><strong>{posture?.total ?? 0}</strong></div>
            <div className="foundry-metric"><span>ALLOWED</span><strong>{posture?.allowed ?? 0}</strong></div>
            <div className="foundry-metric"><span>DENIED</span><strong>{posture?.denied ?? 0}</strong></div>
          </div>
          <div className="hud-label">
            DERNIER EVENEMENT: {posture?.lastEntry ? `SEQ ${posture.lastEntry.seq} · ${formatDate(posture.lastEntry.at)}` : 'AUCUN (JOURNAL VIDE OU SERVICE INDISPONIBLE)'}
            {' · '}PREMIER: {formatDate(posture?.firstEntryAt)}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="ops-action" onClick={() => void verifyChain()}><Link2 className="w-3 h-3" /> VERIFIER LA CHAINE</button>
            <a className="aip-mini-button" href="/api/governance/audit/verify" target="_blank" rel="noopener noreferrer">OUVRIR /api/governance/audit/verify</a>
            <a className="aip-mini-button" href="/api/governance/audit?limit=100" target="_blank" rel="noopener noreferrer">JOURNAL BRUT (JSON)</a>
          </div>
          {verify && (
            <div className={rowClass}>
              {verify.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--alert-green)]" /> : <AlertTriangle className="w-3.5 h-3.5 text-[var(--alert-red)]" />}
              <div className="min-w-0 flex-1">
                <span className={verify.valid ? 'gotham-tag gotham-tag--low' : 'gotham-tag gotham-tag--critical'}>
                  {verify.valid ? `CHAINE INTEGRE (${verify.entries} ENTREES)` : `RUPTURE AU SEQ ${verify.brokenAtSeq ?? '?'}`}
                </span>
                <div className="hud-label">CONTROLE: {formatDate(verify.checkedAt)} · {verify.entries} ENTREES VERIFIEES</div>
              </div>
            </div>
          )}
          {verifyError && <div className="hud-label">VERIFICATION IMPOSSIBLE — {verifyError}</div>}
        </motion.section>
      </div>
    </div>
  );
}
