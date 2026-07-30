'use client'

import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import type { Chunk } from '@/lib/simplicity/types'
import {
  faviconUrl,
  getDomainLabel,
  getHost,
  isFileSource,
} from './sourceUtils'

/**
 * Renders `<citation idx="1,2,5">` produced by annotateCitations.
 *
 * `idx` is guaranteed (by annotateCitations) to be a comma-separated list of
 * 1-based indices already validated against `sources.length`, but this
 * component re-validates defensively -- if resolution still fails for any
 * reason it renders nothing rather than a broken chip, never touching
 * surrounding text (it's a self-contained inline element).
 */
const Citation = ({
  idx,
  sources = [],
}: {
  idx?: string
  sources?: Chunk[]
}) => {
  const indices = (idx ?? '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= sources.length)

  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  if (indices.length === 0) return null

  const group = indices.map((number) => ({
    number,
    chunk: sources[number - 1],
  }))
  const primary = group[0]
  const primaryHost = getHost(primary.chunk?.metadata?.url)

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  const active = group[Math.min(activeIdx, group.length - 1)]
  const activeUrl = active.chunk?.metadata?.url as string | undefined
  const activeHost = getHost(activeUrl)
  const activeIsFile = isFileSource(activeUrl)

  const goPrev = () =>
    setActiveIdx((i) => (i - 1 + group.length) % group.length)
  const goNext = () => setActiveIdx((i) => (i + 1) % group.length)

  return (
    <span
      ref={wrapperRef}
      className="not-prose relative inline-block align-middle"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setActiveIdx(0)
          setOpen((o) => !o)
        }}
        className="mx-0.5 inline-flex h-[19px] -translate-y-[1px] cursor-pointer items-center gap-1 rounded-full bg-light-200/70 px-1.5 align-middle font-medium text-[11px] text-black/70 no-underline transition-colors duration-150 hover:bg-light-200 dark:bg-dark-200/70 dark:text-white/70 dark:hover:bg-dark-200"
      >
        {primaryHost && (
          <img
            src={faviconUrl(primaryHost)}
            alt=""
            className="h-3 w-3 flex-shrink-0 rounded-sm"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        <span className="max-w-[7rem] truncate">
          {getDomainLabel(primary.chunk?.metadata?.url)}
        </span>
        {group.length > 1 && (
          <span className="text-black/40 dark:text-white/40">
            +{group.length - 1}
          </span>
        )}
      </button>

      {open && (
        <div
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          className="absolute bottom-full left-1/2 z-40 mb-2 w-72 max-w-[80vw] -translate-x-1/2 rounded-lg border border-light-200 bg-light-primary p-3 text-left shadow-xl dark:border-dark-200 dark:bg-dark-primary"
        >
          <div className="mb-1.5 flex items-center gap-2">
            {activeHost && (
              <img
                src={faviconUrl(activeHost)}
                alt=""
                className="h-4 w-4 flex-shrink-0 rounded-sm"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            )}
            <span className="truncate font-medium text-black/60 text-xs dark:text-white/60">
              {getDomainLabel(activeUrl)}
            </span>
          </div>

          <p className="mb-1 line-clamp-2 font-medium text-black text-sm dark:text-white">
            {active.chunk?.metadata?.title || 'Untitled source'}
          </p>

          {active.chunk?.content && (
            <p className="line-clamp-2 text-black/60 text-xs dark:text-white/60">
              {active.chunk.content}
            </p>
          )}

          <div className="mt-2.5 flex items-center justify-between border-light-200 border-t pt-2 dark:border-dark-200">
            {group.length > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Previous source"
                  className="rounded p-0.5 text-black/50 hover:bg-light-secondary dark:text-white/50 dark:hover:bg-dark-secondary"
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="text-[11px] text-black/50 tabular-nums dark:text-white/50">
                  {activeIdx + 1}/{group.length}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Next source"
                  className="rounded p-0.5 text-black/50 hover:bg-light-secondary dark:text-white/50 dark:hover:bg-dark-secondary"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            ) : (
              <span />
            )}

            {!activeIsFile && activeUrl && (
              <a
                href={activeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-medium text-[11px] text-sky-500 hover:text-sky-400"
              >
                Visit <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      )}
    </span>
  )
}

export default Citation
