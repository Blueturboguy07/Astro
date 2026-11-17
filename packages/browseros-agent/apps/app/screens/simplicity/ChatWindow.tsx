'use client'

import { useEffect, useRef } from 'react'
import {
  syncPublikProviders,
  usePublikAccount,
  usePublikMoney,
} from '@/lib/publik/useGate'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import { pageTitle } from '@/lib/simplicity/page-title'
import type { Block } from '@/lib/simplicity/types'
import { PublikMoneyBanner } from '@/screens/simplicity/Publik/PublikCard'
import Chat from './Chat'
import EmptyChat from './EmptyChat'
import Navbar from './Navbar'
import { NotFound } from './NotFound'
import SettingsButtonMobile from './Settings/SettingsButtonMobile'
import Loader from './ui/Loader'

export interface BaseMessage {
  chatId: string
  messageId: string
  createdAt: Date
}

export interface Message extends BaseMessage {
  backendId: string
  query: string
  responseBlocks: Block[]
  /* 'cancelled': Stop, or the page reloaded and the server stopped. */
  status: 'answering' | 'completed' | 'error' | 'cancelled'
}

export interface File {
  fileName: string
  fileExtension: string
  fileId: string
}

export interface Widget {
  widgetType: string
  params: Record<string, any>
}

const ChatWindow = () => {
  const { hasError, connectionErrorMessage, retryConnection, notFound, messages, isReady } =
    useChat()
  const { money, dismiss } = usePublikMoney()
  const { choice } = usePublikAccount()

  /* An empty home (New, or a deleted chat) is "Astro", not the last chat. */
  useEffect(() => {
    if (messages.length === 0) document.title = pageTitle()
  }, [messages.length])

  /* "Can't reach the local Astro server" stayed until Retry was pressed,
     also when the server came up seconds later. Try again every 5 s for
     2 minutes (Astro 0.2.4 QA, F-031). Not for "no connection yet". */
  const retryRef = useRef(retryConnection)
  retryRef.current = retryConnection
  const tries = useRef(0)
  const noConnectionYet = /no chat model/i.test(connectionErrorMessage ?? '')
  /* With "Connect your plan" chosen, "no connection yet" is a write that
     has not landed (the local server was starting): ask the background to
     write it again and look again (F-078). With "Use my own key" it is the
     real state, so no retry. */
  const waitForPublik = noConnectionYet && choice === 'publik'
  useEffect(() => {
    if (isReady) tries.current = 0
  }, [isReady])
  useEffect(() => {
    if (!hasError || (noConnectionYet && !waitForPublik) || tries.current >= 24)
      return
    if (waitForPublik) syncPublikProviders()
    const timer = setTimeout(() => {
      tries.current += 1
      retryRef.current({ quiet: true })
    }, 5_000)
    return () => clearTimeout(timer)
  }, [hasError, noConnectionYet, waitForPublik])

  if (hasError) {
    /* The local server lists no providers: the person chose "Use my own
       key" at the gate and has not added one yet, or the server was still
       starting when "Connect your plan" was applied (Settings asks the
       background to apply it again). */
    const noProviders = /no chat model/i.test(connectionErrorMessage ?? '')
    return (
      <div className="relative">
        <div className="absolute mt-5 mr-5 flex w-full flex-row items-center justify-end">
          <SettingsButtonMobile />
        </div>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-sm text-black/70 text-sm dark:text-white/70">
            {noProviders
              ? 'No AI connection yet. Connect your publik plan or add your own key in Settings (the gear at the bottom left).'
              : (connectionErrorMessage ??
                "Can't reach the local Astro server. It may still be starting, or it may have failed to start.")}
          </p>
          <button
            type="button"
            onClick={() => retryConnection()}
            className="cursor-pointer rounded-full bg-light-200 px-4 py-2 font-medium text-black/70 text-sm transition duration-200 hover:opacity-70 active:scale-95 dark:bg-dark-200 dark:text-white/70"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return isReady ? (
    notFound ? (
      <NotFound />
    ) : (
      <div>
        {money && (
          /* The gateway's 402: its message plus exactly one link. */
          <div className="mx-auto w-full max-w-screen-md px-4 pt-4">
            <PublikMoneyBanner money={money} onDismiss={dismiss} />
          </div>
        )}
        {messages.length > 0 ? (
          <>
            <Navbar />
            <Chat />
          </>
        ) : (
          <EmptyChat />
        )}
      </div>
    )
  ) : (
    <div className="flex min-h-screen w-full items-center justify-center">
      <Loader />
    </div>
  )
}

export default ChatWindow
