/**
 * Read an SSE body from fetch(POST). EventSource is GET-only.
 * Yields each `data:` payload (joined multi-line data fields).
 */
export async function* readSseStream(
  body: ReadableStream<Uint8Array> | null,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);

        if (line === "") {
          if (dataLines.length) {
            yield dataLines.join("\n");
            dataLines = [];
          }
          continue;
        }
        if (line.startsWith(":") /* comment */) continue;
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        // ignore event:/id:/retry: for stage text UI
      }
    }
    if (dataLines.length) yield dataLines.join("\n");
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}
