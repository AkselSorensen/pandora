'use client';
import { BookOpen, Play, Plus, Save, Trash2, Search, FileCode, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';

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

  // Mock data for playbooks
  useEffect(() => {
    const mockPlaybooks: Playbook[] = [
      {
        id: '1',
        name: 'Person Tracking',
        description: 'Track an individual across social media and public records',
        steps: [
          {
            id: '1-1',
            title: 'Social Media Search',
            description: 'Search for the person on major social media platforms',
            tool: 'OSINT Automation Hub',
            parameters: { query: '{{target_name}}', platforms: 'twitter,facebook,linkedin' },
            order: 1
          },
          {
            id: '1-2',
            title: 'Public Records Check',
            description: 'Check public records for the person',
            tool: 'Geospatial Recon',
            parameters: { name: '{{target_name}}', location: '{{target_location}}' },
            order: 2
          },
          {
            id: '1-3',
            title: 'Dark Web Scan',
            description: 'Scan dark web forums for mentions of the person',
            tool: 'Dark Web Monitor',
            parameters: { query: '{{target_name}}', forums: 'all' },
            order: 3
          }
        ],
        createdAt: '2026-05-28T10:00:00Z',
        updatedAt: '2026-05-30T14:30:00Z'
      },
      {
        id: '2',
        name: 'Infrastructure Assessment',
        description: 'Assess the security of a network infrastructure',
        steps: [
          {
            id: '2-1',
            title: 'Port Scan',
            description: 'Scan for open ports on the target network',
            tool: 'Vulnerability Scanner',
            parameters: { target: '{{target_ip}}', ports: '1-1000' },
            order: 1
          },
          {
            id: '2-2',
            title: 'Service Identification',
            description: 'Identify services running on open ports',
            tool: 'Vulnerability Scanner',
            parameters: { target: '{{target_ip}}' },
            order: 2
          },
          {
            id: '2-3',
            title: 'Vulnerability Check',
            description: 'Check for known vulnerabilities in identified services',
            tool: 'Vulnerability Scanner',
            parameters: { target: '{{target_ip}}' },
            order: 3
          }
        ],
        createdAt: '2026-05-25T09:15:00Z',
        updatedAt: '2026-05-27T11:45:00Z'
      }
    ];
    setPlaybooks(mockPlaybooks);
  }, []);

  const filteredPlaybooks = playbooks.filter(playbook =>
    playbook.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    playbook.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreatePlaybook = () => {
    if (!newPlaybookName.trim()) return;
    
    const newPlaybook: Playbook = {
      id: Date.now().toString(),
      name: newPlaybookName,
      description: newPlaybookDescription,
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    setPlaybooks([...playbooks, newPlaybook]);
    setSelectedPlaybook(newPlaybook);
    setNewPlaybookName('');
    setNewPlaybookDescription('');
    setIsCreating(false);
  };

  const handleAddStep = () => {
    if (!selectedPlaybook) return;
    
    const newStep: PlaybookStep = {
      id: `${selectedPlaybook.id}-${Date.now()}`,
      title: 'New Step',
      description: '',
      tool: 'OSINT Automation Hub',
      parameters: {},
      order: selectedPlaybook.steps.length + 1
    };
    
    const updatedPlaybook = {
      ...selectedPlaybook,
      steps: [...selectedPlaybook.steps, newStep],
      updatedAt: new Date().toISOString()
    };
    
    setPlaybooks(playbooks.map(p => p.id === selectedPlaybook.id ? updatedPlaybook : p));
    setSelectedPlaybook(updatedPlaybook);
  };

  const handleDeletePlaybook = (id: string) => {
    setPlaybooks(playbooks.filter(p => p.id !== id));
    if (selectedPlaybook?.id === id) {
      setSelectedPlaybook(null);
    }
  };

  const handleDeleteStep = (stepId: string) => {
    if (!selectedPlaybook) return;
    
    const updatedSteps = selectedPlaybook.steps
      .filter(step => step.id !== stepId)
      .map((step, index) => ({ ...step, order: index + 1 }));
    
    const updatedPlaybook = {
      ...selectedPlaybook,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };
    
    setPlaybooks(playbooks.map(p => p.id === selectedPlaybook.id ? updatedPlaybook : p));
    setSelectedPlaybook(updatedPlaybook);
  };

  return (
    <div className="glass-panel">
      <div className="tool-workspace-header">
        <div>
          <span className="hud-label">PANDORA RECON</span>
          <h2>Recon Playbooks</h2>
        </div>
        <span className="gotham-tag gotham-tag--info">AUTOMATION</span>
      </div>
      <div className="tool-workspace-body">
        <div className="flex gap-4 h-full">
          {/* Playbook List */}
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
                <button
                  onClick={() => setIsCreating(true)}
                  className="glass-panel-sm p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                  title="Create New Playbook"
                >
                  <Plus className="w-4 h-4 text-[var(--cyan-primary)]" />
                </button>
              </div>
              
              {isCreating && (
                <div className="glass-panel-sm mb-3 p-3">
                  <div className="mb-2">
                    <input
                      type="text"
                      placeholder="Playbook Name"
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1 text-xs text-[var(--text-primary)] mb-2"
                      value={newPlaybookName}
                      onChange={(e) => setNewPlaybookName(e.target.value)}
                    />
                    <textarea
                      placeholder="Description"
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1 text-xs text-[var(--text-primary)] min-h-[40px]"
                      value={newPlaybookDescription}
                      onChange={(e) => setNewPlaybookDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreatePlaybook}
                      className="flex-1 glass-panel-sm p-2 text-xs text-[var(--cyan-primary)] hover:bg-[var(--cyan-primary)] hover:text-black transition-colors"
                    >
                      <Save className="w-3 h-3 mx-auto mb-1" /> Create
                    </button>
                    <button
                      onClick={() => setIsCreating(false)}
                      className="flex-1 glass-panel-sm p-2 text-xs text-[var(--alert-red)] hover:bg-[var(--alert-red)] hover:text-black transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {filteredPlaybooks.map((playbook) => (
                  <div
                    key={playbook.id}
                    className={`aip-list-row cursor-pointer ${selectedPlaybook?.id === playbook.id ? 'border-[var(--cyan-primary)] bg-[var(--cyan-primary)]/10' : ''}`}
                    onClick={() => setSelectedPlaybook(playbook)}
                  >
                    <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
                    <div className="flex-1">
                      <div className="text-xs text-[var(--text-primary)]">{playbook.name}</div>
                      <div className="text-[8px] text-[var(--text-muted)]">{playbook.description}</div>
                      <div className="text-[7px] text-[var(--text-muted)] mt-1">
                        Updated: {new Date(playbook.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlaybook(playbook.id);
                      }}
                      className="p-1 hover:text-[var(--alert-red)] transition-colors"
                      title="Delete Playbook"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Playbook Editor */}
          <div className="flex-1">
            {selectedPlaybook ? (
              <div className="h-full flex flex-col">
                <div className="glass-panel-sm mb-4 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg text-[var(--text-primary)] font-bold">{selectedPlaybook.name}</h3>
                      <p className="text-xs text-[var(--text-muted)]">{selectedPlaybook.description}</p>
                    </div>
                    <button
                      onClick={handleAddStep}
                      className="glass-panel-sm p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                      title="Add Step"
                    >
                      <Plus className="w-4 h-4 text-[var(--cyan-primary)]" />
                    </button>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button className="flex-1 glass-panel-sm p-2 text-xs text-[var(--alert-green)] hover:bg-[var(--alert-green)] hover:text-black transition-colors">
                      <Play className="w-3 h-3 mx-auto mb-1" /> Run Playbook
                    </button>
                    <button className="flex-1 glass-panel-sm p-2 text-xs text-[var(--cyan-primary)] hover:bg-[var(--cyan-primary)] hover:text-black transition-colors">
                      <Save className="w-3 h-3 mx-auto mb-1" /> Save
                    </button>
                  </div>
                </div>

                <div className="glass-panel-sm flex-1 overflow-y-auto">
                  <h4 className="hud-label mb-2">Steps</h4>
                  <div className="space-y-3">
                    {selectedPlaybook.steps.length === 0 ? (
                      <div className="text-center py-4 text-[var(--text-muted)] text-sm">
                        No steps added yet
                      </div>
                    ) : (
                      selectedPlaybook.steps.map((step) => (
                        <div key={step.id} className="aip-list-row">
                          <FileCode className="w-4 h-4 text-[var(--text-muted)]" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <input
                                type="text"
                                value={step.title}
                                className="bg-transparent text-xs text-[var(--text-primary)] font-medium flex-1"
                                readOnly
                              />
                              <span className="text-[8px] text-[var(--text-muted)]">#{step.order}</span>
                            </div>
                            <textarea
                              value={step.description}
                              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1 text-xs text-[var(--text-primary)] min-h-[30px] mb-2"
                              readOnly
                            />
                            <div className="text-[8px] text-[var(--text-muted)]">
                              <strong>Tool:</strong> {step.tool}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              className="p-1 hover:text-[var(--cyan-primary)] transition-colors"
                              title="Edit Step"
                            >
                              <FileCode className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteStep(step.id)}
                              className="p-1 hover:text-[var(--alert-red)] transition-colors"
                              title="Delete Step"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-panel-sm h-full flex items-center justify-center">
                <div className="text-center text-[var(--text-muted)]">
                  <BookOpen className="w-12 h-12 mx-auto mb-3" />
                  <p className="text-sm">Select a playbook to view or edit</p>
                  <p className="text-xs mt-1">or create a new one</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}