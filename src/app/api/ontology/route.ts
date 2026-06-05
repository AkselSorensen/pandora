import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function fetchOntologyService() {
  const ontologyUrl = process.env.PANDORA_ONTOLOGY_URL;
  if (!ontologyUrl) throw new Error('PANDORA_ONTOLOGY_URL is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${ontologyUrl.replace(/\/$/, '')}/ontology`, {
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

export async function GET() {
  try {
    return NextResponse.json(await fetchOntologyService(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      mode: 'ontology-error',
      generatedAt: new Date().toISOString(),
      summary: { nodes: 0, edges: 0, types: {}, posture: 'UNKNOWN', riskScore: 0 },
      nodes: [],
      edges: [],
      error: error instanceof Error ? error.message : 'Ontology unavailable',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}