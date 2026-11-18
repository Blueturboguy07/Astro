import { afterEach, describe, expect, it, mock } from 'bun:test'

/* F-011 d: voice input goes to publik with the install key, never to
   BrowserOS's transcription service; without a publik plan it says so. */

type Provider =
  | { kind: 'own' | 'publik'; baseURL: string; apiKey: string }
  | { kind: 'needs_own_key' }
let provider: Provider = { kind: 'needs_own_key' }
const noted: string[] = []
mock.module('@/lib/publik/publik', () => ({
  resolveProvider: async () => provider,
  isNotAnswering: (s: number) => s === 429 || s >= 500,
  note402: async (m: string) => {
    noted.push(m)
    return true
  },
}))

const { transcribeAudio, TRANSCRIBE_MODEL, VOICE_NEEDS_PUBLIK } = await import(
  './transcribe-audio'
)

type Call = { url: string; auth: string | null; form: FormData }
const calls: Call[] = []
let reply: () => Response = () => Response.json({ text: 'hi' })
const realFetch = globalThis.fetch
const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({
    url: String(input),
    auth: new Headers(init?.headers).get('authorization'),
    form: init?.body as FormData,
  })
  return reply()
}) as typeof fetch

afterEach(() => {
  globalThis.fetch = realFetch
  calls.length = 0
  noted.length = 0
  provider = { kind: 'needs_own_key' }
})

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })
const PUBLIK: Provider = {
  kind: 'publik',
  baseURL: 'https://publikhq.com/api/v1',
  apiKey: 'pk_test_voice',
}

describe('transcribeAudio (F-011 d)', () => {
  it('sends the recording to publik with the install key and whisper-1', async () => {
    provider = PUBLIK
    globalThis.fetch = fakeFetch
    reply = () =>
      Response.json({
        text: 'hello there',
        segments: [{ avg_logprob: -0.2 }, { avg_logprob: -0.4 }],
      })
    const r = await transcribeAudio(blob())
    expect(r.text).toBe('hello there')
    expect(r.avgLogprob).toBeCloseTo(-0.3)
    expect(calls.length).toBe(1)
    expect(calls[0]?.url).toBe(
      'https://publikhq.com/api/v1/audio/transcriptions',
    )
    expect(calls[0]?.auth).toBe('Bearer pk_test_voice')
    expect(calls[0]?.form.get('model')).toBe(TRANSCRIBE_MODEL)
    expect(TRANSCRIBE_MODEL).toBe('whisper-1')
    expect(calls[0]?.form.get('response_format')).toBe('verbose_json')
    expect(calls[0]?.form.get('file')).toBeInstanceOf(Blob)
  })

  it('without a publik plan it calls nobody and says so', async () => {
    globalThis.fetch = fakeFetch
    provider = { kind: 'needs_own_key' }
    await expect(transcribeAudio(blob())).rejects.toThrow(VOICE_NEEDS_PUBLIK)
    provider = {
      kind: 'own',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'x',
    }
    await expect(transcribeAudio(blob())).rejects.toThrow(VOICE_NEEDS_PUBLIK)
    expect(calls).toEqual([])
    expect(VOICE_NEEDS_PUBLIK).toBe(
      'Voice input needs a publik plan. Open Settings > Models and press Connect your plan, or type your message.',
    )
  })

  it('a 402 shows publik’s message and feeds the money banner', async () => {
    provider = PUBLIK
    globalThis.fetch = fakeFetch
    reply = () =>
      Response.json(
        { error: { message: 'Your publik balance is too low.' } },
        { status: 402 },
      )
    await expect(transcribeAudio(blob())).rejects.toThrow(
      'Your publik balance is too low.',
    )
    expect(noted).toEqual(['402 Your publik balance is too low.'])
  })

  it('a 429 or 5xx says publik is not answering', async () => {
    provider = PUBLIK
    globalThis.fetch = fakeFetch
    reply = () => Response.json({}, { status: 503 })
    await expect(transcribeAudio(blob())).rejects.toThrow(
      'publik is not answering (error 503). Try again in a minute.',
    )
  })

  it('no answer at all says publik is not reachable', async () => {
    provider = PUBLIK
    globalThis.fetch = (() =>
      Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch
    await expect(transcribeAudio(blob())).rejects.toThrow(
      'publik is not reachable. Check your connection.',
    )
  })
})
