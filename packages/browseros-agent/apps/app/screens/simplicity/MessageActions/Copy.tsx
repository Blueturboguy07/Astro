import { Check, ClipboardList } from 'lucide-react'
import { useState } from 'react'
import type { Section } from '@/lib/simplicity/hooks/useChat'
import type { SourceBlock } from '@/lib/simplicity/types'

const Copy = ({
  section,
  initialMessage,
}: {
  section: Section
  initialMessage: string
}) => {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        const sources = section.message.responseBlocks.filter(
          (b) => b.type === 'source' && b.data.length > 0,
        ) as SourceBlock[]

        const contentToCopy = `${initialMessage}${
          sources.length > 0
            ? `\n\nCitations:\n${sources
                .flatMap((source) => source.data)
                .map(
                  (s, i) =>
                    `[${i + 1}] ${s.metadata.url.startsWith('file_id://') ? s.metadata.fileName || 'Uploaded File' : s.metadata.url}`,
                )
                .join(`\n`)}`
            : ''
        }`

        navigator.clipboard.writeText(contentToCopy)

        setCopied(true)
        setTimeout(() => setCopied(false), 1000)
      }}
      className="rounded-full p-2 text-black/70 transition duration-200 hover:bg-light-secondary hover:text-black dark:text-white/70 dark:hover:bg-dark-secondary dark:hover:text-white"
    >
      {copied ? <Check size={16} /> : <ClipboardList size={16} />}
    </button>
  )
}

export default Copy
