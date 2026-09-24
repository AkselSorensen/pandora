import { NextRequest } from 'next/server';
import { relay, serviceBase, serviceMissing } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/** Export the case (json | md). Requires the export action in the ABAC policy. */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = serviceBase('PANDORA_CASES_URL');
  if (!base) return serviceMissing('pandora-cases', 'PANDORA_CASES_URL');
  const { id } = await context.params;
  const format = req.nextUrl.searchParams.get('format') === 'md' ? 'md' : 'json';
  return relay(req, base, `/cases/${encodeURIComponent(id)}/export?format=${format}`);
}
