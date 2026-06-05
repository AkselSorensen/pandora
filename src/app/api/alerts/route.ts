import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function fetchAlertsService() {
  const alertsUrl = process.env.PANDORA_ALERTS_URL;
  if (!alertsUrl) throw new Error('PANDORA_ALERTS_URL is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${alertsUrl.replace(/\/$/, '')}/alerts`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Pandora-Web-Alerts-Proxy/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Alerts service HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackAlertsFromDigest(digest: any) {
  const items = Array.isArray(digest?.priorityItems) ? digest.priorityItems : [];
  const alerts = items
    .filter((item: any) => ['critical', 'high', 'medium'].includes(String(item?.severity || '').toLowerCase()))
    .slice(0, 20)
    .map((item: any, index: number) => ({
      id: `fallback-alert-${item.id || index}`,
      level: String(item.severity || 'medium').toLowerCase() === 'critical' ? 'critical' : String(item.severity || 'medium').toLowerCase() === 'high' ? 'high' : 'medium',
      status: 'open',
      title: item.title || 'Pandora alert',
      category: item.category || 'General',
      source: item.source || 'Pandora Digest',
      timestamp: item.timestamp || digest?.generatedAt || new Date().toISOString(),
      location: item.location,
      url: item.url,
      confidence: Number(item.confidence || 0),
      reasons: [`Digest severity: ${item.severity || 'medium'}`],
      recommendedAction: 'Review the signal, confirm primary sources, and create an analyst case if it persists.',
      digestItem: item,
    }));

  const counts = alerts.reduce((acc: Record<string, number>, alert: any) => {
    acc[alert.level] = (acc[alert.level] || 0) + 1;
    return acc;
  }, {});

  return {
    mode: 'next-fallback-alerts',
    generatedAt: new Date().toISOString(),
    total: alerts.length,
    counts,
    alerts,
    sourceDigest: {
      posture: digest?.posture,
      riskScore: digest?.riskScore,
      generatedAt: digest?.generatedAt,
      mode: digest?.mode,
    },
  };
}

export async function GET(req: Request) {
  try {
    const serviceAlerts = await fetchAlertsService();
    return NextResponse.json(serviceAlerts, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    try {
      const origin = new URL(req.url).origin;
      const response = await fetch(`${origin}/api/digest`, { cache: 'no-store' });
      const digest = response.ok ? await response.json() : {};
      return NextResponse.json({
        ...fallbackAlertsFromDigest(digest),
        warning: error instanceof Error ? error.message : 'Alerts service unavailable',
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (fallbackError) {
      return NextResponse.json({
        mode: 'alerts-error',
        generatedAt: new Date().toISOString(),
        total: 0,
        counts: {},
        alerts: [],
        error: fallbackError instanceof Error ? fallbackError.message : 'Alerts unavailable',
      }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }
}