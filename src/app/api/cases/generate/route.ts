import { NextRequest } from 'next/server';
import { relay, serviceBase, serviceMissing } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/**
 * Generate cases from the live alerts + ontology. Deterministic ids: re-running does not
 * duplicate a case. Unreachable sources are reported in `degraded`, never replaced.
 */
export async function POST(req: NextRequest) {
  const base = serviceBase('PANDORA_CASES_URL');
  if (!base) return serviceMissing('pandora-cases', 'PANDORA_CASES_URL');
  return relay(req, base, '/cases/generate', { method: 'POST' });
}
