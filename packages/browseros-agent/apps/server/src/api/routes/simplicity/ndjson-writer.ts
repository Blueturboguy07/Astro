/**
 * One JSON line per event on a streamed response, safe when the client is
 * gone. `writer.write()` and `writer.close()` return promises; after Stop or
 * a reload the reader side is cancelled and they reject. The old try/catch
 * caught only synchronous throws, so each rejection was unhandled and the
 * server exited with code 1 (Astro 0.2.4 QA, F-060).
 */
export function ndjsonWriter(writable: WritableStream<Uint8Array>) {
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let open = true;
  writer.closed.catch(() => {
    open = false;
  });

  return {
    get open() {
      return open;
    },
    write(payload: unknown) {
      if (!open) return;
      let line: Uint8Array;
      try {
        line = encoder.encode(`${JSON.stringify(payload)}\n`);
      } catch {
        return;
      }
      try {
        writer.write(line).catch(() => {
          open = false;
        });
      } catch {
        open = false;
      }
    },
    close() {
      if (!open) return;
      open = false;
      try {
        writer.close().catch(() => {});
      } catch {}
    },
  };
}
