/**
 * Registre des microservices Pandora consommés par le front.
 *
 * Source unique de vérité pour : l'URL d'un service, son libellé lisible et son
 * domaine. Toute route qui parle à un service devrait passer par ici plutôt que
 * de relire `process.env.PANDORA_*_URL` à la main — sinon la liste des services
 * diverge entre le health check, les proxys et l'interface.
 *
 * Les URL par défaut sont celles du réseau Docker (voir docker-compose.yml) ;
 * en natif elles sont surchargées par .env.
 *
 * Zéro donnée inventée : si `PANDORA_*_URL` n'est pas défini, le service est
 * signalé `unconfigured` — jamais « up », jamais « down ».
 */

export interface ServiceDefinition {
  /** Identifiant court, stable, utilisé par l'API et l'interface. */
  id: string;
  /** Libellé affiché. */
  label: string;
  /** Variable d'environnement qui porte l'URL. */
  envVar: string;
  /** URL par défaut sur le réseau Docker. */
  defaultUrl: string;
  /** Domaine fonctionnel, pour regrouper dans l'interface. */
  domain: string;
  /** Chemin de santé exposé par le service. */
  healthPath: string;
}

export const SERVICES: ServiceDefinition[] = [
  { id: 'ai', label: 'Pandora AI', envVar: 'PANDORA_AI_URL', defaultUrl: 'http://pandora-ai:7701', domain: 'IA', healthPath: '/health' },
  { id: 'digest', label: 'Digest', envVar: 'PANDORA_DIGEST_URL', defaultUrl: 'http://pandora-digest:7702', domain: 'Renseignement', healthPath: '/health' },
  { id: 'alerts', label: 'Alerts', envVar: 'PANDORA_ALERTS_URL', defaultUrl: 'http://pandora-alerts:7703', domain: 'Renseignement', healthPath: '/health' },
  { id: 'ontology', label: 'Ontology', envVar: 'PANDORA_ONTOLOGY_URL', defaultUrl: 'http://pandora-ontology:7704', domain: 'Analyse', healthPath: '/health' },
  { id: 'cases', label: 'Cases', envVar: 'PANDORA_CASES_URL', defaultUrl: 'http://pandora-cases:7705', domain: 'Analyse', healthPath: '/health' },
  { id: 'hotspots', label: 'Hotspots', envVar: 'PANDORA_HOTSPOTS_URL', defaultUrl: 'http://pandora-hotspots:7706', domain: 'Analyse', healthPath: '/health' },
  { id: 'copilot', label: 'Copilot', envVar: 'PANDORA_COPILOT_URL', defaultUrl: 'http://pandora-copilot:7707', domain: 'IA', healthPath: '/health' },
  { id: 'risk', label: 'Risk', envVar: 'PANDORA_RISK_URL', defaultUrl: 'http://pandora-risk:7708', domain: 'Analyse', healthPath: '/health' },
  { id: 'nuclear', label: 'Nuclear', envVar: 'PANDORA_NUCLEAR_URL', defaultUrl: 'http://pandora-nuclear:7709', domain: 'Domaines', healthPath: '/health' },
  { id: 'cyberdef', label: 'CyberDef', envVar: 'PANDORA_CYBERDEF_URL', defaultUrl: 'http://pandora-cyberdef:7711', domain: 'Domaines', healthPath: '/health' },
  { id: 'dgsi', label: 'DGSI', envVar: 'PANDORA_DGSI_URL', defaultUrl: 'http://pandora-dgsi:7712', domain: 'Domaines', healthPath: '/health' },
  { id: 'aerospace', label: 'Aerospace', envVar: 'PANDORA_AEROSPACE_URL', defaultUrl: 'http://pandora-aerospace:7713', domain: 'Domaines', healthPath: '/health' },
  { id: 'territorial', label: 'Territorial', envVar: 'PANDORA_TERRITORIAL_URL', defaultUrl: 'http://pandora-territorial:7714', domain: 'Domaines', healthPath: '/health' },
  { id: 'governance', label: 'Governance', envVar: 'PANDORA_GOVERNANCE_URL', defaultUrl: 'http://pandora-governance:7715', domain: 'Gouvernance', healthPath: '/health' },
];

/** URL effective d'un service, sans slash final. Vide si non configuré en natif. */
export function serviceUrl(service: ServiceDefinition): string {
  return (process.env[service.envVar] || '').replace(/\/$/, '');
}
