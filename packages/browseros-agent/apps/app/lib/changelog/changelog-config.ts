/* Astro's release notes (F-079: upstream's docs.browseros.com changelog). */
const CHANGELOG_BASE_URL = 'https://github.com/Blueturboguy07/Astro/releases'

type ChangelogVersionConfig = {
  showChangelog: true
  anchor?: string
}

/**
 * Whitelist of extension versions that should show changelog.
 * Only versions in this list will trigger changelog notification.
 * Unlisted versions = no changelog shown.
 *
 * @example
 * '0.0.21': { showChangelog: true }  // opens base changelog URL
 * '0.0.25': { showChangelog: true, anchor: 'v0-0-25' }  // opens changelog#v0-0-25
 */
/* Upstream's entries (0.0.52, 0.0.55) were BrowserOS releases; Astro opens
   no changelog tab until a version is listed here. */
const CHANGELOG_VERSIONS: Record<string, ChangelogVersionConfig> = {}

export function getChangelogUrl(version: string): string {
  const config = CHANGELOG_VERSIONS[version]
  if (!config?.anchor) return CHANGELOG_BASE_URL
  return `${CHANGELOG_BASE_URL}#${config.anchor}`
}

export function shouldShowChangelog(version: string): boolean {
  return CHANGELOG_VERSIONS[version]?.showChangelog === true
}
