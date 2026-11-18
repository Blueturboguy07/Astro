import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* Astro 0.2.4 QA, F-089: the scheduled-task dialog and card showed the
   OpenAI logo next to "publik Balanced": a publik tier is an
   openai-compatible entry, and only its id picks the publik mark. */
describe('scheduled tasks pass the provider id to ProviderIcon', () => {
  for (const file of ['ScheduledTaskCard.tsx', 'NewScheduledTaskDialog.tsx']) {
    it(file, () => {
      const src = readFileSync(join(import.meta.dir, file), 'utf-8')
      const uses = src.split('<ProviderIcon').slice(1)
      expect(uses.length).toBeGreaterThan(0)
      for (const use of uses) {
        expect(use.slice(0, use.indexOf('/>'))).toContain('providerId=')
      }
    })
  }
})
