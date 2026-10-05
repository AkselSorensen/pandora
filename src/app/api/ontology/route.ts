import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Relais vers le service ontologie. Le service expose deux ressources :
 *   /ontology  — le graphe décrit (nœuds, arêtes, posture)
 *   /schema    — le modèle DÉCLARÉ (types d'objets, propriétés typées, liens)
 * Le schéma est ce qui permet au front d'étiqueter les propriétés d'une entité
 * avec le type que l'ontologie leur donne, au lieu de les deviner.
 */
const RESOURCES: Record<string, string> = {
  graph: '/ontology',
  schema: '/schema',
};

async function fetchOntologyService(path: string) {
  const ontologyUrl = process.env.PANDORA_ONTOLOGY_URL;
  if (!ontologyUrl) throw new Error('PANDORA_ONTOLOGY_URL is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${ontologyUrl.replace(/\/$/, '')}${path}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Pandora-Web-Ontology-Proxy/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Ontology service HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  const resource = req.nextUrl.searchParams.get('resource') || 'graph';
  const path = RESOURCES[resource];
  if (!path) {
    return NextResponse.json(
      { error: 'unknown_resource', resource, known: Object.keys(RESOURCES) },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    return NextResponse.json(await fetchOntologyService(path), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ontology unavailable';
    // La forme d'origine est conservée pour `graph` : d'autres écrans la lisent telle quelle.
    if (resource === 'graph') {
      return NextResponse.json({
        mode: 'ontology-error',
        generatedAt: new Date().toISOString(),
        summary: { nodes: 0, edges: 0, types: {}, posture: 'UNKNOWN', riskScore: 0 },
        nodes: [],
        edges: [],
        error: message,
      }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}