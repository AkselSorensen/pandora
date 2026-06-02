import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_MODEL = 'pandora-ai';

type BriefingRecord = Record<string, unknown>;

function asRecord(value: unknown): BriefingRecord {
  return value && typeof value === 'object' ? value as BriefingRecord : {};
}

function localBriefing(snapshotValue: unknown, note?: string) {
  const snapshot = asRecord(snapshotValue);
  const anomalies = Array.isArray(snapshot.topAnomalies) ? snapshot.topAnomalies.map(asRecord) : [];
  const hotspots = Array.isArray(snapshot.topHotspots) ? snapshot.topHotspots.map(asRecord) : [];
  const sources = Array.isArray(snapshot.sourceHealth) ? snapshot.sourceHealth.map(asRecord) : [];
  const timeline = Array.isArray(snapshot.timeline) ? snapshot.timeline.map(asRecord) : [];
  const active = sources.filter((s) => Number(s.rows || 0) > 0).length;
  const rows = sources.reduce((sum, s) => sum + Number(s.rows || 0), 0);
  const posture = String(snapshot.posture || 'UNKNOWN');
  const score = Number(snapshot.score || 0);
  const sourceCoverage = sources.length ? Math.round((active / sources.length) * 100) : 0;
  const topSources = sources
    .filter((s) => Number(s.rows || 0) > 0)
    .sort((a, b) => Number(b.rows || 0) - Number(a.rows || 0))
    .slice(0, 5)
    .map((s) => `${s.label || s.key}: ${s.rows}`)
    .join(' · ') || 'aucune source active';

  const criticalSignals = anomalies.filter((a) => ['CRITICAL', 'ELEVATED'].includes(String(a.level || '')));
  const recommendedActions = [
    criticalSignals[0] ? `Ouvrir un case analyste sur “${criticalSignals[0].title}”.` : 'Conserver une veille générale et attendre davantage de signaux corrélés.',
    hotspots[0] ? `Zoomer sur ${hotspots[0].label} et comparer incidents, infrastructures, maritime et cyber.` : 'Activer les couches GDELT, infrastructure, maritime et cyber pour densifier la fusion.',
    sourceCoverage < 50 ? 'Augmenter la couverture source : activer plus de layers ou vérifier les APIs en standby.' : 'Contrôler les sources primaires avant toute décision opérationnelle.',
    'Créer une watchlist pour les ports, pays, infrastructures ou navires associés aux signaux persistants.',
  ];

  const anomalyLines = anomalies.slice(0, 5).map((a, i) =>
    `${i + 1}. [${a.level || 'WATCH'} ${Math.round(Number(a.score || 0))}/100] ${a.title || 'Anomalie'} — ${a.explanation || 'Signal multi-source à qualifier.'}`
  );
  const hotspotLines = hotspots.slice(0, 5).map((h, i) =>
    `${i + 1}. ${h.label || 'Zone'} — niveau ${h.level || 'WATCH'}, score ${Math.round(Number(h.score || 0))}, drivers: ${Array.isArray(h.drivers) ? h.drivers.join(', ') : 'N/A'}`
  );
  const timelineLines = timeline.slice(0, 6).map((e, i) =>
    `${i + 1}. ${e.timestamp || '--'} · ${e.type || 'entity'} · ${e.label || 'Signal'} · risque ${Math.round(Number(e.risk || 0))}`
  );

  return [
    `# BRIEFING AIP LOCAL — PANDORA`,
    `## 1. Posture globale\nPosture ${posture} avec score fusion ${Math.round(score)}/100. Ontologie active : ${snapshot.entityCount || 0} entités, ${snapshot.relationCount || 0} relations, ${active}/${sources.length || 0} sources alimentées (${sourceCoverage}% de couverture). Volume total observé : ${rows} lignes/signaux.`,
    `## 2. Sources dominantes\n${topSources}`,
    `## 3. Signaux prioritaires\n${anomalyLines.length ? anomalyLines.join('\n') : 'Aucune anomalie prioritaire exploitable dans les flux actuellement chargés.'}`,
    `## 4. Zones chaudes\n${hotspotLines.length ? hotspotLines.join('\n') : 'Aucun hotspot géospatial robuste détecté.'}`,
    `## 5. Timeline récente\n${timelineLines.length ? timelineLines.join('\n') : 'Aucun événement horodaté exploitable dans le snapshot compact.'}`,
    `## 6. Recommandations analyste\n${recommendedActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
    `## 7. Incertitudes\nCe briefing est une analyse défensive basée sur sources publiques et heuristiques locales. Les signaux doivent être confirmés par sources primaires avant action. ${note ? `Question opérateur prise en compte : ${note}` : ''}`,
  ].join('\n\n');
}

export async function POST(req: NextRequest) {
  const body = asRecord(await req.json().catch(() => ({})));
  const snapshot = body.snapshot || {};
  const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : '';
  const pandoraAiUrl = process.env.PANDORA_AI_URL;
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;

  if (pandoraAiUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000);
      const response = await fetch(`${pandoraAiUrl.replace(/\/$/, '')}/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot, note, max_tokens: 900 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok) {
        const json = asRecord(await response.json());
        if (typeof json.briefing === 'string' && json.briefing.trim()) {
          return NextResponse.json(json);
        }
      }
    } catch {
      // Fallback to direct Ollama/local below.
    }
  }

  const prompt = `Tu es Pandora AIP, assistant analyste OSINT défensif de niveau opérationnel. Produis un briefing en français, structuré en sections : posture globale, signaux prioritaires, zones chaudes, corrélations multi-sources, incertitudes, recommandations analyste. Tu transformes les données en renseignement exploitable, sans instructions offensives, sans surveillance illégale, et en rappelant la nécessité de confirmer les sources primaires.\n\nQuestion opérateur: ${note || 'Briefing global'}\n\nSnapshot JSON:\n${JSON.stringify(snapshot).slice(0, 16000)}`;

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