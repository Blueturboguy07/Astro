import z from 'zod/v4';
import BaseLLM from '../../models/base/llm';
import BaseEmbedding from '../../models/base/embedding';
import SessionManager from '../../session';
import { ChatTurnMessage, Chunk } from '../../types';
import { UsageMeter } from '../../pricing/meter';

export type SearchSources = 'web' | 'discussions' | 'academic';

export type SearchAgentConfig = {
  sources: SearchSources[];
  fileIds: string[];
  llm: BaseLLM<any>;
  /* Cheap model for pipeline internals (classification, query planning,
     refinement, extraction). Falls back to `llm` when absent. The
     user-selected model only ever writes the answer. */
  utilityLLM?: BaseLLM<any>;
  embedding: BaseEmbedding<any>;
  mode: 'speed' | 'balanced' | 'quality';
  /* From the composer's mode selector (the pill next to Sources). 'search' is
     the normal deterministic loop driven by the ROUNDS table below; keep
     this optional so every existing caller (and every non-deep-research
     test) that never set it keeps behaving exactly as before. 'council'
     (SPEC 2) never reaches Researcher/the writer prompt as itself — the chat
     route dispatches it to CouncilAgent instead of SearchAgent, and
     CouncilAgent always researches+writes in plain 'search' shape (deep
     research and council are mutually exclusive composer picks). It's kept
     in this union purely so `body.searchMode` (now three-way) assigns onto
     CouncilAgentConfig's inherited field without a cast. */
  searchMode?: 'search' | 'deepResearch' | 'council';
  systemInstructions: string;
  /* User's Writing toggle: never search, regardless of what any model
     thinks. Strictly wins over every backstop. */
  writingMode?: boolean;
  /* From the Thinking toggle; set only when the selected model reasons. */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  /* Fires when the client disconnects or hits stop. */
  signal?: AbortSignal;
  /* Incognito (privacy positioning): when true, the turn must never touch
     the chats/messages tables — searchAsync (and the chat route's own
     ensureChatExists/error-path writes) skip every db read/insert/update
     for it. The stream itself is unaffected: blocks still flow through
     SessionManager, only the persistence side-effects are skipped. */
  incognito?: boolean;
  /* Aggregates every LLM call in the turn (classifier + query planner +
     refiner + writer, and — later — council members/chair) into one
     end-of-turn cost summary. Optional so every existing caller/test that
     never set it keeps behaving exactly as before. */
  usageMeter?: UsageMeter;
};

export type SearchAgentInput = {
  chatHistory: ChatTurnMessage[];
  followUp: string;
  config: SearchAgentConfig;
  chatId: string;
  messageId: string;
};

/* Model Council (SPEC 2). One resolved, already-loaded member: the writer
   fans out to up to 3 of these in parallel over one shared search context. */
export type CouncilMemberSpec = {
  providerId: string;
  key: string;
  providerType: string;
  /* Catalog row name (e.g. "GPT-5.1") — used for the usage meter's
     "Council: <name>" label, the council block's cards, and its react key. */
  name: string;
  llm: BaseLLM<any>;
};

/* config.llm doubles as the chair model (the "Best-resolved" pick by
   default) — it already writes the turn's main answer via streamText exactly
   like SearchAgent's writer, so no separate chair field is needed on top of
   SearchAgentConfig. These extra fields just carry the chair's identity,
   which a BaseLLM instance doesn't otherwise expose, for labels/logos/the
   pre-run cost estimate. */
export type CouncilAgentConfig = SearchAgentConfig & {
  members: CouncilMemberSpec[];
  chairName: string;
  chairProviderId: string;
  chairProviderType: string;
  chairKey: string;
};

export type CouncilAgentInput = {
  chatHistory: ChatTurnMessage[];
  followUp: string;
  config: CouncilAgentConfig;
  chatId: string;
  messageId: string;
};

export type WidgetInput = {
  chatHistory: ChatTurnMessage[];
  followUp: string;
  classification: ClassifierOutput;
  llm: BaseLLM<any>;
};

export type Widget = {
  type: string;
  shouldExecute: (classification: ClassifierOutput) => boolean;
  execute: (input: WidgetInput) => Promise<WidgetOutput | void>;
};

export type WidgetOutput = {
  type: string;
  llmContext: string;
  data: any;
};

export type ClassifierInput = {
  llm: BaseLLM<any>;
  enabledSources: SearchSources[];
  query: string;
  chatHistory: ChatTurnMessage[];
};

export type ClassifierOutput = {
  classification: {
    skipSearch: boolean;
    personalSearch: boolean;
    academicSearch: boolean;
    discussionSearch: boolean;
    showWeatherWidget: boolean;
    showStockWidget: boolean;
    showCalculationWidget: boolean;
  };
  standaloneFollowUp: string;
};

export type AdditionalConfig = {
  llm: BaseLLM<any>;
  embedding: BaseEmbedding<any>;
  session: SessionManager;
};

export type ResearcherInput = {
  chatHistory: ChatTurnMessage[];
  followUp: string;
  classification: ClassifierOutput;
  config: SearchAgentConfig;
};

export type ResearcherOutput = {
  findings: ActionOutput[];
  searchFindings: Chunk[];
};

export type SearchActionOutput = {
  type: 'search_results';
  results: Chunk[];
};

export type DoneActionOutput = {
  type: 'done';
};

export type ReasoningResearchAction = {
  type: 'reasoning';
  reasoning: string;
};

export type ActionOutput =
  | SearchActionOutput
  | DoneActionOutput
  | ReasoningResearchAction;

export interface ResearchAction<
  TSchema extends z.ZodObject<any> = z.ZodObject<any>,
> {
  name: string;
  schema: z.ZodObject<any>;
  getToolDescription: (config: { mode: SearchAgentConfig['mode'] }) => string;
  getDescription: (config: { mode: SearchAgentConfig['mode'] }) => string;
  enabled: (config: {
    classification: ClassifierOutput;
    fileIds: string[];
    mode: SearchAgentConfig['mode'];
    sources: SearchSources[];
  }) => boolean;
  execute: (
    params: z.infer<TSchema>,
    additionalConfig: AdditionalConfig & {
      researchBlockId: string;
      fileIds: string[];
      mode: SearchAgentConfig['mode'];
    },
  ) => Promise<ActionOutput>;
}
