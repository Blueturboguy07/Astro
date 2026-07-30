import type { FC } from 'react'
import { Outlet } from 'react-router'
import {
  ChatSessionProvider,
  useChatSessionContext,
} from '@/modules/chat/chat-session-context'
import { PanelOverflowMenu } from '@/screens/sidepanel/index/PanelOverflowMenu'

const ChatLayoutContent: FC = () => {
  const { selectedProvider, resetConversation, isLoading } =
    useChatSessionContext()

  if (isLoading || !selectedProvider) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    )
  }

  return (
    /* No header bar — the overflow menu floats over the canvas instead, so the
       panel opens to empty space the way Comet's does. */
    <div className="relative mx-auto flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <PanelOverflowMenu onNewConversation={resetConversation} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}

export const ChatLayout: FC = () => {
  return (
    <ChatSessionProvider>
      <ChatLayoutContent />
    </ChatSessionProvider>
  )
}
