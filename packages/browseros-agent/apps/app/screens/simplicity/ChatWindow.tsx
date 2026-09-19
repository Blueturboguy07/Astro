'use client'

import { usePublikStatus } from '@/lib/publik/status'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import type { Block } from '@/lib/simplicity/types'
import PublikCard, { PublikBanner } from '@/screens/simplicity/Publik/PublikCard'
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
  const publik = usePublikStatus()

  if (hasError) {
    /* A fresh packaged install lands here: the server is up but lists no
       providers yet. The publik card is the way in — "Continue" mints the
       key, registers the connection and reloads the chat (CONTRACT §12.1). */
    const noProviders = /no chat model/i.test(connectionErrorMessage ?? '')
    const showPublik =
      publik.status.available &&
      noProviders &&
      publik.status.state !== 'declined'
    return (
      <div className="relative">
        <div className="absolute mt-5 mr-5 flex w-full flex-row items-center justify-end">
          <SettingsButtonMobile />
        </div>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          {showPublik && (
            <div className="w-full max-w-screen-sm text-left">
              <PublikCard publik={publik} onProvisioned={retryConnection} />
            </div>
          )}
          <p className="max-w-sm text-black/70 text-sm dark:text-white/70">
            {showPublik
              ? 'Or add a connection of your own in Settings.'
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
        {publik.status.available && publik.status.creditError && (
          /* The gateway's 402, with the one link its body carried
             (CONTRACT §1, §12.3). Non-blocking: the chat stays usable with
             a connection of the user's own. */
          <div className="mx-auto w-full max-w-screen-md px-4 pt-4">
            <PublikBanner status={publik.status} />
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
