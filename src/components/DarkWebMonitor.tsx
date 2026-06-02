'use client';
import { EyeOff, Search, MessageSquare, AlertTriangle, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';

interface DarkWebAlert {
  id: string | number;
  title: string;
  source: string;
  forum: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: string;
}

export default function DarkWebMonitor() {
  const [alerts, setAlerts] = useState<DarkWebAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch('/api/darkweb-alerts');
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw new Error(errorPayload?.error || 'Failed to fetch alerts');
        }
        const data = await response.json();
        setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
        setError('');
      } catch (error) {
        console.error('Error fetching dark web alerts:', error);
        setError(error instanceof Error ? error.message : 'Dark web API unavailable');
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
  }, []);

  const filteredAlerts = alerts.filter(alert =>
    alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    alert.source.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="glass-panel">
      <div className="tool-workspace-header">
        <div>
          <span className="hud-label">PANDORA RECON</span>
          <h2>Dark Web Monitor</h2>
        </div>
        <span className="gotham-tag gotham-tag--critical">TOR + I2P</span>
      </div>
      <div className="tool-workspace-body">
        <div className="glass-panel-sm mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search dark web alerts..."
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-panel-sm p-3 text-center">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-[var(--alert-red)]" />
              <div className="hud-label">Critical Alerts</div>
              <div className="hud-value text-2xl">
                {alerts.filter(a => a.severity === 'critical').length}
              </div>
            </div>
            <div className="glass-panel-sm p-3 text-center">
              <EyeOff className="w-6 h-6 mx-auto mb-2 text-[var(--alert-orange)]" />
              <div className="hud-label">Active Forums</div>
              <div className="hud-value text-2xl">8</div>
            </div>
            <div className="glass-panel-sm p-3 text-center">
              <Globe className="w-6 h-6 mx-auto mb-2 text-[var(--cyan-primary)]" />
              <div className="hud-label">Networks</div>
              <div className="hud-value text-2xl">2</div>
            </div>
          </div>
        </div>

        <div className="glass-panel-sm mb-4">
          <h3 className="hud-label mb-2">Active Forums</h3>
          <div className="grid grid-cols-2 gap-2">
            {['Dread', 'ExploitIN', 'DarkMarket', 'DarkNetLive', 'RAMP', 'BreachForums'].map(forum => (
              <div key={forum} className="aip-list-row">
                <MessageSquare className="w-4 h-4 text-[var(--text-muted)]" />
                <div className="flex-1">
                  <div className="text-xs text-[var(--text-primary)]">{forum}</div>
                  <div className="text-[8px] text-[var(--text-muted)]">Tor Network</div>
                </div>
                <span className="gotham-tag gotham-tag--info">ACTIVE</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel-sm">
          <h3 className="hud-label mb-2">Recent Alerts</h3>
          {loading ? (
            <div className="text-center py-4">
              <div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-xs text-[var(--text-muted)] mt-2">Scanning dark web...</div>
            </div>
          ) : (
            <>
              {error && <div className="glass-panel-sm p-3 mb-3 text-xs text-[var(--alert-orange)]">{error}</div>}
              {filteredAlerts.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] py-4 text-center">
                  No configured Tor/I2P source returned records.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAlerts.map((alert) => (
                    <div key={alert.id} className="aip-list-row">
                      <div className="w-2 h-2 rounded-full bg-[var(--alert-red)]" />
                      <div className="flex-1">
                        <div className="text-xs text-[var(--text-primary)]">{alert.title}</div>
                        <div className="text-[8px] text-[var(--text-muted)]">
                          {alert.source} • {new Date(alert.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <span className={`gotham-tag gotham-tag--${alert.severity}`}>
                        {alert.severity.toUpperCase()}
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