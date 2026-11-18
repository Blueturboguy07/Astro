/**
 * What an opened tool row shows (Astro 0.2.4 QA, INV-TOOLS-22): the panel
 * showed only "Filesystem edit" and a check mark, with no input, output or
 * change. An edit shows a small diff; other tools their input and output.
 */
export interface DiffLine {
  sign: '-' | '+'
  text: string
}

export interface ToolDetails {
  path?: string
  diff?: DiffLine[]
  input?: string
  output?: string
}

const INPUT_MAX = 800
const OUTPUT_MAX = 1500
const DIFF_LINES_MAX = 40

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

/** Text parts of a tool output ({content:[{type:'text'}]}, {text}, or a string). */
export function toolOutputText(output: unknown): string {
  if (typeof output === 'string') return output
  if (!output || typeof output !== 'object') return ''
  const content = (output as { content?: unknown }).content
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        item &&
        typeof item === 'object' &&
        (item as { type?: unknown }).type === 'text' &&
        typeof (item as { text?: unknown }).text === 'string'
          ? (item as { text: string }).text
          : '',
      )
      .filter(Boolean)
      .join('\n')
  }
  const text = (output as { text?: unknown }).text
  return typeof text === 'string' ? text : ''
}

function diffLines(oldStr: string, newStr: string): DiffLine[] {
  const lines: DiffLine[] = [
    ...oldStr.split('\n').map((text) => ({ sign: '-' as const, text })),
    ...newStr.split('\n').map((text) => ({ sign: '+' as const, text })),
  ]
  if (lines.length <= DIFF_LINES_MAX) return lines
  return [
    ...lines.slice(0, DIFF_LINES_MAX),
    { sign: '+', text: `… ${lines.length - DIFF_LINES_MAX} more lines` },
  ]
}

export function toolDetails(tool: {
  toolName: string
  input: Record<string, unknown>
  output: unknown
}): ToolDetails {
  const input = tool.input ?? {}
  const outputText = toolOutputText(tool.output).trim()
  if (
    tool.toolName === 'filesystem_edit' &&
    typeof input.old_string === 'string' &&
    typeof input.new_string === 'string'
  ) {
    return {
      path: typeof input.path === 'string' ? input.path : undefined,
      diff: diffLines(input.old_string, input.new_string),
      output: outputText ? clip(outputText.split('\n')[0], 300) : undefined,
    }
  }
  const inputText =
    Object.keys(input).length > 0 ? JSON.stringify(input, null, 2) : ''
  return {
    input: inputText ? clip(inputText, INPUT_MAX) : undefined,
    output: outputText ? clip(outputText, OUTPUT_MAX) : undefined,
  }
}
