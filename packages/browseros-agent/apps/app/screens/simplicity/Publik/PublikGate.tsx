import { Loader2, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import type { GateAction, GateScreen, PublikNotice } from '@/lib/publik/publik'
import { pressGate, useGateState } from '@/lib/publik/useGate'
import { cn } from '@/lib/simplicity/utils'
import ProviderLogo from '@/screens/simplicity/ui/ProviderLogo'

/* The gate page: Sign in with publik, as a full-tab page that stays until
 * the background says the person is signed in. The words come from the
 * module (lib/publik/publik.ts gateScreen); this file only draws them. A
 * button press goes to the background, which resolves the module's
 * `show()`; the next screen arrives through session storage.
 *
 * The self-test route is the one route outside the gate: the builder runs
 * it on a fresh profile, before any sign-in (RELEASING.md). */

export const SELF_TEST_PATH = '/publik/self-test'

const PRIMARY =
  'flex flex-row items-center gap-1.5 rounded-lg bg-[#24A0ED] px-4 py-2 font-medium text-sm text-white transition-all hover:bg-[#1e8fd1] active:scale-95 disabled:opacity-60 disabled:active:scale-100'
const QUIET =
  'rounded-lg px-4 py-2 font-medium text-black/70 text-sm transition-all hover:bg-black/5 active:scale-95 disabled:opacity-60 dark:text-white/70 dark:hover:bg-white/10'

export const PublikGate = ({ children }: { children: ReactNode }) => {
  const state = useGateState()
  const { pathname } = useLocation()
  if (pathname === SELF_TEST_PATH) return <>{children}</>
  if (state?.status === 'done') {
    return (
      <>
        {children}
        {state.notice && <NotAnsweringNotice notice={state.notice} />}
      </>
    )
  }
  /* Loading from storage: draw nothing rather than a flash of the app. */
  if (state === undefined) return null
  return <GatePage screen={state?.status === 'screen' ? state.screen : null} />
}

/* F-092: the app is open with the last choice while publik answers 429 or
 * 5xx (or not at all). A small notice, not the full-page gate: own keys,
 * local models and every page keep working. Retry asks the background to
 * read the wallet again; the notice goes away when publik answers. */
const NotAnsweringNotice = ({ notice }: { notice: PublikNotice }) => {
  const [pressed, setPressed] = useState(false)
  const [hidden, setHidden] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new time means the background tried again
  useEffect(() => {
    setPressed(false)
  }, [notice.at])
  useEffect(() => {
    if (!pressed) return
    const t = setTimeout(() => setPressed(false), 20_000)
    return () => clearTimeout(t)
  }, [pressed])
  if (hidden) return null

  return (
    <div
      role="status"
      title={
        notice.status ? `publik answered ${notice.status}` : 'No answer came'
      }
      className="fixed top-2 left-1/2 z-[60] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-row items-center gap-2 rounded-full border border-neutral-200 bg-white/95 py-1 pr-1 pl-3 text-black/70 text-xs shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 dark:text-white/70"
    >
      <span className="truncate">{notice.message}</span>
      <button
        type="button"
        disabled={pressed}
        onClick={() => {
          setPressed(true)
          void pressGate('retry')
        }}
        className="flex shrink-0 flex-row items-center gap-1 rounded-full bg-[#24A0ED] px-2.5 py-1 font-medium text-white transition-all hover:bg-[#1e8fd1] active:scale-95 disabled:opacity-60"
      >
        {pressed && <Loader2 className="h-3 w-3 animate-spin" />}
        Retry
      </button>
      <button
        type="button"
        aria-label="Hide"
        onClick={() => setHidden(true)}
        className="shrink-0 rounded-full p-1 text-black/40 hover:bg-black/5 dark:text-white/40 dark:hover:bg-white/10"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

const GatePage = ({ screen }: { screen: GateScreen | null }) => {
  const [pressed, setPressed] = useState<GateAction | null>(null)
  useEffect(() => {
    setPressed(null)
  }, [screen])

  const press = (action: GateAction) => {
    setPressed(action)
    void pressGate(action)
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white px-4 py-10 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mb-5 flex flex-row items-center gap-3">
          <ProviderLogo
            providerKey="publik"
            size={28}
            className="shrink-0 text-black/80 dark:text-white/80"
          />
          <h1 className="font-semibold text-black text-lg dark:text-white">
            {screen?.title ?? 'Sign in with publik'}
          </h1>
        </div>
        {screen ? (
          <>
            <p className="text-black/70 text-sm leading-relaxed dark:text-white/70">
              {screen.body}
            </p>
            {screen.note && (
              <p className="mt-3 text-black/50 text-xs leading-relaxed dark:text-white/50">
                {screen.note}
              </p>
            )}
            <div className="mt-6 flex flex-row flex-wrap items-center gap-3">
              {screen.buttons.map((b, i) => (
                <button
                  key={b.action}
                  type="button"
                  disabled={pressed !== null}
                  onClick={() => press(b.action)}
                  className={cn(i === 0 ? PRIMARY : QUIET)}
                >
                  {pressed === b.action && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {b.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-row items-center gap-2 text-black/50 text-sm dark:text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}

export default PublikGate
