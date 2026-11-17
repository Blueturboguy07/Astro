import type { Choice, PublikAccount } from '@/lib/publik/publik'

export type AccountFooter = {
  initials: string
  title: string
  detail: string
}

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`

/* The left rail's account line. It shows the publik account the gate saw
   (handle, then the plan or the balance, or "Your own keys" for the person
   who chose them). With no account (a build without publik) it shows
   nothing rather than a made-up "Local / BYO key". */
export function accountFooter(
  account: PublikAccount | null | undefined,
  choice: Choice | null | undefined,
): AccountFooter | null {
  if (!account) return null
  const handle = account.handle?.trim() || null
  const title = handle ? `@${handle}` : 'publik'
  const initials = (handle ?? 'publik').slice(0, 2).toUpperCase()
  let detail: string
  if (choice === 'own_key') {
    detail = 'Your own keys'
  } else if (account.plan.kind === 'plan') {
    detail = account.plan.label ?? 'publik plan'
  } else {
    detail = `Balance ${dollars(account.balance_micros)}`
  }
  return { initials, title, detail }
}
