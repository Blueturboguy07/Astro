'use client'

import {
  BookSearch,
  ChevronRight,
  FileText,
  Globe,
  Search,
  Sparkles,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import type {
  Chunk,
  ResearchBlock,
  ResearchBlockSubStep,
} from '@/lib/simplicity/types'

const pluralize = (count: number, singular: string) =>
  count === 1 ? singular : `${singular}s`

const getHost = (url?: string) => {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const faviconUrl = (host: string) =>
  `https://s2.googleusercontent.com/s2/favicons?domain=${host}&sz=32`

/* One-line gerund status shown under the collapsed header while research is
   still running -- always reflects whatever the *latest* subStep is doing. */
const getCurrentStepLabel = (step: ResearchBlockSubStep): string => {
  switch (step.type) {
    case 'reasoning':
      return step.reasoning || 'Thinking'
    case 'searching':
      return 'Searching the web'
    case 'search_results':
      return 'Reviewing search results'
    case 'reading':
      return 'Reading sources'
    case 'upload_searching':
      return 'Searching your files'
    case 'upload_search_results':
      return 'Reading your files'
    default:
      return 'Researching'
  }
}

/* Icon + label shown per row in the expanded step list. */
const getStepIcon = (step: ResearchBlockSubStep) => {
  switch (step.type) {
    case 'reasoning':
      return <Sparkles className="h-3.5 w-3.5" />
    case 'searching':
    case 'upload_searching':
      return <Search className="h-3.5 w-3.5" />
    case 'search_results':
      return <Globe className="h-3.5 w-3.5" />
    case 'reading':
      return <BookSearch className="h-3.5 w-3.5" />
    case 'upload_search_results':
      return <FileText className="h-3.5 w-3.5" />
    default:
      return null
  }
}

const getStepLabel = (step: ResearchBlockSubStep): string => {
  switch (step.type) {
    case 'reasoning':
      return step.reasoning || 'Thinking'
    case 'searching':
      return 'Searching'
    case 'search_results':
      return `Found ${step.reading.length} ${pluralize(step.reading.length, 'result')}`
    case 'reading':
      return 'Reading'
    case 'upload_searching':
      return 'Searching your files'
    case 'upload_search_results':
      return `Found ${step.results.length} ${pluralize(step.results.length, 'passage')}`
    default:
      return 'Researching'
  }
}

/* Exact search queries as verbatim chips -- the owner explicitly wants the
   real query text visible, not a paraphrase. */
const QueryChips = ({ queries }: { queries: string[] }) => (
  <div className="mt-1.5 flex flex-wrap gap-1.5">
    {queries.map((query, idx) => (
      <span
        key={idx}
        className="inline-flex items-center rounded-md border border-light-200 bg-light-100 px-2 py-1 font-mono text-[11px] text-black/70 dark:border-dark-200 dark:bg-dark-100 dark:text-white/70"
      >
        {query}
      </span>
    ))}
  </div>
)

/* Compact favicon row for search_results -- capped so a large result set
   doesn't turn into a wall of icons. */
const FaviconRow = ({ chunks }: { chunks: Chunk[] }) => {
  const withHost = chunks
    .map((chunk) => ({ chunk, host: getHost(chunk.metadata?.url) }))
    .filter((entry) => entry.host)

  const visible = withHost.slice(0, 8)
  const remaining = withHost.length - visible.length

  if (visible.length === 0) return null

  return (
    <div className="mt-1.5 flex items-center gap-1">
      {visible.map(({ chunk, host }, idx) => (
        <a
          key={idx}
          href={chunk.metadata.url}
          target="_blank"
          rel="noreferrer"
          title={chunk.metadata.title || host}
          className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-light-200 bg-light-100 transition-transform duration-150 hover:scale-110 dark:border-dark-200 dark:bg-dark-100"
        >
          <img
            src={faviconUrl(host)}
            alt=""
            className="h-3.5 w-3.5"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </a>
      ))}
      {remaining > 0 && (
        <span className="ml-0.5 text-[11px] text-black/50 dark:text-white/50">
          +{remaining} more
        </span>
      )}
    </div>
  )
}

/* Favicon + title rows for reading (quality mode scrapes) -- one line per
   page, unlike the compact icon-only row used for search_results. */
const ReadingList = ({ chunks }: { chunks: Chunk[] }) => (
  <div className="mt-1.5 space-y-1">
    {chunks.map((chunk, idx) => {
      const host = getHost(chunk.metadata?.url)
      const title = chunk.metadata?.title || host || 'Untitled'

      return (
        <a
          key={idx}
          href={chunk.metadata?.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-black/70 text-xs transition-colors duration-150 hover:text-teal-600 dark:text-white/70 dark:hover:text-teal-400"
        >
          {host && (
            <img
              src={faviconUrl(host)}
              alt=""
              className="h-3.5 w-3.5 flex-shrink-0 rounded-sm"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
          <span className="line-clamp-1">{title}</span>
        </a>
      )
    })}
  </div>
)

/* Uploaded-file passages have no favicon, just a title. */
const PassageList = ({ chunks }: { chunks: Chunk[] }) => (
  <div className="mt-1.5 space-y-1">
    {chunks.map((chunk, idx) => (
      <div
        key={idx}
        className="flex items-center gap-2 text-black/70 text-xs dark:text-white/70"
      >
        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-black/40 dark:text-white/40" />
        <span className="line-clamp-1">
          {chunk.metadata?.title ||
            chunk.metadata?.fileName ||
            'Untitled document'}
        </span>
      </div>
    ))}
  </div>
)

const AssistantSteps = ({
  block,
  status,
  isLast,
}: {
  block: ResearchBlock
  status: 'answering' | 'completed' | 'error'
  isLast: boolean
}) => {
  /* Perplexity-style default: collapsed, whether research is running or
     already done. The user has to click to see the full step list -- we
     never auto-expand or force-collapse out from under them. */
  const [isExpanded, setIsExpanded] = useState(false)
  const { researchEnded } = useChat()

  if (!block || block.data.subSteps.length === 0) return null

  const subSteps = block.data.subSteps
  const stepCount = subSteps.length
  const isRunning = isLast && status === 'answering' && !researchEnded
  const lastStep = subSteps[stepCount - 1]

  const headerLabel = isRunning
    ? `Working · ${stepCount} ${pluralize(stepCount, 'step')} completed`
    : `Completed · ${stepCount} ${pluralize(stepCount, 'step')}`

  return (
    <div className="overflow-hidden rounded-lg border border-light-200 bg-light-secondary dark:border-dark-200 dark:bg-dark-secondary">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-3 transition duration-200 hover:bg-light-200 dark:hover:bg-dark-200"
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
            </span>
          ) : (
            <Sparkles className="h-4 w-4 text-black/40 dark:text-white/40" />
          )}
          <span className="font-medium text-black text-sm dark:text-white">
            {headerLabel}
          </span>
        </div>
        <ChevronRight
          className={`h-4 w-4 text-black/50 transition-transform duration-200 dark:text-white/50 ${
            isExpanded ? 'rotate-90' : ''
          }`}
        />
      </button>

      {!isExpanded && isRunning && lastStep && (
        <div className="-mt-1 flex items-center gap-2 px-3 pb-3">
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0 animate-pulse text-teal-600 dark:text-teal-400" />
          <span className="line-clamp-1 animate-pulse text-sm text-teal-600 dark:text-teal-400">
            {getCurrentStepLabel(lastStep)}
          </span>
        </div>
      )}

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-light-200 border-t dark:border-dark-200"
          >
            <div className="space-y-0 p-3">
              {subSteps.map((step, index) => {
                const isLastStep = index === stepCount - 1
                const isStreamingStep = isRunning && isLastStep

                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0 }}
                    className="flex gap-2.5"
                  >
                    <div className="-mt-0.5 flex flex-col items-center">
                      <div
                        className={`rounded-full bg-light-100 p-1.5 dark:bg-dark-100 ${
                          isStreamingStep
                            ? 'animate-pulse text-teal-600 dark:text-teal-400'
                            : 'text-black/50 dark:text-white/50'
                        }`}
                      >
                        {getStepIcon(step)}
                      </div>
                      {!isLastStep && (
                        <div className="mt-1.5 min-h-[20px] w-0.5 flex-1 bg-light-200 dark:bg-dark-200" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pb-3">
                      {step.type === 'reasoning' ? (
                        <p
                          className={`text-sm ${
                            isStreamingStep
                              ? 'text-teal-600 dark:text-teal-400'
                              : 'text-black/80 dark:text-white/80'
                          }`}
                        >
                          {getStepLabel(step)}
                        </p>
                      ) : (
                        <span className="font-medium text-black/80 text-sm dark:text-white/80">
                          {getStepLabel(step)}
                        </span>
                      )}

                      {step.type === 'searching' && (
                        <QueryChips queries={step.searching} />
                      )}
                      {step.type === 'upload_searching' && (
                        <QueryChips queries={step.queries} />
                      )}
                      {step.type === 'search_results' && (
                        <FaviconRow chunks={step.reading} />
                      )}
                      {step.type === 'reading' && (
                        <ReadingList chunks={step.reading} />
                      )}
                      {step.type === 'upload_search_results' && (
                        <PassageList chunks={step.results} />
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AssistantSteps
