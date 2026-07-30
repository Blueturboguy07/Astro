import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { CaretDownIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Check, Scale, Telescope } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { canRunCouncil } from '@/lib/simplicity/agents/council/select'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import type { MinimalProvider } from '@/lib/simplicity/models/types'
import { apiFetch } from '@/lib/simplicity/api-fetch'

/* Perplexity ground truth (2026-07): this dropdown hangs off the Search
   pill itself, and lists exactly two options — Search and Deep research.
   Picking one just swaps the pill's icon/label; the actual behaviour switch
   is `searchMode` in useChat, threaded to the server as-is.

   Model council (SPEC 2) is added as a third entry in that same list rather
   than a separate composer flag — it's just another value of `searchMode`,
   reusing every bit of that existing plumbing end-to-end. */

const modeList = [
  {
    key: 'search' as const,
    name: 'Search',
    description: 'Fast answers with sources',
    icon: <MagnifyingGlassIcon className="h-[16px] w-auto" />,
  },
  {
    key: 'deepResearch' as const,
    name: 'Deep research',
    description: 'In-depth report, takes a few minutes',
    icon: <Telescope className="h-[16px] w-auto" />,
  },
  {
    key: 'council' as const,
    name: 'Model council',
    description: 'Up to 3 models answer in parallel, a chair compares them',
    icon: <Scale className="h-[16px] w-auto" />,
  },
]

const ModeSelector = () => {
  const { searchMode, setSearchMode } = useChat()
  const [providers, setProviders] = useState<MinimalProvider[]>([])

  /* Own fetch, mirroring ChatModelSelector's pattern — this component has no
     other reason to depend on the composer's model-picker state, and the
     gate below only needs a read of what's connected. */
  useEffect(() => {
    let cancelled = false

    const loadProviders = async () => {
      try {
        const res = await apiFetch('/api/providers')
        if (!res.ok) return
        const data: { providers: MinimalProvider[] } = await res.json()
        if (!cancelled) setProviders(data.providers)
      } catch {
        /* Leave providers empty — council just stays disabled, same as a
           genuinely disconnected setup. */
      }
    }

    loadProviders()
    return () => {
      cancelled = true
    }
  }, [])

  const current = modeList.find((m) => m.key === searchMode) ?? modeList[0]

  /* Hard gate (SPEC 2 §2/§9): a real disable at the entry point, not a
     submit-time error. The chat route re-checks this server-side too, as a
     defensive backstop for a stale client. */
  const councilAvailable = canRunCouncil(providers)

  return (
    <Popover className="relative">
      {({ open }) => (
        <>
          {/* Labelled the same way as Sources and the model button — the
              label doubles as the current state. */}
          <PopoverButton className="flex flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 text-black/50 transition duration-200 hover:bg-light-200 hover:text-black focus:outline-none active:scale-95 active:border-none dark:text-white/50 hover:dark:bg-dark-200 dark:hover:text-white">
            <span className="shrink-0">{current.icon}</span>
            <span className="max-w-[110px] truncate font-medium text-xs">
              {current.name}
            </span>
            <CaretDownIcon className="h-[12px] w-auto shrink-0 opacity-60" />
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                static
                className="absolute right-0 z-10 w-64 md:w-[240px]"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="flex w-full origin-top-right flex-col rounded-lg border border-light-200 bg-light-primary p-1 shadow-lg dark:border-dark-200 dark:bg-dark-primary"
                >
                  {modeList.map((m) => {
                    const disabled = m.key === 'council' && !councilAvailable

                    return (
                      <div
                        key={m.key}
                        title={
                          disabled
                            ? 'Connect at least 2 models to use Model council'
                            : undefined
                        }
                        className={
                          disabled
                            ? 'flex cursor-not-allowed flex-row items-start justify-between gap-2 rounded-md px-2 py-2.5 opacity-40'
                            : 'flex cursor-pointer flex-row items-start justify-between gap-2 rounded-md px-2 py-2.5 hover:bg-light-100 hover:dark:bg-dark-100'
                        }
                        onClick={() => !disabled && setSearchMode(m.key)}
                      >
                        <div className="flex flex-row space-x-2 text-black/80 dark:text-white/80">
                          <div className="shrink-0 pt-0.5">{m.icon}</div>
                          <div>
                            <p className="font-medium text-xs">{m.name}</p>
                            <p className="text-[11px] text-black/50 dark:text-white/50">
                              {m.description}
                            </p>
                          </div>
                        </div>
                        {searchMode === m.key && (
                          <Check
                            size={14}
                            className="mt-0.5 shrink-0 text-black dark:text-white"
                          />
                        )}
                      </div>
                    )
                  })}
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  )
}

export default ModeSelector
