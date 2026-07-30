import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { motion } from 'motion/react'
import { File, LoaderCircle, Paperclip, Plus, Trash } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import { cn } from '@/lib/simplicity/utils'
import { apiFetch } from '@/lib/simplicity/api-fetch'

const Attach = () => {
  const { files, setFiles, setFileIds, fileIds } = useChat()

  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  return loading ? (
    <div className="rounded-lg p-2 text-black/50 transition duration-200 hover:bg-light-200 focus:outline-none active:border-none dark:text-white/50 hover:dark:bg-dark-200">
      <LoaderCircle size={16} className="animate-spin text-sky-500" />
    </div>
  ) : files.length > 0 ? (
    <Popover className="relative w-full max-w-[15rem] md:max-w-md lg:max-w-lg">
      {({ open }) => (
        <>
          <PopoverButton
            type="button"
            className="rounded-lg p-2 headless-open:text-black text-black/50 transition duration-200 hover:bg-light-200 hover:text-black focus:outline-none active:scale-95 active:border-none dark:headless-open:text-white dark:text-white/50 hover:dark:bg-dark-200 dark:hover:text-white"
          >
            <File size={16} className="text-sky-500" />
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                className="absolute right-0 z-10 w-64 md:w-[350px]"
                static
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="flex max-h-[200px] w-full origin-top-right flex-col overflow-y-auto rounded-md border border-light-200 bg-light-primary md:max-h-none dark:border-dark-200 dark:bg-dark-primary"
                >
                  <div className="flex flex-row items-center justify-between px-3 py-2">
                    <h4 className="text-black/70 text-sm dark:text-white/70">
                      Attached files
                    </h4>
                    <div className="flex flex-row items-center space-x-4">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-row items-center space-x-1 text-black/70 transition duration-200 hover:text-black focus:outline-none dark:text-white/70 hover:dark:text-white"
                      >
                        <input
                          type="file"
                          onChange={handleChange}
                          ref={fileInputRef}
                          accept=".pdf,.docx,.txt"
                          multiple
                          hidden
                        />
                        <Plus size={16} />
                        <p className="text-xs">Add</p>
                      </button>
                      <button
                        onClick={() => {
                          setFiles([])
                          setFileIds([])
                        }}
                        className="flex flex-row items-center space-x-1 text-black/70 transition duration-200 hover:text-black focus:outline-none dark:text-white/70 hover:dark:text-white"
                      >
                        <Trash size={13} />
                        <p className="text-xs">Clear</p>
                      </button>
                    </div>
                  </div>
                  <div className="mx-2 h-[0.5px] bg-white/10" />
                  <div className="flex flex-col items-center">
                    {files.map((file, i) => (
                      <div
                        key={i}
                        className="flex w-full flex-row items-center justify-start space-x-3 p-3"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-light-100 dark:bg-dark-100">
                          <File
                            size={16}
                            className="text-black/70 dark:text-white/70"
                          />
                        </div>
                        <p className="text-black/70 text-xs dark:text-white/70">
                          {file.fileName.length > 25
                            ? file.fileName
                                .replace(/\.\w+$/, '')
                                .substring(0, 25) +
                              '...' +
                              file.fileExtension
                            : file.fileName}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  ) : (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        'flex items-center justify-center rounded-lg p-2 headless-open:text-black text-black/50 transition duration-200 hover:bg-light-200 hover:text-black focus:outline-none active:scale-95 active:border-none dark:headless-open:text-white dark:text-white/50 hover:dark:bg-dark-200 dark:hover:text-white',
      )}
    >
      <input
        type="file"
        onChange={handleChange}
        ref={fileInputRef}
        accept=".pdf,.docx,.txt"
        multiple
        hidden
      />
      <Paperclip size={16} />
    </button>
  )
}

export default Attach
