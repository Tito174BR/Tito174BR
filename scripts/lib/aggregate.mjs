function normalizeRepoLanguageWeights(repository) {
  const entries = Object.entries(repository.languages ?? {}).filter(([, value]) => Number(value) > 0);
  if (!entries.length && repository.language) return { [repository.language]: 1000 };
  if (!entries.length) return {};

  const total = entries.reduce((sum, [, value]) => sum + Number(value), 0);
  if (total <= 0) return {};

  return Object.fromEntries(
    entries.map(([name, value]) => [name, (Number(value) / total) * 1000]),
  );
}

function aggregateLanguages(projects, maxLanguages) {
  const totals = new Map();

  for (const project of projects) {
    for (const [language, weight] of Object.entries(normalizeRepoLanguageWeights(project))) {
      totals.set(language, (totals.get(language) ?? 0) + weight);
    }
  }

  const sum = [...totals.values()].reduce((acc, value) => acc + value, 0) || 1;

  return [...totals.entries()]
    .map(([name, bytes]) => ({
      name,
      bytes: Math.round(bytes),
      percentage: Number(((bytes / sum) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, maxLanguages);
}

function projectScore(project, featured) {
  const featuredIndex = featured.findIndex((item) => {
    const normalized = item.toLowerCase();
    return project.url.toLowerCase() === normalized || project.fullName.toLowerCase() === normalized;
  });

  const featuredBoost = featuredIndex >= 0 ? 1_000_000 - featuredIndex * 1000 : 0;
  const starsBoost = Number(project.stars || 0) * 10_000;
  const forksBoost = Number(project.forks || 0) * 1_000;
  const updatedBoost = Math.floor(new Date(project.updatedAt || 0).getTime() / 86_400_000);
  return featuredBoost + starsBoost + forksBoost + updatedBoost;
}

export function buildPortfolio(config, github, gitlab) {
  const allProjects = [...github.repositories, ...gitlab.repositories];
  const featured = config.portfolio.featuredRepositories ?? [];
  const projects = allProjects
    .sort((a, b) => projectScore(b, featured) - projectScore(a, featured))
    .slice(0, config.portfolio.maxFeaturedProjects ?? 8);

  const activity = [...github.activity, ...gitlab.activity]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, config.portfolio.maxRecentActivities ?? 10);

  const languages = aggregateLanguages(
    allProjects,
    config.portfolio.maxLanguages ?? 10,
  );

  const githubCommitTotal = Number(
    github.stats.indexedPublicCommits || github.contributions?.totalCommitContributions || 0,
  );
  const gitlabCommitTotal = Number(
    gitlab.stats.repositoryCommits || gitlab.stats.recentPushCommits || 0,
  );

  return {
    generatedAt: new Date().toISOString(),
    profile: config.profile,
    totals: {
      publicProjects: github.stats.publicRepositories + gitlab.stats.publicRepositories,
      stars: github.stats.stars + gitlab.stats.stars,
      forks: github.stats.forks + gitlab.stats.forks,
      publicCommits: githubCommitTotal + gitlabCommitTotal,
      recentActivities: activity.length,
      followers: Number(github.user?.followers || 0),
    },
    languages,
    projects,
    allProjects: allProjects.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)),
    activity,
    contributions: {
      github: github.contributions,
      gitlabRecentPushCommits: gitlab.stats.recentPushCommits,
    },
    platformStats: {
      github: github.stats,
      gitlab: gitlab.stats,
    },
    sources: {
      github: { available: github.available, error: github.error, user: github.user },
      gitlab: { available: gitlab.available, error: gitlab.error, user: gitlab.user },
    },
  };
}
