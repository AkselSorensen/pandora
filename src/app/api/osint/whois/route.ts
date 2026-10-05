import { NextResponse } from 'next/server';
import { safeFetch, isRateLimited, getClientIp } from '@/lib/ssrf-guard';

// WHOIS + Domain Intelligence via RDAP (free, standardized)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');
  if (!domain) return NextResponse.json({ error: 'Missing domain parameter' }, { status: 400 });

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
  }

  try {
    const results: any = { domain, timestamp: new Date().toISOString() };
    // Une source muette doit se voir : sans cette liste, un `security_score` absent se lit
    // « pas d'information », et un RDAP vide se lit « domaine non enregistré ».
    const degraded: string[] = [];

    // RDAP (Registration Data Access Protocol) — successor to WHOIS
    try {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        results.rdap = {
          handle: data.handle,
          name: data.ldhName,
          status: data.status,
          events: (data.events || []).map((e: any) => ({
            action: e.eventAction,
            date: e.eventDate,
          })),
          nameservers: (data.nameservers || []).map((ns: any) => ns.ldhName),
          entities: (data.entities || []).map((e: any) => ({
            handle: e.handle,
            roles: e.roles,
            name: e.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3],
            org: e.vcardArray?.[1]?.find((v: any) => v[0] === 'org')?.[3],
          })).filter((e: any) => e.name || e.org),
        };

        // Extract key dates
        const events = results.rdap.events || [];
        results.registration = events.find((e: any) => e.action === 'registration')?.date;
        results.expiration = events.find((e: any) => e.action === 'expiration')?.date;
        results.last_changed = events.find((e: any) => e.action === 'last changed')?.date;
      } else {
        // Un 404 RDAP est fréquent pour un domaine non enregistré — mais c'est aussi une
        // façon de refuser. Dans les deux cas, l'absence de données doit être NOMMÉE :
        // c'est ce qui distingue « domaine sans enregistrement » de « registre muet ».
        degraded.push(`rdap:http-${res.status}`);
      }
    } catch (e) {
      degraded.push('rdap:enregistrement');
      console.warn('[PANDORA] RDAP injoignable:', e instanceof Error ? e.message : e);
    }

    // HTTP headers for tech fingerprinting — go through safeFetch so the
    // attacker can't aim a HEAD request at internal infrastructure with a
    // hostname that resolves to a reserved range, or chain a redirect from a
    // public host to one. Redirects are followed manually with re-validation.
    try {
      const res = await safeFetch(`https://${domain}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
        maxRedirects: 3,
      });
      const headers: Record<string, string> = {};
      ['server', 'x-powered-by', 'x-frame-options', 'strict-transport-security',
       'content-security-policy', 'x-content-type-options', 'x-xss-protection',
       'referrer-policy', 'permissions-policy'].forEach(h => {
        const v = res.headers.get(h);
        if (v) headers[h] = v;
      });
      results.http = {
        status: res.status,
        headers,
        redirected: res.redirected,
        final_url: res.url,
      };

      // Un score de sécurité se calcule sur une réponse RÉELLE. Les serveurs refusent
      // souvent HEAD (403/405) : noter les en-têtes d'une page d'erreur produirait un « F »
      // qui ne dit rien de la sécurité du site.
      if (res.ok) {
        let score = 0;
        if (headers['strict-transport-security']) score += 2;
        if (headers['content-security-policy']) score += 2;
        if (headers['x-frame-options']) score += 1;
        if (headers['x-content-type-options']) score += 1;
        if (headers['referrer-policy']) score += 1;
        results.security_score = { score, max: 7, grade: score >= 5 ? 'A' : score >= 3 ? 'B' : score >= 1 ? 'C' : 'F' };
      } else {
        degraded.push(`http:head-${res.status}`);
      }
    } catch (e) {
      degraded.push('http:entetes');
      console.warn('[PANDORA] Entêtes HTTP injoignables:', e instanceof Error ? e.message : e);
    }

    results.degraded = degraded;
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: 'WHOIS lookup failed' }, { status: 500 });
  }
}
