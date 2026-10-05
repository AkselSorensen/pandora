import { NextRequest, NextResponse } from 'next/server';
import { buildSubject, governanceConfigured } from '@/lib/abac';
import { relay, serviceBase, serviceMissing, subjectHeaders } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/**
 * Action d'analyste gouvernée sur un objet du graphe — annoter, confirmer, écarter.
 *
 * TROIS RÈGLES TENUES ICI, chacune contre une façon de contourner la politique :
 *
 *  1. Le SUJET vient de `buildSubject` (session signée). Jamais du corps de requête :
 *     accepter un sujet annoncé par le client reviendrait à laisser le navigateur
 *     déclarer sa propre clearance — exactement ce qui a été supprimé.
 *  2. La CLASSIFICATION DE LA CIBLE est LUE sur le service ontologie, jamais annoncée
 *     par l'appelant. Sinon il suffirait de poster `classification: "public"` pour
 *     obtenir un « allow » sur un objet secret.
 *  3. L'ORDRE décision -> journal -> annotation est appliqué par le service gouvernance.
 *     Ici on transmet et on rapporte ; on ne décide pas, et on n'écrit rien soi-même.
 *
 * Note de classification : cette route hérite de `/api/graph/*` (diffusion_restreinte),
 * la table n'est donc pas modifiée et ne peut pas diverger. La porte qui fait foi n'est
 * pas la classification de la route mais la DÉCISION de gouvernance, calculée sur la
 * classification réelle de l'objet. Un appelant insuffisamment habilité reçoit le refus
 * du service, journalisé comme tout refus.
 */

/**
 * Le service ontologie est BLOQUANT : une construction de graphe dure ~5 s et la
 * lecture d'une entité attend son tour derrière. Mesuré : /entity = 15 ms à vide,
 * mais la file peut dépasser plusieurs secondes quand l'interface rafraîchit le
 * graphe. Un délai serré ici ne protège de rien, il transforme une attente en panne.
 */
const ONTOLOGY_TIMEOUT_MS = 25000;

interface TargetResource {
  id: string;
  type: string;
  classification: string;
  compartments: string[];
}

type TargetResult = { error: string; detail?: string } | { resource: TargetResource };

/**
 * Lit la cible et en tire le descriptif de ressource soumis à la politique.
 * Un objet sans classification déclarée est traité comme le plus protégé :
 * l'inconnu ne doit jamais ouvrir un droit.
 */
async function readTarget(id: string, req: NextRequest): Promise<TargetResult> {
  const base = serviceBase('PANDORA_ONTOLOGY_URL');
  if (!base) return { error: 'ontology_unconfigured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ONTOLOGY_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/entity/${encodeURIComponent(id)}`, {
      headers: subjectHeaders(req),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return { error: 'ontology_unavailable' };

    const payload = (await response.json()) as {
      entity?: { id?: string; type?: string; classification?: string; compartments?: string[] };
    };
    if (!payload.entity) return { error: 'entity_not_found' };

    return {
      resource: {
        id: payload.entity.id || id,
        type: payload.entity.type || 'Unknown',
        classification: payload.entity.classification || 'secret',
        compartments: payload.entity.compartments || [],
      },
    };
  } catch (error) {
    // On rapporte la cause : un « unreachable » muet oblige à instrumenter le code
    // pour savoir ce qui a échoué, et une panne non diagnosticable le reste.
    return {
      error: 'ontology_unreachable',
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Pas de gouvernance, pas d'annotation : une action dont l'autorisation n'est pas
  // traçable n'est pas une action. On refuse plutôt que d'écrire à l'aveugle.
  if (!governanceConfigured()) {
    return NextResponse.json(
      {
        error: 'governance_unconfigured',
        hint: 'PANDORA_GOVERNANCE_URL requis : une annotation sans entrée de journal ne vaut rien.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { id } = await context.params;
  const body = (await req.json().catch(() => null)) as { kind?: string; text?: string } | null;
  const kind = (body?.kind || 'note').trim();
  const text = (body?.text || '').trim();

  if (!text) {
    return NextResponse.json(
      { error: 'empty_text', hint: 'Une annotation sans texte ne dit rien.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const target = await readTarget(id, req);
  if ('error' in target) {
    return NextResponse.json(
      {
        error: target.error,
        detail: target.detail,
        entityId: id,
        ontologyUrl: serviceBase('PANDORA_ONTOLOGY_URL') || null,
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const subject = await buildSubject(req);
  // Le proxy pose l'attestation sur l'appel SORTANT vers la gouvernance, pas sur la
  // requête entrante. On en émet donc une ici, éphémère et côté serveur, comme
  // `authorize()` le fait : une attestation ne se réclame pas, elle s'émet.
  if (!subject.attestation) subject.attestation = `srv-${crypto.randomUUID()}`;

  return relay(req, serviceBase('PANDORA_GOVERNANCE_URL'), '/actions/annotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, resource: target.resource, action: 'annotate', kind, text }),
  });
}

/** Annotations déjà portées par cet objet, avec leur auteur. */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = serviceBase('PANDORA_GOVERNANCE_URL');
  if (!base) return serviceMissing('pandora-governance', 'PANDORA_GOVERNANCE_URL');

  const { id } = await context.params;
  return relay(req, base, `/annotations?target=${encodeURIComponent(id)}`);
}
