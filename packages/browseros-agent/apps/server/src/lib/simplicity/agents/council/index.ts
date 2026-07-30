import SessionManager from '../../session';
import { classify } from '../search/classifier';
import Researcher from '../search/researcher';
import { CONTEXT_TOKEN_BUDGET, budgetChunks } from '../search/contextBudget';
import { WidgetExecutor } from '../search/widgets';
import { getWriterPrompt } from '../../prompts/search/writer';
import { getChairPrompt } from './prompts';
import { estimateCouncilCost } from './select';
import db from '../../db';
import { messages } from '../../db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { CouncilBlock, CouncilMember, TextBlock } from '../../types';
import {
  CouncilAgentConfig,
  CouncilAgentInput,
  CouncilMemberSpec,
  ResearcherOutput,
} from '../search/types';

/* Model Council orchestrator (SPEC 2). Modeled on SearchAgent.searchAsync
 * (src/lib/agents/search/index.ts) — same DB row lifecycle, classifier call,
 * widget promise and researchComplete emit — then diverges from it (and from
 * Perplexity) in two deliberate ways, noted inline where they happen:
 *
 *   1. ONE shared retrieval. Perplexity fans the *prompt* to N models, each
 *      effectively running its own pipeline behind a flat fee. Cost here is
 *      real per call, so the deterministic Researcher runs exactly ONCE and
 *      every member below writes from that identical source context —
 *      members differ only by generation model, which is what makes the
 *      resulting comparison apples-to-apples and keeps cost at N writer
 *      calls instead of N full pipelines. Architecturally this is closer to
 *      OpenRouter Fusion's "judge compares, doesn't merge" shape than to
 *      Perplexity's opaque chair.
 *   2. A user-visible, swappable chair (default: "Best-resolved"), not a
 *      fixed invisible judge.
 *
 * The chair's synthesized verdict streams into a normal 'text' block (via
 * config.llm, exactly like SearchAgent's writer) rather than into the
 * council block itself — so the existing citation/AnswerTabs rendering
 * pipeline applies to it for free and this module never needs to touch
 * either.
 */
class CouncilAgent {
  async run(session: SessionManager, input: CouncilAgentInput) {
    /* Incognito must hold for council turns too — same guard as
       SearchAgent.searchAsync, nothing about this thread touches the db. */
    const exists = input.config.incognito
      ? undefined
      : await db.query.messages.findFirst({
          where: and(
            eq(messages.chatId, input.chatId),
            eq(messages.messageId, input.messageId),
          ),
        });

    if (input.config.incognito) {
      /* skip persistence entirely */
    } else if (!exists) {
      await db.insert(messages).values({
        chatId: input.chatId,
        messageId: input.messageId,
        backendId: session.id,
        query: input.followUp,
        createdAt: new Date().toISOString(),
        status: 'answering',
        responseBlocks: [],
      });
    } else {
      await db
        .delete(messages)
        .where(
          and(eq(messages.chatId, input.chatId), gt(messages.id, exists.id)),
        )
        .execute();
      await db
        .update(messages)
        .set({
          status: 'answering',
          backendId: session.id,
          responseBlocks: [],
        })
        .where(
          and(
            eq(messages.chatId, input.chatId),
            eq(messages.messageId, input.messageId),
          ),
        )
        .execute();
    }

    const classification = await classify({
      chatHistory: input.chatHistory,
      enabledSources: input.config.sources,
      query: input.followUp,
      llm: input.config.utilityLLM ?? input.config.llm,
    });

    const widgetPromise = WidgetExecutor.executeAll({
      classification,
      chatHistory: input.chatHistory,
      followUp: input.followUp,
      llm: input.config.llm,
    }).then((widgetOutputs) => {
      widgetOutputs.forEach((o) => {
        session.emitBlock({
          id: crypto.randomUUID(),
          type: 'widget',
          data: {
            widgetType: o.type,
            params: o.data,
          },
        });
      });
      return widgetOutputs;
    });

    let searchPromise: Promise<ResearcherOutput> | null = null;

    const skipSearch =
      input.config.writingMode || classification.classification.skipSearch;

    if (!skipSearch) {
      const researcher = new Researcher();
      searchPromise = researcher.research(session, {
        chatHistory: input.chatHistory,
        followUp: input.followUp,
        classification,
        config: input.config,
      });
    }

    const [widgetOutputs, searchResults] = await Promise.all([
      widgetPromise,
      searchPromise,
    ]);

    session.emit('data', { type: 'researchComplete' });

    let finalContext =
      '<Query to be answered without searching; Search not made>';

    if (searchResults) {
      /* Same bound as SearchAgent's writer: every member (and the chair,
         which additionally carries all member answers) must fit comfortably
         in context. */
      finalContext = budgetChunks(
        searchResults.searchFindings,
        CONTEXT_TOKEN_BUDGET.search,
      )
        .map(
          (f, index) =>
            `<result index=${index + 1} title=${f.metadata.title}>${f.content}</result>`,
        )
        .join('\n');
    }

    const widgetContext = widgetOutputs
      .map((o) => `<result>${o.llmContext}</result>`)
      .join('\n-------------\n');

    /* SHARED SEARCH CONTEXT — see the class-level comment, divergence #1.
       Every member below writes from this exact string; nothing per-member
       re-runs retrieval. */
    const finalContextWithWidgets = `<search_results note="These are the search results and assistant can cite these">\n${finalContext}\n</search_results>\n<widgets_result noteForAssistant="Its output is already showed to the user, assistant can use this information to answer the query but do not CITE this as a souce">\n${widgetContext}\n</widgets_result>`;

    /* Council never runs the Deep Research report shape — 'search' is
       passed explicitly (not input.config.searchMode) since the two modes
       are mutually exclusive composer picks. */
    const writerPrompt = getWriterPrompt(
      finalContextWithWidgets,
      input.config.systemInstructions,
      input.config.mode,
      'search',
    );

    const writerMessages = [
      { role: 'system' as const, content: writerPrompt },
      ...input.chatHistory,
      { role: 'user' as const, content: input.followUp },
    ];

    const councilBlockId = crypto.randomUUID();

    const initialMembers: CouncilMember[] = input.config.members.map((m) => ({
      rowId: `${m.providerId}:${m.key}`,
      name: m.name,
      providerId: m.providerId,
      providerType: m.providerType,
      model: m.key,
      answer: '',
      status: 'pending',
    }));

    /* Pre-run cost hint (SPEC 2 §7) — a rough estimate the UI can show
       immediately, ahead of the shared UsageMeter having any real usage to
       report. Estimated from the ACTUAL shared prompt's token count, so it
       reflects this turn's real context size, not a flat guess. */
    const costEstimate = estimateCouncilCost(
      writerPrompt,
      input.config.members.map((m) => ({
        rowId: `${m.providerId}:${m.key}`,
        providerType: m.providerType,
        key: m.key,
      })),
      { providerType: input.config.chairProviderType, key: input.config.chairKey },
    );

    session.emitBlock({
      id: councilBlockId,
      type: 'council',
      data: {
        members: initialMembers,
        chairName: input.config.chairName,
        chairProviderType: input.config.chairProviderType,
        chairAnswer: '',
        chairStatus: 'pending',
        /* Present from the start (not omitted) even though it's optional in
           the type: rfc6902's `replace` op is a no-op (never throws, just
           silently skips) whenever the CURRENT value at that path is
           undefined — so a key that starts out genuinely absent can never
           be patched in later. An empty string is falsy, so the renderer's
           truthy check on it behaves exactly like "absent". */
        chairSkippedReason: '',
        convergence: [],
        divergence: [],
        unique: [],
        costEstimate,
      },
    });

    const getCouncilBlock = () =>
      session.getBlock(councilBlockId) as CouncilBlock | null;

    const patchMember = (index: number, patch: Partial<CouncilMember>) => {
      const block = getCouncilBlock();
      if (!block) return;
      const member = { ...block.data.members[index], ...patch };
      session.updateBlock(councilBlockId, [
        { op: 'replace', path: `/data/members/${index}`, value: member },
      ]);
    };

    const patchCouncil = (patch: Record<string, unknown>) => {
      Object.entries(patch).forEach(([key, value]) => {
        session.updateBlock(councilBlockId, [
          { op: 'replace', path: `/data/${key}`, value },
        ]);
      });
    };

    /* Per-member isolation (SPEC 2 §4/§9): each member's whole pipeline is
       wrapped in try/catch so a throw here is recorded as that member's
       `status:'error'` and NEVER rejects — the council survives on >=1
       survivor. Promise.allSettled below is a second line of defense (e.g.
       against a bug that lets something throw past the inner catch) rather
       than the primary mechanism. */
    const runMember = async (member: CouncilMemberSpec, index: number) => {
      try {
        if (input.config.signal?.aborted) {
          patchMember(index, { status: 'cancelled' });
          return;
        }

        patchMember(index, { status: 'streaming' });

        let answer = '';
        const stream = member.llm.streamText({ messages: writerMessages });

        for await (const chunk of stream) {
          if (input.config.signal?.aborted) {
            patchMember(index, { status: 'cancelled', answer });
            return;
          }
          answer += chunk.contentChunk;
          patchMember(index, { answer });
        }

        patchMember(index, { status: 'done', answer });
      } catch (err: any) {
        patchMember(index, {
          status: 'error',
          error: err?.message ?? 'This model failed to answer.',
        });
      }
    };

    await Promise.allSettled(
      input.config.members.map((member, index) => runMember(member, index)),
    );

    const settled = getCouncilBlock()!;
    const successfulMembers = settled.data.members.filter(
      (m) => m.status === 'done' && m.answer.trim().length > 0,
    );

    let responseBlockId = '';

    const emitOrUpdateText = (text: string) => {
      if (!responseBlockId) {
        const block: TextBlock = {
          id: crypto.randomUUID(),
          type: 'text',
          data: text,
        };
        session.emitBlock(block);
        responseBlockId = block.id;
        return;
      }

      const block = session.getBlock(responseBlockId) as TextBlock | null;
      if (!block) return;
      block.data = text;
      session.updateBlock(block.id, [
        { op: 'replace', path: '/data', value: block.data },
      ]);
    };

    if (input.config.signal?.aborted) {
      patchCouncil({ chairStatus: 'skipped', chairSkippedReason: 'Cancelled.' });
    } else if (successfulMembers.length === 0) {
      /* All members failed — degrade like SearchAgent's own "no results"
         backstop: say so plainly instead of leaving a blank answer. */
      patchCouncil({
        chairStatus: 'skipped',
        chairSkippedReason: 'All council members failed to answer.',
      });
      emitOrUpdateText(
        'Hmm, every model in the council failed to answer this one. Try again, or switch to a single model.',
      );
    } else if (successfulMembers.length === 1) {
      /* Degrade to the single survivor's answer directly — no synthesis
         possible with only one voice (SPEC 2 §4/§9). */
      patchCouncil({
        chairStatus: 'skipped',
        chairSkippedReason:
          'Only one member answered successfully — showing its answer directly.',
      });
      emitOrUpdateText(successfulMembers[0].answer);
    } else {
      patchCouncil({ chairStatus: 'streaming' });

      try {
        if (input.config.signal?.aborted) {
          throw new Error('Cancelled.');
        }

        const chairPrompt = getChairPrompt(
          input.followUp,
          finalContextWithWidgets,
          input.config.systemInstructions,
          successfulMembers.map((m) => ({ name: m.name, answer: m.answer })),
        );

        const chairStream = input.config.llm.streamText({
          messages: [
            { role: 'system', content: chairPrompt },
            ...input.chatHistory,
            { role: 'user', content: input.followUp },
          ],
        });

        let chairAnswer = '';
        let chairAborted = false;

        for await (const chunk of chairStream) {
          if (input.config.signal?.aborted) {
            chairAborted = true;
            break;
          }
          chairAnswer += chunk.contentChunk;
          emitOrUpdateText(chairAnswer);
        }

        patchCouncil({
          chairStatus: chairAborted ? 'skipped' : 'done',
          chairAnswer,
          ...(chairAborted ? { chairSkippedReason: 'Cancelled.' } : {}),
        });
      } catch (err: any) {
        /* Chair failure is non-fatal (SPEC 2 §9): member answers/cards stay
           on screen either way, just without a synthesized verdict. */
        patchCouncil({
          chairStatus: 'error',
          chairSkippedReason:
            err?.message ?? 'The chair failed to synthesize a verdict.',
        });
      }
    }

    /* Read actual per-member cost+tokens back from the shared UsageMeter
       (SPEC 1) so the council cards match the turn's single usage
       breakdown — matched by providerId+model, the same key the meter
       groups by. Known limitation: if the chair happens to resolve to the
       exact same (providerId, model) as one of the members, the meter's
       grouping (by providerId+model, not by role) merges their usage under
       whichever label was recorded first; this only affects that display
       edge case, never the turn's total cost. */
    if (input.config.usageMeter) {
      const summary = input.config.usageMeter.summarize();

      const finalBlock = getCouncilBlock();
      finalBlock?.data.members.forEach((m, index) => {
        const entry = summary.breakdown.find(
          (e) => e.providerId === m.providerId && e.model === m.model,
        );
        if (entry) {
          patchMember(index, {
            cost: entry.cost,
            free: entry.free,
            inputTokens: entry.inputTokens,
            outputTokens: entry.outputTokens,
          });
        }
      });

      session.emitBlock({
        id: crypto.randomUUID(),
        type: 'usage',
        data: summary,
      });
    }

    session.emit('end', {});

    if (!input.config.incognito) {
      await db
        .update(messages)
        .set({
          status: input.config.signal?.aborted ? 'cancelled' : 'completed',
          responseBlocks: session.getAllBlocks(),
        })
        .where(
          and(
            eq(messages.chatId, input.chatId),
            eq(messages.messageId, input.messageId),
          ),
        )
        .execute();
    }
  }
}

export default CouncilAgent;
