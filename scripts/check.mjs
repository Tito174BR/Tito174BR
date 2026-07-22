import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'README.md',
  'README.template.md',
  'portfolio.config.json',
  'data/portfolio.json',
  'assets/generated/summary.svg',
  'assets/generated/languages.svg',
  'assets/generated/contributions.svg',
  '.github/workflows/update-profile.yml',
  '.gitlab-ci.yml',
];

const errors = [];
for (const relativePath of required) {
  try {
    const stat = await fs.stat(path.join(root, relativePath));
    if (!stat.isFile() || stat.size === 0) errors.push(`${relativePath} está vazio.`);
  } catch {
    errors.push(`${relativePath} não existe.`);
  }
}

const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');
for (const marker of ['SUMMARY', 'LANGUAGES', 'CONTRIBUTIONS', 'PROJECTS', 'ACTIVITY', 'UPDATED']) {
  if (!readme.includes(`<!-- AUTO:${marker}:START -->`) || !readme.includes(`<!-- AUTO:${marker}:END -->`)) {
    errors.push(`Marcadores ${marker} ausentes no README.md.`);
  }
}

const data = JSON.parse(await fs.readFile(path.join(root, 'data/portfolio.json'), 'utf8'));
if (!Array.isArray(data.projects)) errors.push('data.projects deve ser uma lista.');
if (!Array.isArray(data.languages)) errors.push('data.languages deve ser uma lista.');
if (!data.profile?.username) errors.push('profile.username não foi definido.');

if (errors.length) {
  console.error(errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`Validação concluída: ${required.length} arquivos essenciais e README íntegro.`);
