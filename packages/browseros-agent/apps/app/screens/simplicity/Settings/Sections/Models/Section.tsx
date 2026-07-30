import { useState } from 'react'
import type {
  ConfigModelProvider,
  ModelProviderUISection,
  UIConfigField,
} from '@/lib/simplicity/config/types'
import AddProvider from './AddProviderDialog'
import ModelProvider from './ModelProvider'

/* Which model answers a chat is picked from the model dropdown in the chat
   box, not here — this section is only about the connections (API keys /
   base URLs) that make models available in the first place. */
const Models = ({
  fields,
  values,
}: {
  fields: ModelProviderUISection[]
  values: ConfigModelProvider[]
}) => {
  const [providers, setProviders] = useState<ConfigModelProvider[]>(values)

  return (
    <div className="flex-1 space-y-6 overflow-y-auto py-6">
      <div className="flex flex-row items-center justify-between px-6">
        <p className="text-black/70 text-xs lg:text-xs dark:text-white/70">
          Manage connections
        </p>
        <AddProvider modelProviders={fields} setProviders={setProviders} />
      </div>
      <div className="flex flex-col gap-y-4 px-6">
        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-light-200 border-dashed bg-light-secondary/10 px-4 py-12 dark:border-dark-200 dark:bg-dark-secondary/10">
            <div className="mb-3 rounded-full bg-sky-500/10 p-3 dark:bg-sky-500/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-sky-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <p className="mb-1 font-medium text-black/70 text-sm dark:text-white/70">
              No connections yet
            </p>
            <p className="mb-4 max-w-sm text-center text-black/50 text-xs dark:text-white/50">
              Add your first connection to start using AI models. Connect to
              OpenAI, Anthropic, Ollama, and more.
            </p>
          </div>
        ) : (
          providers.map((provider) => (
            <ModelProvider
              key={`provider-${provider.id}`}
              fields={
                (fields.find((f) => f.key === provider.type)?.fields ??
                  []) as UIConfigField[]
              }
              modelProvider={provider}
              setProviders={setProviders}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default Models
