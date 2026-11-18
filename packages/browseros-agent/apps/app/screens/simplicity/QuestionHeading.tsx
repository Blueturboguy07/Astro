import { useState } from 'react'
import { cn } from '@/lib/simplicity/utils'
import { questionHeadingStyle } from './question-heading'

const QuestionHeading = ({ query }: { query: string }) => {
  const [expanded, setExpanded] = useState(false)
  const { sizeClass, clamp } = questionHeadingStyle(query)
  const cut = clamp && !expanded

  return (
    <div className="w-full break-words pt-8 lg:w-9/12">
      <h2
        className={cn(
          'font-medium text-black dark:text-white',
          sizeClass,
          cut && 'line-clamp-4',
        )}
      >
        {query}
      </h2>
      {clamp && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[#24A0ED] text-xs hover:underline"
        >
          {expanded ? 'Show less' : 'Show full question'}
        </button>
      )}
    </div>
  )
}

export default QuestionHeading
