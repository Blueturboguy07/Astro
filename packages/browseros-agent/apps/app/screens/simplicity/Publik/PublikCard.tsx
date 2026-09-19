import { AlertCircle, Check, ChevronDown, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  balanceLine,
  bannerFor,
  CTA_LATER_LABEL,
  DISCLOSURE_COST,
  DISCLOSURE_PRIVACY,
  planCta,
  WHY_IT_COSTS,
  WHY_IT_COSTS_LABEL,
} from '@/lib/publik/cta'
import type { PublikAction, UsePublikStatus } from '@/lib/publik/status'
import {
  formatMicros,
  PUBLIK_TERMS_URL,
  type PublikStatus,
} from '@/lib/publik/types'
import { cn } from '@/lib/simplicity/utils'
import ProviderLogo from '@/screens/simplicity/ui/ProviderLogo'

/* The packaged build's publik card. Three faces, one component:
 *   pending      — the disclosure (cost + where prompts go) and the two
 *                  buttons; "Continue" is what mints the key [S4]
 *   active       — right after the mint (CONTRACT §12.1), in this order:
 *                  (a) the balance line from the response, (b) the
 *                  one-sentence justification, (c) the primary "Link this
 *                  computer & pick a plan" opening claim_url, with "Later"
 *                  keeping the free starter. Never a silent starter (§12.4).
 *   failed /     — unreachable, or this computer was removed from the
 *   disconnected   account; Retry / Reconnect, and always "use my own key"
 *
 * Copy rules (CONTRACT §1): "publik API" only; dollars, never tokens; the
 * free balance comes from the server, never a constant. Every link a
 * publik button opens is publikhq.com (cta.ts planCta / topUpCta).
 */

const PRIMARY =
  'flex flex-row items-center gap-1.5 rounded-lg bg-[#24A0ED] px-3 py-1.5 font-medium text-white text-xs transition-all hover:bg-[#1e8fd1] active:scale-95 disabled:opacity-60 disabled:active:scale-100'
const QUIET =
  'text-[10px] text-black/50 hover:underline disabled:opacity-60 sm:text-xs dark:text-white/50'

/* Shown to every install once, before anything is sent. */
export const Disclosure = ({ compact = false }: { compact?: boolean }) => (
  <div className="flex flex-col gap-2 text-[11px] text-black/60 leading-relaxed sm:text-xs dark:text-white/60">
    {!compact && (
      <p>
        Astro needs an AI model to answer. By default it runs on{' '}
        <span className="font-medium text-black/80 dark:text-white/80">
          publik API
        </span>
        , so you can start right away without an account or a key.
      </p>
    )}
    <p>
      <span className="font-medium text-black/80 dark:text-white/80">
        Cost.
      </span>{' '}
      {DISCLOSURE_COST}
    </p>
    <p>
      <span className="font-medium text-black/80 dark:text-white/80">
        Where your prompts go.
      </span>{' '}
      {DISCLOSURE_PRIVACY}
    </p>
  </div>
)

/* (b) the justification: in full the first time, a toggle after "Later" or
   the plan button has been used. */
export const WhyItCosts = ({ toggle }: { toggle: boolean }) => {
  const [open, setOpen] = useState(!toggle)
  if (!toggle) {
    return (
      <p className="text-[11px] text-black/60 leading-relaxed sm:text-xs dark:text-white/60">
        {WHY_IT_COSTS}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex flex-row items-center gap-1 text-[10px] text-black/50 hover:underline sm:text-xs dark:text-white/50"
      >
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
        />
        {WHY_IT_COSTS_LABEL}
      </button>
      {open && (
        <p className="text-[11px] text-black/60 leading-relaxed sm:text-xs dark:text-white/60">
          {WHY_IT_COSTS}
        </p>
      )}
    </div>
  )
}

/* (a) the balance line (CONTRACT §12.1). */
export const BalanceLine = ({
  status,
  className,
}: {
  status: PublikStatus
  className?: string
}) => {
  const line = balanceLine(status)
  if (!line) return null
  return (
    <p
      className={cn(
        'font-medium text-black/80 text-xs tabular-nums sm:text-sm dark:text-white/80',
        className,
      )}
    >
      {line}
    </p>
  )
}

const weekLine = (s: PublikStatus) => {
  if (s.week.usedMicros === null) return null
  const used = formatMicros(s.week.usedMicros)
  if (s.week.budgetMicros === null) return `${used} used this week`
  return `This week ${used} of ${formatMicros(s.week.budgetMicros)}`
}

/* The secondary line under the balance: link state and the week's usage. */
export const StatusLine = ({ status }: { status: PublikStatus }) => {
  if (!status.connected) return null
  const week = weekLine(status)
  return (
    <p className="mt-0.5 text-[10px] text-black/50 tabular-nums sm:text-xs dark:text-white/50">
      {status.claimState === 'claimed'
        ? 'Linked to your publik account'
        : 'Ready · this computer is not linked to an account yet'}
      {week && ` · ${week}`}
    </p>
  )
}

/* (c) the primary button. Opened in a new tab; the href is already
   restricted to publikhq.com by planCta. */
export const PlanCtaLink = ({
  status,
  onOpen,
}: {
  status: PublikStatus
  onOpen?: () => void
}) => {
  const cta = planCta(status)
  return (
    <a
      href={cta.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className={PRIMARY}
    >
      {cta.label}
    </a>
  )
}

/* Non-blocking: a 402 with its one link, or the starter running out. */
export const PublikBanner = ({ status }: { status: PublikStatus }) => {
  const banner = bannerFor(status)
  if (!banner) return null
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-3 md:px-4">
      <div className="flex flex-row items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-[11px] text-black/70 leading-relaxed sm:text-xs dark:text-white/70">
          {banner.message}
        </p>
      </div>
      <div className="flex flex-row items-center gap-3 pl-6">
        <a
          href={banner.link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={PRIMARY}
        >
          {banner.link.label}
        </a>
      </div>
    </div>
  )
}

type CardProps = {
  publik: UsePublikStatus
  /* Called once the mint succeeded so the chat can reload its providers. */
  onProvisioned?: () => void
  className?: string
}

const PublikCard = ({ publik, onProvisioned, className }: CardProps) => {
  const { status, busy, act } = publik
  const [pendingAction, setPendingAction] = useState<PublikAction | null>(
    null,
  )

  if (!status.available) return null

  const run = async (action: PublikAction) => {
    setPendingAction(action)
    try {
      const next = await act(action)
      if (action === 'accept' || action === 'retry') {
        if (next.state === 'active') {
          onProvisioned?.()
        } else {
          toast.error(
            next.lastError
              ? `Could not reach publik API (${next.lastError}). Nothing was charged.`
              : 'Could not reach publik API. Nothing was charged.',
          )
        }
      }
    } catch {
      toast.error('Something went wrong talking to Astro. Try again.')
    } finally {
      setPendingAction(null)
    }
  }

  const Button = ({
    action,
    primary,
    children,
  }: {
    action: PublikAction
    primary?: boolean
    children: React.ReactNode
  }) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => run(action)}
      className={primary ? PRIMARY : QUIET}
    >
      {pendingAction === action && (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      )}
      {children}
    </button>
  )

  const failed = status.state === 'pending' && status.lastError
  const disconnected = status.state === 'disconnected'
  const declined = status.state === 'declined'
  const active = status.state === 'active'

  if (declined) {
    /* The user chose their own key. One quiet line so the way back exists. */
    return (
      <div
        className={cn(
          'flex flex-row items-center justify-between gap-3 rounded-xl border border-light-200 px-3 py-2 md:px-4 dark:border-dark-200',
          className,
        )}
      >
        <p className="text-[10px] text-black/50 sm:text-xs dark:text-white/50">
          publik API is off — Astro uses the connections you add yourself.
        </p>
        <Button action="reconnect">Turn publik API back on</Button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-[#24A0ED]/40 bg-[#24A0ED]/5 px-3 py-3 md:px-4',
        className,
      )}
    >
      <div className="flex flex-row items-center gap-3">
        <ProviderLogo
          providerKey="publik"
          size={24}
          className="shrink-0 text-black/80 dark:text-white/80"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-row items-center gap-2">
            <p className="font-medium text-black text-xs sm:text-sm dark:text-white">
              publik API
            </p>
            <span className="rounded-full bg-[#24A0ED]/15 px-1.5 py-0.5 font-semibold text-[#24A0ED] text-[9px] uppercase tracking-wide">
              Default
            </span>
          </div>
          {active ? (
            <>
              <BalanceLine status={status} className="mt-0.5" />
              <StatusLine status={status} />
            </>
          ) : (
            <p className="mt-0.5 text-[10px] text-black/50 sm:text-xs dark:text-white/50">
              {disconnected
                ? 'This computer was removed from your publik account.'
                : failed
                  ? 'publik API is unreachable right now. Nothing is being charged.'
                  : 'Nothing to paste. Ready in one click.'}
            </p>
          )}
        </div>
        {active && (
          <span className="flex shrink-0 flex-row items-center gap-1.5 font-medium text-[#24A0ED] text-xs">
            <Check className="h-4 w-4" strokeWidth={2.5} /> Connected
          </span>
        )}
        {(failed || disconnected) && (
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
        )}
      </div>

      {!active && !disconnected && <Disclosure />}
      {active && !status.disclosureCurrent && <Disclosure compact />}
      {active && <WhyItCosts toggle={status.ctaSeen} />}
      {active && <PublikBanner status={status} />}

      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        {active ? (
          <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2">
            <PlanCtaLink status={status} onOpen={() => run('later')} />
            {!status.ctaSeen && (
              <Button action="later">{CTA_LATER_LABEL}</Button>
            )}
          </div>
        ) : disconnected ? (
          <Button action="reconnect" primary>
            Reconnect
          </Button>
        ) : failed ? (
          <Button action="retry" primary>
            Retry
          </Button>
        ) : (
          <Button action="accept" primary>
            Continue with publik API
          </Button>
        )}
        <div className="flex flex-row items-center gap-3">
          {!active && (
            <a
              href={PUBLIK_TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={QUIET}
            >
              Terms
            </a>
          )}
          <Button action="decline">Use my own key instead</Button>
        </div>
      </div>
    </div>
  )
}

export default PublikCard
