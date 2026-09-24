import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FolderOpen } from 'lucide-react';
import CasesPanel from '@/components/CasesPanel';

export const metadata: Metadata = {
  title: 'Pandora Cases',
  description: 'Gestion des dossiers analystes: preuves, hypothese et chaine de tracabilite.',
};

export default function CasesPage() {
  return (
    <main className="styled-scrollbar h-screen overflow-y-auto bg-[var(--bg-void)] text-[var(--text-primary)]">
      <section className="mx-auto w-full max-w-[1600px] p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="glass-panel p-2" aria-label="Retour au tableau de bord">
              <ArrowLeft className="h-4 w-4 text-[var(--gold-primary)]" />
            </Link>
            <div>
              <span className="gotham-tag gotham-tag--info">
                <FolderOpen className="h-3 w-3" /> CASES
              </span>
              <h1 className="mt-2 font-mono text-3xl font-bold uppercase tracking-[.25em] text-[var(--text-heading)]">
                Pandora Cases
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Dossiers analystes: preuves hashees, hypothese, fil de tracabilite et export.
              </p>
            </div>
          </div>
        </header>

        <CasesPanel />
      </section>
    </main>
  );
}
