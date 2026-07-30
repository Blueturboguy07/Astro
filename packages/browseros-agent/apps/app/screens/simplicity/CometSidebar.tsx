/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Comet-style left navigation.
 *
 * Replaces both Astro's own Sidebar (a fixed icon rail + mobile bottom bar)
 * and the interim TopNav. Layout mirrors Perplexity Comet: a full-width labelled
 * rail holding New / Computer / Spaces / Artifacts / Customize, a secondary
 * unlabelled group (Connectors / Skills / Memory), then History with recent
 * threads, and an account footer pinned to the bottom.
 *
 * Content tabs (Answer / Links / Images) deliberately stay at the top of the
 * answer pane — see AnswerTabs.tsx — so navigation and content selection do not
 * compete for the same edge.
 */

import {
  AppWindow,
  Bell,
  ChevronsLeft,
  Clock,
  Folder,
  Monitor,
  PanelLeft,
  Plus,
  Settings2,
} from 'lucide-react'
import ProductLogo from '@/assets/product_logo.svg'
import { type FC, type ReactNode, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { apiFetch } from '@/lib/simplicity/api-fetch'
import type { Chat } from '@/lib/simplicity/types/discover'
import { cn } from '@/lib/utils'

const PRIMARY = [
  { to: '/home/computer', label: 'Computer', icon: Monitor },
  { to: '/home/spaces', label: 'Spaces', icon: Folder },
  { to: '/home/artifacts', label: 'Artifacts', icon: AppWindow },
  { to: '/home/customize', label: 'Customize', icon: Settings2 },
] as const

/* Comet renders these smaller and without icons, as a sub-group under
   Customize rather than peers of it. */
const SECONDARY = [
  { to: '/home/connectors', label: 'Connectors' },
  { to: '/home/skills', label: 'Skills' },
  { to: '/home/memory', label: 'Memory' },
] as const

const HISTORY_LIMIT = 14

const itemClass = (isActive: boolean) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
    isActive
      ? 'bg-light-200 font-medium text-black dark:bg-dark-200 dark:text-white'
      : 'text-black/70 hover:bg-light-200/70 hover:text-black dark:text-white/70 dark:hover:bg-dark-200/60 dark:hover:text-white',
  )

const subItemClass = (isActive: boolean) =>
  cn(
    'block rounded-lg px-3 py-1.5 text-[13px] transition-colors',
    isActive
      ? 'bg-light-200 font-medium text-black dark:bg-dark-200 dark:text-white'
      : 'text-black/55 hover:bg-light-200/70 hover:text-black dark:text-white/55 dark:hover:text-white',
  )

const SidebarShell: FC<{ children: ReactNode; collapsed: boolean }> = ({
  children,
  collapsed,
}) => (
  <aside
    className={cn(
      'flex h-screen shrink-0 flex-col border-light-200 border-r bg-light-secondary dark:border-dark-200 dark:bg-dark-secondary',
      collapsed ? 'w-[68px]' : 'w-[265px]',
    )}
  >
    {children}
  </aside>
)

export const CometSidebar: FC<{ children: ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [chats, setChats] = useState<Chat[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/chats')
      .then((r) => (r.ok ? r.json() : { chats: [] }))
      .then((d: { chats?: Chat[] }) => {
        if (!cancelled) setChats(d.chats ?? [])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex h-screen bg-light-primary dark:bg-dark-primary">
      <SidebarShell collapsed={collapsed}>
        <div className="flex items-center justify-between px-3 py-3">
          <NavLink to="/home" className="flex items-center gap-2 px-1">
            {/* The product mark, not a generic icon, so the wordmark and the
                favicon agree. */}
            <img src={ProductLogo} alt="" className="size-5" />
            {!collapsed && <span className="font-medium text-sm">Astro</span>}
          </NavLink>
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-md p-1.5 text-black/50 hover:bg-light-200 hover:text-black dark:text-white/50 dark:hover:bg-dark-200 dark:hover:text-white"
          >
            {collapsed ? <PanelLeft size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          <NavLink to="/home" end className={({ isActive }) => itemClass(isActive)}>
            <span className="flex size-6 items-center justify-center rounded-full border border-black/15 dark:border-white/20">
              <Plus size={14} />
            </span>
            {!collapsed && <span>New</span>}
          </NavLink>

          {PRIMARY.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => itemClass(isActive)}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {!collapsed && (
          <nav className="mt-1 flex flex-col gap-0.5 px-2 pl-4">
            {SECONDARY.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => subItemClass(isActive)}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="mt-4 flex min-h-0 flex-1 flex-col px-2">
          <NavLink
            to="/home/library"
            className={({ isActive }) => itemClass(isActive)}
          >
            <Clock size={18} className="shrink-0" />
            {!collapsed && <span>History</span>}
          </NavLink>

          {!collapsed && (
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
              {chats.slice(0, HISTORY_LIMIT).map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => navigate(`/home/c/${chat.id}`)}
                  title={chat.title}
                  className="block w-full truncate rounded-lg px-3 py-1.5 text-left text-[13px] text-black/60 transition-colors hover:bg-light-200/70 hover:text-black dark:text-white/60 dark:hover:bg-dark-200/60 dark:hover:text-white"
                >
                  {chat.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-light-200 border-t px-3 py-3 dark:border-dark-200">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-light-200 font-medium text-[11px] dark:bg-dark-200">
              ME
            </span>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">Local</div>
                  <div className="truncate text-[11px] text-black/45 dark:text-white/45">
                    BYO key
                  </div>
                </div>
                <Bell size={15} className="text-black/40 dark:text-white/40" />
              </>
            )}
          </div>
        </div>
      </SidebarShell>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
