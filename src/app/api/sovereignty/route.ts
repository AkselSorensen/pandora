import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * PANDORA — Souverainete / residence des dependances.
 *
 * Expose le resultat BRUT du scan local `node scripts/dependency-audit.mjs`
 * (docs/dependency-audit.json). Aucune donnee n'est inventee : si le fichier
 * n'existe pas, la route renvoie 503 + la commande a lancer.
 */

const AUDIT_FILE = path.join(process.cwd(), 'docs', 'dependency-audit.json');
const AUDIT_COMMAND = 'node scripts/dependency-audit.mjs';

export async function GET() {
  const deploymentProfile = process.env.PANDORA_DEPLOYMENT_PROFILE ?? null;

  let raw: string;
  try {
    raw = await readFile(AUDIT_FILE, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return NextResponse.json(
        { error: 'audit_not_generated', command: AUDIT_COMMAND, deploymentProfile },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error: 'audit_unreadable',
        message: code ? `lecture impossible (${code})` : 'lecture impossible',
        command: AUDIT_COMMAND,
        deploymentProfile,
      },
      { status: 503 },
    );
  }

  try {
    const audit = JSON.parse(raw) as Record<string, unknown>;
    return NextResponse.json({ ...audit, deploymentProfile }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: 'audit_invalid', message: 'docs/dependency-audit.json illisible (JSON invalide)', command: AUDIT_COMMAND, deploymentProfile },
      { status: 503 },
    );
  }
}
