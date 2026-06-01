import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_MODEL = 'llama3.1:8b';

type BriefingRecord = Record<string, unknown>;

function asRecord(value: unknown): BriefingRecord {
  return value && typeof value === 'object' ? value as BriefingRecord : {};
}

function localBriefing(snapshotValue: unknown, note?: string) {
  const snapshot = asRecord(snapshotValue);
  const anomalies = Array.isArray(snapshot.topAnomalies) ? snapshot.topAnomalies.map(asRecord) : [];
  const hotspots = Array.isArray(snapshot.topHotspots) ? snapshot.topHotspots.map(asRecord) : [];
  const sources = Array.isArray(snapshot.sourceHealth) ? snapshot.sourceHealth.map(asRecord) : [];
  const active = sources.filter((s) => Number(s.rows || 0) > 0).length;
  return [
    `BRIEFING AIP LOCAL — Posture ${snapshot.posture || 'UNKNOWN'} avec score fusion ${snapshot.score ?? '--'}/100.`,
    `Ontologie active : ${snapshot.entityCount || 0} entités, ${snapshot.relationCount || 0} relations, ${active}/${sources.length || 0} sources alimentées.`,
    anomalies[0] ? `Priorité analyste : ${anomalies[0].title}. ${anomalies[0].explanation}` : 'Aucune anomalie prioritaire exploitable dans les flux actuellement chargés.',
    hotspots[0] ? `Zone à surveiller : ${hotspots[0].label}, niveau ${hotspots[0].level}, score ${Math.round(hotspots[0].score)}.` : 'Aucun hotspot géospatial robuste détecté.',
    note ? `Question opérateur : ${note}` : 'Recommandation : vérifier les sources primaires, surveiller les changements de posture et ouvrir une enquête sur les signaux persistants.',
  ].join('\n\n');
}

export async function POST(req: NextRequest) {
  const body = asRecord(await req.json().catch(() => ({})));
  const snapshot = body.snapshot || {};
  const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : '';
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;

  const prompt = `Tu es Pandora AIP, assistant analyste OSINT défensif. Produis un briefing court en français, structuré, avec posture, anomalies, zones chaudes, incertitudes et prochaines vérifications. Ne donne pas d'instructions offensives.\n\nQuestion opérateur: ${note || 'Briefing global'}\n\nSnapshot JSON:\n${JSON.stringify(snapshot).slice(0, 12000)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.25, num_predict: 700 } }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const json = asRecord(await response.json());
    const text = typeof json.response === 'string' && json.response.trim() ? json.response.trim() : localBriefing(snapshot, note);
    return NextResponse.json({ mode: 'ollama', model, briefing: text, generatedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({
      mode: 'local-fallback',
      model,
      briefing: localBriefing(snapshot, note),
      warning: error instanceof Error ? error.message : 'Ollama unavailable',
      generatedAt: new Date().toISOString(),
    });
  }
}