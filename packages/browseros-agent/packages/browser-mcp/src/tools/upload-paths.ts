import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * Turns the agent's file paths into real ones before Chrome gets them.
 * "~/Downloads/cv.pdf" went to Chrome unchanged; Chrome set a 0-byte file,
 * the form submit hung the tab, and later tool calls waited 120 s (Astro
 * 0.2.4 QA, F-074). "~" is expanded and a missing or empty file is
 * refused with a clear error.
 */
export function resolveUploadPaths(
  files: string[],
  home: string = homedir(),
): { paths: string[] } | { error: string } {
  const paths: string[] = []
  for (const raw of files) {
    const trimmed = raw.trim()
    const expanded =
      trimmed === '~'
        ? home
        : trimmed.startsWith('~/')
          ? join(home, trimmed.slice(2))
          : trimmed
    if (!isAbsolute(expanded)) {
      return {
        error: `upload: "${raw}" is not a full path. Give the full path, for example ${join(home, 'Downloads', 'file.pdf')}.`,
      }
    }
    const path = resolve(expanded)
    let size: number
    try {
      const st = statSync(path)
      if (!st.isFile()) {
        return { error: `upload: "${raw}" is a folder, not a file.` }
      }
      size = st.size
    } catch {
      return {
        error: `upload: no file at "${raw}" (${path}). Check the path; nothing was uploaded.`,
      }
    }
    if (size === 0) {
      return {
        error: `upload: "${raw}" is empty (0 bytes); nothing was uploaded.`,
      }
    }
    paths.push(path)
  }
  return { paths }
}
