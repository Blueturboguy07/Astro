import { Popover, PopoverButton, PopoverPanel, Switch } from '@headlessui/react'
import {
  CaretLeftIcon,
  CaretRightIcon,
  GlobeIcon,
  GraduationCapIcon,
  NetworkIcon,
  PlugIcon,
} from '@phosphor-icons/react'
import { LoaderCircle, Paperclip, Plus, Settings } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import SettingsDialogue from '../Settings/SettingsDialogue'
import { apiFetch } from '@/lib/simplicity/api-fetch'

/* Perplexity ground truth (2026-07): the composer's "+" button opens a menu
   with "Upload files or images" on top and a "Connectors ›" row that expands
   into the same Web/Academic/Discussions checkboxes as the Sources pill.
   Bound to the SAME `sources` state Sources.tsx reads/writes, so toggling a
   connector here or from the pill can never leave the two UIs disagreeing
   about what's enabled. */
const connectorsList = [
  {
    name: 'Web',
    key: 'web',
    icon: <GlobeIcon className="h-[15px] w-auto" />,
  },
  {
    name: 'Academic',
    key: 'academic',
    icon: <GraduationCapIcon className="h-[15px] w-auto" />,
  },
  {
    name: 'Discussions',
    key: 'discussions',
    icon: <NetworkIcon className="h-[15px] w-auto" />,
  },
]

const PlusMenu = () => {
  const { files, setFiles, setFileIds, fileIds, sources, setSources } =
    useChat()

  const [loading, setLoading] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* Same upload flow as AttachSmall/Attach (POST to /api/uploads, gated on an
     embedding model being chosen) — reused here rather than imported since
     those two components already duplicate this exact logic between
     themselves, and AttachSmall stays untouched for anywhere it's still
     mounted. */
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files

    if (!selectedFiles?.length) {
      return
    }

    setLoading(true)

    try {
      const data = new FormData()

      for (let i = 0; i < selectedFiles.length; i++) {
        data.append('files', selectedFiles[i])
      }

      const embeddingModelProvider = localStorage.getItem(
        'embeddingModelProviderId',
      )
      const embeddingModel = localStorage.getItem('embeddingModelKey')

      if (!embeddingModelProvider || !embeddingModel) {
        throw new Error('Please select an embedding model before uploading.')
      }

      data.append('embedding_model_provider_id', embeddingModelProvider)
      data.append('embedding_model_key', embeddingModel)

      const res = await apiFetch(`/api/uploads`, {
        method: 'POST',
        body: data,
      })

      const resData = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(resData.message || 'Failed to upload file(s).')
      }

      if (!Array.isArray(resData.files)) {
        throw new Error('Invalid upload response from server.')
      }

      setFiles([...files, ...resData.files])
      setFileIds([...fileIds, ...resData.files.map((file: any) => file.fileId)])
    } catch (err: any) {
      toast(err?.message || 'Failed to upload file(s).')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <PopoverButton
            type="button"
            disabled={loading}
            aria-label="Upload files or manage connectors"
            className="flex h-8 w-8 items-center justify-center rounded-full headless-open:bg-light-200 headless-open:text-black text-black/50 transition duration-200 hover:bg-light-200 hover:text-black active:scale-95 disabled:opacity-60 dark:headless-open:bg-dark-200 dark:headless-open:text-white dark:text-white/50 hover:dark:bg-dark-200 dark:hover:text-white"
          >
            <input
              type="file"
              onChange={handleChange}
              ref={fileInputRef}
              accept=".pdf,.docx,.txt"
              multiple
              hidden
            />
            {loading ? (
              <LoaderCircle size={17} className="animate-spin text-sky-500" />
            ) : (
              <Plus size={18} />
            )}
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                static
                className="absolute bottom-11 left-0 z-20 w-64"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 4 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="flex w-full origin-bottom-left flex-col overflow-hidden rounded-lg border border-light-200 bg-light-primary p-1 shadow-lg dark:border-dark-200 dark:bg-dark-primary"
                >
                  {!showConnectors ? (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-row items-center justify-between rounded-md px-2 py-2.5 text-left text-black/80 hover:bg-light-100 dark:text-white/80 hover:dark:bg-dark-100"
                      >
                        <span className="flex flex-row items-center space-x-2">
                          <Paperclip size={15} />
                          <span className="text-xs">
                            Upload files or images
                          </span>
                        </span>
                        {files.length > 0 && (
                          <span className="text-[10px] text-black/40 dark:text-white/40">
                            {files.length} attached
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowConnectors(true)}
                        className="flex flex-row items-center justify-between rounded-md px-2 py-2.5 text-black/80 hover:bg-light-100 dark:text-white/80 hover:dark:bg-dark-100"
                      >
                        <span className="flex flex-row items-center space-x-2">
                          <PlugIcon className="h-[15px] w-auto" />
                          <span className="text-xs">Connectors</span>
                        </span>
                        <CaretRightIcon className="h-[12px] w-auto opacity-60" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowConnectors(false)}
                        className="mb-1 flex flex-row items-center space-x-1 px-1.5 py-2 text-black/50 hover:text-black dark:text-white/50 hover:dark:text-white"
                      >
                        <CaretLeftIcon className="h-[12px] w-auto" />
                        <span className="font-medium text-xs">Connectors</span>
                      </button>
                      {connectorsList.map((source) => (
                        <div
                          key={source.key}
                          className="flex cursor-pointer flex-row justify-between rounded-md px-2 py-2.5 hover:bg-light-100 hover:dark:bg-dark-100"
                          onClick={() => {
                            if (!sources.includes(source.key)) {
                              setSources([...sources, source.key])
                            } else {
                              setSources(
                                sources.filter((s) => s !== source.key),
                              )
                            }
                          }}
                        >
                          <div className="flex flex-row space-x-2 text-black/80 dark:text-white/80">
                            {source.icon}
                            <p className="text-xs">{source.name}</p>
                          </div>
                          <Switch
                            checked={sources.includes(source.key)}
                            className="group relative flex h-4 w-7 shrink-0 cursor-pointer rounded-full bg-light-200 p-0.5 transition-colors duration-200 ease-in-out focus:outline-none data-[checked]:bg-sky-500 dark:bg-white/10 dark:data-[checked]:bg-sky-500"
                          >
                            <span
                              aria-hidden="true"
                              className="pointer-events-none inline-block size-3 translate-x-[1px] rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out group-data-[checked]:translate-x-3"
                            />
                          </Switch>
                        </div>
                      ))}
                      <div className="mx-1 my-1 h-[0.5px] bg-light-200 dark:bg-dark-200" />
                      <button
                        type="button"
                        onClick={() => {
                          close()
                          setSettingsOpen(true)
                        }}
                        className="flex flex-row items-center space-x-2 rounded-md px-2 py-2.5 text-black/60 hover:bg-light-100 dark:text-white/60 hover:dark:bg-dark-100"
                      >
                        <Settings size={14} />
                        <span className="text-xs">Manage Connectors</span>
                      </button>
                    </>
                  )}
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {settingsOpen && (
              <SettingsDialogue
                isOpen={settingsOpen}
                setIsOpen={setSettingsOpen}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  )
}

export default PlusMenu
