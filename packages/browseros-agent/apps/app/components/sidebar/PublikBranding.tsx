import { ChevronDown, ExternalLink, LogOut } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import ProductLogo from '@/assets/product_logo.svg'
import { ThemeToggle } from '@/components/elements/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { publikLink } from '@/lib/publik/publik'
import { usePublikAccount } from '@/lib/publik/useGate'
import { cn } from '@/lib/utils'
import { accountFooter } from '@/screens/simplicity/comet-sidebar.helpers'

export const PUBLIK_DASHBOARD_URL = 'https://publikhq.com/dashboard'

/**
 * The logo menu of a build without a BrowserOS account API (every Astro
 * build): it shows the publik account the gate linked, not upstream's
 * "Sign in", which opened BrowserOS's Google sign-in (Astro 0.2.4 QA,
 * F-022). The account is managed on publikhq.com.
 */
export const PublikBranding: FC<{ expanded?: boolean }> = ({
  expanded = true,
}) => {
  const navigate = useNavigate()
  const { account, choice } = usePublikAccount()
  const footer = accountFooter(account, choice)
  const manage = publikLink(account?.top_up_url) ?? PUBLIK_DASHBOARD_URL

  return (
    <div className="flex h-14 items-center justify-between border-b px-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none',
              expanded ? 'pr-3' : '',
            )}
          >
            {footer ? (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
                {footer.initials}
              </div>
            ) : (
              <img src={ProductLogo} alt="Astro" className="size-8" />
            )}
            <div
              className={cn(
                'flex min-w-0 flex-col gap-0.5 leading-none transition-opacity duration-200',
                expanded ? 'opacity-100' : 'hidden',
              )}
            >
              <div className="flex items-center gap-1">
                <span className="truncate font-semibold">
                  {footer?.title ?? 'Astro'}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </div>
              <span className="truncate text-muted-foreground text-xs">
                {footer?.detail ?? 'Not signed in to publik'}
              </span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={expanded ? 'bottom' : 'right'}
          align="start"
          className="w-56"
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="font-medium text-sm leading-none">
                {footer?.title ?? 'publik'}
              </p>
              <p className="text-muted-foreground text-xs leading-none">
                {footer?.detail ?? 'Astro signs in with publik at start.'}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => window.open(manage, '_blank', 'noopener')}
          >
            <ExternalLink className="mr-2 size-4" />
            Manage your publik account
          </DropdownMenuItem>
          {/* A real publik sign-out: the key is revoked and the gate shows
              again (F-086). */}
          <DropdownMenuItem
            onClick={() => navigate('/logout')}
            variant="destructive"
          >
            <LogOut className="mr-2 size-4" />
            Sign out of publik
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        className={cn(
          'shrink-0 transition-opacity duration-200',
          expanded ? 'opacity-100' : 'hidden',
        )}
      >
        <ThemeToggle className="h-8 w-8" iconClassName="h-4 w-4" />
      </div>
    </div>
  )
}
