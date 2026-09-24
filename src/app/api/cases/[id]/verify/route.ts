import { NextRequest } from 'next/server';
import { relay, serviceBase, serviceMissing } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/** Re-verify every evidence payload hash of a case. */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = serviceBase('PANDORA_CASES_URL');
  if (!base) return serviceMissing('pandora-cases', 'PANDORA_CASES_URL');
  const { id } = await context.params;
  return relay(req, base, `/cases/${encodeURIComponent(id)}/verify`);
}
