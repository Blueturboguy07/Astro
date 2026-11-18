/* The question above an answer. A 20,000-character question (pasted notes
   plus a question) filled the page as one 3xl heading (Astro 0.2.4 QA,
   F-065): long questions get a smaller size, and very long ones are cut
   to a few lines with "Show full question". */
export type QuestionHeadingStyle = {
  sizeClass: string
  /* Cut to a few lines until the person asks for the full text. */
  clamp: boolean
}

export const SHORT_QUESTION_CHARS = 120
export const MEDIUM_QUESTION_CHARS = 300

export const questionHeadingStyle = (query: string): QuestionHeadingStyle => {
  const length = query.trim().length
  const lines = query.split(/\r?\n/).length
  if (length <= SHORT_QUESTION_CHARS && lines <= 2) {
    return { sizeClass: 'text-3xl', clamp: false }
  }
  if (length <= MEDIUM_QUESTION_CHARS && lines <= 4) {
    return { sizeClass: 'text-xl', clamp: false }
  }
  return { sizeClass: 'text-base', clamp: true }
}
