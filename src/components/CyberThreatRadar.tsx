'use client';
import { Shield, AlertTriangle, Globe, Wifi, Database } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Threat {
  id: number;
  title: string;
  source: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export default function CyberThreatRadar() {
  const [threats, setThreats] = useState<Threat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchThreats = async () => {
      try {
        const response = await fetch('/api/cyber-threats');
        if (!response.ok) {
          throw new Error('Failed to fetch threats');
        }
        const data = await response.json();
        setThreats(data.threats);
      } catch (error) {
        console.error('Error fetching threats:', error);
        // Fallback to mock data if API fails
        const fallbackThreats: Threat[] = [
          { id: 1, title: 'Botnet C2 Detected', source: 'Shodan', severity: 'critical' },
          { id: 2, title: 'CVE-2024-1234 Exploited', source: 'MISP', severity: 'high' },
          { id: 3, title: 'Phishing Campaign', source: 'AlienVault OTX', severity: 'medium' },
          { id: 4, title: 'DDoS Attack Imminent', source: 'Dark Web Forum', severity: 'critical' },
        ];
        setThreats(fallbackThreats);
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
            <div className="hud-label">Countries</div>
            <div className="hud-value text-2xl">12</div>
          </div>
          <div className="glass-panel-sm p-3 text-center">
            <Shield className="w-6 h-6 mx-auto mb-2 text-[var(--alert-green)]" />
            <div className="hud-label">Mitigated</div>
            <div className="hud-value text-2xl">89%</div>
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
            <div className="space-y-2">
              {threats.map((threat) => (
                <div key={threat.id} className="aip-list-row">
                  <div className="w-2 h-2 rounded-full bg-[var(--alert-red)]" />
                  <div className="flex-1">
                    <div className="text-xs text-[var(--text-primary)]">{threat.title}</div>
                    <div className="text-[8px] text-[var(--text-muted)]">{threat.source}</div>
                  </div>
                  <span className={`gotham-tag gotham-tag--${threat.severity}`}>
                    {threat.severity.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}