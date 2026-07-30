import { Clock, MoreHorizontal, Plus, Settings } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface PanelOverflowMenuProps {
  onNewConversation: () => void
}

/**
 * The assistant panel's only chrome.
 *
 * Comet's panel has no header bar — just an overflow affordance in the top
 * corner — so the previous ChatHeader (brand mark, credits counter, provider
 * picker, new-chat, history, GitHub star and settings, all as a full-width bar)
 * collapses to this. Nothing was dropped except the GitHub star; provider
 * selection moved into the composer, where Comet puts it.
 *
 * ChatHeader itself is untouched because the new tab still renders it.
 */
export const PanelOverflowMenu: FC<PanelOverflowMenuProps> = ({
  onNewConversation,
}) => {
  const navigate = useNavigate()

  return (
    <div className="absolute top-2 right-2 z-30">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onNewConversation}>
            <Plus className="size-4" />
            New conversation
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/history')}>
            <Clock className="size-4" />
            History
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => window.open('/app.html#/settings', '_blank')}
          >
            <Settings className="size-4" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
