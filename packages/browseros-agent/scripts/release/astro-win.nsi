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
;
; With /DUPDATER (plus /DVERSIONDIR=<Chromium version dir> /DHELPER=<astro-update-helper.ps1>)
; the same tree becomes Astro-Update-<version>.exe, the package Astro's own
; updater (WinSparkle) downloads, checks against Astro's update key and runs.
; WinSparkle's glue starts it with CreateProcess, hidden, with "--silent"
; (chrome/browser/win/winsparkle_glue.cc). So the package:
;   - asks for no admin rights in its manifest (RequestExecutionLevel user):
;     CreateProcess cannot start an exe whose manifest asks for admin from a
;     normal (non-elevated) process (error 740);
;   - is always silent: no page can wait behind a hidden window;
;   - when its token is not admin, starts itself again with ShellExecute
;     "runas" (the UAC prompt) and waits; the elevated copy does the work;
;   - closes Astro first (chrome.dll and the other files cannot be written
;     while Astro runs), installs the tree, updates the version keys, removes
;     version folders of older Chromium builds, then starts Astro again as the
;     user who ran the update.
; Exit codes: 0 updated; 2 admin rights refused or the elevated copy failed;
; 3 Astro is not installed; 5 Astro did not close or its files stayed in use
; (nothing written); 6 files could not be written.

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
!ifdef UPDATER
  !ifndef VERSIONDIR
    !error "UPDATER needs /DVERSIONDIR=<Chromium version dir of the tree>"
  !endif
  !ifndef HELPER
    !error "UPDATER needs /DHELPER=<path to astro-update-helper.ps1>"
  !endif
  !include "LogicLib.nsh"
  RequestExecutionLevel user
  SilentInstall silent
!else
  RequestExecutionLevel admin
!endif
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

; The version keys both the installer and the update package write.
!macro WriteVersionKeys
  WriteRegStr HKLM "${APP_REG_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${APP_REG_KEY}" "Version" "${VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
!macroend

!ifdef UPDATER
; ---------------- the update package (see the header) ----------------
Var Elevated
Var ResultFile
Var LogFile

Function .onInit
  SetShellVarContext all
  SetRegView 64
  ReadRegStr $INSTDIR HKLM "${APP_REG_KEY}" "InstallDir"
  ${If} $INSTDIR == ""
  ${OrIfNot} ${FileExists} "$INSTDIR\chrome.exe"
    SetErrorLevel 3
    Quit
  ${EndIf}
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/ELEVATED" $R1
  ${IfNot} ${Errors}
    StrCpy $Elevated 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/RESULT=" $ResultFile
  ; What the update did, for a person who asks why it failed: %TEMP%\astro-update.log.
  ; The elevated copy writes next to its result file; the first copy keeps that file.
  ${If} $ResultFile != ""
    StrCpy $LogFile "$ResultFile.log"
  ${Else}
    StrCpy $LogFile "$TEMP\astro-update.log"
    Delete "$LogFile"
  ${EndIf}
FunctionEnd

Function Log
  ; $0 = the line.
  FileOpen $8 "$LogFile" a
  FileSeek $8 0 END
  FileWrite $8 "$0$\r$\n"
  FileClose $8
FunctionEnd

Function WriteResult
  ; $0 = the word to write. Only the elevated copy writes one.
  ${If} $ResultFile != ""
    FileOpen $9 "$ResultFile" w
    FileWrite $9 "$0"
    FileClose $9
  ${EndIf}
FunctionEnd

Function Fail
  ; $0 = exit code.
  Push $0
  StrCpy $0 "fail $0"
  Call Log
  Call WriteResult
  Pop $0
  SetErrorLevel $0
  Quit
FunctionEnd

Section "Update" SecUpdate
  SectionIn RO
  SetShellVarContext all
  SetRegView 64
  ${If} $Elevated != 1
    UserInfo::GetAccountType
    Pop $1
    ${If} $1 != "Admin"
      ; Ask for admin rights (UAC) and let the elevated copy do the work.
      InitPluginsDir
      StrCpy $0 "not admin: asking for admin rights"
      Call Log
      ExecShellWait "runas" "$EXEPATH" '/ELEVATED /RESULT="$PLUGINSDIR\result.txt"'
      StrCpy $2 ""
      ClearErrors
      FileOpen $9 "$PLUGINSDIR\result.txt" r
      ${IfNot} ${Errors}
        FileRead $9 $2
        FileClose $9
      ${EndIf}
      ${If} ${FileExists} "$PLUGINSDIR\result.txt.log"
        FileOpen $9 "$PLUGINSDIR\result.txt.log" r
        ${Do}
          ClearErrors
          FileRead $9 $0
          ${If} ${Errors}
            ${ExitDo}
          ${EndIf}
          FileOpen $8 "$LogFile" a
          FileSeek $8 0 END
          FileWrite $8 "$0"
          FileClose $8
        ${Loop}
        FileClose $9
      ${EndIf}
      StrCpy $0 "the copy with admin rights answered: '$2'"
      Call Log
      ${If} $2 != "ok"
        SetErrorLevel 2
        Quit
      ${EndIf}
      Exec '"$INSTDIR\chrome.exe"'
      SetErrorLevel 0
      Quit
    ${EndIf}
  ${EndIf}

  InitPluginsDir
  File "/oname=$PLUGINSDIR\astro-update-helper.ps1" "${HELPER}"
  StrCpy $0 "update to ${VERSION}: closing Astro in $INSTDIR"
  Call Log
  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\astro-update-helper.ps1" -Action close -InstallDir "$INSTDIR"'
  Pop $1
  Pop $2
  StrCpy $0 "close: exit $1: $2"
  Call Log
  ${If} $1 != 0
    StrCpy $0 5
    Call Fail
  ${EndIf}

  SetOutPath "$INSTDIR"
  SetOverwrite on
  ClearErrors
  File /r "${SRCDIR}\*"
  ${If} ${Errors}
    StrCpy $0 6
    Call Fail
  ${EndIf}
  StrCpy $0 "files copied"
  Call Log
  !insertmacro WriteVersionKeys
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\astro-update-helper.ps1" -Action prune -InstallDir "$INSTDIR" -Keep "${VERSIONDIR}"'
  Pop $1

  ${If} $Elevated == 1
    StrCpy $0 "ok"
    Call WriteResult
  ${Else}
    Exec '"$INSTDIR\chrome.exe"'
  ${EndIf}
  SetErrorLevel 0
SectionEnd

!else
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

  !insertmacro WriteVersionKeys

  ; Add/Remove Programs.
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayName"     "${APPNAME}"
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
!endif
