import { describe, expect, it } from 'bun:test'
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider'
import { LLM_PROVIDERS } from '@browseros/shared/schemas/llm'
import { generateText, stepCountIs, streamText, tool } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'
import { runBudgetFor } from '../../src/agent/ai-sdk-agent'
import {
  CONTINUE_LINE,
  detectSiteError,
  RunBudget,
} from '../../src/agent/run-budget'

/* Astro 0.2.4 QA, F-072 (UC-42): 38 tool calls in 5 minutes on a site whose
   own API answered HTTP 500, no report to the user. */

const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, reasoning: undefined },
}

const INSTRUCTIONS = 'You are a browser agent.'
const API_URL = 'https://automationintesting.online/api/room/1'

let callSeq = 0
function callTool(
  toolName: string,
  input: Record<string, unknown>,
): LanguageModelV3GenerateResult {
  return {
    content: [
      {
        type: 'tool-call',
        toolCallId: `call_${++callSeq}`,
        toolName,
        input: JSON.stringify(input),
      },
    ],
    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    usage,
  }
}

function answer(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
  }
}

function systemText(options: LanguageModelV3CallOptions): string {
  const first = options.prompt[0]
  return first?.role === 'system' ? first.content : ''
}

const wrapped = (text: string, origin: string) =>
  `[UNTRUSTED_PAGE_CONTENT nonce=${Math.random().toString(16).slice(2)} origin=${origin}] Untrusted page content follows.\n${text}\n[END_UNTRUSTED_PAGE_CONTENT nonce=0]`

/** A browser-like toolset; each tool result is built by `output`. */
function browserTools(output: (name: string, n: number) => string) {
  let n = 0
  const make = (name: string) =>
    tool({
      inputSchema: z.object({ page: z.number().optional() }).passthrough(),
      execute: async () => ({
        content: [{ type: 'text', text: output(name, ++n) }],
        isError: false,
      }),
    })
  return {
    navigate: make('navigate'),
    read: make('read'),
    evaluate: make('evaluate'),
  }
}

async function runTurn(options: {
  budget: RunBudget
  next: (
    options: LanguageModelV3CallOptions,
    call: number,
  ) => LanguageModelV3GenerateResult
  output: (name: string, n: number) => string
  afterTool?: () => void
}) {
  const calls: LanguageModelV3CallOptions[] = []
  const model = new MockLanguageModelV3({
    doGenerate: async (callOptions) => {
      calls.push(callOptions)
      if (callOptions.toolChoice?.type === 'none') {
        return answer('I filled the dates. The booking page never loaded.')
      }
      return options.next(callOptions, calls.length)
    },
  })
  const tools = browserTools((name, n) => {
    options.afterTool?.()
    return options.output(name, n)
  })
  const result = await generateText({
    model,
    prompt: 'Book 2 nights next month',
    tools,
    stopWhen: [stepCountIs(100), options.budget.stopCondition],
    prepareStep: ({ steps }) => options.budget.prepareStep(steps),
  })
  return { result, calls }
}

describe('detectSiteError', () => {
  it('names a fetch() result with status 500 and its URL', () => {
    const text = wrapped(
      JSON.stringify({ url: API_URL, status: 500, ok: false }),
      'https://automationintesting.online/reservation/1',
    )
    expect(detectSiteError(text)).toEqual({ status: 500, url: API_URL })
  })

  it('names an error page by its title, with the page URL', () => {
    const text = wrapped(
      '# 500 Internal Server Error\n\nnginx',
      'https://shop.example/cart',
    )
    expect(detectSiteError(text, 'https://shop.example/cart')).toEqual({
      status: 500,
      url: 'https://shop.example/cart',
    })
  })

  it("reads Chrome's own error page and a 503 phrase", () => {
    expect(
      detectSiteError(
        'navigated (url) -> https://a.example/\nThis page isn’t working\nHTTP ERROR 502',
      )?.status,
    ).toBe(502)
    expect(detectSiteError('Service Unavailable\nTry later')?.status).toBe(503)
  })

  it('does not flag an article that mentions the phrase further down', () => {
    const article = `${'Status codes explained. '.repeat(40)}A 500 Internal Server Error means the server failed.`
    expect(detectSiteError(article)).toBeUndefined()
    expect(detectSiteError('Order #500 shipped')).toBeUndefined()
  })
})

describe('RunBudget', () => {
  it('stops after 40 actions and asks the model for a report without tools', async () => {
    const budget = new RunBudget({ instructions: INSTRUCTIONS })
    const { result, calls } = await runTurn({
      budget,
      next: () => callTool('navigate', { page: 1 }),
      output: (_name, n) =>
        `navigated (url) -> https://a.example/${n}\npage ${n}`,
    })

    const toolCalls = result.steps.reduce((s, x) => s + x.toolCalls.length, 0)
    expect(toolCalls).toBe(40)
    expect(result.steps).toHaveLength(41)
    expect(budget.stopReason).toBe('actions')
    const last = calls.at(-1)
    expect(last?.toolChoice).toEqual({ type: 'none' })
    expect(systemText(last as LanguageModelV3CallOptions)).toContain(
      'run budget: 40 actions',
    )
    expect(budget.header()).toBe('**Stopped after 40 actions.**')
    expect(result.text).toContain('The booking page never loaded.')
  })

  it('names the broken site in the report (HTTP 500 at ...)', async () => {
    const budget = new RunBudget({ instructions: INSTRUCTIONS })
    const { calls } = await runTurn({
      budget,
      next: (_o, call) =>
        call % 2 === 1
          ? callTool('read', { page: 1 })
          : callTool('evaluate', { page: 1 }),
      output: (name, n) =>
        name === 'evaluate'
          ? wrapped(
              JSON.stringify({ url: API_URL, status: 500 }),
              'https://automationintesting.online/reservation/1',
            )
          : wrapped(
              `Spinner ${n}`,
              'https://automationintesting.online/reservation/1',
            ),
    })

    expect(budget.header()).toBe(
      `**Stopped after 40 actions.** The site returned an error (HTTP 500 at ${API_URL}).`,
    )
    expect(systemText(calls.at(-1) as LanguageModelV3CallOptions)).toContain(
      `The site returned an error (HTTP 500 at ${API_URL})`,
    )
  })

  it('stops after 3 minutes without progress; script calls are not progress', async () => {
    let clock = 1_000_000
    const budget = new RunBudget({
      instructions: INSTRUCTIONS,
      now: () => clock,
    })
    const { result, calls } = await runTurn({
      budget,
      next: () => callTool('evaluate', { page: 1 }),
      output: (_name, n) => `chunk ${n} of the site's JavaScript`,
      afterTool: () => {
        clock += 40_000
      },
    })

    /* 5 calls x 40 s = 200 s >= 180 s. */
    expect(result.steps).toHaveLength(6)
    expect(budget.stopReason).toBe('no-progress')
    expect(budget.header()).toBe('**Stopped: no progress for 3 minutes.**')
    expect(calls.at(-1)?.toolChoice).toEqual({ type: 'none' })
  })

  it('new page content is progress, the same page again is not', async () => {
    let clock = 0
    const budget = new RunBudget({
      instructions: INSTRUCTIONS,
      now: () => clock,
    })
    const fresh = await runTurn({
      budget,
      next: (_o, call) =>
        call <= 10 ? callTool('read', { page: 1 }) : answer('Done.'),
      output: (_name, n) => wrapped(`Result row ${n}`, 'https://a.example/'),
      afterTool: () => {
        clock += 40_000
      },
    })
    expect(budget.stopReason).toBeUndefined()
    expect(fresh.result.text).toBe('Done.')

    const same = await runTurn({
      budget,
      next: () => callTool('read', { page: 1 }),
      output: () => wrapped('Loading...', 'https://a.example/'),
      afterTool: () => {
        clock += 40_000
      },
    })
    expect(budget.stopReason).toBe('no-progress')
    /* The first "Loading..." read is new content; five more reach 3 min. */
    expect(same.result.steps).toHaveLength(7)
  })

  it('"Continue" starts a fresh budget in the next turn', async () => {
    const budget = new RunBudget({
      instructions: INSTRUCTIONS,
      maxToolCalls: 2,
    })
    await runTurn({
      budget,
      next: () => callTool('navigate', { page: 1 }),
      output: (_name, n) => `page ${n}`,
    })
    expect(budget.stopReason).toBe('actions')

    const next = await runTurn({
      budget,
      next: (_o, call) =>
        call === 1 ? callTool('navigate', { page: 1 }) : answer('Booked.'),
      output: (_name, n) => `page ${n}`,
    })
    expect(budget.stopReason).toBeUndefined()
    expect(next.result.text).toBe('Booked.')
  })

  it('streams the fixed first line before the report and the Continue line after it', async () => {
    const budget = new RunBudget({
      instructions: INSTRUCTIONS,
      maxToolCalls: 1,
    })
    let call = 0
    const model = new MockLanguageModelV3({
      doStream: async () => {
        call++
        const parts: LanguageModelV3StreamPart[] =
          call === 1
            ? [
                { type: 'stream-start', warnings: [] },
                {
                  type: 'tool-call',
                  toolCallId: 'c1',
                  toolName: 'evaluate',
                  input: '{"page":1}',
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                  usage,
                },
              ]
            : [
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: 't' },
                { type: 'text-delta', id: 't', delta: 'The API failed.' },
                { type: 'text-end', id: 't' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage,
                },
              ]
        return {
          stream: new ReadableStream({
            start(controller) {
              for (const part of parts) controller.enqueue(part)
              controller.close()
            },
          }),
        }
      },
    })
    const result = streamText({
      model,
      prompt: 'Book it',
      tools: browserTools(() => JSON.stringify({ url: API_URL, status: 500 })),
      stopWhen: [stepCountIs(100), budget.stopCondition],
      prepareStep: ({ steps }) => budget.prepareStep(steps),
      experimental_transform: budget.transform,
    })
    const texts: string[] = []
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') texts.push(part.text)
    }

    expect(texts).toEqual([
      `**Stopped after 1 action.** The site returned an error (HTTP 500 at ${API_URL}).\n\n`,
      'The API failed.',
      `\n\n${CONTINUE_LINE}`,
    ])
    expect(CONTINUE_LINE).toBe('Reply **Continue** to resume from here.')
    /* The stored step holds the same text, so the next turn sees it. */
    const steps = await result.steps
    expect(steps.at(-1)?.text).toContain('Stopped after 1 action.')
  })
})

describe('runBudgetFor', () => {
  const base = {
    conversationId: 'c',
    provider: LLM_PROVIDERS.OPENAI,
    model: 'm',
  }
  it('gives interactive chats a budget', () => {
    expect(runBudgetFor({ resolvedConfig: base }, 'x')).toBeInstanceOf(
      RunBudget,
    )
    expect(
      runBudgetFor({ resolvedConfig: { ...base, chatMode: true } }, 'x'),
    ).toBeInstanceOf(RunBudget)
  })

  it('leaves scheduled runs (F-071 limits) and ACP agents without one', () => {
    expect(
      runBudgetFor({ resolvedConfig: { ...base, isScheduledTask: true } }, 'x'),
    ).toBeUndefined()
    expect(
      runBudgetFor(
        { resolvedConfig: { ...base, provider: LLM_PROVIDERS.CODEX } },
        'x',
      ),
    ).toBeUndefined()
  })
})

describe('RunBudget site error', () => {
  it('does not name an error the agent got past', async () => {
    const budget = new RunBudget({ instructions: INSTRUCTIONS })
    await runTurn({
      budget,
      next: (_o, call) =>
        call === 1
          ? callTool('evaluate', { page: 1 })
          : callTool('read', { page: 1 }),
      output: (name, n) =>
        name === 'evaluate'
          ? JSON.stringify({ url: API_URL, status: 500 })
          : wrapped(`Room ${n} is free`, 'https://automationintesting.online/'),
    })
    expect(budget.stopReason).toBe('actions')
    expect(budget.header()).toBe('**Stopped after 40 actions.**')
  })
})
