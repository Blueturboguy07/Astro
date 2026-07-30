'use client'

import {
  CornerDownRight,
  Disc3,
  Layers3,
  Plus,
  StopCircle,
  Volume2,
} from 'lucide-react'
import Markdown, { type MarkdownToJSX, RuleType } from 'markdown-to-jsx'
/* eslint-disable @next/next/no-img-element */
import type React from 'react'
import type { MutableRefObject } from 'react'
import { useSpeech } from 'react-text-to-speech'
import { type Section, useChat } from '@/lib/simplicity/hooks/useChat'
import type {
  CouncilBlock,
  ResearchBlock,
  TextBlock,
  UsageBlock,
} from '@/lib/simplicity/types'
import { cn } from '@/lib/simplicity/utils'
import AnswerTabs from './AnswerTabs'
import AssistantSteps from './AssistantSteps'
import Copy from './MessageActions/Copy'
import Download from './MessageActions/Download'
import Rewrite from './MessageActions/Rewrite'
import MessageBoxLoading from './MessageBoxLoading'
import Citation from './MessageRenderer/Citation'
import CodeBlock from './MessageRenderer/CodeBlock'
import CouncilBlockRenderer from './MessageRenderer/CouncilBlock'
import { annotateCitations } from './MessageRenderer/citationParser'
import UsageLine from './MessageRenderer/UsageLine'
import SearchImages from './SearchImages'
import SearchVideos from './SearchVideos'
import ThinkBox from './ThinkBox'
import Renderer from './Widgets/Renderer'

/* Shown wherever the answer text will land, for as long as the turn is
   running with nothing written yet — the gap between "research done" and the
   writer's first token is otherwise completely silent. */
const AnswerPending = ({ label }: { label: string | null }) => (
  <div className="flex flex-col space-y-3">
    {label && (
      <div className="flex flex-row items-center space-x-2">
        <Disc3 className="h-4 w-4 animate-spin text-black/50 dark:text-white/50" />
        <span className="animate-pulse text-black/60 text-sm dark:text-white/60">
          {label}...
        </span>
      </div>
    )}
    <MessageBoxLoading />
  </div>
)

const ThinkTagProcessor = ({
  children,
  thinkingEnded,
}: {
  children: React.ReactNode
  thinkingEnded: boolean
}) => {
  return <ThinkBox content={children as string} thinkingEnded={thinkingEnded} />
}

const MessageBox = ({
  section,
  sectionIndex,
  dividerRef,
  isLast,
}: {
  section: Section
  sectionIndex: number
  dividerRef?: MutableRefObject<HTMLDivElement | null>
  isLast: boolean
}) => {
  const {
    loading,
    sendMessage,
    rewrite,
    messages,
    researchEnded,
    chatHistory,
  } = useChat()

  const parsedMessage = section.parsedTextBlocks.join('\n\n')
  const speechMessage = section.speechMessage || ''
  const thinkingEnded = section.thinkingEnded

  const sourceBlocks = section.message.responseBlocks.filter(
    (block): block is typeof block & { type: 'source' } =>
      block.type === 'source',
  )

  const sources = sourceBlocks.flatMap((block) => block.data)

  const hasContent = section.parsedTextBlocks.length > 0

  const usageBlock = section.message.responseBlocks.find(
    (block): block is UsageBlock => block.type === 'usage',
  )

  const councilBlock = section.message.responseBlocks.find(
    (block): block is CouncilBlock => block.type === 'council',
  )

  // Citation rendering reads from the *raw* text blocks rather than
  // section.parsedTextBlocks: useChat's own citation regex can mangle
  // non-citation bracket content (e.g. "[10,000-40,000]") on its way to
  // parsedTextBlocks, and there's no way to recover the original characters
  // once that's happened. Working from the untouched raw text lets
  // annotateCitations apply a strictly-scoped, provably lossless transform
  // instead. The only bit of useChat's per-block logic worth mirroring here
  // is the unclosed-<think>-tag safety net, since that's what keeps a
  // streaming reasoning block from swallowing the rest of the message.
  const rawTextBlocks = section.message.responseBlocks.filter(
    (block): block is TextBlock => block.type === 'text',
  )

  const rawAnswerJoined = rawTextBlocks.map((block) => block.data).join('\n\n')

  /* Is the answer slot still blank? Neither `hasContent` nor `messageAppeared`
     can answer that: a reasoning model's first chunks arrive either as an
     empty text block (openaiLLM forwards `delta.content || ''`) or as <think>
     content that renders in its own collapsed box — both flip those flags
     while the place the answer goes is still empty. Strip reasoning (including
     an unterminated <think> that's still streaming) and see what's left. */
  const answerText = rawAnswerJoined
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '')
    .trim()

  const answerPending = isLast && loading && answerText.length === 0

  const hasResearchSteps = section.message.responseBlocks.some(
    (b) => b.type === 'research' && b.data.subSteps.length > 0,
  )

  /* While the steps card is live it already narrates what's happening, so the
     placeholder stays silent and shows only the shimmer. Once research ends
     (or never ran) the card goes quiet and the placeholder has to say why
     nothing is on screen yet. */
  const pendingLabel = !researchEnded
    ? hasResearchSteps
      ? null
      : 'Brainstorming'
    : thinkingEnded
      ? 'Writing answer'
      : 'Thinking'

  let rawAnswerText = rawAnswerJoined

  if (rawAnswerText.includes('<think>')) {
    const openThinkTag = rawAnswerText.match(/<think>/g)?.length || 0
    const closeThinkTag = rawAnswerText.match(/<\/think>/g)?.length || 0

    if (openThinkTag && !closeThinkTag) {
      rawAnswerText += '</think> <a> </a>'
    }
  }

  const answerMarkdown = annotateCitations(rawAnswerText, sources)

  const { speechStatus, start, stop } = useSpeech({ text: speechMessage })

  const markdownOverrides: MarkdownToJSX.Options = {
    renderRule(next, node, _renderChildren, state) {
      if (node.type === RuleType.codeInline) {
        return `\`${node.text}\``
      }

      if (node.type === RuleType.codeBlock) {
        return (
          <CodeBlock key={state.key} language={node.lang || ''}>
            {node.text}
          </CodeBlock>
        )
      }

      return next()
    },
    overrides: {
      think: {
        component: ThinkTagProcessor,
        props: {
          thinkingEnded: thinkingEnded,
        },
      },
      citation: {
        component: Citation,
        props: {
          sources,
        },
      },
    },
  }

  const answerBody = (
    <>
      {/* Identified by messageId so Download's PDF export can grab this
         rendered answer's actual innerHTML for the print window — it stays
         mounted (just CSS-hidden) even behind AnswerTabs' Links/Images tabs,
         see AnswerTabs.tsx. */}
      <div id={`answer-content-${section.message.messageId}`}>
        <Markdown
          className={cn(
            'prose dark:prose-invert prose-h2:mt-6 prose-h3:mt-4 prose-h1:mb-3 prose-h2:mb-2 prose-h3:mb-1.5 prose-pre:p-0 font-[400] prose-h1:font-serif prose-h2:font-serif prose-h3:font-[600] prose-p:leading-relaxed',
            'max-w-none break-words text-black dark:text-white',
          )}
          options={markdownOverrides}
        >
          {answerMarkdown}
        </Markdown>
      </div>

      {/* Deliberately outside the exported #answer-content div: a reasoning
          model streams <think> first, so this sits under the collapsed
          Thinking box until real prose starts. */}
      {answerPending && <AnswerPending label={pendingLabel} />}

      {loading && isLast ? null : (
        <div className="w-full py-4">
          {usageBlock && (
            <div className="mb-2 -ml-0.5">
              <UsageLine block={usageBlock} />
            </div>
          )}
          <div className="flex w-full flex-row items-center justify-between text-black dark:text-white">
            <div className="-ml-2 flex flex-row items-center">
              <Rewrite
                rewrite={rewrite}
                messageId={section.message.messageId}
              />
            </div>
            <div className="-mr-2 flex flex-row items-center">
              <Copy initialMessage={parsedMessage} section={section} />
              <Download
                query={section.message.query}
                markdown={rawAnswerText}
                sources={sources}
                messageId={section.message.messageId}
              />
              <button
                onClick={() => {
                  if (speechStatus === 'started') {
                    stop()
                  } else {
                    start()
                  }
                }}
                className="rounded-full p-2 text-black/70 transition duration-200 hover:bg-light-secondary hover:text-black dark:text-white/70 dark:hover:bg-dark-secondary dark:hover:text-white"
              >
                {speechStatus === 'started' ? (
                  <StopCircle size={16} />
                ) : (
                  <Volume2 size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className="space-y-6">
      <div className={'w-full break-words pt-8'}>
        <h2 className="font-medium text-3xl text-black lg:w-9/12 dark:text-white">
          {section.message.query}
        </h2>
      </div>

      <div className="flex flex-col space-y-9 lg:flex-row lg:justify-between lg:space-x-9 lg:space-y-0">
        <div
          ref={dividerRef}
          className="flex w-full flex-col space-y-6 lg:w-9/12"
        >
          {section.message.responseBlocks
            .filter(
              (block): block is ResearchBlock =>
                block.type === 'research' && block.data.subSteps.length > 0,
            )
            .map((researchBlock) => (
              <div key={researchBlock.id} className="flex flex-col space-y-2">
                <AssistantSteps
                  block={researchBlock}
                  status={section.message.status}
                  isLast={isLast}
                />
              </div>
            ))}

          {councilBlock && (
            <div className="flex flex-col space-y-2">
              <CouncilBlockRenderer block={councilBlock} />
            </div>
          )}

          {/* A failed turn stays visibly failed — the toast alone disappears
              and leaves a blank answer behind. */}
          {section.message.responseBlocks
            .filter((block) => block.type === 'error')
            .map((block) => (
              <div
                key={block.id}
                className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4"
              >
                <div className="flex-1">
                  <p className="font-medium text-red-600 text-sm dark:text-red-400">
                    This answer failed
                  </p>
                  <p className="mt-1 text-black/70 text-sm dark:text-white/70">
                    {String(block.data)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => rewrite(section.message.messageId)}
                  className="shrink-0 rounded-lg bg-light-secondary px-3 py-1.5 font-medium text-black text-xs transition hover:bg-light-200 dark:bg-dark-secondary dark:text-white dark:hover:bg-dark-200"
                >
                  Retry
                </button>
              </div>
            ))}

          {section.widgets.length > 0 && <Renderer widgets={section.widgets} />}

          {/* No text block at all yet — nothing renders the answer slot, so the
              placeholder stands in for it here. Once a block exists (even an
              empty or reasoning-only one) the copy inside answerBody takes
              over, which keeps it inside the Answer tab. */}
          {answerPending && !hasContent && (
            <AnswerPending label={pendingLabel} />
          )}

          {hasContent && (
            <div className="flex flex-col space-y-2">
              {sources.length > 0 ? (
                <AnswerTabs
                  sources={sources}
                  query={section.message.query}
                  chatHistory={chatHistory}
                  messageId={section.message.messageId}
                >
                  {answerBody}
                </AnswerTabs>
              ) : (
                answerBody
              )}

              {isLast &&
                section.suggestions &&
                section.suggestions.length > 0 &&
                hasContent &&
                !loading && (
                  <div className="mt-6">
                    <div className="mb-4 flex flex-row items-center space-x-2">
                      <Layers3
                        className="text-black dark:text-white"
                        size={20}
                      />
                      <h3 className="font-medium text-black text-xl dark:text-white">
                        Related
                      </h3>
                    </div>
                    <div className="space-y-0">
                      {section.suggestions.map(
                        (suggestion: string, i: number) => (
                          <div key={i}>
                            <div className="h-px bg-light-200/40 dark:bg-dark-200/40" />
                            <button
                              onClick={() => sendMessage(suggestion)}
                              className="group w-full py-4 text-left transition-colors duration-200"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex flex-row items-center space-x-3">
                                  <CornerDownRight
                                    size={15}
                                    className="flex-shrink-0 transition-colors duration-200 group-hover:text-sky-400"
                                  />
                                  <p className="text-black/70 text-sm leading-relaxed transition-colors duration-200 group-hover:text-sky-400 dark:text-white/70">
                                    {suggestion}
                                  </p>
                                </div>
                                <Plus
                                  size={16}
                                  className="flex-shrink-0 text-black/40 transition-colors duration-200 group-hover:text-sky-400 dark:text-white/40"
                                />
                              </div>
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {hasContent && (
          <div className="z-30 flex h-full w-full flex-col items-center space-y-3 pb-4 lg:sticky lg:top-20 lg:w-3/12">
            <SearchImages
              query={section.message.query}
              chatHistory={chatHistory}
              messageId={section.message.messageId}
            />
            <SearchVideos
              chatHistory={chatHistory}
              query={section.message.query}
              messageId={section.message.messageId}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageBox
