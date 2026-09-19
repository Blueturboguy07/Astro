//go:build !windows

package proc

import (
	"errors"
	"os"
	"syscall"
)

// newProcessGroupSysProcAttr starts a managed child as the leader of its own
// new process group, so the whole group (it plus anything it spawns) can
// later be signaled together via a negative pid, without also reaching the
// shell/session that launched browseros-dev.
func newProcessGroupSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true}
}

func killGroup(pgid int, sig syscall.Signal) error {
	return syscall.Kill(-pgid, sig)
}

func killOne(pid int, sig syscall.Signal) error {
	return syscall.Kill(pid, sig)
}

func groupAlive(pgid int) bool {
	err := syscall.Kill(-pgid, 0)
	return err == nil || err == syscall.EPERM
}

func pidAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || err == syscall.EPERM
}

func currentProcessGroupID() (int, error) {
	return syscall.Getpgid(0)
}

func lockFileExclusiveNonBlocking(f *os.File) error {
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return errWatchRunLocked
		}
		return err
	}
	return nil
}

func unlockFile(f *os.File) error {
	return syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
}
