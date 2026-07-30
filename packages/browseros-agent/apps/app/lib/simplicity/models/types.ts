import type z from 'zod'
import type { Message } from '../types'

type Model = {
  name: string
  key: string
}

type ModelList = {
  embedding: Model[]
  chat: Model[]
}

type ProviderMetadata = {
  name: string
  key: string
}

type MinimalProvider = {
  id: string
  /* Provider kind ('openai', 'ollama', 'claudecode', …) — distinct from `id`,
     which is per-connection, and `name`, which the user can rename. */
  type: string
  name: string
  chatModels: Model[]
  embeddingModels: Model[]
}

type ModelWithProvider = {
  key: string
  providerId: string
}

type GenerateOptions = {
  temperature?: number
  maxTokens?: number
  topP?: number
  stopSequences?: string[]
  frequencyPenalty?: number
  presencePenalty?: number
  /* Only sent for models the catalog marks reasoning-capable — most models
     reject the parameter outright. */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

type Tool = {
  name: string
  description: string
  schema: z.ZodObject<any>
}

type ToolCall = {
  id: string
  name: string
  arguments: Record<string, any>
}

type GenerateTextInput = {
  messages: Message[]
  tools?: Tool[]
  options?: GenerateOptions
}

type GenerateTextOutput = {
  content: string
  toolCalls: ToolCall[]
  additionalInfo?: Record<string, any>
}

type StreamTextOutput = {
  contentChunk: string
  toolCallChunk: ToolCall[]
  additionalInfo?: Record<string, any>
  done?: boolean
}

type GenerateObjectInput = {
  schema: z.ZodTypeAny
  messages: Message[]
  options?: GenerateOptions
}

type GenerateObjectOutput<T> = {
  object: T
  additionalInfo?: Record<string, any>
}

type StreamObjectOutput<T> = {
  objectChunk: Partial<T>
  additionalInfo?: Record<string, any>
  done?: boolean
}

export type {
  GenerateObjectInput,
  GenerateObjectOutput,
  GenerateOptions,
  GenerateTextInput,
  GenerateTextOutput,
  MinimalProvider,
  Model,
  ModelList,
  ModelWithProvider,
  ProviderMetadata,
  StreamObjectOutput,
  StreamTextOutput,
  Tool,
  ToolCall,
}
