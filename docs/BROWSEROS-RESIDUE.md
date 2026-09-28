# BrowserOS identifiers that remain in Astro, and why

Astro is a re-cut of BrowserOS's prebuilt Chromium (a branded build cannot be
recompiled — ~100 GB per platform). Everything a **user sees** is rebranded to
Astro (app name, menus, About box, onboarding, version page, the extension UI,
and its links). The identifiers below are **not user-visible** and are load-
bearing: renaming them would break the profile, the local server, the pref
store, or the extension bridge. They are kept on purpose.

### Bundle id com.browseros.BrowserOS and keychain item 'BrowserOS Safe Storage' (binary @264640336/@264640359 + both slices)
LEAVE. 'BrowserOS Safe Storage' is the macOS keychain access-group label shown in the system password prompt; renaming it orphans every saved password/cookie encryption key. Bundle id change orphans profiles and breaks Iris's foreground check (session DECISION: keep bundle id). Both internal-identity, not worth the data loss.
_(found by the chrome-binary review)_

### 'BrowserOS Framework', 'BrowserOS Helper' and helper .app paths (binary @270430832/@537561747 etc.)
LEAVE. These are the framework/helper executable and bundle names, referenced by @executable_path load paths and the codesign structure. Same-length patching the strings would not rename the on-disk dirs and would break dyld load / signature. Only surface in Activity Monitor (near-invisible). Structural, high corruption risk.
_(found by the chrome-binary review)_

### chrome://browseros-onboarding/ host string (binary @272783520) and 'browseros-onboarding' host id (@264515856)
LEAVE the host id. It is the internal WebUI host registration matched across the binary, the resource map, and BrowserOSOnboardingNavigationThrottle. Renaming requires coordinated changes everywhere or the page fails to load; users rarely type the URL. Rebrand only the page's VISIBLE title/body via the resources.pak rids 16000/16002 edit (in the edits list), which needs no host change.
_(found by the chrome-binary review)_

### Internal symbol/class strings: BrowserOSUserDriver, BrowserOSMetricsService, BrowserOSToast, BrowserOSUpdater, BrowserOSServer, LaunchBrowserOSProcess, kActionBrowserOSAgent, aboutBrowserOSVersion (i18n key), etc.
LEAVE. Not user-visible (ObjC class names, log tags, process names, message-catalog KEYS). aboutBrowserOSVersion is an i18n lookup key resolved from the locale.pak value, so rebranding the locale entry updates the displayed text without touching the key. Patching keys risks breaking runtime lookups.
_(found by the chrome-binary review)_

### macOS app menu-bar title (CFBundleName 'BrowserOS' in Info.plist)
OUT OF THIS DIMENSION but user-visible. The menu-bar app name comes from CFBundleName in Contents/Info.plist, not from the binary or paks. v0.1.1 sets CFBundleDisplayName='Astro' but keeps CFBundleName='BrowserOS'. Flag to the bundle/plist dimension to decide (changing CFBundleName is a plist edit, not a byte patch).
_(found by the chrome-binary review)_

### chrome://flags entries 'BrowserOS Alpha Features' / 'BrowserOS Keyboard Shortcuts' and their descriptions (binary, both slices)
BYTE-PATCHABLE but LOW priority (in edits list). Only visible if a user opens chrome://flags. Same-length patch with trailing-space padding works; skippable if minimizing binary edits.
_(found by the chrome-binary review)_

### chrome.browserOS.* (adapter.ts, chrome-browser-os.d.ts)
Real Chromium C++ extension API surface compiled into the browser (chrome.browserOS.getPref/setPref/getVersionNumber/logMetric/choosePath/browserosToggle/browserosIsOpen). Renaming breaks the extension outright.
_(found by the extension-ui review)_

### browseros.* pref keys in lib/browseros/prefs.ts (BROWSEROS_PREFS.*, e.g. 'browseros.server.mcp_port', 'browseros.show_llm_chat')
Literal preference-store keys read/written by the compiled BrowserOSServer/pref service on the C++ side. Renaming orphans every existing user's settings and breaks pref sync — not user-visible text.
_(found by the extension-ui review)_

### @browseros/app, @browseros/server, @browseros/shared/* package names and import paths
Internal Bun-workspace package identifiers (package.json 'name', tsconfig paths, import specifiers). Never shown to a user; renaming is a large, high-risk refactor across the whole monorepo for zero visible benefit.
_(found by the extension-ui review)_

### BrowserOSAdapter/BrowserOsAiPane/browserOSVersion/getBrowserosVersion/BrowserosToggleOptions/BrowserosIsOpen* class, function, and variable names
Internal code identifiers only; the actual rendered pane title is 'Astro AI pane' and shows no BrowserOS text. Renaming is pure churn with regression risk and no user-visible effect.
_(found by the extension-ui review)_

### provider.type === 'browseros' / id: 'browseros' / DEFAULT_PROVIDER_ID = 'browseros' (llm-providers/*, ai-settings/*, schedules/*, chat modules)
Persisted data-model discriminator (stored in chrome.storage and synced to the server) for the built-in Astro-hosted model. The user-facing label is already 'Astro' (providerTemplates.ts: { value: 'browseros', label: 'Astro' }). Renaming the stored enum string would require a storage migration and isn't a branding fix — it's an internal id.
_(found by the extension-ui review)_

### wxt.config.ts web_accessible_resources / externally_connectable host patterns (PRODUCT_WEB_HOST = 'browseros.com', api.browseros.com)
Functional extension permission/host-matching config wired to the legacy web-extension bridge (LEGACY_AGENT_EXTENSION_ID) and the real API host, not rendered branding text. Belongs to the shared/constants/urls.ts + backend-host dimension, not this UI-branding sweep; changing it here without coordinating the actual API host would break the extension's web integration.
_(found by the extension-ui review)_

### docs.browseros.com feature/how-to deep links: scheduledTasksHelpUrl, MCPServerHeader.tsx DOCS_URL (use-with-claude-code), ChatError.tsx connection-issues URL, ProviderCard.tsx bring-your-own-llm URL, providerTemplates.ts setupGuideUrl entries (chatgpt-pro-oauth, github-copilot-oauth, qwen-code-oauth, bring-your-own-llm#openai/#claude/#gemini/#ollama/#openrouter/#lmstudio)
Astro is a straight fork sharing these exact features/code, so this technical how-to content is still accurate for Astro users. No Astro-specific documentation site exists to replace it, and standing one up is outside a branding text-sweep. Left pointed at upstream deliberately, per the task's own 'keep upstream only where no Astro equivalent exists' rule.
_(found by the extension-ui review)_

### productUrls.ts: discordUrl, slackUrl, productVideoUrl, productRepositoryShortUrl
No Astro-run Discord/Slack community or demo video exists, and none of these four exports has any import site in the current app (confirmed dead code). Left pointed upstream; low priority to revisit only if/when they get wired into the UI.
_(found by the extension-ui review)_

### lib/changelog/changelog-config.ts CHANGELOG_BASE_URL = docs.browseros.com/changelog
No Astro changelog page exists. Currently dormant for the shipped build: CHANGELOG_VERSIONS only whitelists '0.0.52'/'0.0.55', and the current version is 0.0.101, so shouldShowChangelog() never fires today. Left as-is but flagged as a landmine if a future version gets added to that whitelist.
_(found by the extension-ui review)_

### browserosId / installId (crypto.randomUUID, persisted at identity/browseros-id.json)
Used legitimately beyond Klavis: OAuth token manager keying, MCP self-heal (selfHealMcpLinks), and local self-identification. Gating the automatic Klavis connection must not remove the identifier itself — only its unconsented transmission to llm.browseros.com.
_(found by the phone-home review)_

### Upstream's Sparkle SUPublicEDKey (kept, not replaced, in Info.plist)
app/astro/update/route.ts's own comment explains why: publik does not hold the matching private key, so a publik-signed update would fail Sparkle's signature check and error at the worst moment. Until publik generates its own EdDSA keypair and signs releases with it (decision D33's unfinished half), the feed is repointed to publik but the trusted key deliberately stays upstream's, and the served appcast must never offer a version publik cannot actually deliver.
_(found by the phone-home review)_

### cdn.browseros.com / api.browseros.com literal strings inside packages/shared/src/constants/urls.ts (EXTERNAL_URLS.CDN) and apps/app/lib/browseros-api-url.ts (DEFAULT_BROWSEROS_API_URL)
CDN is build-tooling-only (upload-onboarding-video.ts, cli/upload.ts) and never reachable from shipped runtime code — safe to leave as a constant name, just don't let a future runtime import pick it up. DEFAULT_BROWSEROS_API_URL is NOT safe to leave as the fallback (see edits) — flagged separately because the two look similar but have opposite risk.
_(found by the phone-home review)_

### com.browseros.BrowserOS (macBundleId in lib/apps-config.ts, astro listing, line 571)
Framework bundle id shipped inside Astro.app's Info.plist is unchanged from upstream BrowserOS; renaming it in the listing without renaming it in the actual app orphans existing user profiles and breaks Iris's foregroundApp check — this is a DECISION from the session recon (keep it), not something my edits touch.
_(found by the publik review)_

### watch.expect[0].bundleId: "com.browseros.BrowserOS" (lib/guides/astro.ts, macOS 'install' step)
Same identifier, read by tests/astro-guide.test.ts's 'watches Astro opening against the identifier the catalog knows' test, which cross-checks this literal against APPS.find(slug==='astro').macBundleId — the two must stay byte-identical. Untouched by my edits; flagged so nobody 'fixes' it to say 'com.astro.Astro' by mistake.
_(found by the publik review)_

### "BrowserOS Framework" framework name (compiled into the .app bundle, referenced only in RELEASING.md's own verification commands, not in publik)
Not edited here (out of publik's scope), but publik-side copy (guide steps, apps-config comments) must not claim or imply this was renamed — my rewritten Windows branch and apps-config comments deliberately still say 'Astro's own installer' / 'Astro browser' without asserting anything about internal framework naming.
_(found by the publik review)_

### com.browseros.BrowserOS (CFBundleIdentifier) + .com.browseros.BrowserOS.* keychain access groups (secure-payment-confirmation, devicetrust, webauthn, webauthn-uvk, unexportable-keys)
D-decision: changing the bundle id orphans user profiles and breaks Iris's foreground check; the keychain access-group prefixes are derived from it and gate stored credentials.
_(found by the recut-mac review)_

### "BrowserOS Safe Storage"
Keychain item label for the profile encryption key; renaming it orphans every saved password / cookie encryption on existing installs.
_(found by the recut-mac review)_

### "BrowserOS Framework" / "BrowserOS Framework.framework" / "BrowserOS Helper" / "BrowserOS Helper.app/Contents/MacOS/BrowserOS Helper"
Dyld load paths and helper exec paths baked into the bundle layout; renaming breaks framework/helper loading (app will not launch).
_(found by the recut-mac review)_

### Process/service names: BrowserOSServer, BrowserOSUpdater, BrowserOSMetricsService, BrowserOSEnterpriseCompanion, BrowserOSToast, BrowserOSUserDriver, "BrowserOS server"
Objective-C class / process identifiers used for lookup and IPC; patching risks symbol/name mismatch at runtime.
_(found by the recut-mac review)_

### browseros.* pref keys and log prefixes ("browseros: …"), selectors aboutBrowserOSVersion / kActionBrowserOSAgent / logBrowserOSMetric / GetBrowserOSExecutionDir
Preference keys read across launches (renaming loses settings) and internal symbol/log identifiers, not user-facing chrome.
_(found by the recut-mac review)_

### UPSTREAM_AGENT_EXTENSION_ID 'bflpfmnmnokmjhmgnolecpppdbdophmk' -> ASTRO_EXTENSION_ID 'kofbmbngmnnpmopgbhpbajhnnnoflolg'
The id byte-patch (step [2], --patch-id) MUST stay: IsActiveBrowserOSExtension walks a compiled-in table, so only overwriting upstream's 32-char id registers Astro's agent.
_(found by the recut-mac review)_

### chrome.exe / chrome_proxy.exe filenames (kept)
CFBundle-equivalent launcher names; Start-menu shortcut and ARP DisplayIcon point at chrome.exe. Renaming breaks the launcher and every relative path baked into the tree.
_(found by the windows-pkg review)_

### Versioned payload dir name (151.0.8162.137) (kept)
Chromium resolves chrome.dll, resources.pak, Locales and browseros_extensions relative to it; chromeVersionDir() reads it, does not rename it.
_(found by the windows-pkg review)_

### browseros_server(.exe) process/binary name (kept)
The browser's server manager launches it by this name; the CI /health step matches Get-Process browseros_server. Renaming orphans the local server.
_(found by the windows-pkg review)_

### browseros_extensions/ dir + bundled_extensions.json mechanism (kept)
The external-extension loader installs the agent from this exact path/filename on launch; we rewrite the JSON contents (Astro id only) but keep the mechanism.
_(found by the windows-pkg review)_

### 'BrowserOS' / browseros.* tokens inside chrome.dll (kept, NOT patched)
Load-bearing identifiers: pref keys (browseros.*), profile/data paths, safe-storage labels. Same rule as the mac recut's empty VISIBLE_STRING_PATCHES — renaming orphans user data. The user-visible name comes from the extension manifest ('Astro') and the NSIS shortcut, not these.
_(found by the windows-pkg review)_

### Bug-reporter id adlpneommgkgeanpaekgoaolcpncohkf string in chrome.dll's kBrowserOSExtensions table (kept in binary)
Pinned in a compiled-in table; cannot be removed without recompiling Chromium. It is neutralized instead by killing the config URL so the maintainer can never fetch a config that re-adds it, and by deleting the CRX + omitting it from bundled_extensions.json.
_(found by the windows-pkg review)_
