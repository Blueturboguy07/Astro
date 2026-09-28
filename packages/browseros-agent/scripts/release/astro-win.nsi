; Astro Windows installer (NSIS).
;
; Astro is a re-cut of upstream BrowserOS's PREBUILT Windows tree (see
; astro-recut-win.ts). This script wraps the already-patched Chrome-bin tree in
; an installer that satisfies goal item 12 (Windows): a real install to Program
; Files, a Start-menu shortcut, an Add/Remove Programs entry, and a working
; uninstaller. A portable zip was rejected because it delivers none of those.
;
; Unsigned by design: publik holds no Windows code-signing cert and upstream
; ships unsigned too. The publik listing says so and the guide shows the
; SmartScreen "More info -> Run anyway" steps.
;
; Silent install/uninstall (/S) is supported for CI: the release workflow
; installs with /S, drives the browser over CDP, then uninstalls with /S and
; asserts the tree is gone.
;
; Driven entirely by /D defines from astro-recut-win.ts:
;   makensis /DSRCDIR=<abs Chrome-bin> /DOUTFILE=<abs setup.exe> /DVERSION=x.y.z astro-win.nsi

Unicode true

; ${GetSize} (Add/Remove Programs size) lives here; include before first use.
!include "FileFunc.nsh"

!ifndef SRCDIR
  !error "SRCDIR is required: /DSRCDIR=<path to patched Chrome-bin>"
!endif
!ifndef OUTFILE
  !error "OUTFILE is required: /DOUTFILE=<path to Astro-Setup.exe>"
!endif
!ifndef VERSION
  !define VERSION "0.0.0"
!endif

!define APPNAME       "Astro"
!define PUBLISHER     "publik"
!define UNINST_KEY    "Software\Microsoft\Windows\CurrentVersion\Uninstall\Astro"
!define APP_REG_KEY   "Software\Astro"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\Astro"
InstallDirRegKey HKLM "${APP_REG_KEY}" "InstallDir"
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show
SetCompressor /SOLID lzma

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName"     "${APPNAME}"
VIAddVersionKey "CompanyName"     "${PUBLISHER}"
VIAddVersionKey "FileDescription" "Astro installer"
VIAddVersionKey "FileVersion"     "${VERSION}"
VIAddVersionKey "ProductVersion"  "${VERSION}"
VIAddVersionKey "LegalCopyright"  "Copyright 2026 publik"

; ---- pages (skipped automatically under /S) ----
Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Astro" SecMain
  SectionIn RO
  ; All-users context: the app installs to Program Files (per-machine), so its
  ; Start-menu and Desktop shortcuts belong in the all-users locations
  ; ($SMPROGRAMS -> %ProgramData%\...\Start Menu, $DESKTOP -> %Public%\Desktop),
  ; not the installing user's. Without this NSIS defaults to the current user.
  SetShellVarContext all
  ; NSIS is a 32-bit process; without this its HKLM writes are redirected to
  ; WOW6432Node, so the Add/Remove Programs entry would be invisible to 64-bit
  ; tools (and to the CI's registry check). Write the native 64-bit view.
  SetRegView 64
  SetOutPath "$INSTDIR"
  ; The whole patched Chrome-bin tree: chrome.exe, chrome_proxy.exe and the
  ; versioned payload dir (chrome.dll, browseros_extensions, etc.).
  File /r "${SRCDIR}\*"

  WriteRegStr HKLM "${APP_REG_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${APP_REG_KEY}" "Version" "${VERSION}"

  ; Add/Remove Programs.
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayName"     "${APPNAME}"
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKLM "${UNINST_KEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayIcon"     "$INSTDIR\chrome.exe,0"
  WriteRegStr   HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKLM "${UNINST_KEY}" "UninstallString"       '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "${UNINST_KEY}" "QuietUninstallString"  '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1

  ; Estimated size in KB for Add/Remove Programs.
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize" "$0"

  ; Shortcuts point at chrome.exe, the browser launcher.
  CreateDirectory "$SMPROGRAMS\Astro"
  CreateShortcut  "$SMPROGRAMS\Astro\Astro.lnk" "$INSTDIR\chrome.exe" "" "$INSTDIR\chrome.exe" 0
  CreateShortcut  "$DESKTOP\Astro.lnk"          "$INSTDIR\chrome.exe" "" "$INSTDIR\chrome.exe" 0

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  ; Match the install context so the all-users shortcuts are the ones removed.
  SetShellVarContext all
  SetRegView 64
  Delete "$SMPROGRAMS\Astro\Astro.lnk"
  RMDir  "$SMPROGRAMS\Astro"
  Delete "$DESKTOP\Astro.lnk"

  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "${APP_REG_KEY}"
SectionEnd
