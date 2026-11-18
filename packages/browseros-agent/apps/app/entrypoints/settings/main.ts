import { SETTINGS_PAGE_PATH } from './settings-target'

/* The options page (chrome.runtime.openOptionsPage, the extension's
   "Options" entry). It cannot be app.html#/settings itself: app.html is
   also the new tab page, and Chrome reuses an open tab of the same page
   (the #fragment is ignored), so Settings opened Home (Astro 0.2.4 QA,
   F-091 d). */
location.replace(chrome.runtime.getURL(SETTINGS_PAGE_PATH))
