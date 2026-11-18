export type AgentAction = 'get' | 'connect' | 'disconnect' | 'manual'

/** The one button an agent row shows. */
export function agentAction(agent: {
  installed: boolean
  linked: boolean
  setup?: 'one-click' | 'manual'
}): AgentAction {
  if (agent.linked) return 'disconnect'
  if (!agent.installed) return 'get'
  return agent.setup === 'manual' ? 'manual' : 'connect'
}
