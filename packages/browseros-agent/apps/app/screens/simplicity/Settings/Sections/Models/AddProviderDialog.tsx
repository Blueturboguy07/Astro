import { Dialog, DialogPanel } from '@headlessui/react'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type {
  ConfigModelProvider,
  ModelProviderUISection,
  StringUIConfigField,
  UIConfigField,
} from '@/lib/simplicity/config/types'
import Select from '@/screens/simplicity/ui/Select'
import { apiFetch } from '@/lib/simplicity/api-fetch'

const AddProvider = ({
  modelProviders,
  setProviders,
}: {
  modelProviders: ModelProviderUISection[]
  setProviders: React.Dispatch<React.SetStateAction<ConfigModelProvider[]>>
}) => {
  const [open, setOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<null | string>(
    modelProviders[0]?.key || null,
  )
  const [config, setConfig] = useState<Record<string, any>>({})
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const providerConfigMap = useMemo(() => {
    const map: Record<string, { name: string; fields: UIConfigField[] }> = {}

    modelProviders.forEach((p) => {
      map[p.key] = {
        name: p.name,
        fields: p.fields,
      }
    })

    return map
  }, [modelProviders])

  const selectedProviderFields = useMemo(() => {
    if (!selectedProvider) return []
    const providerFields = providerConfigMap[selectedProvider]?.fields || []
    const config: Record<string, any> = {}

    providerFields.forEach((field) => {
      config[field.key] = field.default || ''
    })

    setConfig(config)

    return providerFields
  }, [selectedProvider, providerConfigMap])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await apiFetch('/api/providers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: selectedProvider,
          name: name,
          config: config,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to add provider')
      }

      const data: ConfigModelProvider = (await res.json()).provider

      setProviders((prev) => [...prev, data])

      toast.success('Connection added successfully.')
    } catch (_error) {
      toast.error('Failed to add connection.')
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex flex-row items-center space-x-1 rounded-lg border border-light-200 bg-light-secondary/50 px-3 py-1.5 text-black text-xs transition duration-200 hover:border-light-300 hover:bg-light-secondary active:scale-95 sm:text-xs md:px-4 md:py-2 dark:border-dark-200 dark:bg-dark-secondary/50 dark:text-white hover:dark:border-dark-300 hover:dark:bg-dark-secondary"
      >
        <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
        <span>Add Connection</span>
      </button>
      <AnimatePresence>
        {open && (
          <Dialog
            static
            open={open}
            onClose={() => setOpen(false)}
            className="relative z-[60]"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="fixed inset-0 flex w-screen items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
            >
              <DialogPanel className="mx-4 flex max-h-[85vh] w-full flex-col rounded-lg border border-light-secondary bg-light-primary lg:w-[600px] dark:border-dark-secondary dark:bg-dark-primary">
                <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
                  <div className="px-6 pt-6 pb-4">
                    <h3 className="font-medium text-black/90 text-sm dark:text-white/90">
                      Add new connection
                    </h3>
                  </div>
                  <div className="border-light-200 border-t dark:border-dark-200" />
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="flex flex-col space-y-4">
                      <div className="flex flex-col items-start space-y-2">
                        <label className="text-black/70 text-xs dark:text-white/70">
                          Select connection type
                        </label>
                        <Select
                          value={selectedProvider ?? ''}
                          onChange={(e) => setSelectedProvider(e.target.value)}
                          options={Object.entries(providerConfigMap).map(
                            ([key, val]) => {
                              return {
                                label: val.name,
                                value: key,
                              }
                            },
                          )}
                        />
                      </div>

                      <div
                        key="name"
                        className="flex flex-col items-start space-y-2"
                      >
                        <label className="text-black/70 text-xs dark:text-white/70">
                          Connection Name*
                        </label>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-lg border border-light-200 bg-light-primary px-4 py-3 pr-10 text-black/80 text-sm transition-colors placeholder:text-black/40 focus-visible:border-light-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-200 dark:bg-dark-primary dark:text-white/80 dark:focus-visible:border-dark-300 dark:placeholder:text-white/40"
                          placeholder={'e.g., My OpenAI Connection'}
                          type="text"
                          required={true}
                        />
                      </div>

                      {selectedProviderFields.map((field: UIConfigField) => (
                        <div
                          key={field.key}
                          className="flex flex-col items-start space-y-2"
                        >
                          <label className="text-black/70 text-xs dark:text-white/70">
                            {field.name}
                            {field.required && '*'}
                          </label>
                          <input
                            value={config[field.key] ?? field.default ?? ''}
                            onChange={(event) =>
                              setConfig((prev) => ({
                                ...prev,
                                [field.key]: event.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-light-200 bg-light-primary px-4 py-3 pr-10 text-[13px] text-black/80 transition-colors placeholder:text-black/40 focus-visible:border-light-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-200 dark:bg-dark-primary dark:text-white/80 dark:focus-visible:border-dark-300 dark:placeholder:text-white/40"
                            placeholder={
                              (field as StringUIConfigField).placeholder
                            }
                            type="text"
                            required={field.required}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border-light-200 border-t dark:border-dark-200" />
                  <div className="flex justify-end px-6 py-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-[13px] text-white transition duration-200 hover:opacity-85 active:scale-95 disabled:opacity-85"
                    >
                      {loading ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        'Add Connection'
                      )}
                    </button>
                  </div>
                </form>
              </DialogPanel>
            </motion.div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  )
}

export default AddProvider
