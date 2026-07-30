import type { FC } from 'react'
import ProductLogo from '@/assets/product_logo.svg'
import { cn } from '@/lib/utils'
import type { ChatMode } from '@/modules/chat/chat-types'

export interface ChatEmptyStateProps {
  mode: ChatMode
  mounted: boolean
  onSuggestionClick: (suggestion: string) => void
}

/**
 * Comet's assistant panel opens to just a mark and the word "Assistant" — no
 * tagline and no suggestion chips. The mode-specific copy and the prompt
 * suggestions that used to live here were removed deliberately: the composer
 * below already states the mode, so repeating it mid-panel was duplicate
 * chrome competing with the empty canvas.
 *
 * `mode` and `onSuggestionClick` stay in the props so callers are unchanged and
 * suggestions can be restored without touching Chat.tsx.
 */
export const ChatEmptyState: FC<ChatEmptyStateProps> = ({ mounted }) => (
  <div
    className={cn(
      'm-0! flex h-full flex-col items-center justify-center gap-4 text-center transition-all duration-700',
      mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
    )}
  >
    <img src={ProductLogo} alt="" className="h-16 w-16 opacity-90" />
    <h2 className="font-semibold text-muted-foreground text-xl">Assistant</h2>
  </div>
)
