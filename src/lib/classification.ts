/**
 * Classification registry — frontend mirror of
 * ai/pandora-governance-service/sources.py.
 *
 * The governance service exposes its own table on GET /labels; this mirror lets the proxy and
 * the UI resolve a route without a network round-trip. A drift between the two is detectable
 * at runtime by comparing both (`/api/governance/labels` → resources.resources).
 */

export const CLEARANCE_LEVELS = ['public', 'diffusion_restreinte', 'confidentiel', 'secret'] as const;
export type Classification = (typeof CLEARANCE_LEVELS)[number];

export const CLASSIFICATION_RANK: Record<Classification, number> = {
  public: 0,
  diffusion_restreinte: 1,
  confidentiel: 2,
  secret: 3,
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  public: 'NP — Non protégé',
  diffusion_restreinte: 'DR — Diffusion restreinte',
  confidentiel: 'C — Confidentiel',
  secret: 'S — Secret',
};

export const RETENTION_DAYS: Record<Classification, number> = {
  public: 365,
  diffusion_restreinte: 180,
  confidentiel: 90,
  secret: 30,
};

export interface ResourceDescriptor {
  type: string;
  classification: Classification;
  compartments?: string[];
}

export interface ResolvedResource extends ResourceDescriptor {
  path: string;
  retentionDays: number;
  matched: boolean;
  matchedKey?: string;
}

/** Mirrors API_RESOURCES in sources.py — keep both files in sync. */
export const API_RESOURCES: Record<string, ResourceDescriptor> = {
  // Sources ouvertes
  '/api/health': { type: 'service', classification: 'public' },
  '/api/flights': { type: 'feed', classification: 'public' },
  '/api/earthquakes': { type: 'feed', classification: 'public' },
  '/api/fires': { type: 'feed', classification: 'public' },
  '/api/weather': { type: 'feed', classification: 'public' },
  '/api/air-quality': { type: 'feed', classification: 'public' },
  '/api/gdelt': { type: 'feed', classification: 'public' },
  '/api/news': { type: 'feed', classification: 'public' },
  '/api/live-news': { type: 'feed', classification: 'public' },
  '/api/maritime': { type: 'feed', classification: 'public' },
  '/api/satellites': { type: 'feed', classification: 'public' },
  '/api/space-weather': { type: 'feed', classification: 'public' },
  '/api/cctv': { type: 'feed', classification: 'public' },
  '/api/markets': { type: 'feed', classification: 'public' },
  '/api/aerospace': { type: 'feed', classification: 'public' },
  '/api/public-intel': { type: 'catalogue', classification: 'public' },
  '/api/sovereignty': { type: 'governance', classification: 'public' },
  // Diffusion restreinte
  '/api/airbases': { type: 'infra', classification: 'diffusion_restreinte' },
  '/api/french-airbases': { type: 'infra', classification: 'diffusion_restreinte' },
  '/api/osm-critical': { type: 'infra', classification: 'diffusion_restreinte' },
  '/api/infrastructure': { type: 'infra', classification: 'diffusion_restreinte' },
  '/api/frontlines': { type: 'conflict', classification: 'diffusion_restreinte' },
  '/api/hotspots': { type: 'risk', classification: 'diffusion_restreinte' },
  '/api/territorial': { type: 'risk', classification: 'diffusion_restreinte' },
  '/api/risk': { type: 'risk', classification: 'diffusion_restreinte' },
  '/api/country-risk': { type: 'risk', classification: 'diffusion_restreinte' },
  '/api/country-risk-geo': { type: 'risk', classification: 'diffusion_restreinte' },
  '/api/cyberdef': { type: 'cyber', classification: 'diffusion_restreinte' },
  '/api/cyber-geo': { type: 'cyber', classification: 'diffusion_restreinte' },
  '/api/cyber-threats': { type: 'cyber', classification: 'diffusion_restreinte' },
  '/api/darkweb-alerts': { type: 'osint', classification: 'diffusion_restreinte' },
  '/api/osint': { type: 'osint', classification: 'diffusion_restreinte' },
  '/api/osint/*': { type: 'osint', classification: 'diffusion_restreinte' },
  '/api/sentinel': { type: 'imagery', classification: 'diffusion_restreinte' },
  '/api/alerts': { type: 'alert', classification: 'diffusion_restreinte' },
  '/api/playbooks': { type: 'playbook', classification: 'diffusion_restreinte' },
  '/api/graph': { type: 'graph', classification: 'diffusion_restreinte' },
  '/api/graph/*': { type: 'graph', classification: 'diffusion_restreinte' },
  '/api/ontology': { type: 'graph', classification: 'diffusion_restreinte' },
  '/api/aip': { type: 'ai', classification: 'diffusion_restreinte' },
  // Confidentiel
  '/api/dgsi': { type: 'territorial', classification: 'confidentiel' },
  '/api/region-dossier': { type: 'fusion', classification: 'confidentiel' },
  '/api/digest': { type: 'fusion', classification: 'confidentiel' },
  '/api/copilot': { type: 'ai', classification: 'confidentiel' },
  '/api/cases': { type: 'case', classification: 'confidentiel', compartments: ['investigation'] },
  '/api/cases/*': { type: 'case', classification: 'confidentiel', compartments: ['investigation'] },
  '/api/scanner': { type: 'recon', classification: 'confidentiel', compartments: ['recon'] },
  '/api/governance/*': { type: 'governance', classification: 'confidentiel', compartments: ['audit'] },
  // Secret
  '/api/deterrence': { type: 'nuclear', classification: 'secret', compartments: ['nuclear'] },
};

export const DEFAULT_CLASSIFICATION: Classification = 'diffusion_restreinte';

export function classificationRank(classification: string | undefined): number {
  return CLASSIFICATION_RANK[classification as Classification] ?? 1;
}

/**
 * Resolve a request path to its resource descriptor.
 * Order: exact → wildcard prefix → natural prefix → conservative default.
 */
export function resolveResource(pathname: string): ResolvedResource {
  const clean = '/' + pathname.replace(/^\/+|\/+$/g, '');

  const exact = API_RESOURCES[clean];
  if (exact) return decorate(clean, exact, clean);

  const wildcards = Object.keys(API_RESOURCES)
    .filter((k) => k.endsWith('/*'))
    .sort((a, b) => b.length - a.length);
  for (const key of wildcards) {
    if (clean.startsWith(key.slice(0, -1))) return decorate(clean, API_RESOURCES[key], key);
  }

  const flat = Object.keys(API_RESOURCES)
    .filter((k) => !k.endsWith('/*'))
    .sort((a, b) => b.length - a.length);
  for (const key of flat) {
    if (clean.startsWith(key + '/')) return decorate(clean, API_RESOURCES[key], key);
  }

  return {
    path: clean,
    type: 'unknown',
    classification: DEFAULT_CLASSIFICATION,
    compartments: [],
    retentionDays: RETENTION_DAYS[DEFAULT_CLASSIFICATION],
    matched: false,
  };
}

function decorate(path: string, entry: ResourceDescriptor, matchedKey: string): ResolvedResource {
  return {
    path,
    type: entry.type,
    classification: entry.classification,
    compartments: entry.compartments ?? [],
    retentionDays: RETENTION_DAYS[entry.classification],
    matched: true,
    matchedKey,
  };
}

/** Badge class for the existing design system (globals.css). */
export function classificationBadgeClass(classification: Classification | string): string {
  switch (classification) {
    case 'secret':
      return 'gotham-tag--critical';
    case 'confidentiel':
      return 'gotham-tag--high';
    case 'diffusion_restreinte':
      return 'gotham-tag--info';
    default:
      return 'gotham-tag--low';
  }
}

export function classificationLabel(classification: Classification | string): string {
  return CLASSIFICATION_LABELS[classification as Classification] ?? String(classification);
}
