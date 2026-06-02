'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, MapPin, AlertTriangle,
  Newspaper, Clock, Radio,
} from 'lucide-react';

interface LiveAlertsProps {
  data: any;
  onLocate: (lat: number, lng: number) => void;
  onWatchFeed?: (url: string, name: string, embedAllowed?: boolean) => void;
}

const RISK_COLORS: Record<string, string> = {
  HIGH: '#FF3D3D',
  CRITICAL: '#FF1744',
  ELEVATED: '#FF9500',
  MODERATE: '#FFD700',
  LOW: '#00E676',
};

export default function LiveAlerts({ data, onLocate, onWatchFeed }: LiveAlertsProps) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<'all' | 'news' | 'quakes' | 'feeds'>('all');

  const liveFeeds = Array.isArray(data?.live_feeds) ? data.live_feeds : [];
  const alerts: any[] = [];

  if (data.news) {
    data.news.slice(0, 25).forEach((a: any) => {
      if (a.coords?.length === 2) {
        alerts.push({
          type: 'news',
          title: a.title,
          source: a.source,
          lat: a.coords[0],
          lng: a.coords[1],
          time: a.published,
          severity: (a.risk_score ?? 1) >= 8 ? 'CRITICAL' : (a.risk_score ?? 1) >= 6 ? 'HIGH' : (a.risk_score ?? 1) >= 4 ? 'ELEVATED' : 'LOW',
          url: a.link,
        });
      }
    });
  }

  if (data.earthquakes) {
    data.earthquakes.slice(0, 10).forEach((eq: any) => {
      alerts.push({
        type: 'quake',
        title: `M${eq.magnitude} - ${eq.place}`,
        source: 'USGS',
        lat: eq.lat,
        lng: eq.lng,
        time: eq.time,
        severity: eq.magnitude >= 6 ? 'CRITICAL' : eq.magnitude >= 4.5 ? 'HIGH' : 'MODERATE',
      });
    });
  }

  liveFeeds.forEach((f: any) => {
    if (typeof f.lat !== 'number' || typeof f.lng !== 'number' || !f.url) return;
    alerts.push({
      type: 'feed',
      title: f.name,
      source: `${f.city || 'Live'}, ${f.country || f.region || 'Global'}`,
      lat: f.lat,
      lng: f.lng,
      feedUrl: f.url,
      embedAllowed: f.embed_allowed !== false,
      severity: 'LOW',
      category: f.category,
    });
  });

  const filtered = filter === 'all' ? alerts :
    filter === 'news' ? alerts.filter(a => a.type === 'news') :
    filter === 'quakes' ? alerts.filter(a => a.type === 'quake') :
    alerts.filter(a => a.type === 'feed');

  const getIcon = (type: string) => {
    switch (type) {
      case 'news': return Newspaper;
      case 'quake': return AlertTriangle;
      case 'feed': return Radio;
      default: return Newspaper;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5, duration: 0.6 }}
      className="glass-panel flex flex-col overflow-hidden pointer-events-auto"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-3 py-2 hover:bg-[var(--hover-accent)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-[#FF4081]" />
          <span className="hud-text text-[10px] text-[var(--text-primary)]">LIVE ALERTS</span>
          <span className="gotham-tag gotham-tag--high" style={{ fontSize: '7px', padding: '1px 5px' }}>{alerts.filter(a => a.type === 'news' || a.type === 'quake').length}</span>
          <span className="gotham-tag gotham-tag--info" style={{ fontSize: '7px', padding: '1px 4px' }}>{liveFeeds.length} FEEDS</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#FF4081] animate-pandora-pulse" />
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden px-2 pb-2"
          >
            <div className="flex gap-1 mb-2">
              {(['all', 'news', 'quakes', 'feeds'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-1 rounded text-[9px] font-mono tracking-wider transition-all ${filter === f ? 'bg-[var(--hover-accent)] text-[var(--text-primary)] border border-[var(--border-primary)]' : 'text-[var(--text-muted)] border border-transparent hover:text-[var(--text-secondary)]'}`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="space-y-0.5 max-h-[180px] overflow-y-auto styled-scrollbar">
              {filtered.map((alert, i) => {
                const Icon = getIcon(alert.type);
                const sevColor = RISK_COLORS[alert.severity] || '#FFD700';
                return (
                  <button
                    key={i}
                    onClick={() => {
                      onLocate(alert.lat, alert.lng);
                      if (alert.feedUrl && onWatchFeed) {
                        onWatchFeed(alert.feedUrl, alert.title, alert.embedAllowed);
                      }
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-[var(--hover-accent)] transition-all border border-transparent hover:border-[var(--border-primary)] group"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sevColor, boxShadow: `0 0 6px ${sevColor}60` }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Icon className="w-3 h-3 flex-shrink-0" style={{ color: sevColor }} />
                          <span className="text-[10px] font-mono text-[var(--text-primary)] truncate leading-tight">{alert.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-mono text-[var(--text-muted)]">{alert.source}</span>
                          {alert.time && (
                            <span className="text-[8px] font-mono text-[var(--text-muted)] flex items-center gap-0.5">
                              <Clock className="w-2 h-2" />
                              {new Date(alert.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>

                      <MapPin className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-center py-4 text-[10px] font-mono text-[var(--text-muted)]">
                  No alerts for this filter
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
