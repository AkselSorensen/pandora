import { NextRequest } from 'next/server';
import { relay, serviceBase, serviceMissing } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/**
 * Governance proxy (catch-all): labels, audit, audit/verify, posture, operators, policy.
 * The whole namespace is classified confidentiel + compartment `audit` (see
 * src/lib/classification.ts) and enforced by src/proxy.ts before reaching here.
 */
async function forward(req: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const base = serviceBase('PANDORA_GOVERNANCE_URL');
  if (!base) return serviceMissing('pandora-governance', 'PANDORA_GOVERNANCE_URL');

  const { path } = await context.params;
  const suffix = (path || []).join('/');
  const query = req.nextUrl.search;
  const target = `/${suffix}${query}`;

  const init: RequestInit = { method: req.method };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = await req.text();
  }
  return relay(req, base, target, init);
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
