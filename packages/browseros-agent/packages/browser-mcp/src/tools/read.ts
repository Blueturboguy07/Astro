import { buildContentMarkdownExpression } from '@browseros/browser-core/content-markdown'
import { TOOL_LIMITS } from '@browseros/shared/constants/limits'
import { z } from 'zod'
import { defineTool, errorResult, textResult } from './framework'
import { writeTempToolOutputFile } from './output-file'
import {
  ATTRIBUTES_DESCRIPTION,
  buildAttributeLinesExpression,
} from './page-attributes'
import { pdfTabText } from './pdf-tab-text'
import { wrapUntrusted } from './trust-boundary'

type ReadFormat = 'markdown' | 'text' | 'links' | 'attributes'

function expressionFor(format: ReadFormat, selector?: string): string {
  if (format === 'markdown') return buildContentMarkdownExpression({ selector })
  if (format === 'attributes') {
    return buildAttributeLinesExpression({
      selector,
      maxLines: TOOL_LIMITS.ATTRIBUTE_LINES_MAX,
    })
  }
  const root = selector
    ? `document.querySelector(${JSON.stringify(selector)})`
    : 'document.body'
  if (format === 'text') return `((${root})?.innerText ?? '')`
  return `[...(${root}?.querySelectorAll('a[href]') ?? [])].map(function(a){return '[' + (a.textContent||'').trim() + '](' + a.href + ')'}).join('\\n')`
}

export const read = defineTool({
  name: 'read',
  description: `Extract page content as markdown (default), plain text, a list of links, or attributes (${ATTRIBUTES_DESCRIPTION}). On a tab that shows a PDF, markdown and text return the PDF's text. For reading/scraping, not acting.`,
  input: z.object({
    page: z.number().int(),
    format: z
      .enum(['markdown', 'text', 'links', 'attributes'])
      .default('markdown'),
    selector: z.string().optional().describe('Restrict to a CSS subtree.'),
    viewportOnly: z
      .boolean()
      .optional()
      .describe('For markdown reads, include only visible viewport content.'),
    includeLinks: z
      .boolean()
      .optional()
      .describe('For markdown reads, render links as markdown links.'),
    includeImages: z
      .boolean()
      .optional()
      .describe('For markdown reads, include image references.'),
  }),
  annotations: { title: 'Read page content', readOnlyHint: true },
  handler: async (args, ctx) => {
    const { session } = await ctx.session.pages.getSession(args.page)
    const code =
      args.format === 'markdown'
        ? buildContentMarkdownExpression({
            selector: args.selector,
            viewportOnly: args.viewportOnly,
            includeLinks: args.includeLinks,
            includeImages: args.includeImages,
          })
        : expressionFor(args.format, args.selector)
    const result = await session.Runtime.evaluate({
      expression: code,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      return errorResult(
        `read: ${
          result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text
        }`,
      )
    }

    let text = (result.result?.value as string) ?? ''
    const origin = ctx.session.pages.getInfo(args.page)?.url ?? 'unknown'

    let pdf = false
    if (args.format === 'markdown' || args.format === 'text') {
      const fromPdf = await pdfTabText({
        url: origin,
        pageText: text,
        session,
        signal: ctx.signal,
      })
      if (fromPdf && !fromPdf.ok) {
        return errorResult(
          `read: this tab shows a PDF (${fromPdf.url}), but its text could not be read: ${fromPdf.error}`,
        )
      }
      if (fromPdf) {
        text = fromPdf.text
        pdf = true
      }
    }

    if (text.length <= TOOL_LIMITS.INLINE_PAGE_CONTENT_MAX_CHARS) {
      return textResult(wrapUntrusted(text || '(empty)', origin), {
        page: args.page,
        format: args.format,
        contentLength: text.length,
        writtenToFile: false,
        ...(pdf && { pdf }),
      })
    }

    const path = await writeTempToolOutputFile({
      toolName: 'read',
      extension: args.format === 'markdown' && !pdf ? 'md' : 'txt',
      content: wrapUntrusted(text, origin),
    })
    const truncated = text.slice(0, TOOL_LIMITS.INLINE_PAGE_CONTENT_MAX_CHARS)
    return textResult(
      [
        wrapUntrusted(truncated, origin),
        `Content truncated at ${TOOL_LIMITS.INLINE_PAGE_CONTENT_MAX_CHARS} chars. Full content (${text.length} chars) saved to: ${path}`,
      ].join('\n\n'),
      {
        page: args.page,
        format: args.format,
        path,
        contentLength: text.length,
        writtenToFile: true,
        ...(pdf && { pdf }),
      },
    )
  },
})
