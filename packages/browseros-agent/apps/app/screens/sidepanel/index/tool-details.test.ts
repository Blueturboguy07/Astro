import { describe, expect, it } from 'bun:test'
import { toolDetails, toolOutputText } from './tool-details'

describe('toolDetails (INV-TOOLS-22)', () => {
  it('shows a filesystem edit as a small diff with its path', () => {
    const d = toolDetails({
      toolName: 'filesystem_edit',
      input: {
        path: 'notes.txt',
        old_string: 'hello',
        new_string: 'hi\nthere',
      },
      output: {
        content: [
          { type: 'text', text: 'Applied edit to notes.txt\n\n- hello\n+ hi' },
        ],
      },
    })
    expect(d.path).toBe('notes.txt')
    expect(d.diff).toEqual([
      { sign: '-', text: 'hello' },
      { sign: '+', text: 'hi' },
      { sign: '+', text: 'there' },
    ])
    expect(d.output).toBe('Applied edit to notes.txt')
    expect(d.input).toBeUndefined()
  })

  it('caps a long diff', () => {
    const d = toolDetails({
      toolName: 'filesystem_edit',
      input: {
        path: 'a',
        old_string: Array(30).fill('x').join('\n'),
        new_string: Array(30).fill('y').join('\n'),
      },
      output: '',
    })
    expect(d.diff?.length).toBe(41)
    expect(d.diff?.at(-1)?.text).toBe('… 20 more lines')
  })

  it('shows input and text output of other tools, never image data', () => {
    const d = toolDetails({
      toolName: 'read',
      input: { page: 3, format: 'text' },
      output: {
        content: [
          { type: 'image', data: 'AAAA', mimeType: 'image/png' },
          { type: 'text', text: 'Example Domain' },
        ],
      },
    })
    expect(d.input).toContain('"format": "text"')
    expect(d.output).toBe('Example Domain')
    expect(d.diff).toBeUndefined()
  })

  it('reads {text} and string outputs; an empty input is left out', () => {
    expect(toolOutputText({ text: 'ok' })).toBe('ok')
    expect(toolOutputText('plain')).toBe('plain')
    expect(toolDetails({ toolName: 'tabs', input: {}, output: [] })).toEqual({
      input: undefined,
      output: undefined,
    })
  })
})
