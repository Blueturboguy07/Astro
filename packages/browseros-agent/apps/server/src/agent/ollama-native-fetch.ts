/**
 * Sends the agent's OpenAI-style chat requests to Ollama's native /api/chat
 * so they can carry `options.num_ctx`.
 *
 * Ollama's OpenAI endpoint (/v1/chat/completions) ignores num_ctx and runs
 * every model with its default context (2048 tokens on most installs). The
 * agent prompt is about 9k tokens, so Ollama cut it to the last 2048 and the
 * side panel got empty answers (Astro 0.2.4 QA, F-035). This fetch turns the
 * request into a native one, and turns the native answer (JSON or NDJSON
 * stream) back into the OpenAI shape @ai-sdk/openai-compatible reads. Any
 * other request goes through unchanged.
 */

export const OLLAMA_AGENT_NUM_CTX = 32_000

type OpenAIToolCall = {
  id?: string
  type?: string
  function: { name: string; arguments: string }
}

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool' | string
  content?:
    | string
    | null
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } | string }
        | { type: string; [k: string]: unknown }
      >
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  reasoning_content?: string
}

type OpenAIChatBody = {
  model: string
  messages: OpenAIMessage[]
  tools?: unknown[]
  stream?: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  max_completion_tokens?: number
  stop?: string | string[]
  seed?: number
  frequency_penalty?: number
  presence_penalty?: number
  response_format?: { type: string; json_schema?: { schema?: unknown } }
}

type NativeToolCall = {
  function: { name: string; arguments: Record<string, unknown> | string }
}

type NativeMessage = {
  role: string
  content: string
  thinking?: string
  images?: string[]
  tool_calls?: NativeToolCall[]
  tool_name?: string
}

type NativeChunk = {
  model?: string
  message?: {
    content?: string
    thinking?: string
    tool_calls?: NativeToolCall[]
  }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function imageData(part: { image_url: { url: string } | string }): string {
  const url =
    typeof part.image_url === 'string' ? part.image_url : part.image_url.url
  const comma = url.indexOf(',')
  return url.startsWith('data:') && comma >= 0 ? url.slice(comma + 1) : url
}

export function toNativeChatBody(
  body: OpenAIChatBody,
  numCtx: number = OLLAMA_AGENT_NUM_CTX,
): Record<string, unknown> {
  const toolNames = new Map<string, string>()
  const messages: NativeMessage[] = body.messages.map((m) => {
    const out: NativeMessage = { role: m.role, content: '' }
    if (typeof m.content === 'string') {
      out.content = m.content
    } else if (Array.isArray(m.content)) {
      const texts: string[] = []
      const images: string[] = []
      for (const part of m.content) {
        if (part.type === 'text')
          texts.push(String((part as { text: string }).text))
        else if (part.type === 'image_url') {
          images.push(imageData(part as { image_url: { url: string } }))
        }
      }
      out.content = texts.join('\n')
      if (images.length) out.images = images
    }
    if (m.reasoning_content) out.thinking = m.reasoning_content
    if (m.tool_calls?.length) {
      out.tool_calls = m.tool_calls.map((c) => {
        if (c.id) toolNames.set(c.id, c.function.name)
        return {
          function: {
            name: c.function.name,
            arguments: parseArgs(c.function.arguments),
          },
        }
      })
    }
    if (m.role === 'tool' && m.tool_call_id) {
      const name = toolNames.get(m.tool_call_id)
      if (name) out.tool_name = name
    }
    return out
  })

  const options: Record<string, unknown> = { num_ctx: numCtx }
  if (body.temperature !== undefined) options.temperature = body.temperature
  if (body.top_p !== undefined) options.top_p = body.top_p
  const maxTokens = body.max_completion_tokens ?? body.max_tokens
  if (maxTokens !== undefined) options.num_predict = maxTokens
  if (body.stop !== undefined) {
    options.stop = Array.isArray(body.stop) ? body.stop : [body.stop]
  }
  if (body.seed !== undefined) options.seed = body.seed
  if (body.frequency_penalty !== undefined) {
    options.frequency_penalty = body.frequency_penalty
  }
  if (body.presence_penalty !== undefined) {
    options.presence_penalty = body.presence_penalty
  }

  const native: Record<string, unknown> = {
    model: body.model,
    messages,
    stream: body.stream === true,
    options,
  }
  if (body.tools?.length) native.tools = body.tools
  const rf = body.response_format
  if (rf?.type === 'json_schema' && rf.json_schema?.schema) {
    native.format = rf.json_schema.schema
  } else if (rf?.type === 'json_object') {
    native.format = 'json'
  }
  return native
}

function finishReason(chunk: NativeChunk, sawToolCalls: boolean): string {
  if (sawToolCalls) return 'tool_calls'
  return chunk.done_reason === 'length' ? 'length' : 'stop'
}

function usageOf(chunk: NativeChunk) {
  const prompt = chunk.prompt_eval_count ?? 0
  const completion = chunk.eval_count ?? 0
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  }
}

function openAIToolCalls(
  calls: NativeToolCall[],
  start: number,
  idPrefix: string,
) {
  return calls.map((c, i) => ({
    index: start + i,
    id: `${idPrefix}_${start + i}`,
    type: 'function',
    function: {
      name: c.function.name,
      arguments:
        typeof c.function.arguments === 'string'
          ? c.function.arguments
          : JSON.stringify(c.function.arguments ?? {}),
    },
  }))
}

/** One native NDJSON stream -> an OpenAI chat.completion.chunk SSE stream. */
export function nativeStreamToOpenAISSE(
  native: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const id = `chatcmpl-ollama-${Date.now().toString(36)}`
  const created = Math.floor(Date.now() / 1000)
  let buffer = ''
  let toolIndex = 0
  let sawToolCalls = false
  let sentRole = false
  let finished = false

  const sse = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`)
  const chunkOf = (
    delta: Record<string, unknown>,
    finish: string | null,
    extra = {},
  ) => ({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...extra,
  })

  const handle = (
    line: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    if (!line.trim() || finished) return
    let c: NativeChunk
    try {
      c = JSON.parse(line)
    } catch {
      return
    }
    if (c.error) {
      controller.enqueue(sse({ error: { message: c.error } }))
      finished = true
      return
    }
    const delta: Record<string, unknown> = {}
    if (c.message?.thinking) delta.reasoning_content = c.message.thinking
    if (c.message?.content) delta.content = c.message.content
    if (c.message?.tool_calls?.length) {
      delta.tool_calls = openAIToolCalls(c.message.tool_calls, toolIndex, id)
      toolIndex += c.message.tool_calls.length
      sawToolCalls = true
    }
    if (Object.keys(delta).length > 0) {
      if (!sentRole) {
        delta.role = 'assistant'
        sentRole = true
      }
      controller.enqueue(sse(chunkOf(delta, null)))
    }
    if (c.done) {
      controller.enqueue(
        sse(chunkOf({}, finishReason(c, sawToolCalls), { usage: usageOf(c) })),
      )
      finished = true
    }
  }

  const reader = native.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        handle(buffer, controller)
        buffer = ''
        if (!finished) {
          controller.enqueue(
            sse(chunkOf({}, sawToolCalls ? 'tool_calls' : 'stop')),
          )
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'))
        controller.close()
        return
      }
      buffer += dec.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        handle(buffer.slice(0, nl), controller)
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

/** One native JSON answer -> an OpenAI chat.completion. */
export function nativeJsonToOpenAI(c: NativeChunk, model: string) {
  const id = `chatcmpl-ollama-${Date.now().toString(36)}`
  const calls = c.message?.tool_calls ?? []
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: c.message?.content ?? '',
          ...(c.message?.thinking && { reasoning_content: c.message.thinking }),
          ...(calls.length && {
            tool_calls: openAIToolCalls(calls, 0, id).map(
              ({ index: _i, ...rest }) => rest,
            ),
          }),
        },
        finish_reason: finishReason(c, calls.length > 0),
      },
    ],
    usage: usageOf(c),
  }
}

/** "http://host:11434/v1" -> "http://host:11434". */
export function ollamaRoot(baseURL: string): string {
  return baseURL.replace(/\/+$/, '').replace(/\/v1$/, '')
}

export function ollamaNativeFetch(
  baseURL: string,
  options: { numCtx?: number; fetchImpl?: typeof fetch } = {},
): typeof fetch {
  const fetchImpl = options.fetchImpl ?? fetch
  const root = ollamaRoot(baseURL)
  const wrapped = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    if (
      !/\/chat\/completions\/?$/.test(url) ||
      typeof init?.body !== 'string'
    ) {
      return fetchImpl(input, init)
    }
    const body = JSON.parse(init.body) as OpenAIChatBody
    const res = await fetchImpl(`${root}/api/chat`, {
      ...init,
      body: JSON.stringify(toNativeChatBody(body, options.numCtx)),
    })
    if (!res.ok) {
      const text = await res.text()
      let message = text
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? text
      } catch {}
      return new Response(JSON.stringify({ error: { message } }), {
        status: res.status,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (body.stream === true && res.body) {
      return new Response(nativeStreamToOpenAISSE(res.body, body.model), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    const json = (await res.json()) as NativeChunk
    return new Response(JSON.stringify(nativeJsonToOpenAI(json, body.model)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return wrapped as typeof fetch
}
