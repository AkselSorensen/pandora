import { NextRequest } from 'next/server';
import { relay, serviceBase, serviceMissing } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/** List analyst cases (?status=&limit=). */
export async function GET(req: NextRequest) {
  const base = serviceBase('PANDORA_CASES_URL');
  if (!base) return serviceMissing('pandora-cases', 'PANDORA_CASES_URL');

  const params = req.nextUrl.searchParams;
  const query = new URLSearchParams();
  const status = params.get('status');
  if (status) query.set('status', status);
  query.set('limit', params.get('limit') || '50');
  return relay(req, base, `/cases?${query.toString()}`);
}

/** Create a case. The governance service decides; a deny is relayed as-is (403). */
export async function POST(req: NextRequest) {
  const base = serviceBase('PANDORA_CASES_URL');
  if (!base) return serviceMissing('pandora-cases', 'PANDORA_CASES_URL');

  const body = await req.text();
  return relay(req, base, '/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
