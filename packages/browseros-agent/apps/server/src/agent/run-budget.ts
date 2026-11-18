/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Run budget of one interactive agent turn (Astro 0.2.4 QA, F-072).
 *
 * UC-42: the agent made 38 tool calls in 5 minutes on a site whose own API
 * answered HTTP 500, and never told the user. MAX_TURNS (100 steps) was the
 * only limit. This budget stops a turn after RUN_MAX_TOOL_CALLS tool calls,
 * or after RUN_NO_PROGRESS_MS without progress, and then lets the model write
 * one last step without tools: a short report. The stream transform puts a
 * fixed first line before that report ("Stopped after 40 actions.") and a
 * "Continue" line after it, so the wording does not depend on the model.
 *
 * UC-42 (0.0.114 retest): the booking page stayed on a loading spinner,
 * the agent clicked around other pages, every step looked new, and 34
 * calls took 7 minutes. The run now also stops when the same page state
 * (the same URL and the same page text) is read again after
 * RUN_SAME_PAGE_MS or RUN_SAME_PAGE_CALLS calls, or when a loading screen
 * on one URL is unchanged after RUN_LOADING_PAGE_MS (a reload or a revisit
 * counts).
 */

import { AGENT_LIMITS } from '@browseros/shared/constants/limits'
import type {
  StepResult,
  StopCondition,
  StreamTextTransform,
  TextStreamPart,
  ToolSet,
} from 'ai'

export type RunBudgetStopReason = 'actions' | 'no-progress' | 'same-page'

export interface SiteError {
  status: number
  url?: string
}

interface ToolOutcome {
  toolName: string
  input: unknown
  ok: boolean
  text: string
}

export interface RunBudgetOptions {
  /** The agent's system prompt; the report step adds its rule to it. */
  instructions: string
  maxToolCalls?: number
  noProgressMs?: number
  samePageMs?: number
  samePageCalls?: number
  loadingPageMs?: number
  now?: () => number
}

/* The same page state read again: why and for how long. */
interface SamePage {
  url: string
  by: 'loading' | 'time' | 'calls'
  ms: number
  calls: number
}

/* Defaults: conservative. 3 minutes or 15 calls on one unchanged page; a
   loading screen unchanged for 1 minute. */
export const RUN_SAME_PAGE_MS = 3 * 60_000
export const RUN_SAME_PAGE_CALLS = 15
export const RUN_LOADING_PAGE_MS = 60_000

/* Script and wait tools can run for minutes without moving the task (UC-42
   probed the site's API with 22 evaluate/run calls), so their results never
   count as progress. */
const NON_PROGRESS_TOOLS = new Set(['evaluate', 'run', 'wait', 'screenshot'])

const CONTINUE_MESSAGE = 'Continue'

export class RunBudget {
  private readonly instructions: string
  private readonly maxToolCalls: number
  private readonly noProgressMs: number
  private readonly samePageMs: number
  private readonly samePageCalls: number
  private readonly loadingPageMs: number
  private readonly now: () => number
  private pageFirstSeen = new Map<string, number>()
  private currentPage: { key: string; since: number; calls: number } | undefined
  private samePage: SamePage | undefined

  private assessedSteps = 0
  private toolCalls = 0
  private lastProgressAt = 0
  private seenOutputs = new Set<string>()
  private lastPageUrl: string | undefined
  private siteError: SiteError | undefined
  private reason: RunBudgetStopReason | undefined
  private actionsAtStop = 0
  private reportStep: number | undefined

  constructor(options: RunBudgetOptions) {
    this.instructions = options.instructions
    this.maxToolCalls = options.maxToolCalls ?? AGENT_LIMITS.RUN_MAX_TOOL_CALLS
    this.noProgressMs = options.noProgressMs ?? AGENT_LIMITS.RUN_NO_PROGRESS_MS
    this.samePageMs = options.samePageMs ?? RUN_SAME_PAGE_MS
    this.samePageCalls = options.samePageCalls ?? RUN_SAME_PAGE_CALLS
    this.loadingPageMs = options.loadingPageMs ?? RUN_LOADING_PAGE_MS
    this.now = options.now ?? Date.now
    this.lastProgressAt = this.now()
  }

  get toolCallLimit(): number {
    return this.maxToolCalls
  }

  get stopReason(): RunBudgetStopReason | undefined {
    return this.reason
  }

  /** Clears the counters; the first prepareStep of a turn calls it. */
  beginTurn(): void {
    this.assessedSteps = 0
    this.toolCalls = 0
    this.lastProgressAt = this.now()
    this.seenOutputs = new Set()
    this.lastPageUrl = undefined
    this.siteError = undefined
    this.pageFirstSeen = new Map()
    this.currentPage = undefined
    this.samePage = undefined
    this.reason = undefined
    this.actionsAtStop = 0
    this.reportStep = undefined
  }

  /**
   * Ends the loop only after the report step ran. When the budget is spent
   * the loop goes on for one step, which prepareStep makes tool-free.
   */
  readonly stopCondition: StopCondition<ToolSet> = ({ steps }) => {
    this.observe(steps)
    if (this.reportStep !== undefined) return steps.length > this.reportStep
    return false
  }

  /** Returns the step settings of the report step, else undefined. */
  prepareStep(
    steps: ReadonlyArray<StepResult<ToolSet>>,
  ): { toolChoice: 'none'; system: string } | undefined {
    if (steps.length === 0) {
      this.beginTurn()
      return undefined
    }
    this.observe(steps)
    if (!this.reason || this.reportStep !== undefined) return undefined
    this.reportStep = steps.length
    return {
      toolChoice: 'none',
      system: `${this.instructions}\n\n${this.reportInstruction()}`,
    }
  }

  /** The fixed first line of the report. */
  header(): string {
    const why =
      this.reason === 'same-page' && this.samePage
        ? `**Stopped: ${samePageSentence(this.samePage)}**`
        : this.reason === 'no-progress'
          ? `**Stopped: no progress for ${formatMinutes(this.noProgressMs)}.**`
          : `**Stopped after ${formatActions(this.actionsAtStop)}.**`
    return this.siteError ? `${why} ${siteErrorSentence(this.siteError)}` : why
  }

  readonly transform: StreamTextTransform<ToolSet> = () => {
    let stepIndex = -1
    let inReport = false
    let headerPending = false
    let sawToolCall = false
    let partId = 0
    const textPart = (
      controller: TransformStreamDefaultController<TextStreamPart<ToolSet>>,
      text: string,
    ) => {
      const id = `run-budget-${++partId}`
      controller.enqueue({ type: 'text-start', id })
      controller.enqueue({ type: 'text-delta', id, text })
      controller.enqueue({ type: 'text-end', id })
    }

    return new TransformStream<
      TextStreamPart<ToolSet>,
      TextStreamPart<ToolSet>
    >({
      transform: (part, controller) => {
        if (part.type === 'start-step') {
          stepIndex++
          inReport = this.reportStep === stepIndex
          headerPending = inReport
          sawToolCall = false
          controller.enqueue(part)
          return
        }
        if (inReport) {
          /* After any reasoning, before the first text or tool part. Some
             providers join text parts without a space, so each injected
             part carries its own blank line. */
          if (headerPending && HEADER_BEFORE.has(part.type)) {
            headerPending = false
            textPart(controller, `${this.header()}\n\n`)
          }
          if (part.type === 'tool-call') sawToolCall = true
          /* Text after a tool call in one step becomes [tool-call, text] in
             the stored history, which some providers refuse. */
          if (part.type === 'finish-step' && !sawToolCall) {
            textPart(controller, `\n\n${CONTINUE_LINE}`)
          }
        }
        controller.enqueue(part)
      },
    })
  }

  private reportInstruction(): string {
    const siteLine = this.siteError
      ? `\n- The site returned an error (HTTP ${this.siteError.status}${this.siteError.url ? ` at ${this.siteError.url}` : ''}). Say that the problem is on the site, not in the request.`
      : ''
    const pageLine =
      this.reason === 'same-page' && this.samePage?.by === 'loading'
        ? `\n- The page ${this.samePage.url} stays on a loading screen. Say that the site did not load, not that the request was wrong.`
        : ''
    const budget =
      this.reason === 'same-page' && this.samePage
        ? samePageSentence(this.samePage).replace(/\.$/, '')
        : this.reason === 'no-progress'
          ? `no progress for ${formatMinutes(this.noProgressMs)}`
          : formatActions(this.actionsAtStop)
    return `<run_budget>
This turn reached its run budget: ${budget}. Tools are off for this reply.
Write a short report for the user:
- What you did and what you found so far.
- What is still left to do.
- If what the user asked for is not on the page, say so plainly (for example: "The page has no h1 heading.").${siteLine}${pageLine}
The app shows the first line ("Stopped ...") and a "Continue" option itself. Do not repeat them, and do not apologize at length.
</run_budget>`
  }

  private observe(steps: ReadonlyArray<StepResult<ToolSet>>): void {
    for (; this.assessedSteps < steps.length; this.assessedSteps++) {
      const step = steps[this.assessedSteps]
      if (!step) continue
      this.toolCalls += step.toolCalls.length
      let progressed = false
      let stepError: SiteError | undefined
      for (const outcome of toolOutcomes(step)) {
        const pageUrl = pageUrlOf(outcome)
        if (pageUrl) this.lastPageUrl = pageUrl
        const error = detectSiteError(outcome.text, pageUrl ?? this.lastPageUrl)
        if (error) stepError = error
        else if (this.isProgress(outcome)) progressed = true
        const state = outcome.ok
          ? pageStateOf(outcome.toolName, outcome.text)
          : undefined
        if (state) this.notePageState(state)
      }
      if (progressed) this.lastProgressAt = this.now()
      /* An error the agent got past is no longer the reason it stopped. */
      if (stepError) this.siteError = stepError
      else if (progressed) this.siteError = undefined
    }
    if (!this.reason) this.reason = this.spentReason()
    if (this.reason && !this.actionsAtStop) this.actionsAtStop = this.toolCalls
  }

  private spentReason(): RunBudgetStopReason | undefined {
    if (this.toolCalls >= this.maxToolCalls) return 'actions'
    if (this.samePage) return 'same-page'
    if (this.now() - this.lastProgressAt >= this.noProgressMs)
      return 'no-progress'
    return undefined
  }

  /** Records one read of a page; sets samePage when the page is stuck. */
  private notePageState(state: PageState): void {
    if (this.samePage) return
    const now = this.now()
    const first = this.pageFirstSeen.get(state.key)
    if (first === undefined) this.pageFirstSeen.set(state.key, now)
    if (
      state.loading &&
      first !== undefined &&
      now - first >= this.loadingPageMs
    ) {
      this.samePage = {
        url: state.url,
        by: 'loading',
        ms: now - first,
        calls: 0,
      }
      return
    }
    const current = this.currentPage
    if (current?.key !== state.key) {
      this.currentPage = { key: state.key, since: now, calls: this.toolCalls }
      return
    }
    const ms = now - current.since
    const calls = this.toolCalls - current.calls
    if (ms >= this.samePageMs)
      this.samePage = { url: state.url, by: 'time', ms, calls }
    else if (calls >= this.samePageCalls)
      this.samePage = { url: state.url, by: 'calls', ms, calls }
  }

  /** A successful result of an observing or acting tool with new content. */
  private isProgress(outcome: ToolOutcome): boolean {
    if (!outcome.ok || NON_PROGRESS_TOOLS.has(outcome.toolName)) return false
    const key = `${outcome.toolName}:${Bun.hash(normalizeForCompare(outcome.text))}`
    if (this.seenOutputs.has(key)) return false
    this.seenOutputs.add(key)
    return true
  }
}

const HEADER_BEFORE = new Set<string>([
  'text-start',
  'tool-input-start',
  'tool-call',
  'tool-result',
  'tool-error',
  'file',
  'source',
  'finish-step',
])

export const CONTINUE_LINE = `Reply **${CONTINUE_MESSAGE}** to resume from here.`

function formatActions(count: number): string {
  return count === 1 ? '1 action' : `${count} actions`
}

function formatMinutes(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

function samePageSentence(page: SamePage): string {
  if (page.by === 'loading')
    return `the page stays on a loading screen (${page.url}).`
  if (page.by === 'calls')
    return `the page did not change after ${formatActions(page.calls)} (${page.url}).`
  return `the page did not change for ${formatMinutes(page.ms)} (${page.url}).`
}

/* Tools whose result is the whole page (a diff or a grep is a part). */
const PAGE_STATE_TOOLS = new Set(['snapshot', 'navigate', 'read'])
/* A loading screen: little text and a loading word or a busy role. */
const LOADING_TEXT = /\b(loading|please wait)\b|\bspinner\b|\bprogressbar\b/i
const LOADING_MAX_CHARS = 2000

interface PageState {
  url: string
  key: string
  loading: boolean
}

/** The page a tool result shows: its URL and a hash of its text. */
export function pageStateOf(
  toolName: string,
  text: string,
): PageState | undefined {
  if (!PAGE_STATE_TOOLS.has(toolName)) return undefined
  const start = WRAPPER_ORIGIN.exec(text)
  const url = start?.[1]
  if (!start || !url || !HTTP_URL.test(url)) return undefined
  const afterStart = text.indexOf('\n', start.index)
  if (afterStart < 0) return undefined
  const end = text.indexOf('[END_UNTRUSTED_PAGE_CONTENT', afterStart)
  const body = normalizeForCompare(
    text.slice(afterStart + 1, end < 0 ? undefined : end),
  )
  return {
    url,
    key: `${url} ${Bun.hash(body)}`,
    loading: body.length < LOADING_MAX_CHARS && LOADING_TEXT.test(body),
  }
}

function siteErrorSentence(error: SiteError): string {
  return error.url
    ? `The site returned an error (HTTP ${error.status} at ${error.url}).`
    : `The site returned an error (HTTP ${error.status}).`
}

/** Text of every tool result and tool error of one step. */
function toolOutcomes(step: StepResult<ToolSet>): ToolOutcome[] {
  const outcomes: ToolOutcome[] = []
  for (const part of step.content) {
    if (part.type === 'tool-result') {
      outcomes.push({
        toolName: part.toolName,
        input: part.input,
        ok: !isErrorOutput(part.output),
        text: outputText(part.output),
      })
    } else if (part.type === 'tool-error') {
      outcomes.push({
        toolName: part.toolName,
        input: part.input,
        ok: false,
        text: errorMessage(part.error),
      })
    }
  }
  return outcomes
}

/* A tool error from the AI SDK can fail `instanceof Error` (seen in tests). */
function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' ? message : String(error)
}

function isErrorOutput(output: unknown): boolean {
  return (
    !!output &&
    typeof output === 'object' &&
    (output as { isError?: unknown }).isError === true
  )
}

const OUTPUT_TEXT_MAX = 50_000

/** Browser tools give {content:[{type:'text'}]}, filesystem tools {text}. */
function outputText(output: unknown): string {
  if (typeof output === 'string') return output
  if (!output || typeof output !== 'object') return ''
  const items = Array.isArray(output)
    ? output
    : (output as { content?: unknown }).content
  if (Array.isArray(items)) {
    return items
      .map((item) =>
        item && typeof item === 'object' && 'text' in item
          ? String((item as { text: unknown }).text)
          : '',
      )
      .filter(Boolean)
      .join('\n')
  }
  const { text, value } = output as { text?: unknown; value?: unknown }
  if (typeof text === 'string') return text
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(output).slice(0, OUTPUT_TEXT_MAX)
  } catch {
    return ''
  }
}

/* wrapUntrusted adds a new nonce per call and output files get new names,
   so the same page would look new on every read. */
function normalizeForCompare(text: string): string {
  return text
    .replace(/nonce=[0-9a-f]+/g, 'nonce')
    .replace(/ \[ref=e\d+\]/g, '')
    .replace(/saved to: \S+/g, 'saved to:')
    .replace(/\s+/g, ' ')
    .trim()
}

const WRAPPER_ORIGIN = /\[UNTRUSTED_PAGE_CONTENT nonce=[0-9a-f]+ origin=(\S+)\]/
const WRAPPER_LINE = /^\[(?:END_)?UNTRUSTED_PAGE_CONTENT[^\n]*\n?/gm
const NAVIGATED_TO = /navigated \([a-z]+\) -> (\S+)/
const HTTP_URL = /^https?:\/\//i

function pageUrlOf(outcome: ToolOutcome): string | undefined {
  const fromText =
    outcome.text.match(NAVIGATED_TO)?.[1] ??
    outcome.text.match(WRAPPER_ORIGIN)?.[1]
  if (fromText && HTTP_URL.test(fromText)) return fromText
  const input = outcome.input as { url?: unknown } | undefined
  if (typeof input?.url === 'string' && HTTP_URL.test(input.url))
    return input.url
  return undefined
}

/* Error pages put the status at the top (title, heading); a page that only
   mentions "Internal Server Error" further down is not one. */
const HEAD_CHARS = 600
const HEAD_STATUS_PATTERNS = [
  /\bHTTP(?:\s+ERROR)?\s*:?\s*(5\d\d)\b/i,
  /\b(5\d\d)\s*[-–:|]?\s*(?:Internal Server Error|Bad Gateway|Service (?:Temporarily )?Unavailable|Gateway Time-?out)\b/i,
  /\bError\s+(5\d\d)\b/,
]
const HEAD_PHRASE =
  /\b(Internal Server Error|Bad Gateway|Service (?:Temporarily )?Unavailable|Gateway Time-?out)\b/i
const PHRASE_STATUS: Record<string, number> = {
  'internal server error': 500,
  'bad gateway': 502,
  'service unavailable': 503,
  'service temporarily unavailable': 503,
  'gateway timeout': 504,
  'gateway time-out': 504,
}
/* fetch() results from evaluate/run: {"url": "...", "status": 500}. */
const STATUS_FIELD = /["']?status(?:Code)?["']?\s*[:=]\s*["']?(5\d\d)\b/i
const ANY_URL = /https?:\/\/[^\s"'<>)\]\\]+/g

/** Finds an HTTP 5xx answer of the site in one tool output. */
export function detectSiteError(
  text: string,
  fallbackUrl?: string,
): SiteError | undefined {
  if (!text) return undefined
  const body = text.replace(WRAPPER_LINE, '')
  const head = body.slice(0, HEAD_CHARS)
  for (const pattern of HEAD_STATUS_PATTERNS) {
    const match = head.match(pattern)
    if (match?.[1]) return { status: Number(match[1]), url: fallbackUrl }
  }
  const phrase = head.match(HEAD_PHRASE)?.[1]
  if (phrase) {
    const status = PHRASE_STATUS[phrase.toLowerCase()] ?? 500
    return { status, url: fallbackUrl }
  }
  const field = STATUS_FIELD.exec(body)
  if (field?.[1]) {
    return {
      status: Number(field[1]),
      url: urlNear(body, field.index) ?? fallbackUrl,
    }
  }
  return undefined
}

/** The URL closest before a match (within 400 chars), else just after it. */
function urlNear(text: string, index: number): string | undefined {
  const before = text.slice(Math.max(0, index - 400), index)
  const beforeUrls = before.match(ANY_URL)
  if (beforeUrls?.length) return trimUrl(beforeUrls[beforeUrls.length - 1])
  const after = text.slice(index, index + 200).match(ANY_URL)
  return after?.[0] ? trimUrl(after[0]) : undefined
}

function trimUrl(url: string | undefined): string | undefined {
  return url?.replace(/[.,;:]+$/, '')
}
