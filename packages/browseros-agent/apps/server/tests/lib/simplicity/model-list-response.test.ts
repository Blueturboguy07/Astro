import { describe, expect, it } from 'bun:test'
import { modelListJson } from '../../../src/lib/simplicity/models/providers/model-list-response'

/* Astro 0.2.4 QA, F-040. */
describe('modelListJson', () => {
  it('says why the provider refused (Gemini 400 body)', async () => {
    const res = new Response(
      JSON.stringify({
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
        },
      }),
      { status: 400 },
    )
    await expect(modelListJson(res, 'Gemini')).rejects.toThrow(
      'Gemini refused the request (HTTP 400): API key not valid. Please pass a valid API key. Check the API key.',
    )
  })

  it('handles a plain-text error body (Groq 401)', async () => {
    const res = new Response('Invalid API Key', { status: 401 })
    await expect(modelListJson(res, 'Groq')).rejects.toThrow(
      'Groq refused the request (HTTP 401): Invalid API Key',
    )
  })

  it('returns the list when the reply is ok', async () => {
    const res = new Response(JSON.stringify({ data: [{ id: 'm' }] }))
    expect(await modelListJson(res, 'Groq')).toEqual({ data: [{ id: 'm' }] })
  })
})
