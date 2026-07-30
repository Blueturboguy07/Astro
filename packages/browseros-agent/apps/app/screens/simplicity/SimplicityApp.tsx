/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Shell for the ported Astro UI.
 *
 * Stands in for Simplicity's Next.js RootLayout (~/Vane src/app/layout.tsx, MIT
 * (c) ItzCrazyKns), which composed ThemeProvider > ChatProvider > Sidebar. Same
 * composition, except the left rail/bottom bar is replaced by TopNav and the
 * page is rendered through react-router instead of Next's file routing.
 */

import type { FC } from 'react'
import { Outlet } from 'react-router'
import { Toaster } from 'sonner'
import { ChatProvider } from '@/lib/simplicity/hooks/useChat'
import { CometSidebar } from './CometSidebar'
import ThemeProviderComponent from './theme/Provider'

export const SimplicityApp: FC = () => (
  <ThemeProviderComponent>
    <ChatProvider>
      <CometSidebar>
        <Outlet />
      </CometSidebar>
      <Toaster
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              'bg-light-primary dark:bg-dark-secondary dark:text-white/70 text-black/70 rounded-lg p-4 flex flex-row items-center space-x-2',
          },
        }}
      />
    </ChatProvider>
  </ThemeProviderComponent>
)
