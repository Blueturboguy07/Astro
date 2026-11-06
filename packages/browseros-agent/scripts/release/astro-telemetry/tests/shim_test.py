"""End-to-end check of the launcher on macOS and Linux, with a fake server. Standard library only.

    python3 shim_test.py <path to the built astro-telemetry-shim>

It checks that the launcher: becomes the real server (same process ID, same arguments), sends
app_opened and active_session with the fields of telemetry v1 and no others, sends the publik key
of the "publik API" connection and never a different key, sends nothing after an opt-out, that
the sidecar ends when the server ends, and that a `--version` call goes to the real server with
no count and no wait.
"""
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mock_endpoint import MockEndpoint  # noqa: E402

SHIM = os.path.abspath(sys.argv[1])
MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Cargo.toml")
VERSION = re.search(r'^version = "([^"]+)"', open(MANIFEST).read(), re.M).group(1)
OS_NAME = "macos" if sys.platform == "darwin" else "linux"
PUBLIK_KEY = "pk_test_abcdefghijkl_0123456789abcdef0123456789abcdef"
OWN_KEY = "sk-own-provider-key-that-must-never-leave"
FAKE_VERSION = "0.0.127"
FAKE_SERVER = """#!/bin/sh
if [ "$1" = "--version" ]; then echo "FAKE_VERSION"; exit 0; fi
echo "$$" > "$FAKE_OUT/server.pid"
for arg in "$@"; do printf '%s\\n' "$arg"; done > "$FAKE_OUT/server.args"
exec sleep 120
""".replace("FAKE_VERSION", FAKE_VERSION)
failures = []


def check(ok, what):
    print(("PASS  " if ok else "FAIL  ") + what, flush=True)
    if not ok:
        failures.append(what)


def wait_for(condition, seconds):
    end = time.time() + seconds
    while time.time() < end:
        if condition():
            return True
        time.sleep(0.1)
    return condition()


def sidecars(server_pid):
    out = subprocess.run(["ps", "-A", "-o", "pid=,args="], capture_output=True, text=True).stdout
    return [int(line.split()[0]) for line in out.splitlines() if ("--publik-telemetry-sidecar %d" % server_pid) in line]


class Run:
    """One launch of the launcher in a fresh folder with a fresh home."""

    def __init__(self, env=None, config=None, real_server=True, args=("--config=/tmp/a b/config.json", "second"), stdout=subprocess.DEVNULL):
        self.work = tempfile.mkdtemp(prefix="astro-shim-test-")
        self.home = os.path.join(self.work, "home")
        self.bin = os.path.join(self.work, "bin")
        os.makedirs(self.home)
        os.makedirs(self.bin)
        shutil.copy(SHIM, os.path.join(self.bin, "browseros_server"))
        if real_server:
            real = os.path.join(self.bin, "browseros_server_real")
            with open(real, "w") as handle:
                handle.write(FAKE_SERVER)
            os.chmod(real, 0o755)
        if config is not None:
            folder = os.path.join(self.home, ".browseros", "simplicity")
            os.makedirs(folder)
            with open(os.path.join(folder, "config.json"), "w") as handle:
                json.dump(config, handle)
        self.endpoint = MockEndpoint().start()
        full_env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": self.home,
            "FAKE_OUT": self.work,
            "PUBLIK_TELEMETRY_URL": self.endpoint.url,
            "PUBLIK_TELEMETRY_DEBUG": "1",
        }
        full_env.update(env or {})
        self.args = list(args)
        self.process = subprocess.Popen([os.path.join(self.bin, "browseros_server")] + self.args, env=full_env, stdout=stdout, stderr=subprocess.PIPE)

    def read(self, name):
        path = os.path.join(self.work, name)
        return open(path).read() if os.path.exists(path) else None

    def publik_dir(self):
        if OS_NAME == "macos":
            return os.path.join(self.home, "Library", "Application Support", "publik")
        return os.path.join(self.home, ".config", "publik")

    def bodies(self):
        return [json.loads(request["body"]) for request in list(self.endpoint.requests)]

    def close(self):
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait()
        self.endpoint.stop()
        shutil.rmtree(self.work, ignore_errors=True)


# 1. A normal launch.
run = Run()
check(wait_for(lambda: run.read("server.pid"), 10), "the real server starts")
check((run.read("server.pid") or "").strip() == str(run.process.pid), "the server has the process ID that the caller started (exec)")
check(run.read("server.args") == "".join(arg + "\n" for arg in run.args), "the server gets the same arguments")
check(wait_for(lambda: len(run.endpoint.requests) >= 1, 10), "one request arrives")
request = run.endpoint.requests[0] if run.endpoint.requests else {"headers": {}, "body": "{}", "method": "", "path": ""}
body = json.loads(request["body"])
check(request["method"] == "POST" and request["path"] == "/api/v1/telemetry", "POST /api/v1/telemetry")
check(request["headers"].get("content-type") == "application/json", "Content-Type is application/json")
check("origin" not in request["headers"], "no Origin header")
check("authorization" not in request["headers"], "no Authorization header when the user is not connected")
check(set(body) == {"v", "app", "install_id", "event", "app_version", "os", "arch"}, "the body holds the 7 fields of telemetry v1 and no others: %s" % sorted(body))
check(body.get("v") == 1 and body.get("app") == "astro" and body.get("event") == "app_opened", "v=1, app=astro, event=app_opened")
check(body.get("app_version") == VERSION, "app_version is %s (Cargo.toml)" % VERSION)
check(body.get("os") == OS_NAME and body.get("arch") in ("arm64", "x64"), "os=%s, arch=%s" % (body.get("os"), body.get("arch")))
check(bool(re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", body.get("install_id", ""))), "install_id is a UUID v4")
saved = os.path.join(run.publik_dir(), "telemetry.json")
check(os.path.exists(saved) and json.load(open(saved)).get("install_id") == body.get("install_id"), "telemetry.json holds the same install_id")
server_pid = run.process.pid
check(len(sidecars(server_pid)) == 1, "one sidecar runs while the server runs")
time.sleep(1.5)
check(len(run.endpoint.requests) == 1, "no second request in the next seconds (app_opened goes out one time)")
os.kill(server_pid, signal.SIGKILL)  # the browser stops the server with SIGKILL
run.process.wait()
check(wait_for(lambda: not sidecars(server_pid), 10), "the sidecar ends in 10 seconds after the server ends")
run.close()

# 2. Connected to publik API: the publik key goes out, a different key never does. active_session follows.
config = {
    "version": 1,
    "modelProviders": [
        {"id": "1", "name": "OpenAI", "type": "openai", "config": {"apiKey": OWN_KEY, "baseURL": "https://api.openai.com/v1"}},
        {"id": "2", "name": "publik API", "type": "openai", "config": {"apiKey": PUBLIK_KEY, "baseURL": "https://publikhq.com/api/v1"}},
    ],
}
run = Run(env={"PUBLIK_TELEMETRY_INTERVAL_SECONDS": "1"}, config=config)
check(wait_for(lambda: len(run.endpoint.requests) >= 2, 10), "a second request arrives with a 1 second interval")
events = [body.get("event") for body in run.bodies()]
check(events[:2] == ["app_opened", "active_session"], "app_opened, then active_session: %s" % events[:3])
check(all(request["headers"].get("authorization") == "Bearer " + PUBLIK_KEY for request in list(run.endpoint.requests)), "Authorization holds the publik key of the publik API connection")
check(OWN_KEY not in json.dumps(run.endpoint.requests), "the key of the other provider is in no request")
run.close()

# 3. A config with no publik connection: no key goes out.
config = {
    "modelProviders": [
        {"id": "1", "name": "OpenAI", "type": "openai", "config": {"apiKey": OWN_KEY, "baseURL": "https://api.openai.com/v1"}},
        {"id": "2", "name": "Other", "type": "openai", "config": {"apiKey": "pk_live_not_a_publik_connection", "baseURL": "https://example.com/v1"}},
    ],
}
run = Run(config=config)
check(wait_for(lambda: len(run.endpoint.requests) >= 1, 10), "a request arrives with other providers only")
check(all("authorization" not in request["headers"] for request in list(run.endpoint.requests)), "no Authorization header without a publik API connection")
run.close()

# 4. Opt-out: the server starts, nothing is sent, no file is made.
run = Run(env={"DO_NOT_TRACK": "1"})
check(wait_for(lambda: run.read("server.pid"), 10), "with DO_NOT_TRACK=1 the real server starts")
time.sleep(3)
check(len(run.endpoint.requests) == 0, "with DO_NOT_TRACK=1 no request arrives")
check(not os.path.exists(run.publik_dir()), "with DO_NOT_TRACK=1 no publik folder is made")
run.close()

# 5. No real server: the launcher says so and returns 1 (the browser then starts it again).
run = Run(real_server=False)
check(wait_for(lambda: run.process.poll() is not None, 10) and run.process.returncode == 1, "without the real server the launcher returns 1")
check(b"astro-telemetry-shim/1: cannot start" in run.process.stderr.read(), "and it says why")
check(len(run.endpoint.requests) == 0, "and it sends nothing")
run.close()

# 6. `--version`: the browser asks the server for its version at each start, and it reads the output
#    until the last holder of the pipe closes it. The call must go to the real server as it is.
started = time.time()
run = Run(args=("--version",), stdout=subprocess.PIPE)
try:
    out, err = run.process.communicate(timeout=10)  # ends when the pipes close, not only when the process ends
except subprocess.TimeoutExpired:
    run.process.kill()
    out, err = run.process.communicate()
elapsed = time.time() - started
check(run.process.returncode == 0 and out == (FAKE_VERSION + "\n").encode(), "--version: the output and the exit code of the real server pass through: %r" % out)
check(err == b"", "--version: nothing more is written to the output that the browser reads: %r" % err)
check(elapsed < 2, "--version: the call ends at once (%.1f s): no sidecar holds the output open" % elapsed)
check(run.read("server.pid") is None, "--version: the server does not start")
time.sleep(2)
check(len(run.endpoint.requests) == 0, "--version: no count is sent (it is not a start of the app)")
check(not os.path.exists(run.publik_dir()), "--version: no publik folder is made")
run.close()

print("RESULT: " + ("PASS" if not failures else "FAIL (%d)" % len(failures)), flush=True)
sys.exit(1 if failures else 0)
