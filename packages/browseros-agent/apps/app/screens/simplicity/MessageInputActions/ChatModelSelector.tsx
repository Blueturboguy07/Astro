'use client'

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { Check, ChevronDown, Cpu, Loader2, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import {
  availableRows,
  BEST_KEY,
  type ResolvedRow,
  resolveBest,
} from '@/lib/simplicity/models/catalog'
import type { MinimalProvider } from '@/lib/simplicity/models/types'
import { cn } from '@/lib/simplicity/utils'
import ProviderLogo from '../ui/ProviderLogo'
import { apiFetch } from '@/lib/simplicity/api-fetch'

/* The model picker, shaped like Perplexity's (2026-07): Best on top with a
   subtitle, then a flat list of models — logo, real name, New/Free badges,
   check on the selected row, and a nested "Thinking" toggle under a selected
   reasoning-capable model. No locks anywhere: what's connected is usable. */

const THINKING_STORAGE_KEY = 'thinkingEnabled'

const ModelSelector = () => {
  const [providers, setProviders] = useState<MinimalProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [thinking, setThinking] = useState(true)

  const { setChatModelProvider, chatModelProvider } = useChat()

  useEffect(() => {
    setThinking(localStorage.getItem(THINKING_STORAGE_KEY) !== '0')

    const loadProviders = async () => {
      try {
        setIsLoading(true)
        const res = await apiFetch('/api/providers')

        if (!res.ok) {
          throw new Error('Failed to fetch providers')
        }

        const data: { providers: MinimalProvider[] } = await res.json()
        setProviders(data.providers)
      } catch (_error) {
      } finally {
        setIsLoading(false)
      }
    }

    loadProviders()
  }, [])

  const rows = useMemo(() => availableRows(providers), [providers])
  const mainRows = rows.filter((r) => !r.row.extra)
  const extraRows = rows.filter((r) => r.row.extra)

  const best = resolveBest(providers)
  const isBestSelected = chatModelProvider?.key === BEST_KEY

  const selectedRow = useMemo(
    () =>
      rows.find(
        (r) =>
          r.providerId === chatModelProvider?.providerId &&
          r.key === chatModelProvider?.key,
      ) ?? null,
    [rows, chatModelProvider],
  )

  /* Button label: the row name, with a grayed "Thinking" suffix when the
     selected model reasons — mirroring "GPT-5.6 Terra Thinking". */
  const currentName = isBestSelected
    ? 'Best'
    : (selectedRow?.row.name ?? 'Model')
  const showThinkingSuffix =
    !isBestSelected && !!selectedRow?.row.thinking && thinking

  const selectRow = (r: ResolvedRow) => {
    setChatModelProvider({ providerId: r.providerId, key: r.key })
    localStorage.setItem('chatModelProviderId', r.providerId)
    localStorage.setItem('chatModelKey', r.key)
  }

  const selectBest = () => {
    if (!best) return
    /* Store the sentinel so the choice stays "Best" across restarts, but send
       the resolved model — the API needs a real one. */
    localStorage.setItem('chatModelKey', BEST_KEY)
    localStorage.setItem('chatModelProviderId', best.providerId)
    setChatModelProvider({ providerId: best.providerId, key: best.key })
  }

  const toggleThinking = () => {
    const next = !thinking
    setThinking(next)
    localStorage.setItem(THINKING_STORAGE_KEY, next ? '1' : '0')
  }

  const renderRow = (r: ResolvedRow) => {
    const isSelected =
      !isBestSelected &&
      chatModelProvider?.providerId === r.providerId &&
      chatModelProvider?.key === r.key

    return (
      <div key={r.row.id}>
        <button
          onClick={() => selectRow(r)}
          type="button"
          className={cn(
            'group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-start transition duration-200',
            isSelected
              ? 'bg-light-secondary dark:bg-dark-secondary'
              : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center space-x-2.5">
            <ProviderLogo
              providerKey={r.row.icon}
              size={16}
              className={cn(
                'shrink-0',
                isSelected
                  ? 'text-black dark:text-white'
                  : 'text-black/60 group-hover:text-black dark:text-white/60 dark:group-hover:text-white',
              )}
            />
            <p
              className={cn(
                'truncate text-[13px]',
                isSelected
                  ? 'font-medium text-black dark:text-white'
                  : 'text-black/80 group-hover:text-black dark:text-white/80 dark:group-hover:text-white',
              )}
            >
              {r.row.name}
            </p>
            {r.row.badge && (
              <span className="shrink-0 rounded-full bg-teal-500/15 px-1.5 py-0.5 font-semibold text-[9px] text-teal-600 dark:text-teal-400">
                {r.row.badge}
              </span>
            )}
            {r.free && (
              <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-[9px] text-emerald-600 uppercase tracking-wide dark:text-emerald-400">
                Free
              </span>
            )}
          </div>
          {isSelected && (
            <Check size={14} className="shrink-0 text-black dark:text-white" />
          )}
        </button>

        {/* Nested Thinking toggle, directly under the selected reasoning
            model — where Perplexity puts it. */}
        {isSelected && r.row.thinking && (
          <div className="flex items-center justify-between pr-3 pb-1.5 pl-10">
            <p className="text-black/70 text-xs dark:text-white/70">Thinking</p>
            <button
              type="button"
              role="switch"
              aria-checked={thinking}
              onClick={toggleThinking}
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                thinking ? 'bg-teal-500' : 'bg-black/20 dark:bg-white/20',
              )}
            >
              <span
                className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                  thinking ? 'translate-x-[18px]' : 'translate-x-[3px]',
                )}
              />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <Popover className="relative">
      {({ open }) => (
        <>
          <PopoverButton
            type="button"
            className="flex flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 headless-open:text-black text-black/50 transition duration-200 hover:bg-light-200 hover:text-black focus:outline-none active:scale-95 active:border-none dark:headless-open:text-white dark:text-white/50 hover:dark:bg-dark-200 dark:hover:text-white"
          >
            {isBestSelected ? (
              <Sparkles size={15} className="shrink-0 text-sky-500" />
            ) : (
              <Cpu size={15} className="shrink-0 text-sky-500" />
            )}
            <span className="max-w-[150px] truncate font-medium text-xs">
              {currentName}
              {showThinkingSuffix && (
                <span className="text-black/40 dark:text-white/40">
                  {' '}
                  Thinking
                </span>
              )}
            </span>
            <ChevronDown size={14} className="shrink-0 opacity-60" />
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                className="absolute right-0 z-10 w-[250px] sm:w-[280px]"
                static
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="flex w-full origin-top-right flex-col overflow-hidden rounded-xl border border-light-200 bg-light-primary shadow-lg dark:border-dark-200 dark:bg-dark-primary"
                >
                  <div className="max-h-[360px] overflow-y-auto p-1.5">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2
                          className="animate-spin text-black/40 dark:text-white/40"
                          size={22}
                        />
                      </div>
                    ) : rows.length === 0 && !best ? (
                      <div className="px-4 py-12 text-center text-black/60 text-sm dark:text-white/60">
                        No models connected
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {best && (
                          <button
                            type="button"
                            onClick={selectBest}
                            className={cn(
                              'flex items-center justify-between rounded-lg px-3 py-2.5 text-start transition',
                              isBestSelected
                                ? 'bg-light-secondary dark:bg-dark-secondary'
                                : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
                            )}
                          >
                            <div className="flex items-center space-x-2.5">
                              <Sparkles
                                size={16}
                                className={cn(
                                  'shrink-0',
                                  isBestSelected
                                    ? 'text-black dark:text-white'
                                    : 'text-black/60 dark:text-white/60',
                                )}
                              />
                              <div>
                                <p
                                  className={cn(
                                    'text-[13px]',
                                    isBestSelected
                                      ? 'font-medium text-black dark:text-white'
                                      : 'text-black/80 dark:text-white/80',
                                  )}
                                >
                                  Best
                                </p>
                                <p className="text-[10px] text-black/50 dark:text-white/50">
                                  Selects the best available model
                                </p>
                              </div>
                            </div>
                            {isBestSelected && (
                              <Check
                                size={14}
                                className="shrink-0 text-black dark:text-white"
                              />
                            )}
                          </button>
                        )}

                        {mainRows.map(renderRow)}

                        {extraRows.length > 0 && (
                          <>
                            <div className="my-1.5 h-px bg-light-200 dark:bg-dark-200" />
                            {extraRows.map(renderRow)}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  )
}

export default ModelSelector
