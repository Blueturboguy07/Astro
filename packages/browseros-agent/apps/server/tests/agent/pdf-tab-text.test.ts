import { afterEach, describe, expect, it } from 'bun:test'
import { pathToFileURL } from 'node:url'
import {
  clearPdfTabTextCache,
  fetchPdfTabText,
} from '../../src/agent/pdf-tab-text'

/* Astro 0.2.4 QA, F-070 (UC-24): the text of a PDF tab, through the same
   pdfjs path as uploads. */

const FIXTURE = new URL('../lib/simplicity/hello-upload.pdf', import.meta.url)

async function fixtureBytes(): Promise<Uint8Array> {
  return Bun.file(FIXTURE).bytes()
}

function fakeFetch(response: () => Response | Promise<Response>) {
  const urls: string[] = []
  const impl = (async (input: string | URL | Request) => {
    urls.push(String(input))
    return response()
  }) as typeof fetch
  return { impl, urls }
}

afterEach(() => clearPdfTabTextCache())

describe('fetchPdfTabText', () => {
  it('fetches the tab URL and returns the PDF text, once per URL', async () => {
    const bytes = await fixtureBytes()
    const { impl, urls } = fakeFetch(
      () =>
        new Response(bytes, { headers: { 'content-type': 'application/pdf' } }),
    )
    const url = 'https://arxiv.org/pdf/1706.03762'
    expect(await fetchPdfTabText(url, undefined, impl)).toContain(
      'Hello Astro upload test',
    )
    expect(await fetchPdfTabText(url, undefined, impl)).toContain(
      'Hello Astro upload test',
    )
    expect(urls).toEqual([url])
  })

  it('reads a local PDF tab (file://) from disk', async () => {
    const text = await fetchPdfTabText(pathToFileURL(FIXTURE.pathname).href)
    expect(text).toContain('Hello Astro upload test')
  })

  it('says why when the site refuses or sends a sign-in page', async () => {
    const denied = fakeFetch(() => new Response('no', { status: 403 }))
    await expect(
      fetchPdfTabText('https://a.example/x.pdf', undefined, denied.impl),
    ).rejects.toThrow('the site answered HTTP 403')

    const login = fakeFetch(() => new Response('<html>Sign in</html>'))
    await expect(
      fetchPdfTabText('https://a.example/y.pdf', undefined, login.impl),
    ).rejects.toThrow('the address did not return a PDF file')
  })

  it('refuses other schemes and very large files', async () => {
    await expect(fetchPdfTabText('chrome://settings/')).rejects.toThrow(
      'cannot fetch a chrome: address',
    )
    const big = fakeFetch(
      () =>
        new Response('%PDF-', {
          headers: { 'content-length': String(60 * 1024 * 1024) },
        }),
    )
    await expect(
      fetchPdfTabText('https://a.example/big.pdf', undefined, big.impl),
    ).rejects.toThrow('the PDF is larger than 50 MB')
  })
})
