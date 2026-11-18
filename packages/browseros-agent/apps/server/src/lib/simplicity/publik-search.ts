import type { ConfigModelProvider } from './config/types';

/* The publik search line: POST <base>/search with the install's pk_ key,
   $0.01 a search, every error "Nothing was charged". Used only as the
   fallback when the local SearXNG gives no usable result and the turn's
   own model runs on publik (F-088). */

export type PublikSearchAccess = { baseURL: string; apiKey: string };

export type PublikSearchHit = { title: string; url: string; content: string };

export type PublikSearchOutcome =
  | { ok: true; hits: PublikSearchHit[]; chargeMicros: number }
  | { ok: false; reason: string };

/* Same name the extension writes (apps/app/lib/publik/provider-sync.ts). */
const PUBLIK_PROVIDER_NAME = 'publik API';
const MAX_QUERY_CHARS = 400;
const RESULT_COUNT = 10;
const TIMEOUT_MS = 20_000;

const STATUS_REASON: Record<number, string> = {
  400: 'the search request was not accepted',
  401: 'the publik key was not accepted',
  402: 'not enough publik balance',
  403: 'the publik key was not accepted',
  429: 'publik search is busy or the daily limit is reached',
  502: 'the search supplier gave an error',
  503: 'publik search is busy',
  504: 'publik search timed out',
};

const isPublikHost = (baseURL: unknown): boolean => {
  if (typeof baseURL !== 'string') return false;
  try {
    const host = new URL(baseURL).hostname.toLowerCase();
    return host === 'publikhq.com' || host.endsWith('.publikhq.com');
  } catch {
    return false;
  }
};

export const publikSearchAccess = (
  provider: Pick<ConfigModelProvider, 'type' | 'name' | 'config'> | undefined,
): PublikSearchAccess | undefined => {
  if (!provider || provider.type !== 'openai') return undefined;
  const { baseURL, apiKey } = provider.config ?? {};
  if (!isPublikHost(baseURL) && provider.name !== PUBLIK_PROVIDER_NAME)
    return undefined;
  if (typeof baseURL !== 'string' || !baseURL.trim()) return undefined;
  if (typeof apiKey !== 'string' || !apiKey.trim()) return undefined;
  return { baseURL: baseURL.trim().replace(/\/+$/, ''), apiKey: apiKey.trim() };
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const readHits = (body: unknown): PublikSearchHit[] => {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const hits: PublikSearchHit[] = [];
  for (const r of results) {
    const url = text(r?.url);
    if (!url) continue;
    const title = text(r?.title) || url;
    hits.push({ title, url, content: text(r?.snippet) || title });
  }
  return hits;
};

const readCharge = (res: Response, body: unknown): number => {
  const header = res.headers.get('x-publik-charge-micros');
  const fromHeader = header === null ? Number.NaN : Number(header);
  if (Number.isFinite(fromHeader) && fromHeader >= 0) return fromHeader;
  const fromBody = Number((body as { charge_micros?: unknown })?.charge_micros);
  return Number.isFinite(fromBody) && fromBody >= 0 ? fromBody : 0;
};

/* Never logs or returns the key. */
export const searchPublik = async (
  access: PublikSearchAccess,
  query: string,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<PublikSearchOutcome> => {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await doFetch(`${access.baseURL}/search`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        q: query.trim().slice(0, MAX_QUERY_CHARS),
        count: RESULT_COUNT,
      }),
      signal,
    });
  } catch {
    return {
      ok: false,
      reason: timeout.aborted
        ? 'publik search did not answer in time'
        : 'publik search could not be reached',
    };
  }

  if (!res.ok) {
    const reason =
      STATUS_REASON[res.status] ?? 'publik search gave an error';
    return {
      ok: false,
      reason: `${reason} (HTTP ${res.status}). Nothing was charged`,
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: 'publik search sent an answer Astro cannot read' };
  }

  return { ok: true, hits: readHits(body), chargeMicros: readCharge(res, body) };
};
