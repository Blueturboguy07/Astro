//go:build windows

package proc

import (
	"errors"
	"os"
	"os/exec"
	"strconv"
	"syscall"

	"golang.org/x/sys/windows"
)

// windowsStillActive is GetExitCodeProcess's sentinel for "not exited yet"
// (STILL_ACTIVE, also used as the STATUS_PENDING NTSTATUS low word).
const windowsStillActive = 259

// newProcessGroupSysProcAttr puts a managed child in its own console
// process group. Windows has no pgid; CREATE_NEW_PROCESS_GROUP is the
// nearest primitive and keeps the child from receiving a Ctrl+C meant for
// browseros-dev's own console.
func newProcessGroupSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{CreationFlags: windows.CREATE_NEW_PROCESS_GROUP}
}

// killGroup and killOne both resolve to killTree: Windows has no
// negative-pid "whole group" target, and PGID == PID in this build's
// bookkeeping (see currentProcessGroupID), so both already name the same
// process.
func killGroup(pgid int, _ syscall.Signal) error {
	return killTree(pgid)
}

func killOne(pid int, _ syscall.Signal) error {
	return killTree(pid)
}

// killTree uses taskkill's /T (tree) flag so a managed process's children
// (e.g. bun spawning node/vite) go down too -- the nearest equivalent to
// signaling a whole POSIX process group.
func killTree(pid int) error {
	if !pidAlive(pid) {
		return syscall.ESRCH
	}
	if err := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(pid)).Run(); err != nil {
		if !pidAlive(pid) {
			return nil // exited between our check and taskkill running
		}
		return err
	}
	return nil
}

func groupAlive(pgid int) bool {
	return pidAlive(pgid)
}

func pidAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)
	var exitCode uint32
	if err := windows.GetExitCodeProcess(h, &exitCode); err != nil {
		return false
	}
	return exitCode == windowsStillActive
}

// currentProcessGroupID has no real Windows analogue. Callers only feed the
// returned value back into killGroup/groupAlive above, both of which treat
// it as a plain pid on this platform, so returning the current pid keeps
// that round-trip self-consistent.
func currentProcessGroupID() (int, error) {
	return os.Getpid(), nil
}

// lockFileExclusiveNonBlocking takes an exclusive advisory lock via the
// Windows LockFileEx API (syscall.Flock does not exist on Windows).
func lockFileExclusiveNonBlocking(f *os.File) error {
	ov := new(windows.Overlapped)
	err := windows.LockFileEx(
		windows.Handle(f.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY,
		0, 1, 0,
		ov,
	)
	if err != nil {
		if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
			return errWatchRunLocked
		}
		return err
	}
	return nil
}

func unlockFile(f *os.File) error {
	ov := new(windows.Overlapped)
	return windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, ov)
}
