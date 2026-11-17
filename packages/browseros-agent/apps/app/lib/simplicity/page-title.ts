/** The tab title: the first question of the open chat, else "Astro" (the
    title stayed on the old chat after New, Astro 0.2.4 QA round 3). */
export function pageTitle(firstQuery?: string): string {
  const q = firstQuery?.trim()
  return q ? `${q.substring(0, 30)} - Astro` : 'Astro'
}
