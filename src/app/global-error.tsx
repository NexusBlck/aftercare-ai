"use client";

/** Last-resort error page (replaces the root layout). Shows no error details. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <main style={{ maxWidth: 420, textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p style={{ color: "#555" }}>AFTERCARE AI hit an unexpected error. Please try again in a moment.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 16, padding: "10px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
