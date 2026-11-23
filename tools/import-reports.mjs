// Récupère les rapports d'erreur ouverts dans le dépôt privé et les ajoute à tests/reports.json,
// où chacun devient un test automatique (tests/reports.test.mjs).
//
//   node tools/import-reports.mjs          → importe les nouveaux rapports
//   node tools/import-reports.mjs --list   → affiche seulement les rapports ouverts
//
// Nécessite la commande `gh` connectée au compte GitHub.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const REPO = 'yann-forge/proello-retours';
const FILE = new URL('../tests/reports.json', import.meta.url);

const issues = JSON.parse(
  execFileSync('gh', ['issue', 'list', '-R', REPO, '--state', 'open', '--limit', '200', '--json', 'number,title,body,url'], {
    encoding: 'utf8',
  })
);

const cases = JSON.parse(readFileSync(FILE, 'utf8'));
const known = new Set(cases.map((c) => c.issue));
let added = 0;

for (const issue of issues.sort((a, b) => a.number - b.number)) {
  const block = issue.body.match(/```json\s*([\s\S]*?)```/);
  let data = null;
  try {
    data = block && JSON.parse(block[1]);
  } catch {
    /* bloc illisible */
  }
  const status = known.has(issue.number) ? 'déjà importé' : data ? 'nouveau' : 'sans données (à lire à la main)';
  console.log(`#${issue.number} [${status}] ${issue.title}`);
  if (process.argv.includes('--list') || known.has(issue.number) || !data) continue;
  cases.push({
    issue: issue.number,
    now: data.now,
    input: data.input,
    problems: data.problems || [],
    expected: data.expected || [],
    comment: data.comment || '',
  });
  added++;
}

if (added) writeFileSync(FILE, JSON.stringify(cases, null, 2) + '\n');
console.log(`\n${issues.length} rapport(s) ouvert(s), ${added} ajouté(s) à tests/reports.json`);
