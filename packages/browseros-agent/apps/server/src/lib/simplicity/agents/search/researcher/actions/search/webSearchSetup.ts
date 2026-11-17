import {
  getRunningURL,
  getSearchSetupStatus,
  onSearchSetupStatus,
  type SearchSetupStatus,
  start,
} from '../../../../../../searxng/provision';
import { getSearxngURL } from '../../../../../config/serverRegistry';
import type { NoticeResearchBlock, ResearchBlock } from '../../../../../types';

type BlockSession = {
  updateBlock: (id: string, patch: any[]) => void;
};

const PROGRESS_THROTTLE_MS = 400;

/* The first web search of a fresh install downloads and installs SearXNG,
   which takes a minute or more. Before, the person saw nothing during that
   time, and a failed setup was only a log line: the answer arrived without
   sources and said nothing. This shows the setup progress as a research
   step and, on failure, an error step that says web search is not available.

   Returns false when web search is not available for this answer. */
export const ensureWebSearchReady = async (
  researchBlock: ResearchBlock,
  session: BlockSession,
  deps: {
    configuredURL?: () => string;
    runningURL?: () => string | null;
    startSearch?: () => Promise<string>;
    onStatus?: (cb: (s: SearchSetupStatus) => void) => () => void;
    currentStatus?: () => SearchSetupStatus;
    now?: () => number;
  } = {},
): Promise<boolean> => {
  const configuredURL = deps.configuredURL ?? getSearxngURL;
  const runningURL = deps.runningURL ?? getRunningURL;
  const startSearch = deps.startSearch ?? (() => start());
  const onStatus = deps.onStatus ?? onSearchSetupStatus;
  const currentStatus = deps.currentStatus ?? getSearchSetupStatus;
  const now = deps.now ?? Date.now;

  if (configuredURL() || runningURL()) return true;

  const id = crypto.randomUUID();
  let shown = false;
  let lastAt = 0;

  const show = (level: NoticeResearchBlock['level'], text: string) => {
    const step: NoticeResearchBlock = { id, type: 'notice', level, text };
    const steps = researchBlock.data.subSteps;
    const i = steps.findIndex((s) => s.id === id);
    if (i === -1) steps.push(step);
    else steps[i] = step;
    shown = true;
    session.updateBlock(researchBlock.id, [
      { op: 'replace', path: '/data/subSteps', value: steps },
    ]);
  };

  const onUpdate = (s: SearchSetupStatus) => {
    if (s.state !== 'setting_up') return;
    /* A plain restart of an installed search engine takes a few seconds;
       only the one-time setup earns a step. */
    if (s.step === 'starting' && !shown) return;
    if (now() - lastAt < PROGRESS_THROTTLE_MS && s.percent !== 0) return;
    lastAt = now();
    show('info', s.message);
  };
  const unsubscribe = onStatus(onUpdate);
  /* A question that arrives in the middle of a long step (pip runs for a
     minute) would otherwise see no change until the next step. */
  const atStart = currentStatus();
  if (atStart.state === 'setting_up' && atStart.step !== 'starting') {
    onUpdate(atStart);
  }

  try {
    await startSearch();
    if (shown) show('info', 'Web search is set up');
    return true;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Web search is not available.';
    const text = `${message.replace(/\.$/, '')}. This answer uses no web sources.`;
    /* Later searches of the same answer fail fast with the same error: one
       error step is enough. */
    const already = researchBlock.data.subSteps.some(
      (s) => s.type === 'notice' && s.level === 'error' && s.text === text,
    );
    if (!already) show('error', text);
    else if (shown) {
      const steps = researchBlock.data.subSteps;
      researchBlock.data.subSteps = steps.filter((s) => s.id !== id);
      session.updateBlock(researchBlock.id, [
        {
          op: 'replace',
          path: '/data/subSteps',
          value: researchBlock.data.subSteps,
        },
      ]);
    }
    return false;
  } finally {
    unsubscribe();
  }
};
