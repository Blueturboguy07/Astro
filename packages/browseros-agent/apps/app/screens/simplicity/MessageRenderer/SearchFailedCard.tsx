import type { SearchFailedBlock } from '@/lib/simplicity/types'
import { searchFailedText } from './search-failed-text'

/* F-088: shown instead of an answer when web search gave nothing to write
   from. Retry runs the same question again (the Rewrite path). */
const SearchFailedCard = ({
  block,
  onRetry,
}: {
  block: SearchFailedBlock
  onRetry: () => void
}) => {
  const t = searchFailedText(block.data)
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-red-600 text-sm dark:text-red-400">
          {t.title}
        </p>
        <p className="mt-1 text-black/70 text-sm dark:text-white/70">
          {t.intro}
        </p>
        {t.lines.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-black/70 text-sm dark:text-white/70">
            {t.lines.map((line) => (
              <li key={line} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        )}
        {t.fallback && (
          <p className="mt-2 text-black/70 text-sm dark:text-white/70">
            {t.fallback}
          </p>
        )}
        <p className="mt-2 text-black/50 text-xs dark:text-white/50">
          {t.footer}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-lg bg-light-secondary px-3 py-1.5 font-medium text-black text-xs transition hover:bg-light-200 dark:bg-dark-secondary dark:text-white dark:hover:bg-dark-200"
      >
        Retry
      </button>
    </div>
  )
}

export default SearchFailedCard
