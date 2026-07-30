'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import MessageBox from './MessageBox'
import MessageInput from './MessageInput'

const Chat = () => {
  const { sections, messages } = useChat()

  const [dividerWidth, setDividerWidth] = useState(0)
  const dividerRef = useRef<HTMLDivElement | null>(null)
  const messageEnd = useRef<HTMLDivElement | null>(null)
  const lastScrolledRef = useRef<number>(0)

  useEffect(() => {
    const updateDividerWidth = () => {
      if (dividerRef.current) {
        setDividerWidth(dividerRef.current.offsetWidth)
      }
    }

    updateDividerWidth()

    const resizeObserver = new ResizeObserver(() => {
      updateDividerWidth()
    })

    const currentRef = dividerRef.current
    if (currentRef) {
      resizeObserver.observe(currentRef)
    }

    window.addEventListener('resize', updateDividerWidth)

    return () => {
      if (currentRef) {
        resizeObserver.unobserve(currentRef)
      }
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateDividerWidth)
    }
  }, [])

  useEffect(() => {
    const scroll = () => {
      messageEnd.current?.scrollIntoView({ behavior: 'auto' })
    }

    if (messages.length === 1) {
      document.title = `${messages[0].query.substring(0, 30)} - Astro`
    }

    if (sections.length > lastScrolledRef.current) {
      scroll()
      lastScrolledRef.current = sections.length
    }
  }, [messages, sections.length])

  return (
    <div className="flex flex-col space-y-6 pt-8 pb-44 sm:mx-4 md:mx-8 lg:pb-28">
      {sections.map((section, i) => {
        const isLast = i === sections.length - 1

        return (
          <Fragment key={section.message.messageId}>
            <MessageBox
              section={section}
              sectionIndex={i}
              dividerRef={isLast ? dividerRef : undefined}
              isLast={isLast}
            />
            {!isLast && (
              <div className="h-px w-full bg-light-secondary dark:bg-dark-secondary" />
            )}
          </Fragment>
        )
      })}
      {/* The loading state lives inside the last MessageBox now (in the answer
          slot, where the text will appear) rather than as a detached skeleton
          under the thread — see AnswerPending in MessageBox.tsx. */}
      <div ref={messageEnd} className="h-0" />
      {dividerWidth > 0 && (
        <div
          className="fixed bottom-24 z-40 lg:bottom-6"
          style={{ width: dividerWidth }}
        >
          <div
            className="pointer-events-none absolute right-0 -bottom-6 left-0 h-[calc(100%+24px+24px)] dark:hidden"
            style={{
              background:
                'linear-gradient(to top, #ffffff 0%, #ffffff 35%, rgba(255,255,255,0.95) 45%, rgba(255,255,255,0.85) 55%, rgba(255,255,255,0.7) 65%, rgba(255,255,255,0.5) 75%, rgba(255,255,255,0.3) 85%, rgba(255,255,255,0.1) 92%, transparent 100%)',
            }}
          />
          <div
            className="pointer-events-none absolute right-0 -bottom-6 left-0 hidden h-[calc(100%+24px+24px)] dark:block"
            style={{
              background:
                'linear-gradient(to top, #0d1117 0%, #0d1117 35%, rgba(13,17,23,0.95) 45%, rgba(13,17,23,0.85) 55%, rgba(13,17,23,0.7) 65%, rgba(13,17,23,0.5) 75%, rgba(13,17,23,0.3) 85%, rgba(13,17,23,0.1) 92%, transparent 100%)',
            }}
          />
          <MessageInput />
        </div>
      )}
    </div>
  )
}

export default Chat
