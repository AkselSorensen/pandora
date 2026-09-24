import { NextRequest } from 'next/server';
import { relay, serviceBase, serviceMissing } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/** Entity pivot: neighbours, relations and contributing sources. */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = serviceBase('PANDORA_ONTOLOGY_URL');
  if (!base) return serviceMissing('pandora-ontology', 'PANDORA_ONTOLOGY_URL');
  const { id } = await context.params;
  return relay(req, base, `/entity/${encodeURIComponent(id)}`);
}
