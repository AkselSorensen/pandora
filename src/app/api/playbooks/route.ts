import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = 'nodejs';

interface PlaybookStep {
  id: string;
  title: string;
  description: string;
  tool: string;
  parameters: Record<string, string>;
  order: number;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  steps: PlaybookStep[];
  createdAt: string;
  updatedAt: string;
}

const storePath = path.join(process.cwd(), 'data', 'recon-playbooks.json');

async function ensureStore() {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    await fs.writeFile(storePath, JSON.stringify({ playbooks: [] }, null, 2), 'utf8');
  }
}

async function readPlaybooks(): Promise<Playbook[]> {
  await ensureStore();
  const raw = await fs.readFile(storePath, 'utf8');
  const parsed = JSON.parse(raw || '{"playbooks":[]}');
  return Array.isArray(parsed.playbooks) ? parsed.playbooks : [];
}

async function writePlaybooks(playbooks: Playbook[]) {
  await ensureStore();
  await fs.writeFile(storePath, JSON.stringify({ playbooks }, null, 2), 'utf8');
}

function validatePlaybook(input: any): Playbook {
  if (!input || typeof input !== 'object') throw new Error('Invalid playbook payload');
  if (!input.id || typeof input.id !== 'string') throw new Error('Playbook id is required');
  if (!input.name || typeof input.name !== 'string') throw new Error('Playbook name is required');

  return {
    id: input.id,
    name: input.name,
    description: typeof input.description === 'string' ? input.description : '',
    steps: Array.isArray(input.steps)
      ? input.steps.map((step: any, index: number) => ({
          id: typeof step.id === 'string' ? step.id : `step-${index}`,
          title: typeof step.title === 'string' ? step.title : `Step ${index + 1}`,
          description: typeof step.description === 'string' ? step.description : '',
          tool: typeof step.tool === 'string' ? step.tool : 'Manual',
          parameters: step.parameters && typeof step.parameters === 'object' ? step.parameters : {},
          order: Number.isFinite(step.order) ? step.order : index + 1,
        }))
      : [],
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const playbooks = await readPlaybooks();
    return NextResponse.json({ playbooks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read playbooks' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const playbook = validatePlaybook(await request.json());
    const playbooks = await readPlaybooks();
    const index = playbooks.findIndex((item) => item.id === playbook.id);
    const next = index >= 0 ? playbooks.map((item) => (item.id === playbook.id ? playbook : item)) : [playbook, ...playbooks];
    await writePlaybooks(next);
    return NextResponse.json({ playbook, playbooks: next });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save playbook' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new Error('Missing playbook id');
    const playbooks = await readPlaybooks();
    const next = playbooks.filter((item) => item.id !== id);
    await writePlaybooks(next);
    return NextResponse.json({ playbooks: next });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete playbook' },
      { status: 400 },
    );
  }
}