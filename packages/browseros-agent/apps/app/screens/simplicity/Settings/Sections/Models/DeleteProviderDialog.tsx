import { Dialog, DialogPanel } from '@headlessui/react'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { ConfigModelProvider } from '@/lib/simplicity/config/types'
import { apiFetch } from '@/lib/simplicity/api-fetch'

const DeleteProvider = ({
  modelProvider,
  setProviders,
}: {
  modelProvider: ConfigModelProvider
  setProviders: React.Dispatch<React.SetStateAction<ConfigModelProvider[]>>
}) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await apiFetch(`/api/providers/${modelProvider.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error('Failed to delete provider')
      }

      setProviders((prev) => {
        return prev.filter((p) => p.id !== modelProvider.id)
      })

      toast.success('Connection deleted successfully.')
    } catch (_error) {
      toast.error('Failed to delete connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className="group group rounded-md p-1.5 transition-colors hover:bg-light-200 hover:dark:bg-dark-200"
        title="Remove connection"
      >
        <Trash2
          size={14}
          className="text-black/60 group-hover:text-red-500 dark:text-white/60 group-hover:dark:text-red-400"
        />
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
                <div className="px-6 pt-6 pb-4">
                  <h3 className="font-medium text-black/90 dark:text-white/90">
                    Remove connection
                  </h3>
                </div>
                <div className="border-light-200 border-t dark:border-dark-200" />
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <p className="text-black/60 text-sm dark:text-white/60">
                    Are you sure you want to remove the connection &quot;
                    {modelProvider.name}&quot;? This action cannot be undone.
                  </p>
                </div>
                <div className="flex justify-end space-x-2 px-6 py-6">
                  <button
                    disabled={loading}
                    onClick={() => setOpen(false)}
                    className="flex flex-row items-center space-x-1 rounded-lg border border-light-200 bg-light-secondary/50 px-4 py-2 text-black text-sm transition duration-200 hover:border-light-300 hover:bg-light-secondary active:scale-95 dark:border-dark-200 dark:bg-dark-secondary/50 dark:text-white hover:dark:border-dark-300 hover:dark:bg-dark-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={loading}
                    onClick={handleDelete}
                    className="rounded-lg bg-red-500 px-4 py-2 font-medium text-sm text-white transition duration-200 hover:opacity-85 active:scale-95 disabled:opacity-85"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      'Remove'
                    )}
                  </button>
                </div>
              </DialogPanel>
            </motion.div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  )
}

export default DeleteProvider
