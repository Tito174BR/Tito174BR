import fs from 'node:fs/promises';

function replaceBlock(content, name, replacement) {
  const start = `<!-- AUTO:${name}:START -->`;
  const end = `<!-- AUTO:${name}:END -->`;
  const pattern = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
  if (!pattern.test(content)) throw new Error(`Marcadores ${name} não encontrados no template.`);
  return content.replace(pattern, `${start}\n${replacement.trim()}\n${end}`);
}

function md(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'data não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function platformBadge(platform) {
  return platform === 'github'
    ? '![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)'
    : '![GitLab](https://img.shields.io/badge/GitLab-FC6D26?logo=gitlab&logoColor=white)';
}

function renderProjects(projects) {
  if (!projects.length) return '_Nenhum projeto público foi encontrado nesta atualização._';

  return projects.map((project) => {
    const metadata = [
      project.language ? `\`${md(project.language)}\`` : null,
      `⭐ ${Number(project.stars || 0)}`,
      `⑂ ${Number(project.forks || 0)}`,
      `Atualizado em ${dateLabel(project.updatedAt)}`,
    ].filter(Boolean).join(' • ');

    const topics = (project.topics ?? []).slice(0, 6).map((topic) => `\`${md(topic)}\``).join(' ');
    const links = [
      `[Código](${project.url})`,
      project.homepage ? `[Demonstração](${project.homepage})` : null,
    ].filter(Boolean).join(' · ');

    return `### [${md(project.name)}](${project.url})\n\n${platformBadge(project.platform)}\n\n${md(project.description || 'Projeto público mantido por Marcus Vinicius.')}\n\n${metadata}\n\n${topics ? `${topics}\n\n` : ''}${links}`;
  }).join('\n\n---\n\n');
}

function renderActivity(activity) {
  if (!activity.length) return '_Nenhuma atividade pública recente foi retornada pelas APIs._';

  return activity.map((item) => {
    const icon = item.platform === 'github' ? 'GitHub' : 'GitLab';
    const repo = item.repository ? ` em **${md(item.repository)}**` : '';
    const action = item.url ? `[${md(item.action)}](${item.url})` : md(item.action);
    return `- **${dateLabel(item.createdAt)} · ${icon}:** ${action}${repo}`;
  }).join('\n');
}

export async function renderReadme(templatePath, outputPath, data) {
  let content = await fs.readFile(templatePath, 'utf8');
  content = replaceBlock(content, 'SUMMARY', '![Resumo do perfil](assets/generated/summary.svg)');
  content = replaceBlock(content, 'LANGUAGES', '![Linguagens dos projetos públicos](assets/generated/languages.svg)');
  content = replaceBlock(content, 'CONTRIBUTIONS', '![Contribuições públicas](assets/generated/contributions.svg)');
  content = replaceBlock(content, 'PROJECTS', renderProjects(data.projects));
  content = replaceBlock(content, 'ACTIVITY', renderActivity(data.activity));

  const updated = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(data.generatedAt));

  content = replaceBlock(
    content,
    'UPDATED',
    `Última sincronização pública: **${updated}**.`,
  );

  await fs.writeFile(outputPath, content, 'utf8');
}
