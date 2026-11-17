import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* Astro 0.2.4 QA, F-042 (round 3): PDF uploads failed only in the
   bun-compiled server ("Failed to load native binding", then "Cannot find
   module './pdf.worker.mjs'"); dev tests passed because node_modules exist.

   1. Always: compile a probe binary from the real upload route, with the
      production native-addon guard, start it, POST the PDF, expect 200 and the
      text in the saved content file.
   2. With ASTRO_COMPILED_SERVER_URL (for example http://127.0.0.1:9512 of a
      running packaged server): POST the PDF to it and expect 200. */

const SERVER_SRC = join(import.meta.dir, '../../../src')
const PDF = join(import.meta.dir, 'hello-upload.pdf')
const EXPECTED = 'Hello Astro upload test'
const DOCX = join(import.meta.dir, 'hello-upload.docx')
const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function postFile(
  base: string,
  path: string,
  name: string,
  type: string,
): Promise<Response> {
  const form = new FormData()
  form.append('files', new File([await readFile(path)], name, { type }))
  return fetch(`${base}/uploads`, { method: 'POST', body: form })
}

const postPdf = (base: string) =>
  postFile(base, PDF, 'hello-upload.pdf', 'application/pdf')

describe('PDF and .docx upload in a compiled binary', () => {
  let dir = ''
  let app: ReturnType<typeof Bun.spawn> | null = null
  let base = ''

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'astro-pdf-compiled-'))
    const entry = join(dir, 'probe.ts')
    await writeFile(
      entry,
      [
        `import { installNativeAddonGuard } from ${JSON.stringify(join(SERVER_SRC, 'lib/native-addon-guard'))}`,
        'installNativeAddonGuard()',
        `const { POST } = await import(${JSON.stringify(join(SERVER_SRC, 'api/routes/simplicity/uploads/route'))})`,
        "const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (req) => POST(req) })",
        "console.log('PORT=' + server.port)",
      ].join('\n'),
    )
    const bin = join(dir, 'probe')
    const build = Bun.spawn(
      [
        process.execPath,
        'build',
        '--compile',
        entry,
        '--outfile',
        bin,
        '--external',
        'node-pty',
      ],
      {
        /* As the release build: production inlines the plain logger. */
        env: { ...process.env, NODE_ENV: 'production' },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const buildErr = await new Response(build.stderr).text()
    expect({ exit: await build.exited, buildErr }).toMatchObject({ exit: 0 })
    /* The source tree must not be reachable at run time. */
    await rm(entry)

    app = Bun.spawn([bin], {
      cwd: dir,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: dir,
        BROWSEROS_DIR: join(dir, 'browseros'),
        NODE_ENV: 'production',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const reader = (app.stdout as ReadableStream<Uint8Array>).getReader()
    let out = ''
    while (!out.includes('\n')) {
      const { value, done } = await reader.read()
      if (done) break
      out += new TextDecoder().decode(value)
    }
    reader.releaseLock()
    const port = /PORT=(\d+)/.exec(out)?.[1]
    expect(port).toBeDefined()
    base = `http://127.0.0.1:${port}`
  }, 180_000)

  afterAll(async () => {
    app?.kill()
    await app?.exited
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  async function expectSaved(res: Response, text: string) {
    const body = (await res.json()) as {
      message?: string
      files?: { fileId: string }[]
    }
    expect({ status: res.status, message: body.message }).toEqual({
      status: 200,
      message: undefined,
    })
    const fileId = body.files?.[0]?.fileId
    expect(fileId).toBeDefined()
    const records = JSON.parse(
      await readFile(
        join(dir, 'browseros/simplicity/uploads/uploaded_files.json'),
        'utf-8',
      ),
    ) as { files: { id: string; contentPath: string }[] }
    const record = records.files.find((f) => f.id === fileId)
    expect(record).toBeDefined()
    expect(await readFile(record?.contentPath ?? '', 'utf-8')).toContain(text)
  }

  it('returns 200 and saves the PDF text', async () => {
    await expectSaved(await postPdf(base), EXPECTED)
  }, 60_000)

  it('returns 200 and saves the .docx text', async () => {
    await expectSaved(
      await postFile(base, DOCX, 'hello-upload.docx', DOCX_TYPE),
      'Hello Astro docx test',
    )
  }, 60_000)
})

const LIVE = process.env.ASTRO_COMPILED_SERVER_URL?.trim()

describe.skipIf(!LIVE)('PDF upload on a running packaged server', () => {
  it('returns 200 with the file id', async () => {
    const res = await postPdf(`${LIVE}/api`)
    const body = (await res.json()) as { files?: { fileId: string }[] }
    expect(res.status).toBe(200)
    expect(body.files?.[0]?.fileId).toBeString()
  }, 60_000)
})
