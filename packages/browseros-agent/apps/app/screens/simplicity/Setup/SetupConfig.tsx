import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  ConfigModelProvider,
  UIConfigField,
  UIConfigSections,
} from '@/lib/simplicity/config/types'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import ModelProvider from '../Settings/Sections/Models/ModelProvider'
import ProviderPicker from './ProviderPicker'
import { apiFetch } from '@/lib/simplicity/api-fetch'

const SetupConfig = ({
  configSections,
  setupState,
  setSetupState,
}: {
  configSections: UIConfigSections
  setupState: number
  setSetupState: (state: number) => void
}) => {
  const [providers, setProviders] = useState<ConfigModelProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFinishing, setIsFinishing] = useState(false)
  const { setChatModelProvider, setEmbeddingModelProvider } = useChat()

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setIsLoading(true)
        const res = await apiFetch('/api/providers')
        if (!res.ok) throw new Error('Failed to fetch providers')

        const data = await res.json()
        setProviders(data.providers || [])
      } catch (_error) {
        toast.error('Failed to load providers')
      } finally {
        setIsLoading(false)
      }
    }

    if (setupState === 2) {
      fetchProviders()
    }
  }, [setupState])

  /* Pick the models instead of asking.
   *
   * Chat: the first model of the first provider they connected — they can
   * change it from the selector in the chat box, which is where switching
   * models actually belongs.
   *
   * Embedding: always the bundled Transformers model. It runs locally in the
   * app, costs nothing, and needs no key, so there is no decision here worth
   * putting in front of someone. It reranks search results before they reach
   * the chat model (see baseSearch.ts) — an implementation detail, not a
   * preference, which is why other answer engines never surface it either.
   */
  const autoSelectModels = async () => {
    const chatProvider = providers.find(
      (p) => p.type !== 'transformers' && p.chatModels.length > 0,
    )
    if (chatProvider) {
      localStorage.setItem('chatModelProviderId', chatProvider.id)
      localStorage.setItem('chatModelKey', chatProvider.chatModels[0].key)
      setChatModelProvider({
        providerId: chatProvider.id,
        key: chatProvider.chatModels[0].key,
      })
    }

    /* Embeddings are never a user-facing choice — they only rerank search
       results, and a worse reranker just means worse answers. Prefer Ollama's
       local model (the installer pulls nomic-embed-text alongside the chat
       model); fall back to the bundled Transformers model so that someone who
       connected only an API key still gets ranked results instead of raw
       keyword order. Nothing registers Transformers on a fresh install, so
       without that fallback there'd be no embedding model at all. */
    let embeddingProvider =
      providers.find(
        (p) => p.type === 'ollama' && p.embeddingModels.length > 0,
      ) ?? providers.find((p) => p.embeddingModels.length > 0)

    if (!embeddingProvider) {
      try {
        const res = await apiFetch('/api/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'transformers',
            name: 'Built-in',
            config: {},
          }),
        })
        if (res.ok) embeddingProvider = (await res.json()).provider
      } catch {
        /* Non-fatal: search still works, just with unranked results. */
      }
    }

    if (embeddingProvider?.embeddingModels?.length) {
      localStorage.setItem('embeddingModelProviderId', embeddingProvider.id)
      localStorage.setItem(
        'embeddingModelKey',
        embeddingProvider.embeddingModels[0].key,
      )
      setEmbeddingModelProvider({
        providerId: embeddingProvider.id,
        key: embeddingProvider.embeddingModels[0].key,
      })
    }
  }

  const handleFinish = async () => {
    try {
      setIsFinishing(true)
      await autoSelectModels()

      const res = await apiFetch('/api/config/setup-complete', {
        method: 'POST',
      })

      if (!res.ok) throw new Error('Failed to complete setup')

      window.location.reload()
    } catch (_error) {
      toast.error('Failed to complete setup')
      setIsFinishing(false)
    }
  }

  const visibleProviders = providers.filter(
    (p) => p.name.toLowerCase() !== 'transformers',
  )
  const hasProviders =
    visibleProviders.filter((p) => p.chatModels.length > 0).length > 0

  return (
    <div className="mx-auto flex w-[95vw] flex-col space-y-6 px-2 sm:px-4 md:w-[80vw] md:px-6 lg:w-[65vw]">
      {setupState === 2 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: 0.5, delay: 0.1 },
          }}
          className="flex h-[calc(95vh-80px)] w-full flex-col overflow-hidden rounded-xl border border-light-200 bg-light-primary shadow-sm dark:border-dark-200 dark:bg-dark-primary"
        >
          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 md:py-6">
            <div className="mb-4 border-light-200 border-b pb-3 md:mb-6 md:pb-4 dark:border-dark-200">
              <p className="font-medium text-black text-xs sm:text-sm dark:text-white">
                Choose a provider
              </p>
              <p className="mt-0.5 text-[10px] text-black/50 sm:text-xs dark:text-white/50">
                Connect at least one to get started. You can add more later.
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8 md:py-12">
                <p className="text-black/50 text-xs sm:text-sm dark:text-white/50">
                  Loading providers...
                </p>
              </div>
            ) : (
              <>
                <ProviderPicker
                  modelProviders={configSections.modelProviders}
                  providers={providers}
                  setProviders={setProviders}
                />

                {visibleProviders.length > 0 && (
                  <div className="mt-6 space-y-3 md:mt-8 md:space-y-4">
                    <p className="font-medium text-[10px] text-black/40 uppercase tracking-wide sm:text-xs dark:text-white/40">
                      Your connections
                    </p>
                    {visibleProviders.map((provider) => (
                      <ModelProvider
                        key={`provider-${provider.id}`}
                        fields={
                          (configSections.modelProviders.find(
                            (f) => f.key === provider.type,
                          )?.fields ?? []) as UIConfigField[]
                        }
                        modelProvider={provider}
                        setProviders={setProviders}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* There is no model-selection step. The chat model is chosen for the
          user and swapped from the selector in the chat box; the embedding
          model is never a user-facing choice at all. */}

      <div className="flex flex-row items-center justify-between pt-2">
        <a></a>
        {setupState === 2 && (
          <motion.button
            initial={{ opacity: 0, x: 10 }}
            animate={{
              opacity: 1,
              x: 0,
              transition: { duration: 0.5 },
            }}
            onClick={handleFinish}
            disabled={!hasProviders || isLoading || isFinishing}
            className="flex flex-row items-center gap-1.5 rounded-lg bg-[#24A0ED] px-3 py-2 font-medium text-white text-xs transition-all duration-200 hover:bg-[#1e8fd1] active:scale-95 disabled:cursor-not-allowed disabled:bg-light-200 disabled:text-black/40 disabled:active:scale-100 sm:text-sm md:gap-2 md:px-5 md:py-2.5 dark:disabled:bg-dark-200 dark:disabled:text-white/40"
          >
            <span>{isFinishing ? 'Finishing…' : 'Start searching'}</span>
            <Check className="h-4 w-4 md:h-[18px] md:w-[18px]" />
          </motion.button>
        )}
      </div>
    </div>
  )
}

export default SetupConfig
