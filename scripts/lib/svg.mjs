import fs from 'node:fs/promises';
import path from 'node:path';

const palette = [
  '#58A6FF', '#FC6D26', '#2EA043', '#A371F7', '#F2CC60',
  '#F778BA', '#39C5CF', '#FF7B72', '#79C0FF', '#D2A8FF',
];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function compact(value) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

function baseSvg(width, height, content, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0D1117"/>
      <stop offset="100%" stop-color="#161B22"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.24"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" rx="16" fill="url(#bg)" stroke="#30363D"/>
  <style>
    .title{font:700 19px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#F0F6FC}
    .label{font:500 12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#8B949E}
    .value{font:700 25px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#F0F6FC}
    .small{font:500 11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#C9D1D9}
  </style>
  ${content}
</svg>`;
}

export async function writeSummarySvg(filePath, data) {
  const metrics = [
    ['Projetos públicos', data.totals.publicProjects],
    ['Commits visíveis', data.totals.publicCommits],
    ['Stars', data.totals.stars],
    ['Forks', data.totals.forks],
    ['Atividades recentes', data.totals.recentActivities],
  ];

  const width = 900;
  const height = 180;
  const cardWidth = 160;
  const gap = 14;
  const startX = 25;

  const cards = metrics.map(([label, value], index) => {
    const x = startX + index * (cardWidth + gap);
    return `<g transform="translate(${x} 67)">
      <rect width="${cardWidth}" height="82" rx="12" fill="#0D1117" stroke="#30363D" filter="url(#shadow)"/>
      <text x="14" y="29" class="value">${esc(compact(value))}</text>
      <text x="14" y="56" class="label">${esc(label)}</text>
    </g>`;
  }).join('\n');

  const content = `<text x="25" y="38" class="title">Resumo público — GitHub + GitLab</text>${cards}`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, baseSvg(width, height, content, 'Resumo público do perfil'), 'utf8');
}

export async function writeLanguagesSvg(filePath, data) {
  const width = 900;
  const rowHeight = 28;
  const languages = data.languages.slice(0, 10);
  const height = Math.max(170, 85 + languages.length * rowHeight);
  const barX = 190;
  const barWidth = 630;

  const rows = languages.map((item, index) => {
    const y = 70 + index * rowHeight;
    const valueWidth = Math.max(4, (item.percentage / 100) * barWidth);
    return `<g>
      <text x="25" y="${y + 13}" class="small">${esc(item.name)}</text>
      <rect x="${barX}" y="${y}" width="${barWidth}" height="14" rx="7" fill="#21262D"/>
      <rect x="${barX}" y="${y}" width="${valueWidth.toFixed(1)}" height="14" rx="7" fill="${palette[index % palette.length]}"/>
      <text x="840" y="${y + 12}" class="small" text-anchor="end">${item.percentage.toFixed(1)}%</text>
    </g>`;
  }).join('\n');

  const content = `<text x="25" y="38" class="title">Linguagens dos projetos públicos</text>${rows || '<text x="25" y="90" class="label">Sem dados de linguagens nesta atualização.</text>'}`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, baseSvg(width, height, content, 'Linguagens dos projetos públicos'), 'utf8');
}

function buildFallbackMonths(data) {
  const months = [];
  const now = new Date();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push({
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
      count: 0,
    });
  }

  for (const item of data.activity) {
    const date = new Date(item.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const month = months.find((entry) => entry.key === key);
    if (month) month.count += Math.max(1, Number(item.count || 1));
  }

  return months;
}

export async function writeContributionsSvg(filePath, data) {
  const width = 900;
  const height = 220;
  const calendar = data.contributions.github?.contributionCalendar;

  let visualization = '';

  if (calendar?.weeks?.length) {
    const weeks = calendar.weeks.slice(-53);
    const cell = 11;
    const gap = 3;
    const startX = 120;
    const startY = 65;
    const max = Math.max(
      1,
      ...weeks.flatMap((week) => week.contributionDays.map((day) => day.contributionCount)),
    );

    const cells = weeks.flatMap((week, weekIndex) =>
      week.contributionDays.map((day, dayIndex) => {
        const intensity = day.contributionCount / max;
        const color = day.contributionCount === 0
          ? '#21262D'
          : intensity < 0.25
            ? '#0E4429'
            : intensity < 0.5
              ? '#006D32'
              : intensity < 0.75
                ? '#26A641'
                : '#39D353';
        const x = startX + weekIndex * (cell + gap);
        const y = startY + dayIndex * (cell + gap);
        return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${color}"><title>${esc(day.date)}: ${day.contributionCount}</title></rect>`;
      }),
    ).join('\n');

    visualization = `
      <text x="25" y="38" class="title">Contribuições públicas — últimos 12 meses</text>
      <text x="25" y="72" class="value">${compact(calendar.totalContributions)}</text>
      <text x="25" y="94" class="label">contribuições no GitHub</text>
      ${cells}
      <text x="120" y="190" class="label">Menos</text>
      <rect x="160" y="179" width="11" height="11" rx="2" fill="#21262D"/>
      <rect x="177" y="179" width="11" height="11" rx="2" fill="#0E4429"/>
      <rect x="194" y="179" width="11" height="11" rx="2" fill="#006D32"/>
      <rect x="211" y="179" width="11" height="11" rx="2" fill="#26A641"/>
      <rect x="228" y="179" width="11" height="11" rx="2" fill="#39D353"/>
      <text x="247" y="190" class="label">Mais</text>`;
  } else {
    const months = buildFallbackMonths(data);
    const max = Math.max(1, ...months.map((item) => item.count));
    const barWidth = 48;
    const gap = 18;
    const startX = 45;
    const baseline = 165;

    const bars = months.map((item, index) => {
      const barHeight = Math.max(4, (item.count / max) * 85);
      const x = startX + index * (barWidth + gap);
      return `<g>
        <rect x="${x}" y="${baseline - barHeight}" width="${barWidth}" height="${barHeight}" rx="6" fill="${index % 2 === 0 ? '#58A6FF' : '#FC6D26'}"/>
        <text x="${x + barWidth / 2}" y="${baseline + 22}" text-anchor="middle" class="label">${esc(item.label)}</text>
        <text x="${x + barWidth / 2}" y="${baseline - barHeight - 7}" text-anchor="middle" class="small">${item.count}</text>
      </g>`;
    }).join('\n');

    visualization = `
      <text x="25" y="38" class="title">Atividade pública recente por mês</text>
      ${bars}
      <text x="25" y="207" class="label">O calendário detalhado do GitHub aparece após a execução com GITHUB_TOKEN.</text>`;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, baseSvg(width, height, visualization, 'Contribuições públicas'), 'utf8');
}
