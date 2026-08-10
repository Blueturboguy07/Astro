'use client'

import { useChat } from '@/lib/simplicity/hooks/useChat'
import type { Block } from '@/lib/simplicity/types'
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

  if (hasError) {
    return (
      <div className="relative">
        <div className="absolute mt-5 mr-5 flex w-full flex-row items-center justify-end">
          <SettingsButtonMobile />
        </div>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-sm text-black/70 text-sm dark:text-white/70">
            {connectionErrorMessage ??
              "Can't reach the local Astro server. It may still be starting, or it may have failed to start."}
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
