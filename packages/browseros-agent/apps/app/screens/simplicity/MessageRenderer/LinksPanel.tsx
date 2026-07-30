'use client'

/* eslint-disable @next/next/no-img-element */
import { File } from 'lucide-react'
import type { Chunk } from '@/lib/simplicity/types'
import {
  faviconUrl,
  getDomainLabel,
  getHost,
  isFileSource,
} from './sourceUtils'

/** Full source cards for the "Links" tab: favicon, domain, title, snippet. */
const LinksPanel = ({ sources }: { sources: Chunk[] }) => {
  if (sources.length === 0) {
    return (
      <p className="py-6 text-center text-black/50 text-sm dark:text-white/50">
        No sources for this answer.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {sources.map((source, i) => {
        const url = source.metadata?.url as string | undefined
        const isFile = isFileSource(url)
        const host = getHost(url)

        const Card = (
          <div className="flex h-full flex-col gap-1.5 rounded-lg border border-light-200 bg-light-secondary p-3 transition duration-200 hover:bg-light-200 dark:border-dark-200 dark:bg-dark-secondary dark:hover:bg-dark-200">
            <div className="flex items-center gap-1.5">
              {isFile ? (
                <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-dark-200">
                  <File size={10} className="text-white/70" />
                </div>
              ) : (
                host && (
                  <img
                    src={faviconUrl(host)}
                    width={14}
                    height={14}
                    alt=""
                    className="h-3.5 w-3.5 flex-shrink-0 rounded-sm"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )
              )}
              <span className="truncate text-black/50 text-xs dark:text-white/50">
                {getDomainLabel(url)}
              </span>
              <span className="ml-auto flex-shrink-0 text-[11px] text-black/40 dark:text-white/40">
                {i + 1}
              </span>
            </div>
            <p className="line-clamp-2 font-medium text-black text-sm dark:text-white">
              {source.metadata?.title || getDomainLabel(url)}
            </p>
            {source.content && (
              <p className="line-clamp-2 text-black/60 text-xs dark:text-white/60">
                {source.content}
              </p>
            )}
          </div>
        )

        return isFile ? (
          <div key={i}>{Card}</div>
        ) : (
          <a key={i} href={url} target="_blank" rel="noreferrer">
            {Card}
          </a>
        )
      })}
    </div>
  )
}

export default LinksPanel
