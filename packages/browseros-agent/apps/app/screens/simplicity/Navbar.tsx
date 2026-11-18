import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react'
import jsPDF from 'jspdf'
import { Clock, Edit, FileDown, FileText, Share } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { type Section, useChat } from '@/lib/simplicity/hooks/useChat'
import type { SourceBlock } from '@/lib/simplicity/types'
import { formatTimeDifference } from '@/lib/simplicity/utils'
import DeleteChat from './DeleteChat'
import {
  answerMarkdown,
  exportFileName,
  writeThreadPdf,
} from './thread-export'

const downloadFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}

const sourceUrls = (section: Section): string[] => {
  const block = section.message.responseBlocks.find(
    (b) => b.type === 'source',
  ) as SourceBlock | undefined
  return (block?.data ?? []).map((src: any) => src.metadata?.url || '')
}

/* "Exported on" said the chat's start time (Astro 0.2.4 QA, F-063). */
const exportAsMarkdown = (sections: Section[], title: string) => {
  let md = `# 💬 Chat Export: ${title}\n\n`
  md += `*Exported on: ${new Date().toLocaleString()}*\n\n---\n`

  sections.forEach((section) => {
    md += `\n---\n`
    md += `**🧑 User**  \n`
    md += `*${new Date(section.message.createdAt).toLocaleString()}*\n\n`
    md += `> ${section.message.query.replace(/\n/g, '\n> ')}\n`

    if (section.message.responseBlocks.length > 0) {
      md += `\n---\n`
      md += `**🤖 Assistant**  \n`
      md += `*${new Date(section.message.createdAt).toLocaleString()}*\n\n`
      md += `> ${answerMarkdown(section.message.responseBlocks).replace(/\n/g, '\n> ')}\n`
    }

    const urls = sourceUrls(section)
    if (urls.length > 0) {
      md += `\n**Citations:**\n`
      urls.forEach((url, i) => {
        md += `- [${i + 1}] [${url}](${url})\n`
      })
    }
  })
  md += '\n---\n'
  downloadFile(exportFileName(title, 'md'), md, 'text/markdown')
}

const exportAsPDF = (sections: Section[], title: string) => {
  const doc = new jsPDF()
  writeThreadPdf(doc, {
    title,
    exportedAt: new Date(),
    turns: sections.map((section) => ({
      query: section.message.query,
      askedAt: new Date(section.message.createdAt),
      answer: answerMarkdown(section.message.responseBlocks),
      sources: sourceUrls(section),
    })),
  })
  doc.save(exportFileName(title, 'pdf'))
}

const Navbar = () => {
  const [title, setTitle] = useState<string>('')
  const [timeAgo, setTimeAgo] = useState<string>('')

  const { sections, chatId, startNewChat } = useChat()

  useEffect(() => {
    if (sections.length > 0 && sections[0].message) {
      const newTitle =
        sections[0].message.query.length > 30
          ? `${sections[0].message.query.substring(0, 30).trim()}...`
          : sections[0].message.query || 'New Conversation'

      setTitle(newTitle)
      const newTimeAgo = formatTimeDifference(
        new Date(),
        sections[0].message.createdAt,
      )
      setTimeAgo(newTimeAgo)
    }
  }, [sections])

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (sections.length > 0 && sections[0].message) {
        const newTimeAgo = formatTimeDifference(
          new Date(),
          sections[0].message.createdAt,
        )
        setTimeAgo(newTimeAgo)
      }
    }, 1000)

    return () => clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections[0].message.createdAt, sections[0].message, sections.length])

  return (
    <div className="sticky top-0 z-40 -mx-4 border-light-200/50 border-b bg-light-primary/95 backdrop-blur-sm lg:mx-0 dark:border-dark-200/30 dark:bg-dark-primary/95">
      <div className="px-4 py-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center">
            <a
              href="/"
              className="mr-3 -ml-2 rounded-lg p-2 transition-colors duration-200 hover:bg-light-secondary lg:hidden dark:hover:bg-dark-secondary"
            >
              <Edit size={18} className="text-black/70 dark:text-white/70" />
            </a>
            <div className="hidden min-w-0 items-center gap-2 text-black/50 lg:flex dark:text-white/50">
              <Clock size={14} />
              <span className="whitespace-nowrap text-xs">{timeAgo} ago</span>
            </div>
          </div>

          <div className="mx-4 min-w-0 flex-1">
            <h1 className="truncate text-center font-medium text-black/80 text-sm dark:text-white/90">
              {title || 'New Conversation'}
            </h1>
          </div>

          <div className="flex min-w-0 items-center gap-1">
            <Popover className="relative">
              <PopoverButton
                aria-label="Export chat"
                title="Export chat"
                className="rounded-lg p-2 transition-colors duration-200 hover:bg-light-secondary dark:hover:bg-dark-secondary"
              >
                <Share size={16} className="text-black/60 dark:text-white/60" />
              </PopoverButton>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-1"
              >
                <PopoverPanel className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-2xl border border-light-200 bg-light-primary shadow-black/10 shadow-xl dark:border-dark-200 dark:bg-dark-primary dark:shadow-black/30">
                  <div className="p-3">
                    <div className="mb-2">
                      <p className="font-medium text-black/40 text-xs uppercase tracking-wide dark:text-white/40">
                        Export Chat
                      </p>
                    </div>
                    <div className="space-y-1">
                      <button
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-200 hover:bg-light-secondary dark:hover:bg-dark-secondary"
                        onClick={() => exportAsMarkdown(sections, title || '')}
                      >
                        <FileText size={16} className="text-[#24A0ED]" />
                        <div>
                          <p className="font-medium text-black text-sm dark:text-white">
                            Markdown
                          </p>
                          <p className="text-black/50 text-xs dark:text-white/50">
                            .md format
                          </p>
                        </div>
                      </button>
                      <button
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-200 hover:bg-light-secondary dark:hover:bg-dark-secondary"
                        onClick={() => exportAsPDF(sections, title || '')}
                      >
                        <FileDown size={16} className="text-[#24A0ED]" />
                        <div>
                          <p className="font-medium text-black text-sm dark:text-white">
                            PDF
                          </p>
                          <p className="text-black/50 text-xs dark:text-white/50">
                            Document format
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                </PopoverPanel>
              </Transition>
            </Popover>
            <DeleteChat
              redirect
              onLeave={startNewChat}
              chatId={chatId!}
              chats={[]}
              setChats={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Navbar
