'use client'

import { usePublikMoney } from '@/lib/publik/useGate'
import { useChat } from '@/lib/simplicity/hooks/useChat'
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
  status: 'answering' | 'completed' | 'error'
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
              ? 'No AI connection yet. Connect your publik plan or add your own key in Settings.'
              : (connectionErrorMessage ??
                "Can't reach the local Astro server. It may still be starting, or it may have failed to start.")}
          </p>
          <button
            type="button"
            onClick={retryConnection}
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
