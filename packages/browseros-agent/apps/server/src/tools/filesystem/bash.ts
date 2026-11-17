import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { findCommandEscape } from './command-boundary'
import { resolveWorkspaceRoot } from './path-boundary'
import {
  developerDir,
  SANDBOX_EXEC,
  sandboxArgs,
  sandboxPath,
  sandboxStartError,
} from './shell-sandbox'
import {
  DEFAULT_BASH_TIMEOUT,
  executeWithMetrics,
  toModelOutput,
  truncateTail,
} from './utils'

const TOOL_NAME = 'filesystem_bash'

function getShellArgs(): [string, string] {
  if (process.platform === 'win32') return ['cmd.exe', '/c']
  return [process.env.SHELL || '/bin/sh', '-c']
}

/* Astro 0.2.4 QA, F-083: the shell stays inside the workspace. HOME points at
   the workspace (the real home is closed by the sandbox, and "~" then stays
   inside); variables that could lead out of it are removed. */
function shellEnv(root: string, tempDir: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  for (const k of ['OLDPWD', 'CDPATH', 'BASH_ENV', 'ENV', 'ZDOTDIR']) {
    delete env[k]
  }
  env.PWD = root
  env.TMPDIR = tempDir
  env.TMP = tempDir
  env.TEMP = tempDir
  if (process.platform !== 'win32') {
    env.HOME = root
    env.GIT_CEILING_DIRECTORIES = dirname(root)
  }
  if (process.platform === 'darwin') {
    env.PATH = sandboxPath(env.PATH, developerDir())
  }
  return env
}

export function createBashTool(cwd: string) {
  return tool({
    description:
      'Execute a shell command inside the selected workspace folder and return its output. Commands run in a shell (sh/bash on Unix, cmd on Windows) whose working folder and HOME are the workspace; paths outside the workspace are refused. Output is truncated to the last 2000 lines if too large.',
    inputSchema: z.object({
      command: z.string().describe('Shell command to execute'),
      timeout: z
        .number()
        .optional()
        .describe(`Timeout in seconds (default: ${DEFAULT_BASH_TIMEOUT})`),
    }),
    execute: (params) =>
      executeWithMetrics(TOOL_NAME, () =>
        runConfined(cwd, params.command, params.timeout),
      ),
    toModelOutput,
  })
}

type ShellResult = { text: string; isError?: boolean }

async function runConfined(
  cwd: string,
  command: string,
  timeout: number | undefined,
): Promise<ShellResult> {
  const [shell, flag] = getShellArgs()

  let root: string
  try {
    root = await resolveWorkspaceRoot(cwd)
  } catch {
    return {
      text: 'The workspace folder does not exist. The command did not run.',
      isError: true,
    }
  }
  if (process.platform === 'darwin' && !existsSync(SANDBOX_EXEC)) {
    return {
      text: `The command did not run: ${SANDBOX_EXEC} is missing, so the shell cannot be kept inside the workspace.`,
      isError: true,
    }
  }

  const tempDir = await realpath(await mkdtemp(join(tmpdir(), 'astro-bash-')))
  try {
    const env = shellEnv(root, tempDir)
    const refusal = findCommandEscape(command, {
      root,
      tempDir,
      env,
      platform: process.platform,
    })
    if (refusal) {
      return { text: `${refusal} The command did not run.`, isError: true }
    }

    const argv =
      process.platform === 'darwin'
        ? sandboxArgs(root, tempDir, [shell, flag, command])
        : [shell, flag, command]
    return await runShell(argv, root, env, timeout)
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function runShell(
  argv: string[],
  root: string,
  env: Record<string, string>,
  timeout: number | undefined,
): Promise<ShellResult> {
  const timeoutMs = (timeout || DEFAULT_BASH_TIMEOUT) * 1000
  const proc = Bun.spawn(argv, {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env,
  })

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, timeoutMs)

  const [stdoutText, stderrText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  const exitCode = await proc.exited
  clearTimeout(timer)

  if (process.platform === 'darwin') {
    const startError = sandboxStartError(exitCode, stderrText)
    if (startError && !timedOut) {
      return {
        text: `The command did not run: the shell sandbox could not start (${startError}).`,
        isError: true,
      }
    }
  }

  let output = stdoutText
  if (stderrText) output += (output ? '\n' : '') + stderrText

  if (timedOut) {
    const truncated = truncateTail(output)
    return {
      text: `Command timed out after ${timeout || DEFAULT_BASH_TIMEOUT}s\n\n${truncated.content}`,
      isError: true,
    }
  }

  const truncated = truncateTail(output)
  let result = truncated.content
  if (truncated.truncated) {
    result = `(Output truncated. Showing last ${truncated.keptLines} of ${truncated.totalLines} lines)\n${result}`
  }

  if (exitCode !== 0) {
    result += `\n\n[Exit code: ${exitCode}]`
    return { text: result, isError: true }
  }

  return { text: result || '(no output)' }
}
