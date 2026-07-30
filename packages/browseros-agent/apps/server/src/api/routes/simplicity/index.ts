/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Mounts Simplicity's API surface (ported from ~/Vane src/app/api, MIT
 * (c) ItzCrazyKns) onto Hono.
 *
 * Next route handlers are already Web-standard `(Request) => Response`
 * functions, so each is mounted as-is rather than rewritten. The only adaptation
 * is the second argument: Next passes `{ params: Promise<...> }` for dynamic
 * segments, so Hono's `c.req.param()` is wrapped in a resolved promise to match.
 */

import { Hono } from 'hono'
import * as chat from './chat/route'
import * as chatById from './chats/[id]/route'
import * as chats from './chats/route'
import * as config from './config/route'
import * as setupComplete from './config/setup-complete/route'
import * as discover from './discover/route'
import * as images from './images/route'
import * as localRuntimeClaude from './local-runtime/claude/route'
import * as localRuntimeOllama from './local-runtime/ollama/route'
import * as providerById from './providers/[id]/route'
import * as providerModels from './providers/[id]/models/route'
import * as providers from './providers/route'
import * as reconnect from './reconnect/[id]/route'
import * as search from './search/route'
import * as suggestions from './suggestions/route'
import * as uploads from './uploads/route'
import * as videos from './videos/route'
import * as weather from './weather/route'

type Handler = (req: Request, ctx?: unknown) => Promise<Response> | Response

/** Wraps a Next-style handler so Hono can serve it. */
function adapt(handler: Handler, paramNames: string[] = []) {
  return async (c: {
    req: { raw: Request; param: (name: string) => string | undefined }
  }) => {
    if (paramNames.length === 0) {
      return handler(c.req.raw)
    }
    const params: Record<string, string> = {}
    for (const name of paramNames) {
      params[name] = c.req.param(name) ?? ''
    }
    /* Next 15 hands params in as a promise; upstream handlers await it. */
    return handler(c.req.raw, { params: Promise.resolve(params) })
  }
}

export function createSimplicityRoutes(): Hono {
  const app = new Hono()

  app.post('/chat', adapt(chat.POST as Handler))

  app.get('/chats', adapt(chats.GET as Handler))
  app.get('/chats/:id', adapt(chatById.GET as Handler, ['id']))
  app.delete('/chats/:id', adapt(chatById.DELETE as Handler, ['id']))

  app.get('/config', adapt(config.GET as Handler))
  if ('POST' in config) app.post('/config', adapt(config.POST as Handler))
  app.post('/config/setup-complete', adapt(setupComplete.POST as Handler))

  app.get('/providers', adapt(providers.GET as Handler))
  app.post('/providers', adapt(providers.POST as Handler))
  if ('PATCH' in providerById) {
    app.patch('/providers/:id', adapt(providerById.PATCH as Handler, ['id']))
  }
  if ('DELETE' in providerById) {
    app.delete('/providers/:id', adapt(providerById.DELETE as Handler, ['id']))
  }
  app.post('/providers/:id/models', adapt(providerModels.POST as Handler, ['id']))
  app.delete(
    '/providers/:id/models',
    adapt(providerModels.DELETE as Handler, ['id']),
  )

  app.post('/reconnect/:id', adapt(reconnect.POST as Handler, ['id']))

  app.post('/search', adapt(search.POST as Handler))
  app.post('/suggestions', adapt(suggestions.POST as Handler))
  app.get('/discover', adapt(discover.GET as Handler))
  app.post('/images', adapt(images.POST as Handler))
  app.post('/videos', adapt(videos.POST as Handler))
  app.post('/weather', adapt(weather.POST as Handler))
  app.post('/uploads', adapt(uploads.POST as Handler))

  app.get('/local-runtime/ollama', adapt(localRuntimeOllama.GET as Handler))
  if ('POST' in localRuntimeOllama) {
    app.post('/local-runtime/ollama', adapt(localRuntimeOllama.POST as Handler))
  }
  app.get('/local-runtime/claude', adapt(localRuntimeClaude.GET as Handler))
  if ('POST' in localRuntimeClaude) {
    app.post('/local-runtime/claude', adapt(localRuntimeClaude.POST as Handler))
  }

  return app
}
