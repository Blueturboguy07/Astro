'use client'

import { Lock, LockOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import { cn } from '@/lib/simplicity/utils'

/* Perplexity ground truth: a circular lock button near the composer toggles
   a thread that's never written to the database — see useChat's `incognito`
   state (plain React state, not localStorage, so it resets for every new
   chat) and the server-side guards in route.ts / search/index.ts that skip
   every chats/messages row write when it's set. */
const IncognitoToggle = () => {
  const { incognito, setIncognito } = useChat()
  const [hovered, setHovered] = useState(false)

  return (
    <div className="relative flex items-center justify-center">
      <button
        type="button"
        onClick={() => setIncognito(!incognito)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-pressed={incognito}
        aria-label={
          incognito ? 'Turn off incognito mode' : 'Turn on incognito mode'
        }
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full border transition duration-200 active:scale-95',
          incognito
            ? 'border-sky-500/40 bg-sky-500/10 text-sky-500'
            : 'border-light-200 bg-light-secondary text-black/50 hover:text-black dark:border-dark-200 dark:bg-dark-secondary dark:text-white/50 dark:hover:text-white',
        )}
      >
        {incognito ? <Lock size={14} /> : <LockOpen size={14} />}
      </button>
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            className="pointer-events-none absolute top-full left-0 z-20 mt-2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-[11px] text-white shadow-lg dark:bg-white/90 dark:text-black"
          >
            Incognito — this thread won&apos;t be saved
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default IncognitoToggle
