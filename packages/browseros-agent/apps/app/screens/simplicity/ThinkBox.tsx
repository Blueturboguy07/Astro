'use client'

import { BrainCircuit, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ThinkBoxProps {
  content: string
  thinkingEnded: boolean
}

const ThinkBox = ({ content, thinkingEnded }: ThinkBoxProps) => {
  const [isExpanded, setIsExpanded] = useState(true)

  useEffect(() => {
    if (thinkingEnded) {
      setIsExpanded(false)
    } else {
      setIsExpanded(true)
    }
  }, [thinkingEnded])

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-light-200 bg-light-secondary/50 dark:border-dark-200 dark:bg-dark-secondary/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-1 text-black/90 transition duration-200 hover:bg-light-200 dark:text-white/90 dark:hover:bg-dark-200"
      >
        <div className="flex items-center space-x-2">
          <BrainCircuit
            size={20}
            className="text-[#9C27B0] dark:text-[#CE93D8]"
          />
          <p className="font-medium text-sm">Thinking Process</p>
        </div>
        {isExpanded ? (
          <ChevronUp size={18} className="text-black/70 dark:text-white/70" />
        ) : (
          <ChevronDown size={18} className="text-black/70 dark:text-white/70" />
        )}
      </button>

      {isExpanded && (
        <div className="whitespace-pre-wrap border-light-200 border-t bg-light-100/50 px-4 py-3 text-black/80 text-sm dark:border-dark-200 dark:bg-dark-100/50 dark:text-white/80">
          {content}
        </div>
      )}
    </div>
  )
}

export default ThinkBox
