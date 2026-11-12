import "server-only";
import { AppError } from "./errors";
import type { ProcessEvent } from "./process-events";

/** Streams events as newline-delimited JSON so the client sees each stage as it actually happens. */
export function ndjsonStream(run: (emit: (event: ProcessEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ProcessEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await run(emit);
      } catch (err) {
        const e =
          err instanceof AppError
            ? err
            : new AppError("internal_error", "Something went wrong while processing. Please try again.", 500, true);
        if (!(err instanceof AppError)) console.error("[aftercare] processing error:", err instanceof Error ? err.message : "unknown");
        emit({ type: "error", error: { code: e.code, message: e.message, retryable: e.retryable } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
