import { describe, expect, it } from 'bun:test'
import { createSimplicityRoutes } from '../../../../src/api/routes/simplicity'

/* Astro 0.2.4 QA, F-087: the one-click Ollama install (download the engine,
   start it, pull a model) and the Claude Code check were reachable only from
   an unrouted setup wizard. The routes are gone, so no page can start a
   download or a Claude Code prompt through them. */
describe('removed local-runtime routes', () => {
  for (const path of ['/local-runtime/ollama', '/local-runtime/claude']) {
    for (const method of ['GET', 'POST']) {
      it(`${method} ${path} is not served`, async () => {
        const res = await createSimplicityRoutes().request(path, { method })
        expect(res.status).toBe(404)
      })
    }
  }
})
