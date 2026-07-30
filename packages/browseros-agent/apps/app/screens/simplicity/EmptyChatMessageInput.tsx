import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import ModelSelector from './MessageInputActions/ChatModelSelector'
import ModeSelector from './MessageInputActions/ModeSelector'
import Optimization from './MessageInputActions/Optimization'
import PlusMenu from './MessageInputActions/PlusMenu'
import Sources from './MessageInputActions/Sources'

const EmptyChatMessageInput = () => {
  const { sendMessage } = useChat()

  /* const [copilotEnabled, setCopilotEnabled] = useState(false); */
  const [message, setMessage] = useState('')

  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement

      const isInputFocused =
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        activeElement?.hasAttribute('contenteditable')

      if (e.key === '/' && !isInputFocused) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    inputRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        sendMessage(message)
        setMessage('')
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          sendMessage(message)
          setMessage('')
        }
      }}
      className="w-full"
    >
      <div className="flex w-full flex-col rounded-2xl border border-light-200 bg-light-secondary px-3 pt-5 pb-3 shadow-light-200/10 shadow-sm transition-all duration-200 focus-within:border-light-300 dark:border-dark-200 dark:bg-dark-secondary dark:shadow-black/20 dark:focus-within:border-dark-300">
        <TextareaAutosize
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          minRows={2}
          className="max-h-24 w-full resize-none bg-transparent px-2 text-black text-sm placeholder:text-[15px] placeholder:text-black/50 focus:outline-none lg:max-h-36 xl:max-h-48 dark:text-white dark:placeholder:text-white/50"
          placeholder="Ask anything..."
        />
        {/* Same always-visible control set as the follow-up composer
            (MessageInput) — this is the home screen, so it's the first place
            a user sees the Search/Deep research/Model council pill, not an
            afterthought only the in-chat composer got. */}
        <div className="mt-4 flex flex-row items-center justify-between">
          <div className="flex flex-row items-center space-x-1">
            <Optimization />
            <PlusMenu />
            <ModeSelector />
            <Sources />
          </div>
          <div className="flex flex-row items-center space-x-2">
            <div className="flex flex-row items-center space-x-1">
              <ModelSelector />
            </div>
            <button
              disabled={message.trim().length === 0}
              className="rounded-full bg-sky-500 p-2 text-white transition duration-100 hover:bg-opacity-85 disabled:bg-[#e0e0dc] disabled:text-black/50 dark:disabled:bg-[#ececec21] dark:disabled:text-white/50"
            >
              <ArrowRight className="bg-background" size={17} />
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

export default EmptyChatMessageInput
