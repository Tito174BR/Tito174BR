import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildPortfolio } from './lib/aggregate.mjs';
import { collectGitHub } from './lib/github.mjs';
import { collectGitLab } from './lib/gitlab.mjs';
import { renderReadme } from './lib/render.mjs';
import {
  writeContributionsSvg,
  writeLanguagesSvg,
  writeSummarySvg,
} from './lib/svg.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const offline = process.argv.includes('--offline');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function loadDotEnv() {
  const envPath = path.join(root, '.env');
  try {
    const content = await fs.readFile(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function sourceFromPrevious(previous, platform) {
  const repositories = (previous.allProjects ?? previous.projects ?? []).filter(
    (project) => project.platform === platform,
  );
  const activity = (previous.activity ?? []).filter((item) => item.platform === platform);
  const stats = previous.platformStats?.[platform] ?? {
    publicRepositories: repositories.length,
    stars: repositories.reduce((sum, item) => sum + Number(item.stars || 0), 0),
    forks: repositories.reduce((sum, item) => sum + Number(item.forks || 0), 0),
    recentPushCommits: 0,
    indexedPublicCommits: platform === 'github' ? Number(previous.totals?.publicCommits || 0) : undefined,
    repositoryCommits: platform === 'gitlab' ? Number(previous.totals?.publicCommits || 0) : undefined,
  };

  return {
    available: false,
    error: previous.sources?.[platform]?.error || 'API indisponível; snapshot anterior preservado.',
    user: previous.sources?.[platform]?.user ?? null,
    repositories,
    activity,
    stats,
    contributions: platform === 'github' ? previous.contributions?.github ?? null : undefined,
  };
}

async function generateAssets(data) {
  const generatedDir = path.join(root, 'assets', 'generated');
  await Promise.all([
    writeSummarySvg(path.join(generatedDir, 'summary.svg'), data),
    writeLanguagesSvg(path.join(generatedDir, 'languages.svg'), data),
    writeContributionsSvg(path.join(generatedDir, 'contributions.svg'), data),
  ]);
}

async function main() {
  await loadDotEnv();

  const configPath = path.join(root, 'portfolio.config.json');
  const dataPath = path.join(root, 'data', 'portfolio.json');
  const templatePath = path.join(root, 'README.template.md');
  const readmePath = path.join(root, 'README.md');

  const config = await readJson(configPath);
  let previous = null;
  try {
    previous = await readJson(dataPath);
  } catch {
    previous = null;
  }

  let data;

  if (offline) {
    if (!previous) throw new Error('O modo offline precisa de data/portfolio.json.');
    data = { ...previous, generatedAt: previous.generatedAt || new Date().toISOString() };
  } else {
    const githubPromise = config.sources.github.enabled
      ? collectGitHub(config.sources.github, config.portfolio, process.env.GITHUB_TOKEN)
      : Promise.resolve(sourceFromPrevious(previous ?? {}, 'github'));

    const gitlabPromise = config.sources.gitlab.enabled
      ? collectGitLab(config.sources.gitlab, config.portfolio, process.env.GITLAB_TOKEN)
      : Promise.resolve(sourceFromPrevious(previous ?? {}, 'gitlab'));

    let [github, gitlab] = await Promise.all([githubPromise, gitlabPromise]);

    if (!github.available && previous) {
      console.warn(`GitHub indisponível: ${github.error}. Preservando snapshot anterior.`);
      const fallback = sourceFromPrevious(previous, 'github');
      github = { ...fallback, error: github.error };
    }

    if (!gitlab.available && previous) {
      console.warn(`GitLab indisponível: ${gitlab.error}. Preservando snapshot anterior.`);
      const fallback = sourceFromPrevious(previous, 'gitlab');
      gitlab = { ...fallback, error: gitlab.error };
    }

    data = buildPortfolio(config, github, gitlab);
  }

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await generateAssets(data);
  await renderReadme(templatePath, readmePath, data);

  console.log(`Perfil atualizado para ${config.profile.name}.`);
  console.log(`Projetos públicos no snapshot: ${data.totals.publicProjects}.`);
  console.log(`Arquivo reutilizável pelo futuro site: ${path.relative(root, dataPath)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
