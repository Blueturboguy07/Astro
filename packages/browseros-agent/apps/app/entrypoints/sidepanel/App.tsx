import type { FC } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { ChatLayout } from '@/components/layout/ChatLayout'
import { ChatHistory } from '@/screens/sidepanel/history/ChatHistory'
import { Chat } from '@/screens/sidepanel/index/Chat'
import { PublikGate } from '@/screens/simplicity/Publik/PublikGate'

export const App: FC = () => {
  return (
    <HashRouter>
      {/* Sign in with publik: the side panel waits behind the same gate as
          the app pages. */}
      <PublikGate>
        <Routes>
          <Route element={<ChatLayout />}>
            <Route index element={<Chat />} />
            <Route path="history" element={<ChatHistory />} />
          </Route>
        </Routes>
      </PublikGate>
    </HashRouter>
  )
}
