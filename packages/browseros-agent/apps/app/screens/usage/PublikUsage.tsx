import { ExternalLink } from 'lucide-react'
import { type FC, useEffect } from 'react'
import { PUBLIK_DASHBOARD_URL } from '@/components/sidebar/PublikBranding'
import { PublikIcon } from '@/lib/llm-providers/providerIcons'
import { publikLink } from '@/lib/publik/publik'
import { refreshPublikAccount, usePublikAccount } from '@/lib/publik/useGate'

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`

/** Usage & Billing of an Astro build: the publik account, managed on publikhq.com. */
export const PublikUsage: FC = () => {
  const { account, choice } = usePublikAccount()
  useEffect(() => {
    void refreshPublikAccount()
  }, [])

  const what = !account
    ? 'Not signed in to publik. Astro asks at the next start.'
    : choice === 'own_key'
      ? 'Astro uses the connections you add yourself. publik is not charged.'
      : account.plan.kind === 'plan'
        ? `Your plan: ${account.plan.label ?? 'publik'}.`
        : `Your balance: ${dollars(account.balance_micros)}.`
  const manage = publikLink(account?.top_up_url) ?? PUBLIK_DASHBOARD_URL

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4 rounded-xl border p-5">
        <PublikIcon size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-lg">Usage & Billing</h2>
          <p className="text-muted-foreground text-sm">
            {account?.handle ? `@${account.handle} · ` : ''}
            {what}
          </p>
        </div>
        <a
          href={manage}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium text-sm hover:bg-muted/50"
        >
          <ExternalLink className="size-4" />
          Manage on publikhq.com
        </a>
      </div>
    </div>
  )
}
