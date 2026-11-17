/**
 * Signed out once the stored session has loaded and has no user. The page
 * checked `!sessionInfo`, but the storage fallback is `{}`, which is always
 * truthy, so a signed-out #/profile spun forever (Astro 0.2.4 QA, F-032).
 */
export function shouldGoToLogin(
  sessionLoading: boolean,
  userId: string | undefined,
): boolean {
  return !sessionLoading && !userId
}
