#!/usr/bin/env node
/**
 * PANDORA — Audit de juridiction des dependances sortantes.
 *
 * Scan 100% local (fs + path, aucun acces reseau) :
 *   - src/**\/*.ts, src/**\/*.tsx
 *   - ai/**\/*.py
 * Extrait les hosts des URL absolues (https?://...), deduplique, compte les
 * occurrences, conserve jusqu'a 3 fichiers par host, mappe la juridiction via
 * scripts/jurisdiction-map.json puis ecrit docs/dependency-audit.json et
 * affiche le meme resume en console.
 *
 * Aucun host n'est invente : seuls les hosts reellement presents dans les
 * fichiers sources apparaissent dans la sortie.
 *
 * Usage: node scripts/dependency-audit.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = path.join(ROOT, 'scripts', 'jurisdiction-map.json');
const OUT_PATH = path.join(ROOT, 'docs', 'dependency-audit.json');

const SCAN_TARGETS = [
  { dir: 'src', exts: ['.ts', '.tsx'] },
  { dir: 'ai', exts: ['.py'] },
];

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', '.turbo', 'dist', 'build', 'out',
  '__pycache__', '.venv', 'venv', '.mypy_cache', '.pytest_cache', 'coverage',
]);

const URL_RE = /https?:\/\/([^\/"'\s\)]+)/g;
const MAX_FILES_PER_HOST = 3;
const MAX_EXAMPLES_PER_HOST = 8; // borne d'affichage console uniquement

const JURISDICTIONS = ['FR', 'EU', 'US', 'UK', 'INTL', 'UNDETERMINED'];

/** Normalise un fragment d'URL capture par la regex en host exploitable. */
function normalizeHost(raw) {
  let token = String(raw).split('${')[0]; // variable non substituee -> on garde la partie resolue
  token = token.replace(/["'`,;:\]\)}]+$/g, '').trim().toLowerCase();
  if (!token) return null;
  token = token.replace(/:\d+$/, ''); // port retire : la juridiction se lit sur le host
  token = token.replace(/^\[|\]$/g, '');
  if (!token || token.length < 3) return null;
  if (/[$}{`<>\\]/.test(token)) return null;
  if (!/[a-z]/.test(token)) return null; // IP brute / reste de ponctuation
  if (!/^[a-z0-9._-]+$/.test(token)) return null;
  return token;
}

function loadMap(raw) {
  const map = JSON.parse(raw);
  if (!map || typeof map !== 'object') throw new Error('jurisdiction-map.json illisible');
  const fallback = JURISDICTIONS.includes(map.fallback) ? map.fallback : 'UNDETERMINED';
  const suffixes = Object.entries(map.suffixes || {}).sort((a, b) => b[0].length - a[0].length);
  return { map, fallback, suffixes };
}

function jurisdictionOf(host, table) {
  const { map, fallback, suffixes } = table;
  const exact = map.hosts?.[host];
  if (exact && JURISDICTIONS.includes(exact)) return { jurisdiction: exact, rule: 'hosts' };
  for (const [suffix, value] of suffixes) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return { jurisdiction: value, rule: 'suffixes' };
  }
  const label = host.includes('.') ? host.split('.').pop() : host;
  const byTld = map.tld?.[label];
  if (byTld && JURISDICTIONS.includes(byTld)) return { jurisdiction: byTld, rule: 'tld' };
  return { jurisdiction: fallback, rule: 'fallback' };
}

async function walk(dir, exts, hosts, stats) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      await walk(abs, exts, hosts, stats);
      continue;
    }
    if (!entry.isFile() || !exts.some((ext) => entry.name.endsWith(ext))) continue;
    let source;
    try {
      source = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    stats.filesScanned += 1;
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    URL_RE.lastIndex = 0;
    let match;
    while ((match = URL_RE.exec(source)) !== null) {
      const host = normalizeHost(match[1]);
      if (!host) continue;
      const found = hosts.get(host) || { occurrences: 0, files: [] };
      found.occurrences += 1;
      if (found.files.length < MAX_FILES_PER_HOST && !found.files.includes(rel)) found.files.push(rel);
      hosts.set(host, found);
    }
  }
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function buildNote(hosts) {
  const unattributed = hosts.filter((h) => h.jurisdiction === 'UNDETERMINED').length;
  return (
    'Scan local (fs, sans reseau) de src/**/*.{ts,tsx} et ai/**/*.py ; juridictions resolues par '
    + 'scripts/jurisdiction-map.json (hosts > suffixes > tld > fallback). '
    + `${unattributed} host(s) restent non attribuables (hote local, service Docker, operateur inconnu) : `
    + 'a examiner avant tout deploiement souverain. Aucun host n\'est declare a la main dans ce fichier.'
  );
}

async function main() {
  let table;
  try {
    table = loadMap(await fs.readFile(MAP_PATH, 'utf8'));
  } catch (error) {
    console.error(`[audit] table de juridiction illisible (${MAP_PATH}) : ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const hosts = new Map();
  const stats = { filesScanned: 0 };
  for (const target of SCAN_TARGETS) {
    await walk(path.join(ROOT, target.dir), target.exts, hosts, stats);
  }

  const entries = [...hosts.entries()]
    .map(([host, value]) => ({ host, occurrences: value.occurrences, files: value.files }))
    .sort((a, b) => b.occurrences - a.occurrences || a.host.localeCompare(b.host))
    .map((entry) => {
      const { jurisdiction } = jurisdictionOf(entry.host, table);
      return { host: entry.host, jurisdiction, occurrences: entry.occurrences, files: entry.files };
    });

  const totals = Object.fromEntries(JURISDICTIONS.map((j) => [j, 0]));
  const totalsOccurrences = Object.fromEntries(JURISDICTIONS.map((j) => [j, 0]));
  for (const entry of entries) {
    totals[entry.jurisdiction] += 1;
    totalsOccurrences[entry.jurisdiction] += entry.occurrences;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    filesScanned: stats.filesScanned,
    scannedTargets: SCAN_TARGETS.map((t) => `${t.dir}/**/*{${t.exts.join(',')}}`),
    hosts: entries,
    totals,
    totalsOccurrences,
    note: buildNote(entries),
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const byJurisdiction = (jurisdiction) => entries.filter((e) => e.jurisdiction === jurisdiction);
  const width = Math.max(...entries.map((e) => e.host.length), 4);

  console.log('PANDORA — AUDIT DE JURIDICTION DES DEPENDANCES');
  console.log(`genere: ${report.generatedAt}`);
  console.log(`fichiers analyses: ${report.filesScanned} (${report.scannedTargets.join(', ')})`);
  console.log(`hosts uniques: ${entries.length} — occurrences: ${entries.reduce((sum, e) => sum + e.occurrences, 0)}`);
  console.log('');
  console.log(`${pad('JURID.', 11)} ${pad('HOST', width)} ${pad('OCC', 5)} FICHIERS (max ${MAX_FILES_PER_HOST})`);
  console.log('-'.repeat(11 + width + 5 + 24));
  for (const entry of entries) {
    console.log(`${pad(entry.jurisdiction, 11)} ${pad(entry.host, width)} ${pad(entry.occurrences, 5)} ${entry.files.join(', ')}`);
  }
  console.log('');
  console.log('TOTAUX PAR JURIDICTION (hosts uniques / occurrences)');
  for (const jurisdiction of JURISDICTIONS) {
    console.log(`  ${pad(jurisdiction, 13)} ${pad(totals[jurisdiction], 4)} hosts  ${pad(totalsOccurrences[jurisdiction], 5)} occurrences`);
  }
  const nonEu = entries.filter((e) => e.jurisdiction !== 'FR' && e.jurisdiction !== 'EU');
  console.log('');
  console.log(`HORS UE: ${nonEu.length} hosts uniques, ${nonEu.reduce((sum, e) => sum + e.occurrences, 0)} occurrences`);
  const unattributed = byJurisdiction('UNDETERMINED').slice(0, MAX_EXAMPLES_PER_HOST);
  if (unattributed.length) {
    console.log(`NON ATTRIBUES (${byJurisdiction('UNDETERMINED').length}) : ${unattributed.map((e) => e.host).join(', ')}${byJurisdiction('UNDETERMINED').length > unattributed.length ? ', ...' : ''}`);
  }
  console.log('');
  console.log(`ecrit: ${path.relative(ROOT, OUT_PATH).split(path.sep).join('/')}`);
  console.log(report.note);
}

main().catch((error) => {
  console.error(`[audit] echec: ${error?.stack || error}`);
  process.exitCode = 1;
});
