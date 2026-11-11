import { defineExtensionMessaging } from '@webext-core/messaging'
import type { GateAction } from '@/lib/publik/publik'

export const RuntimeMessageType = {
  getTabId: 'runtime.getTabId',
  authSuccess: 'runtime.authSuccess',
  stopAgent: 'runtime.stopAgent',
  sidePanelScopeChanged: 'runtime.sidePanelScopeChanged',
  /* The publik gate (lib/publik/background.ts): a page presses a button,
     wakes the worker, asks for the self-test line, or asks it to apply the
     stored choice to the provider stores again. */
  publikGate: 'runtime.publikGate',
  publikWake: 'runtime.publikWake',
  publikSelfTest: 'runtime.publikSelfTest',
  publikSync: 'runtime.publikSync',
} as const

export interface RuntimePublikGateData {
  action: GateAction
}

export interface RuntimePublikSelfTestResponse {
  line: string
}

export interface RuntimeTabIdResponse {
  tabId?: number
}

export interface RuntimeStopAgentData {
  conversationId: string
}

export interface RuntimeSidePanelScopeChangedData {
  perWindow: boolean
}

type RuntimeMessagesProtocol = {
  [RuntimeMessageType.getTabId](): RuntimeTabIdResponse
  [RuntimeMessageType.authSuccess](): void
  [RuntimeMessageType.stopAgent](data: RuntimeStopAgentData): void
  [RuntimeMessageType.sidePanelScopeChanged](
    data: RuntimeSidePanelScopeChangedData,
  ): void
  [RuntimeMessageType.publikGate](data: RuntimePublikGateData): void
  [RuntimeMessageType.publikWake](): void
  [RuntimeMessageType.publikSelfTest](): RuntimePublikSelfTestResponse
  [RuntimeMessageType.publikSync](): void
}

const { sendMessage, onMessage } =
  defineExtensionMessaging<RuntimeMessagesProtocol>()

export { onMessage as onRuntimeMessage, sendMessage as sendRuntimeMessage }
