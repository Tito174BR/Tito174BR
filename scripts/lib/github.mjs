import { mapLimit, requestJson } from './http.mjs';

const API = 'https://api.github.com';

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchAllRepos(username, token) {
  const repos = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data } = await requestJson(
      `${API}/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=updated&type=owner`,
      { headers: headers(token) },
    );
    repos.push(...data);
    if (data.length < 100) break;
  }
  return repos;
}

async function fetchContributionCollection(username, token) {
  if (!token) return null;

  const query = `
    query ProfileContributions($login: String!) {
      user(login: $login) {
        contributionsCollection {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          totalRepositoryContributions
          restrictedContributionsCount
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                color
              }
            }
          }
        }
      }
    }
  `;

  const { data } = await requestJson(`${API}/graphql`, {
    method: 'POST',
    headers: {
      ...headers(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  if (data.errors?.length) {
    throw new Error(`GitHub GraphQL: ${data.errors.map((item) => item.message).join('; ')}`);
  }

  return data.data?.user?.contributionsCollection ?? null;
}

function normalizeActivity(event) {
  const repository = event.repo?.name;
  const base = {
    platform: 'github',
    type: event.type,
    repository,
    url: repository ? `https://github.com/${repository}` : 'https://github.com',
    createdAt: event.created_at,
  };

  switch (event.type) {
    case 'PushEvent':
      return {
        ...base,
        action: `Enviou ${event.payload?.size ?? event.payload?.commits?.length ?? 0} commit(s)`,
        count: event.payload?.size ?? event.payload?.commits?.length ?? 0,
      };
    case 'PullRequestEvent':
      return {
        ...base,
        action: `${event.payload?.action ?? 'Atualizou'} um pull request`,
        url: event.payload?.pull_request?.html_url ?? base.url,
        count: 1,
      };
    case 'IssuesEvent':
      return {
        ...base,
        action: `${event.payload?.action ?? 'Atualizou'} uma issue`,
        url: event.payload?.issue?.html_url ?? base.url,
        count: 1,
      };
    case 'ReleaseEvent':
      return {
        ...base,
        action: `Publicou a release ${event.payload?.release?.tag_name ?? ''}`.trim(),
        url: event.payload?.release?.html_url ?? base.url,
        count: 1,
      };
    case 'CreateEvent':
      return {
        ...base,
        action: `Criou ${event.payload?.ref_type ?? 'um recurso'}${event.payload?.ref ? ` ${event.payload.ref}` : ''}`,
        count: 1,
      };
    default:
      return null;
  }
}

export async function collectGitHub(sourceConfig, portfolioConfig, token) {
  const username = sourceConfig.username;

  try {
    const [{ data: user }, reposRaw, { data: eventsRaw }] = await Promise.all([
      requestJson(`${API}/users/${encodeURIComponent(username)}`, { headers: headers(token) }),
      fetchAllRepos(username, token),
      requestJson(`${API}/users/${encodeURIComponent(username)}/events/public?per_page=100`, {
        headers: headers(token),
      }),
    ]);

    const excluded = new Set(
      (portfolioConfig.excludedRepositories ?? []).map((name) => name.toLowerCase()),
    );

    const reposFiltered = reposRaw.filter((repo) => {
      if (portfolioConfig.excludeForks && repo.fork) return false;
      if (portfolioConfig.excludeArchived && repo.archived) return false;
      return !excluded.has(repo.name.toLowerCase());
    });

    const languageTargets = reposFiltered.slice(0, 30);
    const languageResults = await mapLimit(languageTargets, 5, async (repo) => {
      try {
        const { data } = await requestJson(repo.languages_url, { headers: headers(token) });
        return data;
      } catch {
        return {};
      }
    });

    const repositories = reposFiltered.map((repo, index) => ({
      platform: 'github',
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      homepage: repo.homepage || null,
      language: repo.language,
      languages: languageResults[index] ?? {},
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      updatedAt: repo.pushed_at || repo.updated_at,
      createdAt: repo.created_at,
      topics: repo.topics ?? [],
      archived: repo.archived,
      fork: repo.fork,
    }));

    const activity = eventsRaw.map(normalizeActivity).filter(Boolean);
    const pushCommits = activity
      .filter((item) => item.type === 'PushEvent')
      .reduce((sum, item) => sum + item.count, 0);

    let contributions = null;
    try {
      contributions = await fetchContributionCollection(username, token);
    } catch (error) {
      console.warn(`Aviso: calendário do GitHub indisponível: ${error.message}`);
    }

    let indexedCommitCount = null;
    try {
      const { data } = await requestJson(
        `${API}/search/commits?q=author:${encodeURIComponent(username)}&per_page=1`,
        { headers: headers(token) },
      );
      indexedCommitCount = data.total_count;
    } catch (error) {
      console.warn(`Aviso: busca de commits do GitHub indisponível: ${error.message}`);
    }

    return {
      available: true,
      error: null,
      user: {
        username: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
        profileUrl: user.html_url,
        bio: user.bio,
        company: user.company,
        location: user.location,
        blog: user.blog,
        followers: user.followers,
        following: user.following,
        publicRepos: user.public_repos,
        createdAt: user.created_at,
      },
      repositories,
      activity,
      stats: {
        publicRepositories: repositories.length,
        stars: repositories.reduce((sum, repo) => sum + repo.stars, 0),
        forks: repositories.reduce((sum, repo) => sum + repo.forks, 0),
        recentPushCommits: pushCommits,
        indexedPublicCommits:
          indexedCommitCount ?? contributions?.totalCommitContributions ?? pushCommits,
      },
      contributions,
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
      user: null,
      repositories: [],
      activity: [],
      stats: {
        publicRepositories: 0,
        stars: 0,
        forks: 0,
        recentPushCommits: 0,
        indexedPublicCommits: 0,
      },
      contributions: null,
    };
  }
}
