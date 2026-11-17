'use client'

import { note402 } from '@/lib/publik/publik'
import { randomHex } from '@/lib/simplicity/random-id'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useParams, useSearchParams } from 'react-router'
import { applyPatch } from 'rfc6902'
import { toast } from 'sonner'
import type { Block } from '@/lib/simplicity/types'
import type { Message, Widget } from '@/screens/simplicity/ChatWindow'
import { getSuggestions } from '../actions'
import { getAutoMediaSearch } from '../config/clientRegistry'
import { publikServerProviderIdStorage } from '@/lib/publik/providers'
import {
  CHOSEN_CHAT_MODEL_STORAGE_KEY,
  parseChosenChatModel,
  resolveChatModel,
} from '../models/catalog'
import type { MinimalProvider } from '../models/types'
import { apiFetch } from '@/lib/simplicity/api-fetch'
import {
  needsReconnect,
  readTurnStream,
  TURN_LOST_TEXT,
} from '@/lib/simplicity/read-turn-stream'
import {
  readOptimizationMode,
  readSources,
  saveAnswerPref,
} from '@/lib/simplicity/answer-prefs'

export type Section = {
  message: Message
  widgets: Widget[]
  parsedTextBlocks: string[]
  speechMessage: string
  thinkingEnded: boolean
  suggestions?: string[]
}

type ChatContext = {
  messages: Message[]
  sections: Section[]
  chatHistory: [string, string][]
  files: File[]
  fileIds: string[]
  sources: string[]
  chatId: string | undefined
  optimizationMode: string
  /* Composer's Search/Deep research/Model council pill — orthogonal to
     optimizationMode. Persisted to localStorage so a choice survives a
     reload, the same way the model and thinking toggles do. */
  searchMode: 'search' | 'deepResearch' | 'council'
  /* Perplexity ground truth: a lock toggle near the composer. Plain React
     state (never localStorage) so it's scoped to the CURRENT thread only —
     a new chat always starts with it off. When true, the client still
     streams the turn exactly as normal (blocks flow through SessionManager,
     not the db) but sends `incognito: true` so the server skips every
     chats/messages row write for this thread (route.ts + search/index.ts). */
  incognito: boolean
  isMessagesLoaded: boolean
  loading: boolean
  notFound: boolean
  messageAppeared: boolean
  isReady: boolean
  hasError: boolean
  connectionErrorMessage: string | null
  /** `quiet`: no toast (the automatic retries of ChatWindow). */
  retryConnection: (opts?: { quiet?: boolean }) => void
  /* The left rail's New: a fresh thread even when the URL already says
     #/home (sendMessage rewrites the hash without telling the router). */
  startNewChat: () => void
  chatModelProvider: ChatModelProvider
  embeddingModelProvider: EmbeddingModelProvider
  researchEnded: boolean
  setResearchEnded: (ended: boolean) => void
  setOptimizationMode: (mode: string) => void
  setSearchMode: (mode: 'search' | 'deepResearch' | 'council') => void
  setSources: (sources: string[]) => void
  setIncognito: (incognito: boolean) => void
  setFiles: (files: File[]) => void
  setFileIds: (fileIds: string[]) => void
  sendMessage: (
    message: string,
    messageId?: string,
    rewrite?: boolean,
  ) => Promise<void>
  stopGeneration: () => void
  rewrite: (messageId: string) => void
  setChatModelProvider: (provider: ChatModelProvider) => void
  setEmbeddingModelProvider: (provider: EmbeddingModelProvider) => void
}

export interface File {
  fileName: string
  fileExtension: string
  fileId: string
}

interface ChatModelProvider {
  key: string
  providerId: string
}

interface EmbeddingModelProvider {
  key: string
  providerId: string
}

const checkConfig = async (
  setChatModelProvider: (provider: ChatModelProvider) => void,
  setEmbeddingModelProvider: (provider: EmbeddingModelProvider) => void,
  setIsConfigReady: (ready: boolean) => void,
  setHasError: (hasError: boolean) => void,
  setConnectionErrorMessage: (message: string | null) => void,
  quiet = false,
) => {
  /* Cleared up front, not just left false-by-default: this also runs from
     the "Retry" button (ChatWindow's hasError screen), and without this
     reset a retry that fails with no message (network error has none) would
     keep showing the previous attempt's message under a fresh spinner. */
  setHasError(false)
  setConnectionErrorMessage(null)
  try {
    let embeddingModelKey = localStorage.getItem('embeddingModelKey')
    let embeddingModelProviderId = localStorage.getItem(
      'embeddingModelProviderId',
    )

    const res = await apiFetch(`/api/providers`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Provider fetching failed with status code ${res.status}`)
    }

    const data = await res.json()
    const providers: MinimalProvider[] = data.providers

    if (providers.length === 0) {
      throw new Error(
        'No chat model providers found, please configure them in the settings page.',
      )
    }

    /* Honour the person's own pick only while it still resolves to a real
       model — otherwise fall back to the curated catalog. Picking
       `chatModels[0]` (the old behaviour) selects whatever the provider's API
       happened to list first, which is how a Groq safety classifier or a
       retired gpt-3.5 ends up answering questions and hanging the request.
       The last resolved model (chatModelKey) is not a choice: re-resolving it
       lets the default follow what is connected, e.g. publik once the
       background has registered it. */
    const resolved = resolveChatModel(
      providers,
      parseChosenChatModel(
        localStorage.getItem(CHOSEN_CHAT_MODEL_STORAGE_KEY),
      ),
    )
    if (!resolved) {
      throw new Error(
        'No chat models found, please configure them in the settings page.',
      )
    }

    const chatModelProviderId = resolved.providerId
    const chatModelKey = resolved.key

    /* Embeddings only rerank search results, so this is never a user choice.
       Prefer a purpose-built embedding model — Ollama lists its chat models
       here too, and picking one of those means running every search result
       through a 7B chat model. */
    const embeddingModelProvider =
      providers.find((p) => p.id === embeddingModelProviderId) ??
      providers.find(
        (p) =>
          p.type === 'ollama' &&
          p.embeddingModels.some((m) => m.key.includes('embed')),
      ) ??
      providers.find((p) => p.embeddingModels.length > 0)

    /* Upstream threw here when no embedding provider existed, which hard-failed
       the whole app into "Failed to connect to the server". BrowserOS's default
       provider (Claude Code, via your existing subscription) exposes chat models
       and no embedding models, and this fork's retrieval path deliberately does
       not embed — SearXNG's cross-engine ranking plus a model-driven picker
       replaced the cosine rerank. So a missing embedding provider is now a
       degraded mode, not a fatal error. */
    if (embeddingModelProvider) {
      embeddingModelProviderId = embeddingModelProvider.id

      /* Same reasoning as the provider choice above: prefer an actual embedding
         model over index 0, which for Ollama is a chat model. */
      const embeddingModel =
        embeddingModelProvider.embeddingModels.find(
          (m) => m.key === embeddingModelKey,
        ) ??
        embeddingModelProvider.embeddingModels.find((m) =>
          m.key.includes('embed'),
        ) ??
        embeddingModelProvider.embeddingModels[0]
      embeddingModelKey = embeddingModel?.key ?? ''
    } else {
      embeddingModelProviderId = ''
      embeddingModelKey = ''
    }

    localStorage.setItem('chatModelKey', chatModelKey)
    localStorage.setItem('chatModelProviderId', chatModelProviderId)
    localStorage.setItem('embeddingModelKey', embeddingModelKey)
    localStorage.setItem('embeddingModelProviderId', embeddingModelProviderId)

    setChatModelProvider({
      key: chatModelKey,
      providerId: chatModelProviderId,
    })

    setEmbeddingModelProvider({
      key: embeddingModelKey,
      providerId: embeddingModelProviderId,
    })

    setIsConfigReady(true)
  } catch (err: any) {
    /* The toast is easy to miss (auto-dismisses, and this runs before the
       user has seen any UI to look at) — ChatWindow's error screen shows
       the same message so it's still there once the toast is gone.
       A plain "fetch failed" TypeError (nothing is listening on the port
       yet) and McpPortError/ProxyPortError (the browser hasn't reported a
       port at all — the server never started or died before it could)
       both mean the same thing to a user: the local agent server isn't
       reachable. Neither has a message worth showing verbatim, so give
       that whole class of failure one clear explanation instead of an
       empty or internals-flavored one. Anything else (e.g. "No chat model
       providers found...") is already written for a user and passes
       through unchanged. */
    const isUnreachable =
      err instanceof TypeError ||
      err?.name === 'McpPortError' ||
      err?.name === 'ProxyPortError'
    const message = isUnreachable
      ? "Can't reach the local Astro server. It may still be starting, or it may have failed to start — try again in a moment."
      : (err?.message ?? 'Something went wrong connecting to the server.')
    if (!quiet) toast.error(message)
    setIsConfigReady(false)
    setHasError(true)
    setConnectionErrorMessage(message)
  }
}

const loadMessages = async (
  chatId: string,
  setMessages: (messages: Message[]) => void,
  setIsMessagesLoaded: (loaded: boolean) => void,
  chatHistory: React.MutableRefObject<[string, string][]>,
  setSources: (sources: string[]) => void,
  setNotFound: (notFound: boolean) => void,
  setFiles: (files: File[]) => void,
  setFileIds: (fileIds: string[]) => void,
) => {
  const res = await apiFetch(`/api/chats/${chatId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (res.status === 404) {
    setNotFound(true)
    setIsMessagesLoaded(true)
    return
  }

  const data = await res.json()

  const messages = data.messages as Message[]

  setMessages(messages)

  const history: [string, string][] = []
  messages.forEach((msg) => {
    history.push(['human', msg.query])

    const textBlocks = msg.responseBlocks
      .filter(
        (block): block is Block & { type: 'text' } => block.type === 'text',
      )
      .map((block) => block.data)
      .join('\n')

    if (textBlocks) {
      history.push(['assistant', textBlocks])
    }
  })

  if (messages.length > 0) {
    document.title = messages[0].query
  }

  const files = data.chat.files.map((file: any) => {
    return {
      fileName: file.name,
      fileExtension: file.name.split('.').pop(),
      fileId: file.fileId,
    }
  })

  setFiles(files)
  setFileIds(files.map((file: File) => file.fileId))

  chatHistory.current = history
  setSources(data.chat.sources)
  setIsMessagesLoaded(true)
}

export const chatContext = createContext<ChatContext>({
  chatHistory: [],
  chatId: '',
  fileIds: [],
  files: [],
  sources: [],
  hasError: false,
  connectionErrorMessage: null,
  retryConnection: () => {},
  startNewChat: () => {},
  isMessagesLoaded: false,
  isReady: false,
  loading: false,
  messageAppeared: false,
  messages: [],
  sections: [],
  notFound: false,
  optimizationMode: '',
  searchMode: 'search',
  incognito: false,
  chatModelProvider: { key: '', providerId: '' },
  embeddingModelProvider: { key: '', providerId: '' },
  researchEnded: false,
  rewrite: () => {},
  sendMessage: async () => {},
  stopGeneration: () => {},
  setFileIds: () => {},
  setFiles: () => {},
  setSources: () => {},
  setIncognito: () => {},
  setOptimizationMode: () => {},
  setSearchMode: () => {},
  setChatModelProvider: () => {},
  setEmbeddingModelProvider: () => {},
  setResearchEnded: () => {},
})

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
  const params = useParams<{ chatId?: string }>()

  /* react-router's useSearchParams returns a [params, setParams] tuple, unlike
     Next's, which returns the params object directly. */
  const [searchParams] = useSearchParams()
  const initialMessage = searchParams.get('q')

  const [chatId, setChatId] = useState<string | undefined>(params.chatId)
  const [newChatCreated, setNewChatCreated] = useState(false)

  const [loading, setLoading] = useState(false)
  const [messageAppeared, setMessageAppeared] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const [researchEnded, setResearchEnded] = useState(false)

  const chatHistory = useRef<[string, string][]>([])
  const [messages, setMessages] = useState<Message[]>([])

  const [files, setFiles] = useState<File[]>([])
  const [fileIds, setFileIds] = useState<string[]>([])

  const [sources, setSourcesState] = useState<string[]>(readSources)
  const [incognito, setIncognito] = useState(false)
  const [optimizationMode, setOptimizationModeState] =
    useState(readOptimizationMode)
  /* The person's picks persist (F-065); an opened chat's own sources do
     not change the default (loadMessages uses the state setter). */
  const setSources = (next: string[]) => {
    setSourcesState(next)
    saveAnswerPref('answerSources', next)
  }
  const setOptimizationMode = (mode: string) => {
    setOptimizationModeState(mode)
    saveAnswerPref('optimizationMode', mode)
  }
  const [searchMode, setSearchModeState] = useState<
    'search' | 'deepResearch' | 'council'
  >('search')

  const [isMessagesLoaded, setIsMessagesLoaded] = useState(false)

  const [notFound, setNotFound] = useState(false)

  const [chatModelProvider, setChatModelProvider] = useState<ChatModelProvider>(
    {
      key: '',
      providerId: '',
    },
  )

  const [embeddingModelProvider, setEmbeddingModelProvider] =
    useState<EmbeddingModelProvider>({
      key: '',
      providerId: '',
    })

  const [isConfigReady, setIsConfigReady] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [connectionErrorMessage, setConnectionErrorMessage] = useState<
    string | null
  >(null)
  const [isReady, setIsReady] = useState(false)

  const messagesRef = useRef<Message[]>([])

  const sections = useMemo<Section[]>(() => {
    return messages.map((msg) => {
      const textBlocks: string[] = []
      let speechMessage = ''
      let thinkingEnded = false
      let suggestions: string[] = []

      const sourceBlocks = msg.responseBlocks.filter(
        (block): block is Block & { type: 'source' } => block.type === 'source',
      )
      const sources = sourceBlocks.flatMap((block) => block.data)

      const widgetBlocks = msg.responseBlocks
        .filter((b) => b.type === 'widget')
        .map((b) => b.data) as Widget[]

      msg.responseBlocks.forEach((block) => {
        if (block.type === 'text') {
          let processedText = block.data
          const citationRegex = /\[([^\]]+)\]/g
          const regex = /\[(\d+)\]/g

          if (processedText.includes('<think>')) {
            const openThinkTag = processedText.match(/<think>/g)?.length || 0
            const closeThinkTag = processedText.match(/<\/think>/g)?.length || 0

            if (openThinkTag && !closeThinkTag) {
              processedText += '</think> <a> </a>'
            }
          }

          if (block.data.includes('</think>')) {
            thinkingEnded = true
          }

          if (sources.length > 0) {
            processedText = processedText.replace(
              citationRegex,
              (_, capturedContent: string) => {
                const numbers = capturedContent
                  .split(',')
                  .map((numStr) => numStr.trim())

                const linksHtml = numbers
                  .map((numStr) => {
                    const number = parseInt(numStr, 10)

                    if (Number.isNaN(number) || number <= 0) {
                      return `[${numStr}]`
                    }

                    const source = sources[number - 1]
                    const url = source?.metadata?.url

                    if (url) {
                      return `<citation href="${url}">${numStr}</citation>`
                    } else {
                      return ``
                    }
                  })
                  .join('')

                return linksHtml
              },
            )
            speechMessage += block.data.replace(regex, '')
          } else {
            processedText = processedText.replace(regex, '')
            speechMessage += block.data.replace(regex, '')
          }

          textBlocks.push(processedText)
        } else if (block.type === 'suggestion') {
          suggestions = block.data
        }
      })

      return {
        message: msg,
        parsedTextBlocks: textBlocks,
        speechMessage,
        thinkingEnded,
        suggestions,
        widgets: widgetBlocks,
      }
    })
  }, [messages])

  const isReconnectingRef = useRef(false)
  /* Turns this page streams right now; see needsReconnect. */
  const liveTurnsRef = useRef<Set<string>>(new Set())
  const handledMessageEndRef = useRef<Set<string>>(new Set())
  /* A turn whose stream ended without messageEnd or error (the local
     server stopped, the page reloaded) must not show "Brainstorming..."
     with Stop for ever (F-059, F-060). */
  const failTurn = (messageId: string, text: string) => {
    setLoading(false)
    setResearchEnded(true)
    setMessages((prev) =>
      prev.map((msg) =>
        msg.messageId === messageId
          ? {
              ...msg,
              status: 'error' as const,
              responseBlocks: [
                ...msg.responseBlocks,
                {
                  id: globalThis.crypto.randomUUID(),
                  type: 'error',
                  data: text,
                } as any,
              ],
            }
          : msg,
      ),
    )
  }

  const checkReconnect = async () => {
    if (isReconnectingRef.current) return

    setIsReady(true)

    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1]

      if (needsReconnect(lastMsg, liveTurnsRef.current)) {
        setLoading(true)
        setResearchEnded(false)
        setMessageAppeared(false)

        isReconnectingRef.current = true

        try {
          const res = await apiFetch(`/api/reconnect/${lastMsg.backendId}`, {
            method: 'POST',
          })

          /* 404: the server no longer runs this turn (it restarted). */
          if (!res.ok || !res.body) {
            failTurn(lastMsg.messageId, TURN_LOST_TEXT)
            return
          }

          const messageHandler = getMessageHandler(lastMsg)
          const outcome = await readTurnStream(res.body, messageHandler)
          if (outcome === 'lost') failTurn(lastMsg.messageId, TURN_LOST_TEXT)
        } catch {
          failTurn(lastMsg.messageId, TURN_LOST_TEXT)
        } finally {
          isReconnectingRef.current = false
        }
      }
    }
  }

  const retryConnection = (opts?: { quiet?: boolean }) => {
    checkConfig(
      setChatModelProvider,
      setEmbeddingModelProvider,
      setIsConfigReady,
      setHasError,
      setConnectionErrorMessage,
      opts?.quiet,
    )
  }

  useEffect(() => {
    retryConnection()
    /* Connect your plan registers publik with the local server from the
       background, which can finish after this page loaded: resolve again
       when it lands. A pick made in another tab (localStorage is shared by
       every app page) applies here too. */
    const unwatch = publikServerProviderIdStorage.watch(() => retryConnection())
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHOSEN_CHAT_MODEL_STORAGE_KEY) retryConnection()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unwatch()
      window.removeEventListener('storage', onStorage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('searchMode')
    if (
      stored === 'search' ||
      stored === 'deepResearch' ||
      stored === 'council'
    ) {
      setSearchModeState(stored)
    }
  }, [])

  const setSearchMode = (mode: 'search' | 'deepResearch' | 'council') => {
    setSearchModeState(mode)
    localStorage.setItem('searchMode', mode)
  }

  useEffect(() => {
    if (params.chatId && params.chatId !== chatId) {
      setChatId(params.chatId)
      setMessages([])
      chatHistory.current = []
      setFiles([])
      setFileIds([])
      setIsMessagesLoaded(false)
      setNotFound(false)
      setNewChatCreated(false)
      /* Navigating to a different (already-persisted) chat — incognito is
         scoped to the thread that was active, never the one being switched
         to. */
      setIncognito(false)
    }
  }, [params.chatId, chatId])

  useEffect(() => {
    if (
      chatId &&
      !newChatCreated &&
      !isMessagesLoaded &&
      messages.length === 0
    ) {
      loadMessages(
        chatId,
        setMessages,
        setIsMessagesLoaded,
        chatHistory,
        setSourcesState,
        setNotFound,
        setFiles,
        setFileIds,
      )
    } else if (!chatId) {
      setNewChatCreated(true)
      setIsMessagesLoaded(true)
      setChatId(randomHex(20))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, isMessagesLoaded, newChatCreated, messages.length])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (isMessagesLoaded && isConfigReady && newChatCreated) {
      setIsReady(true)
    } else if (isMessagesLoaded && isConfigReady && !newChatCreated) {
      checkReconnect()
    } else {
      setIsReady(false)
    }
  }, [isMessagesLoaded, isConfigReady, newChatCreated, checkReconnect])

  const rewrite = (messageId: string) => {
    const index = messages.findIndex((msg) => msg.messageId === messageId)

    if (index === -1) return

    setMessages((prev) => prev.slice(0, index))

    chatHistory.current = chatHistory.current.slice(0, index * 2)

    const messageToRewrite = messages[index]
    sendMessage(messageToRewrite.query, messageToRewrite.messageId, true)
  }

  const getMessageHandler = (message: Message) => {
    const messageId = message.messageId

    return async (data: any) => {
      if (data.type === 'error') {
        /* A publik API 402 is a money message, not a bug: remember it so
           the chat's publik banner can show the gateway's own sentence
           with its one link. Anything else is ignored by note402. */
        void note402(data.data)
        toast.error(data.data)
        setLoading(false)
        setResearchEnded(true)
        /* The toast vanishes in seconds — the turn itself must show the
           failure. An error block in responseBlocks survives on screen (and
           gives the Rewrite button an obvious retry target). */
        setMessages((prev) =>
          prev.map((msg) =>
            msg.messageId === messageId
              ? {
                  ...msg,
                  status: 'error' as const,
                  responseBlocks: [
                    ...msg.responseBlocks,
                    {
                      id: globalThis.crypto.randomUUID(),
                      type: 'error',
                      data: String(data.data ?? 'Something went wrong.'),
                    } as any,
                  ],
                }
              : msg,
          ),
        )
        return
      }

      if (data.type === 'researchComplete') {
        setResearchEnded(true)
        if (
          message.responseBlocks.find(
            (b) => b.type === 'source' && b.data.length > 0,
          )
        ) {
          setMessageAppeared(true)
        }
      }

      if (data.type === 'block') {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.messageId === messageId) {
              const exists = msg.responseBlocks.findIndex(
                (b) => b.id === data.block.id,
              )

              if (exists !== -1) {
                const existingBlocks = [...msg.responseBlocks]
                existingBlocks[exists] = data.block

                return {
                  ...msg,
                  responseBlocks: existingBlocks,
                }
              }

              return {
                ...msg,
                responseBlocks: [...msg.responseBlocks, data.block],
              }
            }
            return msg
          }),
        )

        if (
          (data.block.type === 'source' && data.block.data.length > 0) ||
          data.block.type === 'text'
        ) {
          setMessageAppeared(true)
        }
      }

      if (data.type === 'updateBlock') {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.messageId === messageId) {
              const updatedBlocks = msg.responseBlocks.map((block) => {
                if (block.id === data.blockId) {
                  const updatedBlock = { ...block }
                  applyPatch(updatedBlock, data.patch)
                  return updatedBlock
                }
                return block
              })
              return { ...msg, responseBlocks: updatedBlocks }
            }
            return msg
          }),
        )
      }

      if (data.type === 'messageEnd') {
        if (handledMessageEndRef.current.has(messageId)) {
          return
        }

        handledMessageEndRef.current.add(messageId)

        const currentMsg = messagesRef.current.find(
          (msg) => msg.messageId === messageId,
        )

        const newHistory: [string, string][] = [
          ...chatHistory.current,
          ['human', message.query],
          [
            'assistant',
            currentMsg?.responseBlocks.find((b) => b.type === 'text')?.data ||
              '',
          ],
        ]

        chatHistory.current = newHistory

        setMessages((prev) =>
          prev.map((msg) =>
            msg.messageId === messageId
              ? { ...msg, status: 'completed' as const }
              : msg,
          ),
        )

        setLoading(false)

        const lastMsg = messagesRef.current[messagesRef.current.length - 1]

        const autoMediaSearch = getAutoMediaSearch()

        if (autoMediaSearch) {
          setTimeout(() => {
            document
              .getElementById(`search-images-${lastMsg.messageId}`)
              ?.click()

            document
              .getElementById(`search-videos-${lastMsg.messageId}`)
              ?.click()
          }, 200)
        }

        // Check if there are sources and no suggestions

        const hasSourceBlocks = currentMsg?.responseBlocks.some(
          (block) => block.type === 'source' && block.data.length > 0,
        )
        const hasSuggestions = currentMsg?.responseBlocks.some(
          (block) => block.type === 'suggestion',
        )

        if (hasSourceBlocks && !hasSuggestions) {
          const suggestions = await getSuggestions(newHistory)
          const suggestionBlock: Block = {
            id: randomHex(7),
            type: 'suggestion',
            data: suggestions,
          }

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.messageId === messageId) {
                return {
                  ...msg,
                  responseBlocks: [...msg.responseBlocks, suggestionBlock],
                }
              }
              return msg
            }),
          )
        }
      }
    }
  }

  const sendMessage: ChatContext['sendMessage'] = async (
    message,
    messageId,
    rewrite = false,
  ) => {
    if (loading || !message) return
    setLoading(true)
    setResearchEnded(false)
    setMessageAppeared(false)

    const abortController = new AbortController()
    abortRef.current = abortController

    if (messages.length <= 1) {
      /* Hash route, not a path. Upstream ran under Next where `/c/<id>` is a
         real route; here the app is served from app.html under a HashRouter, so
         a path push resolves to chrome-extension://<id>/c/<id> — a file that
         does not exist. The document title still updated, which is why this
         showed up as "tab renamed but the page went blank". */
      window.history.replaceState(null, '', `#/home/c/${chatId}`)
    }

    messageId = messageId ?? randomHex(7)
    const backendId = randomHex(20)
    /* Rewrite sends the same messageId again: the earlier messageEnd must
       not swallow the new one (Rewrite never ended, F-063). */
    handledMessageEndRef.current.delete(messageId)
    liveTurnsRef.current.add(messageId)

    const newMessage: Message = {
      messageId,
      chatId: chatId!,
      backendId,
      query: message,
      responseBlocks: [],
      status: 'answering',
      createdAt: new Date(),
    }

    setMessages((prevMessages) => [...prevMessages, newMessage])

    const messageIndex = messages.findIndex((m) => m.messageId === messageId)

    const res = await apiFetch('/api/chat', {
      method: 'POST',
      signal: abortController.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: message,
        message: {
          messageId: messageId,
          chatId: chatId!,
          content: message,
        },
        chatId: chatId!,
        files: fileIds,
        sources: sources,
        optimizationMode: optimizationMode,
        searchMode: searchMode,
        incognito: incognito,
        history: rewrite
          ? chatHistory.current.slice(
              0,
              messageIndex === -1 ? undefined : messageIndex,
            )
          : chatHistory.current,
        chatModel: {
          key: chatModelProvider.key,
          providerId: chatModelProvider.providerId,
        },
        embeddingModel: {
          key: embeddingModelProvider.key,
          providerId: embeddingModelProvider.providerId,
        },
        systemInstructions: localStorage.getItem('systemInstructions'),
        thinking: localStorage.getItem('thinkingEnabled') !== '0',
      }),
    }).catch((err: unknown) =>
      err instanceof Error ? err : new Error(String(err)),
    )

    /* The local server is down or Stop came before the answer started. */
    /* Stop: what streamed so far stays on screen and the turn ends as
       finished. It must not stay 'answering': the reconnect effect then took
       it for a lost turn and showed "connection ended" twice (0.0.109 UI
       run). The server saves the row as 'cancelled'. */
    const endStopped = () => {
      setResearchEnded(true)
      setLoading(false)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.messageId === messageId && msg.status === 'answering'
            ? { ...msg, status: 'completed' as const }
            : msg,
        ),
      )
    }

    if (res instanceof Error) {
      liveTurnsRef.current.delete(messageId)
      abortRef.current = null
      if (res.name === 'AbortError') {
        endStopped()
      } else {
        failTurn(messageId, TURN_LOST_TEXT)
      }
      return
    }

    /* A pre-flight rejection (invalid body, or Model council's server-side
       backstop when a stale client still has it selected with <2 connected
       models — see route.ts) comes back as a plain non-2xx JSON response,
       not the SSE stream. Surface it as a toast instead of hanging on a
       spinner forever waiting for stream events that will never arrive. */
    if (!res.ok) {
      liveTurnsRef.current.delete(messageId)
      const body = await res.json().catch(() => null)
      void note402(body?.message)
      const text = body?.message ?? 'That request failed. Try again.'
      toast.error(text)
      setLoading(false)
      /* Keep the question on screen with the reason and a Retry, like a
         failed stream: removing it lost what the person typed (F-055). */
      setMessages((prev) =>
        prev.map((msg) =>
          msg.messageId === messageId
            ? {
                ...msg,
                status: 'error' as const,
                responseBlocks: [
                  ...msg.responseBlocks,
                  {
                    id: globalThis.crypto.randomUUID(),
                    type: 'error',
                    data: String(text),
                  } as any,
                ],
              }
            : msg,
        ),
      )
      return
    }

    if (!res.body) {
      liveTurnsRef.current.delete(messageId)
      failTurn(messageId, TURN_LOST_TEXT)
      return
    }

    const messageHandler = getMessageHandler(newMessage)

    try {
      const outcome = await readTurnStream(res.body, messageHandler)
      if (outcome === 'lost') {
        if (abortController.signal.aborted) endStopped()
        else failTurn(messageId, TURN_LOST_TEXT)
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        endStopped()
      } else {
        failTurn(messageId, TURN_LOST_TEXT)
      }
    } finally {
      abortRef.current = null
      liveTurnsRef.current.delete(messageId)
    }
  }

  /* Moved below sendMessage's declaration: it appears in this effect's
     dependency array, which is evaluated at that line, so declaring the effect
     first is a genuine use-before-declaration. Next's build never typechecked
     it strictly upstream. */
  useEffect(() => {
    if (isReady && initialMessage && isConfigReady) {
      sendMessage(initialMessage)
    }
  }, [isConfigReady, isReady, initialMessage, sendMessage])

  const stopGeneration = () => {
    abortRef.current?.abort()
  }

  const startNewChat = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    messagesRef.current = []
    chatHistory.current = []
    setFiles([])
    setFileIds([])
    setNotFound(false)
    setIncognito(false)
    setLoading(false)
    setMessageAppeared(false)
    setResearchEnded(false)
    setNewChatCreated(true)
    setIsMessagesLoaded(true)
    setChatId(randomHex(20))
  }

  return (
    <chatContext.Provider
      value={{
        messages,
        sections,
        chatHistory: chatHistory.current,
        files,
        fileIds,
        sources,
        chatId,
        hasError,
        connectionErrorMessage,
        retryConnection,
        startNewChat,
        isMessagesLoaded,
        isReady,
        loading,
        messageAppeared,
        notFound,
        optimizationMode,
        searchMode,
        incognito,
        stopGeneration,
        setFileIds,
        setFiles,
        setSources,
        setIncognito,
        setOptimizationMode,
        setSearchMode,
        rewrite,
        sendMessage,
        setChatModelProvider,
        chatModelProvider,
        embeddingModelProvider,
        setEmbeddingModelProvider,
        researchEnded,
        setResearchEnded,
      }}
    >
      {children}
    </chatContext.Provider>
  )
}

export const useChat = () => {
  const ctx = useContext(chatContext)
  return ctx
}
