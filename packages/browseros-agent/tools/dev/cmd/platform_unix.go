//go:build !windows

package cmd

import (
	"errors"
	"os"
	"syscall"
)

func lockFileExclusiveNonBlocking(f *os.File) error {
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return errDogfoodLockHeld
		}
		return err
	}
	return nil
}

func unlockFile(f *os.File) error {
	return syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
}

func killPID(pid int, sig syscall.Signal) error {
	return syscall.Kill(pid, sig)
}
