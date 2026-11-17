/**
 * The speed mode and the sources the person picked, kept across a reload
 * or a restart like the model and the search mode (Astro 0.2.4 QA, F-065:
 * both went back to Speed and Web).
 */
const MODES = ['speed', 'balanced', 'quality'] as const
const SOURCES = ['web', 'academic', 'discussions'] as const

type Store = Pick<Storage, 'getItem' | 'setItem'>

const safe = (s: () => Store | undefined): Store | undefined => {
  try {
    return s()
  } catch {
    return undefined
  }
}

export function readOptimizationMode(
  store: Store | undefined = safe(() => localStorage),
): string {
  const v = store?.getItem('optimizationMode')
  return v && (MODES as readonly string[]).includes(v) ? v : 'speed'
}

export function readSources(
  store: Store | undefined = safe(() => localStorage),
): string[] {
  try {
    const v = JSON.parse(store?.getItem('answerSources') ?? 'null')
    if (Array.isArray(v)) {
      /* [] is a choice (every source off): keep it, or the composer shows
         "Web" and searches the web after a reload (round 3 note). */
      if (v.length === 0) return []
      const ok = v.filter((s) => (SOURCES as readonly string[]).includes(s))
      if (ok.length > 0) return ok
    }
  } catch {}
  return ['web']
}

export function saveAnswerPref(
  key: 'optimizationMode' | 'answerSources',
  value: string | string[],
  store: Store | undefined = safe(() => localStorage),
): void {
  try {
    store?.setItem(
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    )
  } catch {}
}
