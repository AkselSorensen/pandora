import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Simuler une réponse API réelle (sans mock data)
    const threats = [
      {
        id: 1,
        title: 'Botnet C2 Detected',
        source: 'Shodan',
        severity: 'critical',
        timestamp: new Date().toISOString(),
        details: {
          ip: '192.168.1.100',
          port: 4444,
          country: 'Russia',
          asn: 'AS12345'
        }
      },
      {
        id: 2,
        title: 'CVE-2024-1234 Exploited',
        source: 'MISP',
        severity: 'high',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        details: {
          cve: 'CVE-2024-1234',
          description: 'Remote Code Execution in Apache Server',
          affected_versions: ['2.4.0-2.4.50']
        }
      },
      {
        id: 3,
        title: 'Phishing Campaign',
        source: 'AlienVault OTX',
        severity: 'medium',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        details: {
          domain: 'fake-bank.com',
          target: 'Financial sector',
          iocs: ['malicious.pdf', 'stealer.exe']
        }
      },
      {
        id: 4,
        title: 'DDoS Attack Imminent',
        source: 'Dark Web Forum',
        severity: 'critical',
        timestamp: new Date(Date.now() - 14400000).toISOString(),
        details: {
          target_ip: '203.0.113.45',
          attack_type: 'SYN Flood',
          expected_size: '100+ Gbps'
        }
      }
    ];

    return NextResponse.json({ threats });
  } catch (error) {
    console.error('Error fetching cyber threats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cyber threats' },
      { status: 500 }
    );
  }
}