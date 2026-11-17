import { beforeAll, describe, expect, it, mock } from 'bun:test'
import { type ComponentProps, createElement, type FC } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type MockButtonProps = ComponentProps<'button'> & {
  variant?: string
  size?: string
}

mock.module('@/components/ui/button', () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: MockButtonProps) =>
    createElement('button', { type: 'button', ...props }, children),
}))

mock.module(
  '@/lib/publik/limit-error',
  () => import('../../../lib/publik/limit-error'),
)

mock.module('@/lib/publik/publik', () => ({
  publikLink: (url: unknown) =>
    typeof url === 'string' && url.startsWith('https://publikhq.com/')
      ? url
      : null,
}))

let ChatError: FC<{
  error: Error
  onRetry?: () => void
  providerType?: string
}>

beforeAll(async () => {
  ChatError = (await import('./ChatError')).ChatError
})

function renderError(error: Error, providerType = 'browseros') {
  return renderToStaticMarkup(
    createElement(ChatError, {
      error,
      onRetry: () => {},
      providerType,
    }),
  )
}

describe('ChatError', () => {
  it('shows retry for connection errors', () => {
    const html = renderError(new Error('Failed to fetch'))

    expect(html).toContain('Try again')
  })

  it('hides retry for credits-exhausted errors', () => {
    const html = renderError(new Error('CREDITS_EXHAUSTED'))

    expect(html).toContain('Daily credits exhausted')
    expect(html).not.toContain('Try again')
  })

  it('hides retry for Astro daily-limit errors', () => {
    const html = renderError(
      new Error('Astro LLM daily limit reached for today'),
    )

    expect(html).toContain('Add your own API key')
    expect(html).not.toContain('Try again')
  })
})

/* Astro 0.2.4 QA, F-021: a publik 402 showed "Something went wrong / An
   error occurred." in the side panel. */
describe('ChatError for a publik 402', () => {
  const body = JSON.stringify({
    error: {
      type: 'insufficient_credit',
      message: 'Your publik balance is too low for this request.',
      top_up_url: 'https://publikhq.com/wallet/add',
    },
  })

  it('shows the message and one top-up link, no retry', () => {
    const html = renderError(new Error(body), 'openai-compatible')
    expect(html).toContain('Not enough publik balance')
    expect(html).toContain('Your publik balance is too low for this request.')
    expect(html).toContain('href="https://publikhq.com/wallet/add"')
    expect(html).toContain('Get a plan')
    expect(html).not.toContain('Try again')
  })

  it('never links outside publikhq.com', () => {
    const evil = body.replace(
      'https://publikhq.com/wallet/add',
      'https://evil.example/pay',
    )
    const html = renderError(new Error(evil), 'openai-compatible')
    expect(html).not.toContain('evil.example')
    expect(html).toContain('href="https://publikhq.com/wallet/add"')
  })
})

describe('ChatError: F-045, F-046, F-050', () => {
  it('connection error has no empty promise and no upstream link', () => {
    const html = renderError(new Error('Failed to fetch'))
    expect(html).not.toContain('Follow below instructions')
    expect(html).not.toContain('docs.browseros.com')
    expect(html).toContain('quit and reopen Astro')
    expect(html).toContain('Try again')
  })

  it('publik daily cap shows the reset time and the wallet, no retry', () => {
    const body = JSON.stringify({
      error: {
        type: 'daily_cap_reached',
        message: 'This key has reached its daily spending cap.',
        reset_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      },
    })
    const html = renderError(new Error(body), 'openai-compatible')
    expect(html).toContain('Daily limit reached')
    expect(html).toContain('It resets in 2 h 0 min')
    expect(html).toContain('href="https://publikhq.com/wallet"')
    expect(html).toContain('Open wallet')
    expect(html).not.toContain('Try again')
  })

  it('a stalled model stream says so and offers retry', () => {
    const html = renderError(
      new Error(
        'The AI model stopped answering: no data for 90 seconds. Retry, or choose another model.',
      ),
      'openai-compatible',
    )
    expect(html).toContain('No answer from the model')
    expect(html).toContain('Try again')
  })
})
