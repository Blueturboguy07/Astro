"""A local stand-in for the publik telemetry endpoint. Standard library only. Tests use it.

    python3 mock_endpoint.py <port file> <log file>

It listens on 127.0.0.1 on a free port, writes the port number to <port file> and adds one JSON
line to <log file> for each request: method, path, headers (lower-case names) and body.
It answers 204 to each request.
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class MockEndpoint:
    def __init__(self, log_file=None):
        self.requests, self._lock, outer = [], threading.Lock(), self

        class Handler(BaseHTTPRequestHandler):
            def _handle(self):
                length = int(self.headers.get("Content-Length") or 0)
                record = {
                    "method": self.command,
                    "path": self.path,
                    "headers": {name.lower(): value for name, value in self.headers.items()},
                    "body": self.rfile.read(length).decode("utf-8", "replace") if length else "",
                }
                with outer._lock:
                    outer.requests.append(record)
                    if log_file:
                        with open(log_file, "a", encoding="utf-8") as log:
                            log.write(json.dumps(record) + "\n")
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()

            do_POST = do_GET = do_PUT = do_OPTIONS = _handle

            def log_message(self, *args):
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._server.daemon_threads = True
        self.port = self._server.server_address[1]
        self.url = "http://127.0.0.1:%d/api/v1/telemetry" % self.port

    def start(self):
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return self

    def stop(self):
        self._server.shutdown()
        self._server.server_close()


if __name__ == "__main__":
    port_file, log_file = sys.argv[1], sys.argv[2]
    open(log_file, "a").close()
    endpoint = MockEndpoint(log_file).start()
    with open(port_file, "w") as handle:
        handle.write(str(endpoint.port))
    threading.Event().wait()
