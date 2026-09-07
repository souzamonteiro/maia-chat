import { config } from './config.js';
import { SearchDisabledError, SearchUnavailableError, UpstreamResponseError } from './errors.js';

function text(value, limit) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function result(item) {
  const url = typeof item.url === 'string' ? item.url : '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  } catch {
    return null;
  }
  const title = text(item.title, 240);
  if (!title) return null;
  return {
    title,
    url,
    snippet: text(item.content, 1200),
    engine: text(item.engine, 80)
  };
}

export async function searchWeb(query, { language } = {}) {
  if (config.searchProvider !== 'searxng') throw new SearchDisabledError();

  const url = new URL('/search', config.searxngUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  if (language) url.searchParams.set('language', language);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.searchTimeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new UpstreamResponseError(response.status);
    const data = await response.json();
    return (data.results || []).map(result).filter(Boolean).slice(0, config.searchMaxResults);
  } catch (error) {
    if (error instanceof UpstreamResponseError) throw error;
    throw new SearchUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
