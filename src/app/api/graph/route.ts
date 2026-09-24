import { NextRequest } from 'next/server';
import { relay, serviceBase, serviceMissing } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/**
 * Knowledge graph proxy.
 *  resource=graph  (default) → /graph
 *  resource=entity&id=…      → /entity/{id}
 *  resource=search&q=…       → /entities?q=
 */
export async function GET(req: NextRequest) {
  const base = serviceBase('PANDORA_ONTOLOGY_URL');
  if (!base) return serviceMissing('pandora-ontology', 'PANDORA_ONTOLOGY_URL');

  const params = req.nextUrl.searchParams;
  const resource = params.get('resource') || 'graph';

  if (resource === 'entity') {
    const id = params.get('id');
    if (!id) {
      return Response.json({ error: 'missing_id', hint: 'resource=entity requires ?id=' }, { status: 400 });
    }
    return relay(req, base, `/entity/${encodeURIComponent(id)}`);
  }

  if (resource === 'search') {
    const q = encodeURIComponent(params.get('q') || '');
    const type = params.get('type');
    const limit = params.get('limit') || '50';
    return relay(req, base, `/entities?q=${q}&limit=${limit}${type ? `&type=${encodeURIComponent(type)}` : ''}`);
  }

  const query = new URLSearchParams();
  for (const key of ['domain', 'type', 'min_risk', 'limit']) {
    const value = params.get(key);
    if (value !== null) query.set(key, value);
  }
  if (params.get('force') === '1') query.set('force', 'true');
  const suffix = query.toString();
  return relay(req, base, `/graph${suffix ? `?${suffix}` : ''}`);
}
