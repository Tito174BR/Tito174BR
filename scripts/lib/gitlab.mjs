import { mapLimit, requestJson } from './http.mjs';

function apiBase(baseUrl) {
  return `${baseUrl.replace(/\/$/, '')}/api/v4`;
}

function headers(token) {
  return token ? { 'PRIVATE-TOKEN': token } : {};
}

function normalizeActivity(event) {
  const projectPath = event.project_id ? `project/${event.project_id}` : null;
  const targetTitle = event.target_title || event.push_data?.ref || 'projeto';
  const base = {
    platform: 'gitlab',
    type: event.action_name || event.target_type || 'activity',
    repository: event.project_id ? `Projeto #${event.project_id}` : null,
    url: event.target_url || null,
    createdAt: event.created_at,
    projectPath,
  };

  if (event.action_name === 'pushed to') {
    const count = Number(event.push_data?.commit_count ?? 0);
    return {
      ...base,
      action: `Enviou ${count} commit(s) para ${event.push_data?.ref ?? targetTitle}`,
      count,
    };
  }

  return {
    ...base,
    action: `${event.action_name || 'Atualizou'} ${targetTitle}`,
    count: 1,
  };
}

export async function collectGitLab(sourceConfig, portfolioConfig, token) {
  const baseUrl = sourceConfig.baseUrl || 'https://gitlab.com';
  const api = apiBase(baseUrl);
  const username = sourceConfig.username;

  try {
    const { data: users } = await requestJson(
      `${api}/users?username=${encodeURIComponent(username)}`,
      { headers: headers(token) },
    );

    const user = users.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user) throw new Error(`Usuário ${username} não encontrado no GitLab.`);

    const [{ data: projectsRaw }, { data: eventsRaw }] = await Promise.all([
      requestJson(
        `${api}/users/${user.id}/projects?per_page=100&order_by=last_activity_at&sort=desc`,
        { headers: headers(token) },
      ),
      requestJson(`${api}/users/${user.id}/events?per_page=100&sort=desc`, {
        headers: headers(token),
      }),
    ]);

    const excluded = new Set(
      (portfolioConfig.excludedRepositories ?? []).map((name) => name.toLowerCase()),
    );

    const projectsFiltered = projectsRaw.filter((project) => {
      if (project.visibility !== 'public') return false;
      if (portfolioConfig.excludeArchived && project.archived) return false;
      return !excluded.has(project.path.toLowerCase());
    });

    const enriched = await mapLimit(projectsFiltered.slice(0, 30), 5, async (project) => {
      const encodedId = encodeURIComponent(project.id);
      let languages = {};
      let commitCount = 0;

      try {
        const result = await requestJson(`${api}/projects/${encodedId}/languages`, {
          headers: headers(token),
        });
        languages = result.data ?? {};
      } catch {
        languages = {};
      }

      try {
        const result = await requestJson(
          `${api}/projects/${encodedId}/repository/commits?per_page=1&all=true`,
          { headers: headers(token), allow404: true },
        );
        commitCount = Number(result.headers.get('x-total') || (result.data?.length ?? 0));
      } catch {
        commitCount = 0;
      }

      return { languages, commitCount };
    });

    const repositories = projectsFiltered.map((project, index) => {
      const extra = enriched[index] ?? { languages: {}, commitCount: 0 };
      const mainLanguage = Object.entries(extra.languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      return {
        platform: 'gitlab',
        name: project.name,
        fullName: project.path_with_namespace,
        description: project.description,
        url: project.web_url,
        homepage: null,
        language: mainLanguage,
        languages: extra.languages,
        stars: project.star_count,
        forks: project.forks_count,
        openIssues: project.open_issues_count ?? 0,
        updatedAt: project.last_activity_at,
        createdAt: project.created_at,
        topics: project.topics ?? project.tag_list ?? [],
        archived: project.archived ?? false,
        fork: Boolean(project.forked_from_project),
        repositoryCommitCount: extra.commitCount,
      };
    });

    const activity = eventsRaw.map(normalizeActivity).filter(Boolean);
    const recentPushCommits = activity
      .filter((item) => item.type === 'pushed to')
      .reduce((sum, item) => sum + item.count, 0);

    return {
      available: true,
      error: null,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatar_url,
        profileUrl: user.web_url,
      },
      repositories,
      activity,
      stats: {
        publicRepositories: repositories.length,
        stars: repositories.reduce((sum, repo) => sum + repo.stars, 0),
        forks: repositories.reduce((sum, repo) => sum + repo.forks, 0),
        recentPushCommits,
        repositoryCommits: repositories.reduce(
          (sum, repo) => sum + Number(repo.repositoryCommitCount || 0),
          0,
        ),
      },
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
        repositoryCommits: 0,
      },
    };
  }
}
