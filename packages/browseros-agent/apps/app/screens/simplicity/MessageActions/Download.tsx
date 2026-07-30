import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import {
  Download as DownloadIcon,
  FileText,
  Printer,
  Table2,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import type { Chunk } from '@/lib/simplicity/types'
import {
  hasMarkdownTable,
  markdownTablesToCsv,
} from '@/lib/simplicity/utils/markdownTables'

/* Clean, self-contained print stylesheet for the PDF export — no chrome
   (nav, composer, sidebar) is present at all since only the answer's own
   rendered HTML is injected into the popup, and this stylesheet restyles
   that plain semantic markup (h1-h4/p/pre/table/...) rather than relying on
   the app's Tailwind classes, which don't exist in the popup document. */
const PRINT_STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #18181b;
    background: #fff;
    margin: 0;
    padding: 2.5rem 3rem;
  }
  article { max-width: 720px; margin: 0 auto; }
  h1, h2, h3, h4 {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 600;
    color: #111;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }
  h1 { font-size: 1.9rem; margin-top: 0; }
  h2 { font-size: 1.4rem; }
  h3 { font-size: 1.15rem; }
  p { line-height: 1.7; margin: 0.75em 0; }
  a { color: #0369a1; text-decoration: underline; }
  ul, ol { line-height: 1.7; }
  pre {
    background: #f4f4f5;
    border: 1px solid #e4e4e7;
    border-radius: 6px;
    padding: 0.75rem 1rem;
    overflow-x: auto;
    font-size: 0.85rem;
  }
  code { font-family: 'SFMono-Regular', Menlo, Consolas, monospace; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #d4d4d8; padding: 0.4rem 0.6rem; text-align: left; }
  blockquote { border-left: 3px solid #d4d4d8; margin: 1em 0; padding-left: 1em; color: #444; }
  button, [role="button"] { display: none !important; }
  @media print {
    body { padding: 0; }
    a { color: #111; text-decoration: none; }
  }
`

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const slugify = (text: string) => {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)

  return slug || 'answer'
}

const downloadBlob = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/* `markdown` is the RAW answer text (pre citation-annotation, i.e. the same
   source MessageBox.tsx feeds into annotateCitations) — plain `[1]`/`[2]`
   markers are legible in a downloaded .md file; the `<citation>` custom
   tags the renderer produces are not. `sources` mirrors what Copy.tsx
   already does for its clipboard "Citations:" list, just formatted as a
   proper Markdown section here. */
const Download = ({
  query,
  markdown,
  sources,
  messageId,
}: {
  query: string
  markdown: string
  sources: Chunk[]
  messageId: string
}) => {
  const showCsv = hasMarkdownTable(markdown)

  const handleMarkdown = () => {
    const sourceLines = sources.map((s, i) => {
      const isFile = s.metadata?.url?.startsWith('file_id://')
      const title =
        s.metadata?.title ||
        (isFile ? s.metadata?.fileName : undefined) ||
        `Source ${i + 1}`
      const url = isFile
        ? s.metadata?.fileName || 'Uploaded file'
        : s.metadata?.url || ''

      return `${i + 1}. ${title}${url && url !== title ? ` — ${url}` : ''}`
    })

    const content = `# ${query}\n\n${markdown}${
      sourceLines.length > 0
        ? `\n\n## Sources\n\n${sourceLines.join('\n')}`
        : ''
    }\n`

    downloadBlob(content, `${slugify(query)}.md`, 'text/markdown')
  }

  const handlePdf = () => {
    const container = document.getElementById(`answer-content-${messageId}`)
    const bodyHtml = container?.innerHTML ?? escapeHtml(markdown)

    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      toast.error('Could not open the print window — check your popup blocker.')
      return
    }

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(query)}</title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>
    <article>
      <h1>${escapeHtml(query)}</h1>
      ${bodyHtml}
    </article>
  </body>
</html>`)
    printWindow.document.close()

    printWindow.onload = () => {
      printWindow.focus()
      printWindow.print()
    }
  }

  const handleCsv = () => {
    const csv = markdownTablesToCsv(markdown)
    downloadBlob(csv, `${slugify(query)}-tables.csv`, 'text/csv')
  }

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <PopoverButton
            aria-label="Export answer"
            className="rounded-full p-2 text-black/70 transition duration-200 hover:bg-light-secondary hover:text-black dark:text-white/70 dark:hover:bg-dark-secondary dark:hover:text-white"
          >
            <DownloadIcon size={16} />
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel static className="absolute right-0 z-20 w-52">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="flex w-full origin-top-right flex-col rounded-lg border border-light-200 bg-light-primary p-1 shadow-lg dark:border-dark-200 dark:bg-dark-primary"
                >
                  <button
                    type="button"
                    onClick={() => {
                      handleMarkdown()
                      close()
                    }}
                    className="flex w-full flex-row items-center space-x-2 rounded-md px-2 py-2.5 text-left text-black/80 hover:bg-light-100 dark:text-white/80 hover:dark:bg-dark-100"
                  >
                    <FileText size={15} />
                    <span className="text-xs">Markdown (.md)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handlePdf()
                      close()
                    }}
                    className="flex w-full flex-row items-center space-x-2 rounded-md px-2 py-2.5 text-left text-black/80 hover:bg-light-100 dark:text-white/80 hover:dark:bg-dark-100"
                  >
                    <Printer size={15} />
                    <span className="text-xs">PDF</span>
                  </button>
                  {showCsv && (
                    <button
                      type="button"
                      onClick={() => {
                        handleCsv()
                        close()
                      }}
                      className="flex w-full flex-row items-center space-x-2 rounded-md px-2 py-2.5 text-left text-black/80 hover:bg-light-100 dark:text-white/80 hover:dark:bg-dark-100"
                    >
                      <Table2 size={15} />
                      <span className="text-xs">CSV (tables)</span>
                    </button>
                  )}
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  )
}

export default Download
