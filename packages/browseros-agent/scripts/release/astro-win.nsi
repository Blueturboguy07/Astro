; Astro Windows installer and update package (NSIS).
;
; Astro is a re-cut of upstream BrowserOS's PREBUILT Windows tree (see
; astro-recut-win.ts). This script wraps the already-patched Chrome-bin tree.
;
; Astro installs PER USER (no admin rights, ever):
;   %LOCALAPPDATA%\Astro\Application\     the app (chrome.exe, the version folder)
;   %LOCALAPPDATA%\Astro\Application.next\ a newer version, staged while Astro runs
;   %LOCALAPPDATA%\Astro\Updater\          astro-restart-<version>.exe (the restart helper)
;   %LOCALAPPDATA%\Astro\Uninstall.exe
;   HKCU\Software\Astro (InstallDir, Version), HKCU ...\Uninstall\Astro (Apps & Features),
;   HKCU ...\Run "Astro Update" (the helper switches a staged version in at logon),
;   Start-menu and Desktop shortcuts of this user.
; The profile stays in %LOCALAPPDATA%\BrowserOS\User Data (Chromium's own path).
; Astro 0.2.9 and older installed for all users in Program Files; the update
; package moves such an install (mode "migrate" below).
;
; Unsigned by design: publik holds no Windows code-signing cert and upstream
; ships unsigned too. The publik listing says so and the guide shows the
; SmartScreen "More info -> Run anyway" steps.
;
; Silent install/uninstall (/S) is supported for CI.
;
;   makensis /DSRCDIR=<abs Chrome-bin> /DOUTFILE=<abs setup.exe> /DVERSION=x.y.z
;            /DHELPER=<astro-update-helper.ps1> /DRESTART=<astro-restart.exe> astro-win.nsi
;
; With /DUPDATER the same tree becomes Astro-Update-<version>.exe, the package
; Astro's updater downloads. WinSparkle (Astro's fork, WinSparkle.ini
; SilentAutoInstall=1) downloads it with no window and checks it against
; Astro's update key; chrome.dll's glue then starts it with CreateProcess,
; hidden, with "--silent" (chrome/browser/win/winsparkle_glue.cc), and waits up
; to 10 minutes. So the package asks for no admin rights in its manifest
; (RequestExecutionLevel user) and is always silent. Its mode:
;   stage    (Astro is installed for this user) never closes Astro: refuses a
;            version that is not newer than the installed one, writes the new
;            tree to Application.next (under the lock Local\AstroUpdateSwap),
;            then starts the restart helper, which asks "Restart now / Later".
;   migrate  (only the old all-users install exists) installs for this user
;            (no admin rights), then asks for admin rights ONCE (UAC) to remove
;            the old copy in Program Files, closes the old Astro and starts
;            Astro from its new folder. If admin rights are refused, the old
;            copy stays on disk; Astro still moves to the new folder.
;   /ELEVATED (the copy started with admin rights by "migrate") closes the old
;            Astro and removes the old copy, its keys and its shortcuts.
; Exit codes: 0 done; 3 Astro is not installed; 5 the old Astro did not close;
; 6 files could not be written; 7 the package is not newer than the installed
; Astro (no downgrade); 8 the update lock stayed busy.
; Log: %TEMP%\astro-update.log.

Unicode true

; ${GetSize}, ${GetParameters}, ${GetOptions}
!include "FileFunc.nsh"
; ${VersionCompare}
!include "WordFunc.nsh"
!include "LogicLib.nsh"

!ifndef SRCDIR
  !error "SRCDIR is required: /DSRCDIR=<path to patched Chrome-bin>"
!endif
!ifndef OUTFILE
  !error "OUTFILE is required: /DOUTFILE=<path to Astro-Setup.exe>"
!endif
!ifndef HELPER
  !error "HELPER is required: /DHELPER=<path to astro-update-helper.ps1>"
!endif
!ifndef RESTART
  !error "RESTART is required: /DRESTART=<path to astro-restart.exe>"
!endif
!ifndef VERSION
  !define VERSION "0.0.0"
!endif

!define APPNAME       "Astro"
!define PUBLISHER     "publik"
!define UNINST_KEY    "Software\Microsoft\Windows\CurrentVersion\Uninstall\Astro"
!define APP_REG_KEY   "Software\Astro"
!define RUN_KEY       "Software\Microsoft\Windows\CurrentVersion\Run"
!define RUN_VALUE     "Astro Update"
!define ROOT          "$LOCALAPPDATA\Astro"
!define RESTART_EXE   "$LOCALAPPDATA\Astro\Updater\astro-restart-${VERSION}.exe"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Astro\Application"
RequestExecutionLevel user
!ifdef UPDATER
  SilentInstall silent
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

Var LogFile
Var ResultFile
Var Target
Var Installed
Var OldDir
Var Mode

; ---------------- shared pieces ----------------

Function Log
  ; $0 = the line.
  ${If} $LogFile != ""
    FileOpen $8 "$LogFile" a
    FileSeek $8 0 END
    FileWrite $8 "$0$\r$\n"
    FileClose $8
  ${EndIf}
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

; The one copy of the tree in this file, written to $Target.
Function ExtractTree
  SetOutPath "$Target"
  SetOverwrite on
  ClearErrors
  File /r "${SRCDIR}\*"
  ${If} ${Errors}
    StrCpy $0 6
    Call Fail
  ${EndIf}
FunctionEnd

; Version keys and the Apps & Features entry of this user.
Function WriteUserKeys
  WriteRegStr   HKCU "${APP_REG_KEY}" "InstallDir" "${ROOT}\Application"
  WriteRegStr   HKCU "${APP_REG_KEY}" "Version" "${VERSION}"
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayName"     "${APPNAME}"
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKCU "${UNINST_KEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayIcon"     "${ROOT}\Application\chrome.exe,0"
  WriteRegStr   HKCU "${UNINST_KEY}" "InstallLocation" "${ROOT}"
  WriteRegStr   HKCU "${UNINST_KEY}" "UninstallString"      '"${ROOT}\Uninstall.exe"'
  WriteRegStr   HKCU "${UNINST_KEY}" "QuietUninstallString" '"${ROOT}\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "${ROOT}\Application" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
FunctionEnd

; Shortcuts of this user; the restart helper outside Application (so it can
; rename that folder) and its logon entry; the uninstaller.
Function WriteUserFiles
  SetShellVarContext current
  CreateDirectory "$SMPROGRAMS\Astro"
  CreateShortcut  "$SMPROGRAMS\Astro\Astro.lnk" "${ROOT}\Application\chrome.exe" "" "${ROOT}\Application\chrome.exe" 0
  CreateShortcut  "$DESKTOP\Astro.lnk"          "${ROOT}\Application\chrome.exe" "" "${ROOT}\Application\chrome.exe" 0
  CreateDirectory "${ROOT}\Updater"
  SetOverwrite try
  File "/oname=${RESTART_EXE}" "${RESTART}"
  SetOverwrite on
  WriteRegStr HKCU "${RUN_KEY}" "${RUN_VALUE}" '"${RESTART_EXE}" --apply-if-staged'
  WriteUninstaller "${ROOT}\Uninstall.exe"
FunctionEnd

; Closes Astro running from $0 (helper script, see astro-update-helper.ps1).
; $1 = extra arguments. Leaves the exit code in $1 and the output in $2.
Function CloseAstroIn
  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\astro-update-helper.ps1" -Action close -InstallDir "$0" $1'
  Pop $1
  Pop $2
FunctionEnd

!ifdef UPDATER
; ======================= the update package (see the header) =======================

Function .onInit
  SetShellVarContext current
  SetRegView 64
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/RESULT=" $ResultFile
  ClearErrors
  ${GetOptions} $R0 "/ELEVATED" $R1
  ${IfNot} ${Errors}
    StrCpy $Mode "elevated"
    StrCpy $LogFile "$ResultFile.log"
    Return
  ${EndIf}
  StrCpy $ResultFile ""
  StrCpy $LogFile "$TEMP\astro-update.log"
  Delete "$LogFile"
  ReadRegStr $Installed HKCU "${APP_REG_KEY}" "Version"
  ${If} $Installed != ""
  ${AndIf} ${FileExists} "${ROOT}\Application\chrome.exe"
    StrCpy $Mode "stage"
    Return
  ${EndIf}
  ReadRegStr $OldDir HKLM "${APP_REG_KEY}" "InstallDir"
  ReadRegStr $Installed HKLM "${APP_REG_KEY}" "Version"
  ${If} $OldDir != ""
  ${AndIf} ${FileExists} "$OldDir\chrome.exe"
    StrCpy $Mode "migrate"
    Return
  ${EndIf}
  StrCpy $0 "Astro is not installed"
  Call Log
  SetErrorLevel 3
  Quit
FunctionEnd

; No downgrade: the package must be newer than the installed Astro.
Function RefuseOlder
  ${VersionCompare} "${VERSION}" "$Installed" $0
  ${If} $0 != 1
    StrCpy $0 "refused: ${VERSION} is not newer than the installed '$Installed'"
    Call Log
    StrCpy $0 7
    Call Fail
  ${EndIf}
FunctionEnd

Function Stage
  Call RefuseOlder
  StrCpy $0 "stage ${VERSION} next to the running $Installed"
  Call Log
  ; The restart helper switches folders under the same lock.
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\AstroUpdateSwap") p .R9'
  System::Call 'kernel32::WaitForSingleObject(p R9, i 600000) i .R8'
  ${If} $R8 != 0
  ${AndIf} $R8 != 128
    StrCpy $0 "the update lock stayed busy ($R8)"
    Call Log
    StrCpy $0 8
    Call Fail
  ${EndIf}
  StrCpy $1 ""
  ClearErrors
  FileOpen $2 "${ROOT}\Application.next\astro-staged.txt" r
  ${IfNot} ${Errors}
    FileRead $2 $1
    FileClose $2
  ${EndIf}
  ${If} $1 == "${VERSION}"
    StrCpy $0 "${VERSION} is already staged"
    Call Log
  ${Else}
    RMDir /r "${ROOT}\Application.next.tmp"
    StrCpy $Target "${ROOT}\Application.next.tmp"
    Call ExtractTree
    ; The marker comes last: the helper treats Application.next as complete only with it.
    FileOpen $1 "${ROOT}\Application.next.tmp\astro-staged.txt" w
    FileWrite $1 "${VERSION}"
    FileClose $1
    RMDir /r "${ROOT}\Application.next"
    ClearErrors
    Rename "${ROOT}\Application.next.tmp" "${ROOT}\Application.next"
    ${If} ${Errors}
      StrCpy $0 6
      Call Fail
    ${EndIf}
    StrCpy $0 "staged ${VERSION} in ${ROOT}\Application.next"
    Call Log
  ${EndIf}
  System::Call 'kernel32::ReleaseMutex(p R9)'
  System::Call 'kernel32::CloseHandle(p R9)'
  ; WinSparkle's scheduled check skips this version from now on, so a person
  ; who answers "Later" does not download it again every hour. (chrome.dll
  ; sets WinSparkle's registry path; a manual check still offers it.)
  WriteRegStr HKCU "Software\BrowserOS\WinSparkle" "SkipThisVersion" "10001.${VERSION}"
  CreateDirectory "${ROOT}\Updater"
  SetOverwrite try
  File "/oname=${RESTART_EXE}" "${RESTART}"
  SetOverwrite on
  WriteRegStr HKCU "${RUN_KEY}" "${RUN_VALUE}" '"${RESTART_EXE}" --apply-if-staged'
  Exec '"${RESTART_EXE}" --staged'
  StrCpy $0 "restart helper started"
  Call Log
  SetErrorLevel 0
FunctionEnd

Function Migrate
  Call RefuseOlder
  StrCpy $0 "migrate: $OldDir (all users, $Installed) -> ${ROOT}\Application (this user, ${VERSION})"
  Call Log
  ; 1. This user's copy. No admin rights; nothing runs from that folder yet.
  RMDir /r "${ROOT}\Application.next"
  RMDir /r "${ROOT}\Application.next.tmp"
  RMDir /r "${ROOT}\Application"
  StrCpy $Target "${ROOT}\Application"
  Call ExtractTree
  Call WriteUserKeys
  Call WriteUserFiles
  StrCpy $0 "installed for this user"
  Call Log

  ; 2. The old copy for all users: removing it needs admin rights (one UAC question).
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

  ; 3. If the old Astro still runs (admin rights refused), close it: its
  ;    processes belong to this user, so no admin rights are needed.
  StrCpy $0 "$OldDir"
  StrCpy $1 "-SkipWriteCheck"
  Call CloseAstroIn
  StrCpy $0 "close the old Astro: exit $1: $2"
  Call Log

  ; 4. Astro from its new folder.
  Exec '"${ROOT}\Application\chrome.exe"'
  StrCpy $0 "started ${ROOT}\Application\chrome.exe"
  Call Log
  SetErrorLevel 0
FunctionEnd

Function RemoveOldElevated
  SetShellVarContext all
  ReadRegStr $OldDir HKLM "${APP_REG_KEY}" "InstallDir"
  ${If} $OldDir == ""
  ${OrIfNot} ${FileExists} "$OldDir\chrome.exe"
    StrCpy $0 "no copy for all users"
    Call Log
    StrCpy $0 "ok"
    Call WriteResult
    Return
  ${EndIf}
  StrCpy $0 "remove the copy for all users in $OldDir"
  Call Log
  StrCpy $0 "$OldDir"
  StrCpy $1 ""
  Call CloseAstroIn
  StrCpy $0 "close: exit $1: $2"
  Call Log
  ${If} $1 != 0
    StrCpy $0 5
    Call Fail
  ${EndIf}
  Delete "$SMPROGRAMS\Astro\Astro.lnk"
  RMDir  "$SMPROGRAMS\Astro"
  Delete "$DESKTOP\Astro.lnk"
  RMDir /r "$OldDir"
  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "${APP_REG_KEY}"
  StrCpy $0 "ok"
  Call Log
  Call WriteResult
FunctionEnd

Section "Update" SecUpdate
  SectionIn RO
  SetRegView 64
  InitPluginsDir
  File "/oname=$PLUGINSDIR\astro-update-helper.ps1" "${HELPER}"
  ${If} $Mode == "elevated"
    Call RemoveOldElevated
  ${ElseIf} $Mode == "stage"
    Call Stage
  ${Else}
    Call Migrate
  ${EndIf}
SectionEnd

!else
; ======================= the installer =======================

Page instfiles

Function .onInit
  SetShellVarContext current
  SetRegView 64
  StrCpy $LogFile ""
FunctionEnd

Section "Astro" SecMain
  SectionIn RO
  SetShellVarContext current
  SetRegView 64
  InitPluginsDir
  File "/oname=$PLUGINSDIR\astro-update-helper.ps1" "${HELPER}"
  ${If} ${FileExists} "${ROOT}\Application\chrome.exe"
    DetailPrint "Closing Astro"
    StrCpy $0 "${ROOT}\Application"
    StrCpy $1 ""
    Call CloseAstroIn
  ${EndIf}
  ; A staged update belongs to the copy this install replaces, and so does
  ; the version the update package told WinSparkle to skip.
  RMDir /r "${ROOT}\Application.next"
  RMDir /r "${ROOT}\Application.next.tmp"
  DeleteRegValue HKCU "Software\BrowserOS\WinSparkle" "SkipThisVersion"
  RMDir /r "${ROOT}\Application"
  StrCpy $Target "${ROOT}\Application"
  Call ExtractTree
  Call WriteUserKeys
  Call WriteUserFiles

  ; Astro 0.2.9 and older installed for all users in Program Files. Offer to
  ; remove that copy (asks for admin rights); never in a silent install.
  ReadRegStr $OldDir HKLM "${APP_REG_KEY}" "InstallDir"
  ${If} $OldDir != ""
  ${AndIf} ${FileExists} "$OldDir\Uninstall.exe"
  ${AndIfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "An older Astro is installed for all users in $OldDir.$\r$\nAstro now installs for your account only. Remove the older copy?$\r$\n(Windows asks for admin rights.)" IDNO +2
    ExecShellWait "runas" "$OldDir\Uninstall.exe" "/S"
  ${EndIf}
SectionEnd

!endif

; ======================= the uninstaller =======================

UninstPage uninstConfirm
UninstPage instfiles

Function un.onInit
  SetShellVarContext current
  SetRegView 64
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 64
  InitPluginsDir
  File "/oname=$PLUGINSDIR\astro-update-helper.ps1" "${HELPER}"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\astro-update-helper.ps1" -Action close -InstallDir "${ROOT}\Application"'
  Pop $0
  nsExec::ExecToLog 'taskkill.exe /F /IM astro-restart-*'
  Pop $0
  Delete "$SMPROGRAMS\Astro\Astro.lnk"
  RMDir  "$SMPROGRAMS\Astro"
  Delete "$DESKTOP\Astro.lnk"
  DeleteRegValue HKCU "${RUN_KEY}" "${RUN_VALUE}"
  RMDir /r "${ROOT}\Application"
  RMDir /r "${ROOT}\Application.next"
  RMDir /r "${ROOT}\Application.next.tmp"
  FindFirst $0 $1 "${ROOT}\Application.old-*"
  ${DoWhile} $1 != ""
    RMDir /r "${ROOT}\$1"
    FindNext $0 $1
  ${Loop}
  FindClose $0
  RMDir /r "${ROOT}\Updater"
  Delete "${ROOT}\Uninstall.exe"
  RMDir "${ROOT}"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "${APP_REG_KEY}"
SectionEnd
