import type { SearxngSearchOptions } from '../../../searxng';
import type { UnresponsiveEngine } from '../../../search-report';
import type { SearchSources } from '../types';

/* SearXNG runs an engine that `engines=` names even when its settings mark
   it disabled, and skips a name it does not know, so these lists need no
   settings change. All are keyless. */

/* arXiv alone answered every Academic question with CS and physics
   preprints: "health effects of intermittent fasting" got five unrelated
   arXiv papers (Astro 0.2.4 QA, F-065). OpenAlex, Semantic Scholar,
   Crossref and PubMed cover every field, medicine included. */
export const ACADEMIC_ENGINES = [
  'openalex',
  'semantic scholar',
  'crossref',
  'pubmed',
  'google scholar',
  'arxiv',
];

/* Reddit often refuses SearXNG ("Suspended: access denied"), and Social
   then came back empty with no word why (F-076). Hacker News and Lemmy
   are further keyless discussion sources. */
export const DISCUSSION_ENGINES = ['reddit', 'hackernews', 'lemmy posts'];

/* When the discussion engines give nothing, the same queries go to the
   general web engines limited to this site. */
export const DISCUSSION_SITE = 'reddit.com';

export type VerticalName = 'web' | 'academic' | 'discussions';

export type Vertical = {
  name: VerticalName;
  searchConfig?: SearxngSearchOptions;
};

/* Web runs whenever it is on. Academic and Social run when the classifier
   asks for them, and always when Web is off: then the person chose that
   source alone, and a classifier "no" fell back to plain web search
   without a word. */
export const pickVerticals = (
  sources: SearchSources[],
  wants: { academicSearch: boolean; discussionSearch: boolean },
): Vertical[] => {
  const webOn = sources.includes('web');
  const out: Vertical[] = [];
  if (webOn) out.push({ name: 'web' });
  if (sources.includes('academic') && (wants.academicSearch || !webOn)) {
    out.push({ name: 'academic', searchConfig: { engines: ACADEMIC_ENGINES } });
  }
  if (sources.includes('discussions') && (wants.discussionSearch || !webOn)) {
    out.push({
      name: 'discussions',
      searchConfig: { engines: DISCUSSION_ENGINES },
    });
  }
  if (out.length === 0) out.push({ name: 'web' });
  return out;
};

/** True when `url` is on `site` or one of its subdomains. */
export const onSite = (url: string, site: string): boolean => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === site || host.endsWith(`.${site}`);
  } catch {
    return false;
  }
};

const ENGINE_NAMES: Record<string, string> = {
  reddit: 'Reddit',
  hackernews: 'Hacker News',
  'lemmy posts': 'Lemmy',
};

const reasons = (engines: string[], failed: UnresponsiveEngine[]) => {
  const list = failed
    .filter((f) => engines.includes(f.engine))
    .slice(0, 3)
    .map((f) => `${f.engine}: ${f.reason}`);
  return list.length > 0 ? ` (${list.join('; ')})` : '';
};

/* The line shown above the answer when a source the person chose gave
   nothing. `siteHits`: what the reddit.com search on the web engines
   found (Social only). */
export const emptySourceNotice = (
  vertical: 'academic' | 'discussions',
  failed: UnresponsiveEngine[],
  siteHits?: number,
): string => {
  if (vertical === 'academic') {
    return `Academic: the paper search engines gave no results${reasons(
      ACADEMIC_ENGINES,
      failed,
    )}. This answer has no academic sources.`;
  }
  const names = DISCUSSION_ENGINES.map((e) => ENGINE_NAMES[e] ?? e);
  const head = `Social: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} gave no results${reasons(
    DISCUSSION_ENGINES,
    failed,
  )}.`;
  if (siteHits && siteHits > 0) {
    return `${head} Astro searched ${DISCUSSION_SITE} with the web engines instead.`;
  }
  return `${head} The web engines found no ${DISCUSSION_SITE} pages either. This answer has no social sources.`;
};
