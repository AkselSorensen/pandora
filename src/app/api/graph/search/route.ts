import { NextRequest } from 'next/server';
import { relay, serviceBase, serviceMissing } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/** Entity search by label/id, optionally filtered by type. */
export async function GET(req: NextRequest) {
  const base = serviceBase('PANDORA_ONTOLOGY_URL');
  if (!base) return serviceMissing('pandora-ontology', 'PANDORA_ONTOLOGY_URL');
  const params = req.nextUrl.searchParams;
  const query = new URLSearchParams({
    q: params.get('q') || '',
    limit: params.get('limit') || '50',
  });
  const type = params.get('type');
  if (type) query.set('type', type);
  return relay(req, base, `/entities?${query.toString()}`);
}
