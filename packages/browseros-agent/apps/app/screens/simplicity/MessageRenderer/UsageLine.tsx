'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { UsageBlock } from '@/lib/simplicity/types'
import { cn } from '@/lib/simplicity/utils'
import ProviderLogo from '../ui/ProviderLogo'

/* Never renders raw floats like $0.00417382 — 2 sig figs above a cent,
   nearest tenth-of-a-cent below it. */
const formatCost = (n: number): string => {
  if (n <= 0) return '$0.00'
  if (n >= 0.01) return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

const formatTokens = (n: number): string => {
  if (n >= 1000) {
    const k = n / 1000
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`
  }
  return `${n}`
}

const FreeChip = ({ className }: { className?: string }) => (
  <span
    className={cn(
      'rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-[9px] text-emerald-600 uppercase tracking-wide dark:text-emerald-400',
      className,
    )}
  >
    Free
  </span>
)

const UsageLine = ({ block }: { block: UsageBlock }) => {
  const [open, setOpen] = useState(false)
  const { totalCost, breakdown, free } = block.data

  if (breakdown.length === 0) return null

  const totalTokens = breakdown.reduce(
    (sum, e) => sum + e.inputTokens + e.outputTokens,
    0,
  )

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-black/50 text-xs transition-colors duration-200 hover:text-black/70 dark:text-white/50 dark:hover:text-white/70"
      >
        {free ? (
          <FreeChip />
        ) : (
          <span className="tabular-nums">~{formatCost(totalCost)}</span>
        )}
        <span>·</span>
        <span className="tabular-nums">{formatTokens(totalTokens)} tokens</span>
        {breakdown.length > 1 && (
          <>
            <span>·</span>
            <span>{breakdown.length} models</span>
          </>
        )}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="mt-2 divide-y divide-light-200 overflow-hidden rounded-lg border border-light-200 bg-light-secondary dark:divide-dark-200 dark:border-dark-200 dark:bg-dark-secondary">
          {breakdown.map((entry) => (
            <div
              key={`${entry.providerId}-${entry.model}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ProviderLogo
                  providerKey={entry.providerType}
                  size={14}
                  className="flex-shrink-0 text-black/60 dark:text-white/60"
                />
                <span className="truncate font-medium text-black/80 dark:text-white/80">
                  {entry.label}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span className="text-black/40 tabular-nums dark:text-white/40">
                  {entry.inputTokens.toLocaleString()} in ·{' '}
                  {entry.outputTokens.toLocaleString()} out
                </span>
                {entry.free ? (
                  <FreeChip />
                ) : entry.cost == null ? (
                  <span
                    className="text-black/30 dark:text-white/30"
                    title="No price data for this model"
                  >
                    —
                  </span>
                ) : (
                  <span className="text-black/70 tabular-nums dark:text-white/70">
                    {formatCost(entry.cost)}
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-3 py-2 font-medium text-xs">
            <span className="text-black/60 dark:text-white/60">Total</span>
            <span className="text-black tabular-nums dark:text-white">
              {free ? 'Free' : formatCost(totalCost)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default UsageLine
