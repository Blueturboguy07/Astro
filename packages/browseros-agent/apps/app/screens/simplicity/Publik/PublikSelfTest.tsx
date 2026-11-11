import { useEffect, useState } from 'react'
import {
  RuntimeMessageType,
  sendRuntimeMessage,
} from '@/lib/messaging/runtime/runtimeMessages'

/* The builder's self-test of the publik module (publikhq.com/skills/setup.md
 * step 6). An extension has no environment variable to read at start, so the
 * switch is a URL: app.html#/publik/self-test. The background runs
 * selfTest() (a real POST /installs and GET /wallet with this build's app
 * token) and this page prints the one line three ways: in the page, in the
 * tab title, and on the console, which `--enable-logging=stderr` writes to
 * the terminal. RELEASING.md has the command. */

export const PublikSelfTest = () => {
  const [line, setLine] = useState<string>('')

  useEffect(() => {
    let live = true
    const show = (text: string) => {
      if (live) setLine(text)
      document.title = text
      console.log(text)
    }
    sendRuntimeMessage(RuntimeMessageType.publikSelfTest, undefined)
      .then((r) => show(r.line))
      .catch((e: unknown) =>
        show(
          `publik self-test: failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      )
    return () => {
      live = false
    }
  }, [])

  return (
    <pre
      id="publik-self-test"
      className="min-h-screen bg-white p-6 font-mono text-black text-sm dark:bg-neutral-950 dark:text-white"
    >
      {line}
    </pre>
  )
}

export default PublikSelfTest
