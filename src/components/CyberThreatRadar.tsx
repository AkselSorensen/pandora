'use client';
import { Shield, AlertTriangle, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Threat {
  id: string;
  title: string;
  source: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp?: string;
  details?: Record<string, unknown>;
}

export default function CyberThreatRadar() {
  const [threats, setThreats] = useState<Threat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchThreats = async () => {
      try {
        const response = await fetch('/api/cyber-threats');
        if (!response.ok) {
          throw new Error('Failed to fetch threats');
        }
        const data = await response.json();
        setThreats(Array.isArray(data.threats) ? data.threats : []);
        setError(data.message || (Array.isArray(data.errors) && data.errors.length ? data.errors.join(' · ') : ''));
      } catch (error) {
        console.error('Error fetching threats:', error);
        setError(error instanceof Error ? error.message : 'Cyber threat API unavailable');
        setThreats([]);
      } finally {
        setLoading(false);
      }
    };
    fetchThreats();
  }, []);

  return (
    <div className="glass-panel">
      <div className="tool-workspace-header">
        <div>
          <span className="hud-label">PANDORA RECON</span>
          <h2>Cyber Threat Radar</h2>
        </div>
        <span className="gotham-tag gotham-tag--critical">LIVE</span>
      </div>
      <div className="tool-workspace-body">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="glass-panel-sm p-3 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-[var(--alert-red)]" />
            <div className="hud-label">Active Threats</div>
            <div className="hud-value text-2xl">{threats.length}</div>
          </div>
          <div className="glass-panel-sm p-3 text-center">
            <Globe className="w-6 h-6 mx-auto mb-2 text-[var(--cyan-primary)]" />
            <div className="hud-label">Sources</div>
            <div className="hud-value text-2xl">{new Set(threats.map((threat) => threat.source)).size}</div>
          </div>
          <div className="glass-panel-sm p-3 text-center">
            <Shield className="w-6 h-6 mx-auto mb-2 text-[var(--alert-green)]" />
            <div className="hud-label">Critical</div>
            <div className="hud-value text-2xl">{threats.filter((threat) => threat.severity === 'critical').length}</div>
          </div>
        </div>
        <div className="glass-panel-sm mb-4">
          <h3 className="hud-label mb-2">Threat Map</h3>
          <div className="w-full h-48 bg-[var(--bg-tertiary)] rounded border border-[var(--border-primary)] flex items-center justify-center">
            <div className="text-[var(--text-muted)] text-sm">World Map with Threat Origins</div>
          </div>
        </div>
        <div className="glass-panel-sm">
          <h3 className="hud-label mb-2">Recent Alerts</h3>
          {loading ? (
            <div className="text-center py-4">
              <div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-xs text-[var(--text-muted)] mt-2">Scanning cyber threats...</div>
            </div>
          ) : (
            <>
              {error && <div className="glass-panel-sm p-3 mb-3 text-xs text-[var(--alert-orange)]">{error}</div>}
              {threats.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] py-4 text-center">
                  No live cyber threat records returned by configured sources.
                </div>
              ) : (
                <div className="space-y-2">
                  {threats.map((threat) => (
                    <div key={threat.id} className="aip-list-row">
                      <div className="w-2 h-2 rounded-full bg-[var(--alert-red)]" />
                      <div className="flex-1">
                        <div className="text-xs text-[var(--text-primary)]">{threat.title}</div>
                        <div className="text-[8px] text-[var(--text-muted)]">{threat.source}{threat.timestamp ? ` • ${new Date(threat.timestamp).toLocaleString()}` : ''}</div>
                      </div>
                      <span className={`gotham-tag gotham-tag--${threat.severity}`}>
                        {threat.severity.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}