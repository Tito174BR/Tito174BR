const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function requestJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 25_000,
    retries = 3,
    allow404 = false,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': 'Tito174BR-portfolio-profile',
          ...headers,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (allow404 && response.status === 404) {
        return { data: null, headers: response.headers, status: response.status };
      }

      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`HTTP ${response.status} em ${url}: ${text.slice(0, 300)}`);
        error.status = response.status;

        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          const retryAfter = Number(response.headers.get('retry-after') || 0);
          await sleep(retryAfter > 0 ? retryAfter * 1000 : 750 * 2 ** attempt);
          lastError = error;
          continue;
        }

        throw error;
      }

      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      return { data, headers: response.headers, status: response.status };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt < retries && (error.name === 'AbortError' || error.cause?.code)) {
        await sleep(750 * 2 ** attempt);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function encodePath(value) {
  return encodeURIComponent(String(value));
}
