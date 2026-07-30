import type { FC } from 'react'
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { SettingsSidebarLayout } from '@/components/layout/SettingsSidebarLayout'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { AISettingsPage } from '@/screens/ai-settings/AISettingsPage'
import { LoginPage } from '@/screens/auth/LoginPage'
import { LogoutPage } from '@/screens/auth/LogoutPage'
import { ConnectMCP } from '@/screens/connect-mcp/ConnectMCP'
import { CustomizationPage } from '@/screens/customization/CustomizationPage'
import { SurveyPage } from '@/screens/jtbd-agent/SurveyPage'
import { LlmHubPage } from '@/screens/llm-hub/LlmHubPage'
import { MCPSettingsPage } from '@/screens/mcp-settings/MCPSettingsPage'
import { ProfilePage } from '@/screens/profile/ProfilePage'
import { ScheduledTasksPage } from '@/screens/scheduled-tasks/ScheduledTasksPage'
import ChatWindow from '@/screens/simplicity/ChatWindow'
import { DiscoverPage } from '@/screens/simplicity/pages/DiscoverPage'
import { LibraryPage } from '@/screens/simplicity/pages/LibraryPage'
import {
  ArtifactsPage,
  ComputerPage,
  MemoryPage,
  SkillsPage,
  SpacesPage,
} from '@/screens/simplicity/pages/NotBuiltPage'
import { SimplicityApp } from '@/screens/simplicity/SimplicityApp'
import { UsagePage } from '@/screens/usage/UsagePage'

function getSurveyParams(): { maxTurns?: number; experimentId?: string } {
  const params = new URLSearchParams(window.location.search)
  const maxTurnsStr = params.get('maxTurns')
  const experimentId = params.get('experimentId') ?? 'default'
  const maxTurns = maxTurnsStr ? Number.parseInt(maxTurnsStr, 10) : 7
  return { maxTurns, experimentId }
}

// Agent management moved into AI & Agents settings; conversations live under
// /home/agents. Keep old /agents links alive.
const LegacyAgentRedirect: FC = () => {
  const params = useParams()
  return <Navigate to={`/home/agents/${params.agentId ?? ''}`} replace />
}

const OptionsRedirect: FC = () => {
  const params = useParams()
  const path = params['*'] || ''

  const routeMap: Record<string, string> = {
    ai: '/settings/ai',
    chat: '/settings/chat',
    'connect-mcp': '/connect-apps',
    mcp: '/settings/mcp',
    customization: '/settings/customization',
    search: '/settings/ai',
    'jtbd-agent': '/settings/survey',
    scheduled: '/scheduled',
  }

  const newPath = routeMap[path] || '/settings/ai'
  return <Navigate to={newPath} replace />
}

export const App: FC = () => {
  const surveyParams = getSurveyParams()

  return (
    <HashRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="logout" element={<LogoutPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* Simplicity is the product surface. Its own left rail / bottom bar is
            replaced by TopNav so it doesn't fight the browser's tab strip. */}
        <Route path="home" element={<SimplicityApp />}>
          <Route index element={<ChatWindow />} />
          <Route path="c/:chatId" element={<ChatWindow />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="library" element={<LibraryPage />} />
          {/* Comet sidebar destinations. Customize/Connectors map onto real
              screens; the rest state plainly that they are not built. */}
          <Route path="computer" element={<ComputerPage />} />
          <Route path="spaces" element={<SpacesPage />} />
          <Route path="artifacts" element={<ArtifactsPage />} />
          <Route
            path="customize"
            element={<Navigate to="/settings/ai" replace />}
          />
          <Route
            path="connectors"
            element={<Navigate to="/connect-apps" replace />}
          />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="memory" element={<MemoryPage />} />
        </Route>

        <Route element={<SidebarLayout />}>
          <Route path="connect-apps" element={<ConnectMCP />} />
          <Route path="scheduled" element={<ScheduledTasksPage />} />
        </Route>

        <Route element={<SettingsSidebarLayout />}>
          <Route path="settings">
            <Route index element={<Navigate to="/settings/ai" replace />} />
            <Route path="ai" element={<AISettingsPage key="ai" />} />
            <Route path="chat" element={<LlmHubPage />} />
            <Route path="mcp" element={<MCPSettingsPage />} />
            <Route path="customization" element={<CustomizationPage />} />
            <Route
              path="search"
              element={<Navigate to="/settings/ai" replace />}
            />
            <Route path="survey" element={<SurveyPage {...surveyParams} />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="*" element={<Navigate to="/settings/ai" replace />} />
          </Route>
        </Route>

        {/* Onboarding removed — provider setup lives in Simplicity's Settings. */}
        <Route path="/onboarding/*" element={<Navigate to="/home" replace />} />

        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route
          path="/personalize"
          element={<Navigate to="/home/personalize" replace />}
        />
        <Route
          path="/settings/connect-mcp"
          element={<Navigate to="/connect-apps" replace />}
        />
        <Route path="/audit" element={<Navigate to="/home" replace />} />
        <Route
          path="/observability"
          element={<Navigate to="/home" replace />}
        />
        <Route path="/executions" element={<Navigate to="/home" replace />} />
        <Route
          path="/agents"
          element={<Navigate to="/settings/ai" replace />}
        />
        <Route path="/agents/:agentId" element={<LegacyAgentRedirect />} />
        <Route path="/options/*" element={<OptionsRedirect />} />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </HashRouter>
  )
}
