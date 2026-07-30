'use client'

import { AlignLeft, Globe, Image as ImageIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { Chunk } from '@/lib/simplicity/types'
import { cn } from '@/lib/simplicity/utils'
import LinksPanel from './MessageRenderer/LinksPanel'
import SearchImages from './SearchImages'

type TabId = 'answer' | 'links' | 'images'

const TABS: { id: TabId; label: string; icon: typeof AlignLeft }[] = [
  { id: 'answer', label: 'Answer', icon: AlignLeft },
  { id: 'links', label: 'Links', icon: Globe },
  { id: 'images', label: 'Images', icon: ImageIcon },
]

/**
 * Perplexity-style Answer / Links / Images tab bar shown above a completed
 * answer once research has produced sources. The Answer pane (passed in as
 * `children`) is always kept mounted -- only hidden via CSS -- so switching
 * tabs never interrupts streaming or loses scroll/selection state. The
 * Images pane mounts (and fetches) lazily the first time it's opened, then
 * stays mounted so flipping back and forth doesn't refetch.
 */
const AnswerTabs = ({
  sources,
  query,
  chatHistory,
  messageId,
  children,
}: {
  sources: Chunk[]
  query: string
  chatHistory: [string, string][]
  messageId: string
  children: ReactNode
}) => {
  const [active, setActive] = useState<TabId>('answer')
  const [imagesOpened, setImagesOpened] = useState(false)

  const selectTab = (id: TabId) => {
    setActive(id)
    if (id === 'images') setImagesOpened(true)
  }

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center gap-5 border-light-200 border-b dark:border-dark-200">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              className={cn(
                'relative flex items-center gap-1.5 pt-1 pb-2.5 font-medium text-sm transition-colors duration-150',
                isActive
                  ? 'text-black dark:text-white'
                  : 'text-black/50 hover:text-black/70 dark:text-white/50 dark:hover:text-white/70',
              )}
            >
              <Icon size={15} />
              {tab.label}
              {isActive && (
                <span className="absolute right-0 -bottom-px left-0 h-[2px] rounded-full bg-teal-500 dark:bg-teal-400" />
              )}
            </button>
          )
        })}
      </div>

      <div className={active === 'answer' ? undefined : 'hidden'}>
        {children}
      </div>

      {active === 'links' && <LinksPanel sources={sources} />}

      {imagesOpened && (
        <div className={active === 'images' ? undefined : 'hidden'}>
          <SearchImages
            query={query}
            chatHistory={chatHistory}
            messageId={messageId}
            variant="grid"
            autoLoad
          />
        </div>
      )}
    </div>
  )
}

export default AnswerTabs
