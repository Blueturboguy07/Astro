/* chrome://browseros/<page> opens app.html#/<page>. Pages that live under
   another route need a redirect here, or the catch-all sends them home
   (Astro 0.2.4 QA, F-080: chrome://browseros/mcp, which the docs name). */
export const CHROME_PAGE_REDIRECTS: Readonly<Record<string, string>> = {
  '/mcp': '/settings/mcp',
}
