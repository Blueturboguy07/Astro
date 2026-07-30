import {
  Description,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { Trash } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import type { Chat } from '@/lib/simplicity/types/discover'
import { apiFetch } from '@/lib/simplicity/api-fetch'

const DeleteChat = ({
  chatId,
  chats,
  setChats,
  redirect = false,
}: {
  chatId: string
  chats: Chat[]
  setChats: (chats: Chat[]) => void
  redirect?: boolean
}) => {
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (res.status !== 200) {
        throw new Error('Failed to delete chat')
      }

      const newChats = chats.filter((chat) => chat.id !== chatId)

      setChats(newChats)

      if (redirect) {
        /* Hash route: a bare '/' would leave app.html for a nonexistent
           extension path. */
        window.location.hash = '#/home'
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setConfirmationDialogOpen(false)
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setConfirmationDialogOpen(true)
        }}
        className="bg-transparent text-red-400 transition duration-200 hover:scale-105"
      >
        <Trash size={17} />
      </button>
      <Transition appear show={confirmationDialogOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => {
            if (!loading) {
              setConfirmationDialogOpen(false)
            }
          }}
        >
          <DialogBackdrop className="fixed inset-0 bg-black/30" />
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-100"
                leaveFrom="opacity-100 scale-200"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-md transform rounded-2xl border border-light-200 bg-light-secondary p-6 text-left align-middle shadow-xl transition-all dark:border-dark-200 dark:bg-dark-secondary">
                  <DialogTitle className="font-medium text-lg leading-6 dark:text-white">
                    Delete Confirmation
                  </DialogTitle>
                  <Description className="text-black/70 text-sm dark:text-white/70">
                    Are you sure you want to delete this chat?
                  </Description>
                  <div className="mt-6 flex flex-row items-end justify-end space-x-4">
                    <button
                      onClick={() => {
                        if (!loading) {
                          setConfirmationDialogOpen(false)
                        }
                      }}
                      className="text-black/50 text-sm transition duration-200 hover:text-black/70 dark:text-white/50 hover:dark:text-white/70"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      className="duration200 text-red-400 text-sm transition hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}

export default DeleteChat
