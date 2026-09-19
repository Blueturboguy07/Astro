//go:build windows

package cmd

import (
	"errors"
	"os"
	"os/exec"
	"strconv"
	"syscall"

	"golang.org/x/sys/windows"
)

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
			return errDogfoodLockHeld
		}
		return err
	}
	return nil
}

func unlockFile(f *os.File) error {
	ov := new(windows.Overlapped)
	return windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, ov)
}

// killPID has no real "signal" concept on Windows; taskkill /T tears down
// the target and anything it spawned, the nearest equivalent to a POSIX
// SIGTERM/SIGKILL of a process (group) the dogfood daemon owns.
func killPID(pid int, _ syscall.Signal) error {
	if err := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(pid)).Run(); err != nil {
		if _, err2 := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid)); err2 != nil {
			return syscall.ESRCH // already gone
		}
		return err
	}
	return nil
}
