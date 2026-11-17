/**
 * The chat to open after a route change, or null to keep the current one.
 *
 * Only a change of the route's chat id opens a chat. "New" sets a fresh id
 * before the router clears the old id from the URL; comparing the route id
 * with the current id alone switched straight back to the old thread when
 * that thread came from History or a reload (Astro 0.2.4 QA, F-056).
 */
export function chatToOpen(
  previousRouteId: string | undefined,
  routeId: string | undefined,
  currentId: string | undefined,
): string | null {
  if (!routeId || routeId === previousRouteId) return null
  return routeId === currentId ? null : routeId
}
