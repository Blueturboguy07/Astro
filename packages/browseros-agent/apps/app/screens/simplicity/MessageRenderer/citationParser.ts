import type { Chunk } from '@/lib/simplicity/types'

/**
 * Matches one or more bracket groups that consist *only* of digits, commas
 * and whitespace, optionally separated by more whitespace so consecutive
 * markers like "[1][2]" or "[1] [2]" collapse into a single run alongside
 * "[1,2]".
 *
 * Deliberately strict: any bracket whose content contains a letter, a
 * decimal point, a hyphen, etc. (e.g. "[Note]", "[10,000-40,000]",
 * "[3.14]") never matches at all, so it is left completely untouched by
 * `.replace`. This is what makes the transform below provably lossless for
 * non-citation input -- String.prototype.replace only ever rewrites the
 * substrings a regex actually matched, never the text around them, and this
 * regex only ever matches genuine citation-shaped brackets.
 */
const CITATION_RUN_REGEX =
  /(?:\[\s*\d+(?:\s*,\s*\d+)*\s*\])(?:\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\])*/g

/**
 * Replaces citation markers in raw model text with `<citation idx="1,2">`
 * tags that the Citation component resolves against `sources`.
 *
 * Guarantees (see CITATION_RUN_REGEX above for why):
 *  - Any text that isn't a strictly-numeric bracket run is returned
 *    byte-for-byte identical -- it never matches, so it's never touched.
 *  - A matched run that resolves to zero valid indices (out-of-range
 *    numbers, or no sources at all) is dropped -- only that exact matched
 *    span disappears, the text before and after it is untouched.
 *  - A matched run with a mix of valid/invalid numbers keeps only the
 *    valid ones instead of discarding the whole group.
 *  - Duplicate numbers within one run (e.g. "[1,1,2]") are deduped.
 *
 * In other words: for any input, either the output is character-for-
 * character the same as the input, or it differs only inside spans this
 * regex matched -- surrounding answer prose can never be swallowed.
 */
export const annotateCitations = (text: string, sources: Chunk[]): string => {
  if (!text) return text

  return text.replace(CITATION_RUN_REGEX, (match) => {
    if (sources.length === 0) return ''

    const seen = new Set<number>()
    const indices: number[] = []

    for (const numStr of match.match(/\d+/g) ?? []) {
      const n = Number(numStr)
      if (n >= 1 && n <= sources.length && !seen.has(n)) {
        seen.add(n)
        indices.push(n)
      }
    }

    if (indices.length === 0) return ''

    return `<citation idx="${indices.join(',')}"></citation>`
  })
}
