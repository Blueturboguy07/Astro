/**
 * The app route that asks for a summary of a news link. Astro runs the app
 * from chrome-extension://…/app.html with a hash router: the old `/?q=…`
 * link opened chrome-extension://…/?q=… (ERR_FILE_NOT_FOUND). Astro 0.2.4
 * QA, F-031.
 */
export const summaryRoute = (url: string) =>
  `/home?q=${encodeURIComponent(`Summary: ${url}`)}`
