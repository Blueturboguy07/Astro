import { describe, expect, it } from 'bun:test'
import { APICallError } from 'ai'
import { chatErrorText } from '../../src/api/services/chat-error-text'

/* Astro 0.2.4 QA, F-021: the side panel showed "An error occurred." for a
   publik 402. The body is the gateway's (publik lib/publik-api/gateway). */
const body402 = JSON.stringify({
  error: {
    type: 'insufficient_credit',
    message:
      'Your publik balance is too low for this request. Add a plan or a pack at the link below, or use your own key.',
    top_up_url: 'https://publikhq.com/wallet/add',
  },
})

const apiError = (
  statusCode: number,
  responseBody: string,
  message: string,
  responseHeaders?: Record<string, string>,
) =>
  new APICallError({
    message,
    url: 'https://publikhq.com/api/v1/chat/completions',
    requestBodyValues: {},
    statusCode,
    responseBody,
    responseHeaders,
    isRetryable: false,
  })

describe('chatErrorText', () => {
  it('passes publik 402 on with its message and top-up link', () => {
    const text = chatErrorText(apiError(402, body402, 'Payment Required'))
    expect(JSON.parse(text)).toEqual(JSON.parse(body402))
  })

  /* F-050: the daily cap answered with a raw "429 ..." and no reset time. */
  it('passes the publik daily cap on with its type and reset time', () => {
    const before = Date.now()
    const text = chatErrorText(
      apiError(
        429,
        JSON.stringify({
          error: {
            type: 'daily_cap_reached',
            message: 'This key has reached its daily spending cap.',
            daily_cap_micros: 2000000,
          },
        }),
        'This key has reached its daily spending cap.',
        { 'retry-after': '3600' },
      ),
    )
    const parsed = JSON.parse(text)
    expect(parsed.error.type).toBe('daily_cap_reached')
    expect(parsed.error.message).toBe(
      'This key has reached its daily spending cap.',
    )
    const reset = Date.parse(parsed.error.reset_at)
    expect(reset - before).toBeGreaterThanOrEqual(3_600_000)
    expect(reset - before).toBeLessThan(3_660_000)
  })

  it('passes other provider errors on as their message', () => {
    expect(
      chatErrorText(
        apiError(401, '{"error":{"message":"bad key"}}', 'bad key'),
      ),
    ).toBe('bad key')
  })

  it('keeps a generic text for values that are not errors', () => {
    expect(chatErrorText('x')).toBe('An error occurred.')
  })
})
