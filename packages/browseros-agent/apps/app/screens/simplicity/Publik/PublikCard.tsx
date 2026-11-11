import { AlertCircle, Loader2, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { type Choice, publikLink } from '@/lib/publik/publik'
import { usePublikAccount } from '@/lib/publik/useGate'
import { cn } from '@/lib/simplicity/utils'
import ProviderLogo from '@/screens/simplicity/ui/ProviderLogo'

/* The publik card in Settings → Models. The sign-in itself happened at the
 * gate (PublikGate.tsx); this card shows the account the module saw and
 * lets the person change the one answer the gate stored: how Astro pays
 * for AI. `setChoice("publik")` connects the plan, `setChoice("own_key")`
 * keeps Astro on the person's own connections, `setChoice(null)` asks again
 * at the next start. The usage-count switch is the module's opt-out.
 *
 * Copy rule: "publik API", dollars, never a vendor name. Every link a
 * publik button opens is publikhq.com. */

const PRIMARY =
  'flex flex-row items-center gap-1.5 rounded-lg bg-[#24A0ED] px-3 py-1.5 font-medium text-white text-xs transition-all hover:bg-[#1e8fd1] active:scale-95 disabled:opacity-60 disabled:active:scale-100'
const QUIET =
  'flex flex-row items-center gap-1.5 text-[10px] text-black/50 hover:underline disabled:opacity-60 sm:text-xs dark:text-white/50'
const PUBLIK_DASHBOARD_URL = 'https://publikhq.com/dashboard'
const PUBLIK_PRIVACY_URL = 'https://publikhq.com/privacy#app-usage'

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`

/* The gateway's 402, with the one link its body carried. Non-blocking: the
   chat stays usable with a connection of the person's own. */
export const PublikMoneyBanner = ({
  money,
  onDismiss,
}: {
  money: { message: string; url: string | null }
  onDismiss: () => void
}) => (
  <div className="flex w-full flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-3 md:px-4">
    <div className="flex flex-row items-start gap-2">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="flex-1 text-[11px] text-black/70 leading-relaxed sm:text-xs dark:text-white/70">
        {money.message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
    <div className="flex flex-row items-center gap-3 pl-6">
      <a
        href={publikLink(money.url) ?? PUBLIK_DASHBOARD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={PRIMARY}
      >
        Get a plan
      </a>
    </div>
  </div>
)

const PublikCard = ({ className }: { className?: string }) => {
  const { account, choice, usageCounted, choose, setUsageCounted } =
    usePublikAccount()
  const [busy, setBusy] = useState<Choice | 'ask' | null>(null)

  if (account === undefined || choice === undefined) return null

  const who = account
    ? account.handle
      ? `Signed in as @${account.handle}`
      : 'Signed in to publik'
    : 'Not signed in'
  const what = account
    ? account.plan.kind === 'plan'
      ? `Your plan: ${account.plan.label ?? 'publik'}.`
      : `Your balance: ${dollars(account.balance_micros)}.`
    : null
  const uses =
    choice === 'publik'
      ? 'Astro uses your publik plan for AI.'
      : choice === 'own_key'
        ? 'Astro uses the connections you add yourself.'
        : 'Astro asks how to pay for AI at the next start.'
  const manage = publikLink(account?.top_up_url) ?? PUBLIK_DASHBOARD_URL

  const run = async (next: Choice | null) => {
    setBusy(next ?? 'ask')
    try {
      await choose(next)
    } finally {
      setBusy(null)
    }
  }

  const Button = ({
    next,
    primary,
    children,
  }: {
    next: Choice | null
    primary?: boolean
    children: ReactNode
  }) => (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => run(next)}
      className={primary ? PRIMARY : QUIET}
    >
      {busy === (next ?? 'ask') && (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      )}
      {children}
    </button>
  )

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
          <p className="font-medium text-black text-xs sm:text-sm dark:text-white">
            publik API
          </p>
          <p className="mt-0.5 text-[10px] text-black/50 sm:text-xs dark:text-white/50">
            {who}
            {what && ` · ${what}`}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-black/60 leading-relaxed sm:text-xs dark:text-white/60">
        {uses}
      </p>

      <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2">
        {choice !== 'publik' && (
          <Button next="publik" primary>
            Connect your plan
          </Button>
        )}
        {choice !== 'own_key' && <Button next="own_key">Use my own key</Button>}
        {choice !== null && <Button next={null}>Ask again at next start</Button>}
        <a
          href={manage}
          target="_blank"
          rel="noopener noreferrer"
          className={QUIET}
        >
          Manage your plan
        </a>
      </div>

      <label className="flex flex-row items-start gap-2 text-[11px] text-black/60 leading-relaxed sm:text-xs dark:text-white/60">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={usageCounted}
          onChange={(e) => void setUsageCounted(e.target.checked)}
        />
        <span>
          Count me as a user of Astro. Astro sends publik two small events:
          app opened, and still running every 30 minutes. They carry the app
          version, the operating system and your publik account. No pages,
          prompts or other content.{' '}
          <a
            href={PUBLIK_PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            What publik does with them
          </a>
        </span>
      </label>
    </div>
  )
}

export default PublikCard
