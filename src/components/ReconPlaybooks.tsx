'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Play, Plus, Save, Trash2, Search, FileCode } from 'lucide-react';

interface PlaybookStep {
  id: string;
  title: string;
  description: string;
  tool: string;
  parameters: Record<string, string>;
  order: number;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  steps: PlaybookStep[];
  createdAt: string;
  updatedAt: string;
}

export default function ReconPlaybooks() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [newPlaybookName, setNewPlaybookName] = useState('');
  const [newPlaybookDescription, setNewPlaybookDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runLog, setRunLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const refreshPlaybooks = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/playbooks');
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Failed to fetch playbooks');
      const data = await response.json();
      const items = Array.isArray(data.playbooks) ? data.playbooks : [];
      setPlaybooks(items);
      setSelectedPlaybook((current) => current ? items.find((item: Playbook) => item.id === current.id) || null : items[0] || null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playbooks API unavailable');
      setPlaybooks([]);
      setSelectedPlaybook(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshPlaybooks();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const resolveStepRequest = (step: PlaybookStep) => {
    const tool = step.tool.toLowerCase();
    const params = step.parameters || {};
    const target = params.target || params.domain || params.ip || params.query || '';

    if (tool.includes('dns') && target) return `/api/osint/dns?domain=${encodeURIComponent(target)}`;
    if (tool.includes('whois') && target) return `/api/osint/whois?domain=${encodeURIComponent(target)}`;
    if (tool.includes('cert') && target) return `/api/osint/certs?domain=${encodeURIComponent(target)}`;
    if (tool.includes('threat') && target) return `/api/osint/threats?query=${encodeURIComponent(target)}`;
    if ((tool.includes('sweep') || tool.includes('vuln')) && target) return `/api/osint/sweep?ip=${encodeURIComponent(target)}&cidr=${encodeURIComponent(params.cidr || '28')}`;
    if (tool.includes('header') && target) return `/api/scanner?target=${encodeURIComponent(target)}&type=headers`;
    if (tool.includes('ssl') && target) return `/api/scanner?target=${encodeURIComponent(target)}&type=ssl`;
    if (tool.includes('subdomain') && target) return `/api/scanner?target=${encodeURIComponent(target)}&type=subdomains`;
    if (tool.includes('tech') && target) return `/api/scanner?target=${encodeURIComponent(target)}&type=tech`;
    if ((tool.includes('port') || tool.includes('scanner')) && target) return `/api/scanner?target=${encodeURIComponent(target)}&type=quick`;
    return null;
  };

  const filteredPlaybooks = playbooks.filter(playbook =>
    playbook.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    playbook.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const savePlaybook = async (playbook: Playbook) => {
    const response = await fetch('/api/playbooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playbook),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Failed to save playbook');
    const data = await response.json();
    setPlaybooks(data.playbooks || []);
    setSelectedPlaybook(data.playbook || playbook);
  };

  const handleCreatePlaybook = async () => {
    if (!newPlaybookName.trim()) return;
    const now = new Date().toISOString();
    const newPlaybook: Playbook = {
      id: `playbook-${crypto.randomUUID()}`,
      name: newPlaybookName.trim(),
      description: newPlaybookDescription.trim(),
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
    await savePlaybook(newPlaybook);
    setNewPlaybookName('');
    setNewPlaybookDescription('');
    setIsCreating(false);
  };

  const handleAddStep = async () => {
    if (!selectedPlaybook) return;
    const updatedPlaybook = {
      ...selectedPlaybook,
      steps: [
        ...selectedPlaybook.steps,
        {
          id: `step-${crypto.randomUUID()}`,
          title: 'New Step',
          description: '',
          tool: 'OSINT Automation Hub',
          parameters: {},
          order: selectedPlaybook.steps.length + 1,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await savePlaybook(updatedPlaybook);
  };

  const handleDeletePlaybook = async (id: string) => {
    const response = await fetch(`/api/playbooks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Failed to delete playbook');
    await refreshPlaybooks();
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!selectedPlaybook) return;
    const updatedPlaybook = {
      ...selectedPlaybook,
      steps: selectedPlaybook.steps
        .filter(step => step.id !== stepId)
        .map((step, index) => ({ ...step, order: index + 1 })),
      updatedAt: new Date().toISOString(),
    };
    await savePlaybook(updatedPlaybook);
  };

  const handleRunPlaybook = async () => {
    if (!selectedPlaybook || running) return;
    setRunning(true);
    setRunLog([`Starting ${selectedPlaybook.name} (${selectedPlaybook.steps.length} step${selectedPlaybook.steps.length > 1 ? 's' : ''})`]);

    for (const step of [...selectedPlaybook.steps].sort((a, b) => a.order - b.order)) {
      const url = resolveStepRequest(step);
      if (!url) {
        setRunLog((log) => [...log, `SKIP #${step.order} ${step.title}: missing supported tool/parameters`]);
        continue;
      }

      try {
        const response = await fetch(url);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || payload.detail || `HTTP ${response.status}`);
        setRunLog((log) => [...log, `OK #${step.order} ${step.title}: ${url}`]);
      } catch (err) {
        setRunLog((log) => [...log, `ERR #${step.order} ${step.title}: ${err instanceof Error ? err.message : 'request failed'}`]);
      }
    }

    setRunLog((log) => [...log, 'Playbook run complete']);
    setRunning(false);
  };

  return (
    <div className="glass-panel">
      <div className="tool-workspace-header">
        <div>
          <span className="hud-label">PANDORA RECON</span>
          <h2>Recon Playbooks</h2>
        </div>
        <span className="gotham-tag gotham-tag--info">LOCAL JSON</span>
      </div>
      <div className="tool-workspace-body">
        {error && <div className="glass-panel-sm p-3 mb-3 text-xs text-[var(--alert-orange)]">{error}</div>}
        <div className="flex gap-4 h-full">
          <div className="w-1/3">
            <div className="glass-panel-sm mb-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search playbooks..."
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                </div>
                <button onClick={() => setIsCreating(true)} className="glass-panel-sm p-2 hover:bg-[var(--bg-tertiary)] transition-colors" title="Create New Playbook">
                  <Plus className="w-4 h-4 text-[var(--cyan-primary)]" />
                </button>
              </div>

              {isCreating && (
                <div className="glass-panel-sm mb-3 p-3">
                  <input className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1 text-xs text-[var(--text-primary)] mb-2" placeholder="Playbook Name" value={newPlaybookName} onChange={(e) => setNewPlaybookName(e.target.value)} />
                  <textarea className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1 text-xs text-[var(--text-primary)] min-h-[40px]" placeholder="Description" value={newPlaybookDescription} onChange={(e) => setNewPlaybookDescription(e.target.value)} />
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleCreatePlaybook} className="flex-1 glass-panel-sm p-2 text-xs text-[var(--cyan-primary)] hover:bg-[var(--cyan-primary)] hover:text-black transition-colors"><Save className="w-3 h-3 mx-auto mb-1" /> Create</button>
                    <button onClick={() => setIsCreating(false)} className="flex-1 glass-panel-sm p-2 text-xs text-[var(--alert-red)] hover:bg-[var(--alert-red)] hover:text-black transition-colors">Cancel</button>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {loading ? <div className="text-xs text-[var(--text-muted)] p-3">Loading playbooks...</div> : filteredPlaybooks.map((playbook) => (
                  <div key={playbook.id} className={`aip-list-row cursor-pointer ${selectedPlaybook?.id === playbook.id ? 'border-[var(--cyan-primary)] bg-[var(--cyan-primary)]/10' : ''}`} onClick={() => setSelectedPlaybook(playbook)}>
                    <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
                    <div className="flex-1">
                      <div className="text-xs text-[var(--text-primary)]">{playbook.name}</div>
                      <div className="text-[8px] text-[var(--text-muted)]">{playbook.description || 'No description'}</div>
                      <div className="text-[7px] text-[var(--text-muted)] mt-1">Updated: {new Date(playbook.updatedAt).toLocaleString()}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDeletePlaybook(playbook.id); }} className="p-1 hover:text-[var(--alert-red)] transition-colors" title="Delete Playbook"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1">
            {selectedPlaybook ? (
              <div className="h-full flex flex-col">
                <div className="glass-panel-sm mb-4 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg text-[var(--text-primary)] font-bold">{selectedPlaybook.name}</h3>
                      <p className="text-xs text-[var(--text-muted)]">{selectedPlaybook.description || 'No description'}</p>
                    </div>
                    <button onClick={handleAddStep} className="glass-panel-sm p-2 hover:bg-[var(--bg-tertiary)] transition-colors" title="Add Step"><Plus className="w-4 h-4 text-[var(--cyan-primary)]" /></button>
                  </div>
                  <button onClick={handleRunPlaybook} disabled={running || selectedPlaybook.steps.length === 0} className="w-full glass-panel-sm p-2 text-xs text-[var(--alert-green)] hover:bg-[var(--alert-green)] hover:text-black transition-colors disabled:opacity-50"><Play className="w-3 h-3 inline mr-2" /> {running ? 'Running...' : 'Run Playbook'}</button>
                </div>
                {runLog.length > 0 && (
                  <div className="glass-panel-sm mb-4 p-3">
                    <h4 className="hud-label mb-2">Run Log</h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto styled-scrollbar">
                      {runLog.map((line, index) => <div key={`${line}-${index}`} className="text-[9px] font-mono text-[var(--text-secondary)]">{line}</div>)}
                    </div>
                  </div>
                )}
                <div className="glass-panel-sm flex-1 overflow-y-auto">
                  <h4 className="hud-label mb-2">Steps</h4>
                  <div className="space-y-3">
                    {selectedPlaybook.steps.length === 0 ? <div className="text-center py-4 text-[var(--text-muted)] text-sm">No steps added yet</div> : selectedPlaybook.steps.map((step) => (
                      <div key={step.id} className="aip-list-row">
                        <FileCode className="w-4 h-4 text-[var(--text-muted)]" />
                        <div className="flex-1">
                          <div className="text-xs text-[var(--text-primary)] font-medium">{step.title} <span className="text-[8px] text-[var(--text-muted)]">#{step.order}</span></div>
                          <div className="text-[8px] text-[var(--text-muted)]"><strong>Tool:</strong> {step.tool}</div>
                          {step.description && <p className="text-xs text-[var(--text-secondary)] mt-1">{step.description}</p>}
                        </div>
                        <button onClick={() => handleDeleteStep(step.id)} className="p-1 hover:text-[var(--alert-red)] transition-colors" title="Delete Step"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-panel-sm h-full flex items-center justify-center">
                <div className="text-center text-[var(--text-muted)]"><BookOpen className="w-12 h-12 mx-auto mb-3" /><p className="text-sm">Select or create a playbook</p></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}