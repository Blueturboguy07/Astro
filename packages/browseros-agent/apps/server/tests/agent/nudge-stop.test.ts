import { describe, expect, it } from 'bun:test'
import type {
  LanguageModelV3GenerateResult,
  LanguageModelV3Usage,
} from '@ai-sdk/provider'
import { generateText, stepCountIs, tool } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'
import {
  buildNudgeToolSet,
  nudgeStopConditions,
} from '../../src/agent/nudge-tools'

/* Astro 0.2.4 QA, F-085: after the app-connection card the agent said "now
   connected" and called the app's tools before the person clicked. */

const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, reasoning: undefined },
}

const callTool = (
  toolName: string,
  input: Record<string, unknown>,
): LanguageModelV3GenerateResult => ({
  content: [
    {
      type: 'tool-call',
      toolCallId: `call_${toolName}`,
      toolName,
      input: JSON.stringify(input),
    },
  ],
  finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
  usage,
})

async function run(first: LanguageModelV3GenerateResult) {
  const calls: string[] = []
  let modelCalls = 0
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      modelCalls++
      return modelCalls === 1
        ? first
        : callTool('strata_execute', { action: 'list_files' })
    },
  })
  await generateText({
    model,
    prompt: 'List my Google Drive files',
    tools: {
      ...buildNudgeToolSet(),
      strata_execute: tool({
        inputSchema: z.object({ action: z.string() }),
        execute: async ({ action }) => {
          calls.push(action)
          return 'done'
        },
      }),
    },
    stopWhen: [stepCountIs(5), ...nudgeStopConditions()],
  })
  return { calls, modelCalls }
}

describe('the app-connection card ends the turn (F-085)', () => {
  it('stops after the step that shows the card', async () => {
    const { calls, modelCalls } = await run(
      callTool('suggest_app_connection', {
        appName: 'Google Drive',
        reason: 'to list your files',
      }),
    )
    expect(modelCalls).toBe(1)
    expect(calls).toEqual([])
  })

  it('does not stop other tool loops', async () => {
    const { modelCalls } = await run(
      callTool('suggest_schedule', {
        query: 'news',
        suggestedName: 'News',
        scheduleType: 'daily',
      }),
    )
    expect(modelCalls).toBeGreaterThan(1)
  })
})
