import type { FC } from 'react'
import ProductLogo from '@/assets/product_logo.svg'
import { usePublikAccount } from '@/lib/publik/useGate'

/**
 * The side panel with no AI connection: the person chose "Use my own key"
 * and has not added one, or chose nothing yet. It says what to do instead of
 * sending questions to a placeholder that can only fail (Astro 0.2.4 QA,
 * F-018).
 */
export const ChatNoConnection: FC = () => {
  const { account, choose } = usePublikAccount()
  return (
    <div className="m-0! flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <img src={ProductLogo} alt="" className="h-12 w-12 opacity-90" />
      <p className="max-w-xs text-muted-foreground text-sm">
        No AI connection yet. Connect your publik plan or add your own key.
      </p>
      <div className="flex flex-row flex-wrap items-center justify-center gap-2">
        {account && (
          <button
            type="button"
            onClick={() => choose('publik')}
            className="cursor-pointer rounded-lg bg-[#24A0ED] px-3 py-1.5 font-medium text-white text-xs transition-all hover:bg-[#1e8fd1] active:scale-95"
          >
            Connect your plan
          </button>
        )}
        <button
          type="button"
          onClick={() => window.open('/app.html#/settings/ai', '_blank')}
          className="cursor-pointer rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-xs transition-all hover:bg-muted/50 active:scale-95"
        >
          Add your own key
        </button>
      </div>
    </div>
  )
}
