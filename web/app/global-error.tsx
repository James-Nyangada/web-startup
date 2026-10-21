"use client";

import "./globals.css";

/**
 * S-80: last-resort 500 when the root layout itself fails. Renders its own document, so the
 * theme is applied here (it cannot read the app's theme toggle).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <title>Something went wrong · Plainsight</title>
        <main id="main" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1rem" }}>
          <div style={{ maxWidth: "32rem", textAlign: "center" }}>
            <p style={{ fontFamily: "monospace", color: "var(--muted)", margin: 0 }}>500</p>
            <h1 style={{ fontSize: "2.25rem", fontWeight: 400, margin: "0.5rem 0 1rem" }}>Something went wrong</h1>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Plainsight could not load. Try again in a moment.
              {error.digest ? ` Reference: ${error.digest}.` : ""}
            </p>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                marginTop: "1.5rem",
                height: "2.75rem",
                padding: "0 1.25rem",
                borderRadius: "999px",
                border: 0,
                background: "var(--primary)",
                color: "var(--onp)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
