'use client'

import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useTheme } from 'next-themes'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import SyntaxHighlighter from 'react-syntax-highlighter'
import darkTheme from './CodeBlockDarkTheme'
import lightTheme from './CodeBlockLightTheme'

const SyntaxHighlighterComponent =
  SyntaxHighlighter as unknown as React.ComponentType<any>

const CodeBlock = ({
  language,
  children,
}: {
  language: string
  children: React.ReactNode
}) => {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const syntaxTheme = useMemo(() => {
    if (!mounted) return lightTheme
    return resolvedTheme === 'dark' ? darkTheme : lightTheme
  }, [mounted, resolvedTheme])

  return (
    <div className="relative">
      <button
        className="absolute top-2 right-2 p-1"
        onClick={() => {
          navigator.clipboard.writeText(children as string)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? (
          <CheckIcon
            size={16}
            className="absolute top-2 right-2 text-black/70 dark:text-white/70"
          />
        ) : (
          <CopyIcon
            size={16}
            className="absolute top-2 right-2 text-black/70 transition duration-200 hover:text-gray-800/70 dark:text-white/70 hover:dark:text-gray-300/70"
          />
        )}
      </button>
      <SyntaxHighlighterComponent
        language={language}
        style={syntaxTheme}
        showInlineLineNumbers
      >
        {children as string}
      </SyntaxHighlighterComponent>
    </div>
  )
}

export default CodeBlock
