import {
  BotIcon,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock,
  Loader2,
  ShieldX,
  XCircle,
} from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from '@/components/ai-elements/task'
import type {
  ToolInvocationInfo,
  ToolInvocationState,
} from './getMessageSegments'
import { toolDetails } from './tool-details'

export interface ToolBatchProps {
  tools: ToolInvocationInfo[]
  isLastBatch: boolean
  isLastMessage: boolean
  isStreaming: boolean
}

export const ToolBatch: FC<ToolBatchProps> = ({
  tools,
  isLastBatch,
  isLastMessage,
  isStreaming,
}) => {
  const shouldBeOpen = isLastMessage && isLastBatch && isStreaming
  const [isOpen, setIsOpen] = useState(shouldBeOpen)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const toggleRow = (id: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  useEffect(() => {
    if (isLastMessage && !hasUserInteracted) {
      if (isLastBatch) {
        setIsOpen(isStreaming)
      } else {
        setIsOpen(false)
      }
    }
  }, [isStreaming, isLastMessage, isLastBatch, hasUserInteracted])

  const completedCount = tools.filter((t) => isToolCompleted(t.state)).length
  const failedCount = tools.filter((t) => isToolError(t.state)).length
  const triggerTitle =
    `${completedCount}/${tools.length} actions completed` +
    (failedCount > 0 ? `, ${failedCount} failed` : '')

  const onManualToggle = (newState: boolean) => {
    setHasUserInteracted(true)
    setIsOpen(newState)
  }

  return (
    <Task open={isOpen} onOpenChange={onManualToggle}>
      <TaskTrigger title={triggerTitle} TriggerIcon={BotIcon} />
      <TaskContent>
        {tools.map((tool) => {
          const open = openRows.has(tool.toolCallId)
          return (
            <div key={tool.toolCallId}>
              <TaskItem>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left hover:text-foreground"
                  aria-expanded={open}
                  onClick={() => toggleRow(tool.toolCallId)}
                >
                  <ToolStatusIcon state={tool.state} />
                  <span className="flex-1">
                    {formatToolName(tool.toolName)}
                  </span>
                  <ChevronRight
                    className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                  />
                </button>
              </TaskItem>
              {tool.errorText ? (
                <p className="break-words pl-5.5 text-muted-foreground text-xs">
                  {tool.errorText}
                </p>
              ) : null}
              {open ? <ToolRowDetails tool={tool} /> : null}
            </div>
          )
        })}
      </TaskContent>
    </Task>
  )
}

const ToolRowDetails: FC<{ tool: ToolInvocationInfo }> = ({ tool }) => {
  const d = toolDetails(tool)
  if (!d.diff && !d.input && !d.output) {
    return <p className="pl-5.5 text-muted-foreground text-xs">No details.</p>
  }
  return (
    <div className="space-y-1 pt-1 pl-5.5 text-xs" data-tool-details>
      {d.path ? (
        <p className="font-mono text-muted-foreground">{d.path}</p>
      ) : null}
      {d.diff ? (
        <pre className="max-h-48 overflow-auto rounded border border-border bg-muted/40 p-2 font-mono">
          {d.diff.map((line, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no id
              key={i}
              className={
                line.sign === '-'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-700 dark:text-green-400'
              }
            >
              {line.sign} {line.text}
            </div>
          ))}
        </pre>
      ) : null}
      {d.input ? (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-muted-foreground">
          {d.input}
        </pre>
      ) : null}
      {d.output ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono">
          {d.output}
        </pre>
      ) : null}
    </div>
  )
}

const formatToolName = (name: string) => {
  return name
    ?.replace(/_/g, ' ')
    ?.replace(/([a-z])([A-Z])/g, '$1 $2')
    ?.replace(/^./, (s) => s.toUpperCase())
}

const isToolCompleted = (state: ToolInvocationState) =>
  state === 'result' || state === 'output-available'

const isToolInProgress = (state: ToolInvocationState) =>
  state === 'call' || state === 'input-available'

const isToolError = (state: ToolInvocationState) => state === 'output-error'

const isToolDenied = (state: ToolInvocationState) => state === 'output-denied'

const isToolWaitingForApproval = (state: ToolInvocationState) =>
  state === 'approval-requested'

const ToolStatusIcon: FC<{ state: ToolInvocationState }> = ({ state }) => {
  if (isToolCompleted(state)) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
  }
  if (isToolWaitingForApproval(state)) {
    return <Clock className="h-3.5 w-3.5 text-yellow-500" />
  }
  if (isToolDenied(state)) {
    return <ShieldX className="h-3.5 w-3.5 text-red-400" />
  }
  if (isToolInProgress(state)) {
    return (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-orange)]" />
    )
  }
  if (isToolError(state)) {
    return <XCircle className="h-3.5 w-3.5 text-destructive" />
  }
  return <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
}
