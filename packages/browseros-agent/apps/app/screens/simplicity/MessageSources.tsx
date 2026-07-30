/* eslint-disable @next/next/no-img-element */
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { File } from 'lucide-react'
import { Fragment, useState } from 'react'
import type { Chunk } from '@/lib/simplicity/types'

const MessageSources = ({ sources }: { sources: Chunk[] }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const closeModal = () => {
    setIsDialogOpen(false)
    document.body.classList.remove('overflow-hidden-scrollable')
  }

  const openModal = () => {
    setIsDialogOpen(true)
    document.body.classList.add('overflow-hidden-scrollable')
  }

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {sources.slice(0, 3).map((source, i) => (
        <a
          className="flex flex-col space-y-2 rounded-lg bg-light-100 p-3 font-medium transition duration-200 hover:bg-light-200 dark:bg-dark-100 dark:hover:bg-dark-200"
          key={i}
          href={source.metadata.url}
          target="_blank"
          rel="noopener"
        >
          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-xs dark:text-white">
            {source.metadata.title}
          </p>
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center space-x-1">
              {source.metadata.url.includes('file_id://') ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dark-200 transition duration-200 hover:bg-dark-100">
                  <File size={12} className="text-white/70" />
                </div>
              ) : (
                <img
                  src={`https://s2.googleusercontent.com/s2/favicons?domain_url=${source.metadata.url}`}
                  width={16}
                  height={16}
                  alt="favicon"
                  className="h-4 w-4 rounded-lg"
                />
              )}
              <p className="overflow-hidden text-ellipsis whitespace-nowrap text-black/50 text-xs dark:text-white/50">
                {source.metadata.url.includes('file_id://')
                  ? 'Uploaded File'
                  : source.metadata.url.replace(/.+\/\/|www.|\..+/g, '')}
              </p>
            </div>
            <div className="flex flex-row items-center space-x-1 text-black/50 text-xs dark:text-white/50">
              <div className="h-[4px] w-[4px] rounded-full bg-black/50 dark:bg-white/50" />
              <span>{i + 1}</span>
            </div>
          </div>
        </a>
      ))}
      {sources.length > 3 && (
        <button
          onClick={openModal}
          className="flex flex-col space-y-2 rounded-lg bg-light-100 p-3 font-medium transition duration-200 hover:bg-light-200 dark:bg-dark-100 dark:hover:bg-dark-200"
        >
          <div className="flex flex-row items-center space-x-1">
            {sources.slice(3, 6).map((source, i) => {
              return source.metadata.url === 'File' ? (
                <div
                  key={i}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-dark-200 transition duration-200 hover:bg-dark-100"
                >
                  <File size={12} className="text-white/70" />
                </div>
              ) : (
                <img
                  key={i}
                  src={`https://s2.googleusercontent.com/s2/favicons?domain_url=${source.metadata.url}`}
                  width={16}
                  height={16}
                  alt="favicon"
                  className="h-4 w-4 rounded-lg"
                />
              )
            })}
          </div>
          <p className="text-black/50 text-xs dark:text-white/50">
            View {sources.length - 3} more
          </p>
        </button>
      )}
      <Transition appear show={isDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={closeModal}>
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
                    Sources
                  </DialogTitle>
                  <div className="mt-2 grid max-h-[300px] grid-cols-2 gap-2 overflow-auto pr-2">
                    {sources.map((source, i) => (
                      <a
                        className="flex flex-col space-y-2 rounded-lg border border-light-200 bg-light-secondary p-3 font-medium transition duration-200 hover:bg-light-200 dark:border-dark-200 dark:bg-dark-secondary dark:hover:bg-dark-200"
                        key={i}
                        href={source.metadata.url}
                        target="_blank"
                        rel="noopener"
                      >
                        <p className="overflow-hidden text-ellipsis whitespace-nowrap text-xs dark:text-white">
                          {source.metadata.title}
                        </p>
                        <div className="flex flex-row items-center justify-between">
                          <div className="flex flex-row items-center space-x-1">
                            {source.metadata.url === 'File' ? (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dark-200 transition duration-200 hover:bg-dark-100">
                                <File size={12} className="text-white/70" />
                              </div>
                            ) : (
                              <img
                                src={`https://s2.googleusercontent.com/s2/favicons?domain_url=${source.metadata.url}`}
                                width={16}
                                height={16}
                                alt="favicon"
                                className="h-4 w-4 rounded-lg"
                              />
                            )}
                            <p className="overflow-hidden text-ellipsis whitespace-nowrap text-black/50 text-xs dark:text-white/50">
                              {source.metadata.url.replace(
                                /.+\/\/|www.|\..+/g,
                                '',
                              )}
                            </p>
                          </div>
                          <div className="flex flex-row items-center space-x-1 text-black/50 text-xs dark:text-white/50">
                            <div className="h-[4px] w-[4px] rounded-full bg-black/50 dark:bg-white/50" />
                            <span>{i + 1}</span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}

export default MessageSources
