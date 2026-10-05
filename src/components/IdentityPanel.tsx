'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, Loader2, LogIn, LogOut, ShieldCheck, UserCheck } from 'lucide-react';

/**
 * Identité opérateur — remplace `ClearanceSwitcher`.
 *
 * POURQUOI CE COMPOSANT EXISTE
 * `ClearanceSwitcher` écrivait les cookies de clearance **côté client**
 * (`document.cookie`), et le serveur les lisait tels quels : n'importe qui
 * pouvait se déclarer `secret` depuis la console du navigateur. Ici, il n'y a
 * plus rien à choisir — on s'authentifie, et le serveur renvoie ce à quoi on a
 * droit. Afficher un sélecteur de niveau serait un mensonge.
 *
 * Sans `PANDORA_SESSION_SECRET` côté serveur, l'écran le dit au lieu de
 * proposer un formulaire qui ne pourrait pas aboutir.
 */

interface Operator {
  id: string;
  role: string;
  clearance: string;
  compartments: string[];
}

interface SessionState {
  authenticated: boolean;
  configured?: boolean;
  reason?: string;
  operator?: Operator;
  expiresAt?: string;
}

const FIELD_CLASS =
  'w-full rounded border border-[var(--border-secondary)] bg-[var(--bg-void)] px-2 py-1 font-mono text-[9px] tracking-[0.08em] text-[var(--text-primary)] outline-none focus:border-[var(--border-active)] disabled:opacity-50';

const CLEARANCE_TAG: Record<string, string> = {
  public: 'gotham-tag--low',
  diffusion_restreinte: 'gotham-tag--info',
  confidentiel: 'gotham-tag--high',
  secret: 'gotham-tag--critical',
};

export default function IdentityPanel() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as SessionState | null;
      setSession(payload ?? { authenticated: false });
    } catch {
      setSession({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError('');
      setBusy(true);
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: id.trim(), password }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; hint?: string }
          | null;
        if (!response.ok) {
          setError(
            payload?.error === 'invalid_credentials'
              ? 'IDENTIFIANTS INVALIDES'
              : payload?.error === 'auth_unconfigured'
                ? "AUTHENTIFICATION NON CONFIGUREE CÔTÉ SERVEUR"
                : `ECHEC ${response.status} — ${payload?.error || 'requête refusée'}`,
          );
          return;
        }
        // Le niveau de diffusion change : on recharge pour que les requêtes en
        // cours soient refaites avec la nouvelle session, pas mélangées.
        window.location.reload();
      } catch (err) {
        setError(`ERREUR RESEAU — ${err instanceof Error ? err.message : 'requête impossible'}`);
      } finally {
        setBusy(false);
      }
    },
    [id, password],
  );

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.reload();
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--gold-primary)]" />
        <span className="hud-label">LECTURE DE LA SESSION</span>
      </div>
    );
  }

  // ── Authentifié : on affiche ce que le SERVEUR a accordé, rien à choisir ──
  if (session?.authenticated && session.operator) {
    const op = session.operator;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="gotham-tag gotham-tag--low">SESSION SIGNÉE — VÉRIFIÉE PAR LE SERVEUR</div>
          <span className="hud-label">IDENTITÉ RÉELLE</span>
        </div>

        <div className="glass-panel-sm p-3 space-y-2">
          <div className="flex items-center gap-2">
            <UserCheck className="w-3.5 h-3.5 text-[var(--alert-green)]" />
            <span className="text-[11px] font-mono text-[var(--text-primary)]">{op.id}</span>
            <span className={`gotham-tag ${CLEARANCE_TAG[op.clearance] || 'gotham-tag--info'}`}>
              {op.clearance}
            </span>
            <span className="gotham-tag gotham-tag--info">{op.role}</span>
          </div>

          <div>
            <div className="hud-label mb-1">COMPARTIMENTS ACCORDÉS</div>
            <div className="flex flex-wrap gap-1.5">
              {op.compartments.length === 0 ? (
                <span className="hud-label">AUCUN</span>
              ) : (
                op.compartments.map((value) => (
                  <span key={value} className="gotham-tag gotham-tag--low">
                    {value}
                  </span>
                ))
              )}
            </div>
          </div>

          {session.expiresAt && (
            <div className="hud-label">
              EXPIRE LE {new Date(session.expiresAt).toLocaleString()}
            </div>
          )}

          <p className="text-[9px] leading-relaxed text-[var(--text-muted)]">
            Le niveau de diffusion est un attribut signé par le serveur. Il ne peut pas être modifié
            depuis le navigateur.
          </p>
        </div>

        <button className="ops-action w-full" onClick={logout} disabled={busy}>
          <LogOut className="w-3 h-3" /> {busy ? 'DECONNEXION' : 'SE DECONNECTER'}
        </button>
      </div>
    );
  }

  // ── Non configuré côté serveur : le dire, ne pas proposer un formulaire mort ──
  if (session && session.configured === false) {
    return (
      <div className="space-y-2">
        <div className="gotham-tag gotham-tag--high">AUTHENTIFICATION NON CONFIGUREE</div>
        <div className="glass-panel-sm p-3 space-y-2">
          <div className="flex items-center gap-2 text-[var(--alert-orange)]">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hud-label">AUCUNE SESSION POSSIBLE</span>
          </div>
          <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">
            Le serveur n&apos;a pas de secret de session. Sans lui, il ne peut pas signer
            d&apos;identité — donc il n&apos;y a pas de connexion possible, et les ressources
            classifiées restent refusées.
          </p>
          <p className="text-[9px] leading-relaxed text-[var(--text-muted)]">
            À définir côté serveur : <span className="font-mono">PANDORA_SESSION_SECRET</span> (32
            caractères minimum) et <span className="font-mono">PANDORA_OPERATORS</span>.
          </p>
        </div>
      </div>
    );
  }

  // ── Non authentifié : formulaire de connexion ──
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="gotham-tag gotham-tag--high">NON AUTHENTIFIÉ</div>
        <span className="hud-label">AUCUNE HABILITATION</span>
      </div>

      <div className="glass-panel-sm p-3 space-y-2">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hud-label">CONNEXION REQUISE POUR LES RESSOURCES CLASSIFIÉES</span>
        </div>

        <form onSubmit={submit} className="space-y-2">
          <div>
            <label className="hud-label mb-1 block" htmlFor="pandora-operator">
              OPÉRATEUR
            </label>
            <input
              id="pandora-operator"
              className={FIELD_CLASS}
              value={id}
              onChange={(event) => setId(event.target.value)}
              autoComplete="username"
              placeholder="identifiant"
              disabled={busy}
            />
          </div>
          <div>
            <label className="hud-label mb-1 block" htmlFor="pandora-passphrase">
              PHRASE SECRÈTE
            </label>
            <input
              id="pandora-passphrase"
              type="password"
              className={FIELD_CLASS}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={busy}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[var(--alert-orange)]">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span className="hud-label">{error}</span>
            </div>
          )}

          <button type="submit" className="ops-action w-full" disabled={busy || !id || !password}>
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
            {busy ? 'CONNEXION' : 'SE CONNECTER'}
          </button>
        </form>

        <p className="flex items-start gap-1.5 text-[9px] leading-relaxed text-[var(--text-muted)]">
          <KeyRound className="w-3 h-3 flex-shrink-0 mt-0.5" />
          L&apos;identité et la clearance sont attribuées par le serveur. Le navigateur ne peut
          déclarer ni l&apos;une ni l&apos;autre.
        </p>
      </div>
    </div>
  );
}
