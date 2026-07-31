import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'
import { parseAstroApiUrl } from './lib/browseros-api-url'
import { LEGACY_AGENT_EXTENSION_ID } from './lib/constants/legacyAgentExtensionId'
import { PRODUCT_WEB_HOST } from './lib/constants/productWebHost'

// biome-ignore lint/style/noProcessEnv: build config file needs env access
const env = process.env

const apiUrl = new URL(parseAstroApiUrl(env.VITE_PUBLIC_BROWSEROS_API))
const apiPattern = apiUrl.port
  ? `${apiUrl.hostname}:${apiUrl.port}`
  : apiUrl.hostname

// See https://wxt.dev/api/config.html
/* `key` is the public half of the CRX signing key, and Chrome derives the
   extension ID from it. It must stay in step with the private key used to pack
   the crx (~/.astro-extension-key.pem, kept out of the repo) — a different key
   means a different ID, which the browser's extension catalog will not
   recognize. Astro's ID: kofbmbngmnnpmopgbhpbajhnnnoflolg */
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Astro',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoZMul4RLe6LnxQB1CMVNGRO+f7PCpbpax0ON+EedN2hbCvz888u8M8vA3bkhY4wx/K9JU3WO97wLMLwyhB10TaVFDOHewcwpuT7Q0gGSiXgExy35WmCqsegpiMth8WuNhBqJyW+cvWPTd43iUu+LGhAnLW7CP+W6vlpd9DXG8WynJ9UIN3C5Cht3xA0XAs1xcbukA3WKy4jhQx/1dtEm+xBiVPMbDYGOOZhtR8/+L/K/HTRlMsRF6qGwsbLSPCw8QJI74FVR2YsHEKrJ3gE/94fABoosYzQSkVgLyBc11LbXLp75+jp/fqb+UXVgbvh+6YO9ikXZgMHu9ovzvNZWVQIDAQAB',
    /* No update_url: upstream points this at cdn.browseros.com, which serves
       their extension, not ours. Astro has no update server, so an absent
       update_url is the honest answer — updates come with the app. */
    externally_connectable: {
      matches: [`https://${apiPattern}/*`, `https://*.${apiPattern}/*`],
    },
    web_accessible_resources: [
      {
        resources: ['app.html'],
        matches: [
          `https://${PRODUCT_WEB_HOST}/*`,
          `https://*.${PRODUCT_WEB_HOST}/*`,
        ],
        extension_ids: [LEGACY_AGENT_EXTENSION_ID],
      },
    ],
    chrome_url_overrides: {
      newtab: 'app.html',
    },
    options_ui: {
      page: 'app.html#/settings',
      open_in_tab: true,
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
      default_title: 'Ask Astro',
    },
    permissions: [
      'topSites',
      'storage',
      'unlimitedStorage',
      'scripting',
      'tabs',
      'tabGroups',
      'sidePanel',
      'bookmarks',
      'history',
      'browserOS',
      'alarms',
      'webNavigation',
      'downloads',
    ],
    host_permissions: ['http://127.0.0.1/*'],
  },
  vite: () => ({
    build: {
      sourcemap: 'hidden',
    },
    /* WXT reads each entrypoint's config through vite-node, and an entrypoint
       whose `matches` depends on env pulls zod in there. Externalized, zod
       resolves to a namespace without `z` and the build fails before writing
       anything; bundling it for SSR keeps that path working. */
    ssr: {
      noExternal: ['zod'],
    },
    plugins: [
      tailwindcss(),
      ...(env.SENTRY_AUTH_TOKEN
        ? [
            sentryVitePlugin({
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              authToken: env.SENTRY_AUTH_TOKEN,
              sourcemaps: {
                // Bug with sentry & WXT - refer: https://github.com/wxt-dev/wxt/issues/1735
                // filesToDeleteAfterUpload: ['./dist/**/*.map'],
              },
            }),
          ]
        : []),
    ],
  }),
})
