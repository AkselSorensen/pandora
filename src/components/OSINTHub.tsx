'use client';
import { useState } from 'react';
import { Search, Bird, Globe, FileText, Download } from 'lucide-react';
import { Icon } from '@iconify/react';

type IconProps = { className?: string };

interface OSINTResult {
  id: string;
  title: string;
  source: string;
  url: string;
  content: string;
  timestamp: string;
  platform: 'twitter' | 'facebook' | 'linkedin' | 'web';
}

export default function OSINTHub() {
  const [query, setQuery] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['twitter', 'web']);
  const [results, setResults] = useState<OSINTResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportMode, setReportMode] = useState(false);
  const [reportHtml, setReportHtml] = useState('');
  const [maxResults, setMaxResults] = useState(10);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim() || selectedPlatforms.length === 0) return;

    setLoading(true);
    setResults([]);
    setReportHtml('');
    setError('');

    try {
      const response = await fetch('/api/osint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          platforms: selectedPlatforms,
          maxResults,
          format: reportMode ? 'report' : 'json'
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'OSINT query failed');
      }

      const data = await response.json();

      if (reportMode) {
        setReportHtml(data.html);
        setResults(data.results);
      } else {
        setResults(data.results);
      }
    } catch (error) {
      console.error('OSINT search error:', error);
      setError(error instanceof Error ? error.message : 'Failed to perform OSINT search');
    } finally {
      setLoading(false);
    }
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const downloadReport = () => {
    if (!reportHtml) return;

    const blob = new Blob([reportHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `osint-report-${query}-${new Date().toISOString()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel">
      <div className="tool-workspace-header">
        <div>
          <span className="hud-label">PANDORA RECON</span>
          <h2>OSINT Automation Hub</h2>
        </div>
        <span className="gotham-tag gotham-tag--info">AUTOMATION</span>
      </div>

      <div className="tool-workspace-body">
        {/* Search Controls */}
        <div className="glass-panel-sm mb-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search for people, organizations, events..."
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="glass-panel-sm p-2 hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
            >
              <FileText className="w-4 h-4 text-[var(--cyan-primary)]" />
            </button>
          </div>

          {/* Platform Selection */}
          <div className="mb-4">
            <h4 className="hud-label mb-2">Platforms</h4>
            <div className="flex gap-2">
              {[
                { id: 'twitter', icon: Bird, color: 'text-[#1DA1F2]' },
                { id: 'facebook', icon: (props: IconProps) => <Icon icon="fa-brands:facebook" {...props} />, color: 'text-[#1877F2]' },
                { id: 'linkedin', icon: (props: IconProps) => <Icon icon="fa-brands:linkedin" {...props} />, color: 'text-[#0A66C2]' },
                { id: 'web', icon: Globe, color: 'text-[var(--cyan-primary)]' }
              ].map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => togglePlatform(platform.id)}
                  className={`glass-panel-sm p-2 hover:bg-[var(--bg-tertiary)] transition-colors ${
                    selectedPlatforms.includes(platform.id) ? 'border-[var(--gold-primary)]' : ''
                  }`}
                >
                  <platform.icon className={`w-4 h-4 ${platform.color}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={reportMode}
                  onChange={(e) => setReportMode(e.target.checked)}
                  className="mr-1"
                />
                Generate Report
              </label>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-primary)]">
                Max Results:
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={maxResults}
                  onChange={(e) => setMaxResults(Math.min(50, Math.max(5, parseInt(e.target.value) || 10)))}
                  className="w-16 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1 text-xs text-center"
                />
              </label>
            </div>
          </div>
        </div>

        {error && <div className="glass-panel-sm p-3 mb-3 text-xs text-[var(--alert-orange)]">{error}</div>}

        {/* Results */}
        {loading ? (
          <div className="glass-panel-sm text-center py-8">
            <div className="w-6 h-6 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <div className="text-xs text-[var(--text-muted)]">Searching OSINT sources...</div>
          </div>
        ) : reportMode && reportHtml ? (
          <div className="glass-panel-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="hud-label">OSINT Report</h3>
              <button
                onClick={downloadReport}
                className="glass-panel-sm p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <Download className="w-4 h-4 text-[var(--cyan-primary)]" />
              </button>
            </div>
            <div className="bg-[var(--bg-tertiary)] p-4 rounded border border-[var(--border-primary)]">
              <div className="prose prose-invert max-w-none text-xs">
                <h4>Summary</h4>
                <p>Found {results.filter(r => r.platform === 'twitter').length} Twitter posts, {
                  results.filter(r => r.platform === 'facebook').length} Facebook posts, {
                  results.filter(r => r.platform === 'linkedin').length} LinkedIn posts, and {
                  results.filter(r => r.platform === 'web').length} web results.</p>
                <h4 className="mt-4">Results Preview</h4>
                <div className="space-y-3 mt-2">
                  {results.slice(0, 5).map((result) => (
                    <div key={result.id} className="aip-list-row">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 
                        result.platform === 'twitter' ? '#1DA1F2' :
                        result.platform === 'facebook' ? '#1877F2' :
                        result.platform === 'linkedin' ? '#0A66C2' :
                        'var(--cyan-primary)' }} />
                      <div className="flex-1">
                        <div className="text-xs text-[var(--text-primary)]">{result.title}</div>
                        <div className="text-[8px] text-[var(--text-muted)]">
                          {result.source} • {new Date(result.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--cyan-primary)] text-xs hover:underline"
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
                {results.length > 5 && (
                  <div className="text-center mt-4">
                    <span className="text-xs text-[var(--text-muted)]">
                      +{results.length - 5} more results
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : results.length > 0 ? (
          <div className="glass-panel-sm">
            <h3 className="hud-label mb-3">Results ({results.length})</h3>
            <div className="space-y-3">
              {results.map((result) => (
                <div key={result.id} className="aip-list-row">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 
                    result.platform === 'twitter' ? '#1DA1F2' :
                    result.platform === 'facebook' ? '#1877F2' :
                    result.platform === 'linkedin' ? '#0A66C2' :
                    'var(--cyan-primary)' }} />
                  <div className="flex-1">
                    <div className="text-xs text-[var(--text-primary)]">{result.title}</div>
                    <div className="text-[8px] text-[var(--text-muted)]">
                      {result.source} • {new Date(result.timestamp).toLocaleString()}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                      {result.content}
                    </div>
                  </div>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--cyan-primary)] text-xs hover:underline"
                  >
                    View
                  </a>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass-panel-sm text-center py-8">
            <div className="text-[var(--text-muted)]">
              <Search className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm">Enter a search query to begin</p>
              <p className="text-xs mt-1">Select platforms and click search</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}