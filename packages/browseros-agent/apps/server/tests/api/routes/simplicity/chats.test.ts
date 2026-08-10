/**
 * Regression coverage for the Simplicity chat-history routes.
 *
 * These routes (and the search/council agents) import a
 * `lib/simplicity/db` module that never existed after the Simplicity port —
 * see that module's own doc comment. Because `api/routes/simplicity/
 * index.ts` imports `./chats/route` at the top level, and `api/routes/
 * index.ts` mounts it eagerly, the missing module crashed the whole server
 * on boot with `Cannot find module '../../../../lib/simplicity/db'` before
 * it could open a port — reported as "failed to connect to the server."
 *
 * `tests/api/routes/index.test.ts` already exercises this same import
 * chain indirectly (any crash there fails every test in the file), but
 * these tests additionally exercise the routes end to end against a real
 * (temp, isolated — see tests/__helpers__/test-env.ts) sqlite db, so a
 * future schema/route mismatch fails here with a readable assertion
 * instead of a bare "Cannot find module" or 500.
 */

import { describe, expect, it } from 'bun:test'
import { createSimplicityRoutes } from '../../../../src/api/routes/simplicity'
import db from '../../../../src/lib/simplicity/db'
import { chats, messages } from '../../../../src/lib/simplicity/db/schema'

function createTestApp() {
  return createSimplicityRoutes()
}

describe('Simplicity chat routes', () => {
  it('GET /chats resolves and lists chats newest-first', async () => {
    const app = createTestApp()

    await db.insert(chats).values({
      id: 'chat-older',
      title: 'Older chat',
      createdAt: new Date(0).toISOString(),
      sources: ['web'],
      files: [],
    })
    await db.insert(chats).values({
      id: 'chat-newer',
      title: 'Newer chat',
      createdAt: new Date().toISOString(),
      sources: ['web'],
      files: [],
    })

    const response = await app.request('/chats')
    expect(response.status).toBe(200)

    const body = (await response.json()) as { chats: { id: string }[] }
    const ids = body.chats.map((c) => c.id)
    expect(ids).toContain('chat-older')
    expect(ids).toContain('chat-newer')
    // findMany() returns insertion order; the route reverses it so the
    // most recently created chat comes first.
    expect(ids.indexOf('chat-newer')).toBeLessThan(ids.indexOf('chat-older'))
  })

  it('GET /chats/:id 404s for an unknown chat instead of crashing', async () => {
    const app = createTestApp()

    const response = await app.request('/chats/does-not-exist')
    expect(response.status).toBe(404)
  })

  it('GET /chats/:id returns the chat plus its messages', async () => {
    const app = createTestApp()

    await db.insert(chats).values({
      id: 'chat-with-messages',
      title: 'Has messages',
      createdAt: new Date().toISOString(),
      sources: [],
      files: [],
    })
    await db.insert(messages).values({
      chatId: 'chat-with-messages',
      messageId: 'msg-1',
      backendId: 'backend-1',
      query: 'hello',
      createdAt: new Date().toISOString(),
      status: 'completed',
      responseBlocks: [],
    })

    const response = await app.request('/chats/chat-with-messages')
    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      chat: { id: string }
      messages: { messageId: string }[]
    }
    expect(body.chat.id).toBe('chat-with-messages')
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].messageId).toBe('msg-1')
  })

  it('DELETE /chats/:id removes the chat and its messages', async () => {
    const app = createTestApp()

    await db.insert(chats).values({
      id: 'chat-to-delete',
      title: 'Delete me',
      createdAt: new Date().toISOString(),
      sources: [],
      files: [],
    })
    await db.insert(messages).values({
      chatId: 'chat-to-delete',
      messageId: 'msg-1',
      backendId: 'backend-1',
      query: 'hello',
      createdAt: new Date().toISOString(),
      status: 'completed',
      responseBlocks: [],
    })

    const deleteResponse = await app.request('/chats/chat-to-delete', {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(200)

    const getResponse = await app.request('/chats/chat-to-delete')
    expect(getResponse.status).toBe(404)
  })
})
