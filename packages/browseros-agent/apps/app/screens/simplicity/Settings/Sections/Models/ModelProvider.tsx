import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  ConfigModelProvider,
  StringUIConfigField,
  UIConfigField,
} from '@/lib/simplicity/config/types'
import ProviderLogo from '@/screens/simplicity/ui/ProviderLogo'
import DeleteProvider from './DeleteProviderDialog'
import { apiFetch } from '@/lib/simplicity/api-fetch'

/* Settings only ever needs to show and edit a connection's credentials — which
   fields those are (an API key, a base URL, both, or none) comes straight from
   the provider's own config schema, so there is nothing provider-specific to
   special-case here. Model enablement, model lists and per-model add/remove
   used to live in this card; that has moved to the chat box's model picker,
   which is the only place models are actually chosen. */
const ModelProvider = ({
  modelProvider,
  setProviders,
  fields,
}: {
  modelProvider: ConfigModelProvider
  fields: UIConfigField[]
  setProviders: React.Dispatch<React.SetStateAction<ConfigModelProvider[]>>
}) => {
  const [config, setConfig] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    /* Auto-registered providers (transformers, a connected Claude account)
       can arrive with no stored config at all — a fresh install renders this
       card before anything was ever saved. */
    const stored = modelProvider.config ?? {}
    const initial: Record<string, any> = {}
    fields.forEach((field) => {
      initial[field.key] = stored[field.key] ?? field.default ?? ''
    })
    setConfig(initial)
  }, [fields, modelProvider.config])

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/providers/${modelProvider.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: modelProvider.name,
          config,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to update provider')
      }

      const data: ConfigModelProvider = (await res.json()).provider

      setProviders((prev) =>
        prev.map((p) => (p.id === modelProvider.id ? data : p)),
      )

      toast.success('Connection saved.')
    } catch (_error) {
      toast.error('Failed to save connection.')
    } finally {
      setLoading(false)
    }
  }

  const errorMessage =
    modelProvider.chatModels.find((m) => m.key === 'error')?.name ??
    modelProvider.embeddingModels.find((m) => m.key === 'error')?.name

  return (
    <div
      key={modelProvider.id}
      className="overflow-hidden rounded-lg border border-light-200 bg-light-primary dark:border-dark-200 dark:bg-dark-primary"
    >
      <div className="flex w-full flex-row items-center justify-between border-light-200 border-b bg-light-secondary/30 px-5 py-3.5 dark:border-dark-200 dark:bg-dark-secondary/30">
        <div className="flex items-center gap-2.5">
          <div className="rounded-md bg-sky-500/10 p-1.5 dark:bg-sky-500/10">
            <ProviderLogo
              providerKey={modelProvider.type}
              size={14}
              className="text-sky-500"
            />
          </div>
          <p className="font-medium text-black text-sm lg:text-sm dark:text-white">
            {modelProvider.name}
          </p>
        </div>
        <DeleteProvider
          modelProvider={modelProvider}
          setProviders={setProviders}
        />
      </div>
      <div className="flex flex-col gap-y-3 px-5 py-4">
        {errorMessage && (
          <div className="flex flex-row items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-500 text-xs lg:text-xs dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
            <AlertCircle size={16} className="shrink-0" />
            <span className="break-words">{errorMessage}</span>
          </div>
        )}
        {fields.length === 0 ? (
          <p className="text-black/50 text-xs dark:text-white/50">
            No configuration needed for this connection.
          </p>
        ) : (
          fields.map((field) => (
            <div key={field.key} className="flex flex-col items-start gap-1.5">
              <label className="text-black/70 text-xs dark:text-white/70">
                {field.name}
                {field.required && '*'}
              </label>
              <input
                value={config[field.key] ?? ''}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-light-200 bg-light-primary px-4 py-3 text-[13px] text-black/80 transition-colors placeholder:text-black/40 focus-visible:border-light-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-200 dark:bg-dark-primary dark:text-white/80 dark:focus-visible:border-dark-300 dark:placeholder:text-white/40"
                placeholder={(field as StringUIConfigField).placeholder}
                type={field.type === 'password' ? 'password' : 'text'}
                required={field.required}
              />
            </div>
          ))
        )}
        {fields.length > 0 && (
          <div className="flex justify-end pt-1">
            <button
              onClick={handleSave}
              disabled={loading}
              className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-[13px] text-white transition duration-200 hover:opacity-85 active:scale-95 disabled:opacity-85"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                'Save'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ModelProvider
