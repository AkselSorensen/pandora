'use client';

import { useEffect, useState } from 'react';
import { Bookmark, RotateCcw, Trash2 } from 'lucide-react';

interface SavedWorkspace {
  id: string;
  name: string;
  savedAt: number;
  view: { latitude: number; longitude: number; zoom: number };
  layers: Record<string, boolean>;
}

interface SavedWorkspacesPanelProps {
  view: SavedWorkspace['view'];
  layers: Record<string, boolean>;
  onRestore: (workspace: Pick<SavedWorkspace, 'view' | 'layers'>) => void;
}

const STORAGE_KEY = 'pandora.saved-workspaces.v1';

export default function SavedWorkspacesPanel({ view, layers, onRestore }: SavedWorkspacesPanelProps) {
  const [workspaces, setWorkspaces] = useState<SavedWorkspace[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setWorkspaces(parsed.filter((item) => item?.id && item?.view && item?.layers));
    } catch { /* Start with an empty list when saved data is unavailable. */ }
  }, []);

  const save = () => {
    const workspace: SavedWorkspace = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || `Workspace ${workspaces.length + 1}`,
      savedAt: Date.now(),
      view: { latitude: view.latitude, longitude: view.longitude, zoom: view.zoom },
      layers: { ...layers },
    };
    const next = [workspace, ...workspaces].slice(0, 12);
    setWorkspaces(next);
    setName('');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep this session's saved views in memory. */ }
  };

  const remove = (id: string) => {
    const next = workspaces.filter((workspace) => workspace.id !== id);
    setWorkspaces(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the in-memory update. */ }
  };

  return (
    <section className="glass-panel p-3" aria-label="Saved workspaces">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bookmark className="h-3.5 w-3.5 text-[var(--gold-primary)]" />
          <h2 className="hud-text text-[10px] text-[var(--text-primary)]">SAVED WORKSPACES</h2>
          <span className="text-[8px] font-mono text-[var(--text-muted)]">{workspaces.length}/12</span>
        </div>
        <span className="text-[7px] font-mono tracking-wider text-[var(--text-muted)]">THIS DEVICE</span>
      </header>

      <form onSubmit={(event) => { event.preventDefault(); save(); }} className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name this view"
          aria-label="Workspace name"
          maxLength={48}
          className="min-w-0 flex-1 rounded border border-[var(--border-secondary)] bg-black/20 px-2 py-1.5 text-[9px] font-mono text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-active)]"
        />
        <button type="submit" disabled={workspaces.length >= 12} className="rounded border border-[var(--border-primary)] px-2 text-[8px] font-mono text-[var(--gold-primary)] hover:bg-[var(--hover-accent)] disabled:opacity-40">SAVE VIEW</button>
      </form>

      <p className="mt-2 text-[8px] font-mono text-[var(--text-muted)]">Saves the map position, zoom and enabled layers locally.</p>

      <div className="mt-2 space-y-1">
        {workspaces.map((workspace) => (
          <div key={workspace.id} className="flex items-center gap-2 rounded border border-[var(--border-secondary)] bg-black/15 px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[9px] font-mono text-[var(--text-primary)]">{workspace.name}</p>
              <p className="text-[7px] font-mono text-[var(--text-muted)]">{workspace.view.latitude.toFixed(2)}, {workspace.view.longitude.toFixed(2)} · Z{workspace.view.zoom.toFixed(1)} · {Object.values(workspace.layers).filter(Boolean).length} layers</p>
            </div>
            <button type="button" onClick={() => onRestore({ view: workspace.view, layers: workspace.layers })} aria-label={`Restore ${workspace.name}`} className="text-[var(--gold-primary)] hover:text-[var(--text-primary)]"><RotateCcw className="h-3 w-3" /></button>
            <button type="button" onClick={() => remove(workspace.id)} aria-label={`Delete ${workspace.name}`} className="text-[var(--text-muted)] hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
        {workspaces.length === 0 && <p className="py-2 text-center text-[8px] font-mono text-[var(--text-muted)]">Save the current map setup to create a workspace.</p>}
      </div>
    </section>
  );
}
