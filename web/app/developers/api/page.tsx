import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = pageMetadata({
  title: "API reference",
  description:
    "EveryVisitor public REST API: read sites, scans and accessibility issues, and start scans, with an Agency Pro API key.",
  path: "/developers/api",
});

// Re-read the OpenAPI document every 5 minutes so the docs follow the API (P6-06).
export const revalidate = 300;

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || API_URL;

interface Param {
  name: string;
  in: "path" | "query";
  required?: boolean;
  description?: string;
  schema?: { type?: string; enum?: string[]; default?: unknown; minimum?: number; maximum?: number };
}
interface Operation {
  operationId: string;
  summary: string;
  description?: string;
  tags?: string[];
  security?: { apiKey: string[] }[];
  parameters?: Param[];
  requestBody?: { content: Record<string, { example?: unknown }> };
  responses: Record<string, { description: string; content?: Record<string, { example?: unknown }> }>;
}
interface OpenApiDoc {
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, Operation>>;
}

async function loadDoc(): Promise<OpenApiDoc | null> {
  try {
    const res = await fetch(`${API_URL}/v1/openapi.json`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as OpenApiDoc;
  } catch {
    return null;
  }
}

const METHOD_STYLE: Record<string, string> = {
  get: "bg-ok-soft text-ok",
  post: "bg-primary-soft text-ptext",
};

function curl(method: string, url: string, body?: unknown): string {
  const lines = [`curl${method === "get" ? "" : ` -X ${method.toUpperCase()}`} "${url}"`, `  -H "Authorization: Bearer $EVERYVISITOR_API_KEY"`];
  if (body !== undefined) {
    lines.push(`  -H "Content-Type: application/json"`, `  -d '${JSON.stringify(body)}'`);
  }
  return lines.join(" \\\n");
}

function Code({ children, label }: { children: string; label: string }) {
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className="m-0 max-h-96 overflow-auto rounded-xl border border-line bg-sunk p-4 font-mono text-xs leading-5 text-ink"
    >
      <code>{children}</code>
    </pre>
  );
}

/** Public API reference, rendered from /v1/openapi.json and served at docs.<domain> (P6-06). */
export default async function ApiReferencePage() {
  const doc = await loadDoc();
  const base = `${PUBLIC_API_URL.replace(/\/$/, "")}/v1`;
  const operations = doc
    ? Object.entries(doc.paths).flatMap(([path, methods]) =>
        Object.entries(methods).map(([method, op]) => ({ path, method, op })),
      )
    : [];
  const tags = [...new Set(operations.map((o) => o.op.tags?.[0] ?? "Other"))];

  return (
    <div className="flex min-h-screen flex-col bg-page text-ink">
      <MarketingHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-14 sm:px-8 lg:grid-cols-[14rem_1fr]">
          <nav aria-label="API reference" className="lg:sticky lg:top-24 lg:self-start">
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-muted">On this page</p>
            <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-sm">
              {["Authentication", "Rate limits", "Errors"].map((t) => (
                <li key={t}>
                  <a href={`#${t.toLowerCase().replace(/\s/g, "-")}`} className="no-underline">
                    {t}
                  </a>
                </li>
              ))}
              {operations.map(({ op }) => (
                <li key={op.operationId}>
                  <a href={`#${op.operationId}`} className="no-underline">
                    {op.summary}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-primary">Developers</p>
            <h1 className="m-0 mt-2 font-serif text-4xl font-normal sm:text-5xl">API reference</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
              Read sites, scans and accessibility issues, and start scans, from your own tools. The API is part of the
              Agency Pro plan. Base URL: <code className="font-mono text-ink">{base}</code>.{" "}
              <a href={`${base}/openapi.json`}>Download the OpenAPI 3.1 document</a>.
            </p>

            <section aria-labelledby="authentication" className="mt-10">
              <h2 id="authentication" className="m-0 text-2xl font-semibold">
                Authentication
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6">
                Create a key in <Link href="/settings/api-keys">Settings → API keys</Link> (organisation owners only) and send
                it in the <code className="font-mono">Authorization</code> header. Keys start with{" "}
                <code className="font-mono">psk_</code> and are shown once. A key has the <code className="font-mono">read</code>{" "}
                scope, and optionally <code className="font-mono">scan:write</code> to start scans. Keep keys on your server,
                never in browser code.
              </p>
              <Code label="Example: authenticated request">{curl("get", `${base}/sites`)}</Code>
            </section>

            <section aria-labelledby="rate-limits" className="mt-10">
              <h2 id="rate-limits" className="m-0 text-2xl font-semibold">
                Rate limits
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6">
                Each key can make 60 requests a minute. Every response carries{" "}
                <code className="font-mono">X-RateLimit-Limit</code> and <code className="font-mono">X-RateLimit-Remaining</code>.
                Over the limit you get <code className="font-mono">429</code> with a <code className="font-mono">Retry-After</code>{" "}
                header in seconds. API scans share the plan’s daily manual-scan allowance per site.
              </p>
            </section>

            <section aria-labelledby="errors" className="mt-10">
              <h2 id="errors" className="m-0 text-2xl font-semibold">
                Errors
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6">
                Errors use one shape with a stable <code className="font-mono">code</code>. A site, scan or issue in
                another organisation always returns <code className="font-mono">404</code>, never 403.
              </p>
              <Code label="Example error response">
                {JSON.stringify({ error: { code: "NOT_FOUND", message: "Site not found.", details: {} } }, null, 2)}
              </Code>
              <div className="mt-4 overflow-x-auto rounded-xl border border-line">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">HTTP status codes</caption>
                  <thead className="bg-subtle">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-semibold">Status</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Meaning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[
                      ["400", "The request is invalid (VALIDATION_ERROR)."],
                      ["401", "Missing, invalid or revoked key (API_KEY_INVALID)."],
                      ["402", "The organisation is read-only; reads still work (BILLING_REQUIRED)."],
                      ["403", "The key lacks a scope (API_KEY_SCOPE), or the plan has no API access (PLAN_LIMIT)."],
                      ["404", "Not found, or in another organisation."],
                      ["409", "A scan is already running for that site (SCAN_IN_PROGRESS)."],
                      ["422", "A business rule stopped it, such as an unverified site or a used-up allowance."],
                      ["429", "Rate limit reached (RATE_LIMITED)."],
                    ].map(([code, meaning]) => (
                      <tr key={code}>
                        <td className="px-4 py-2 font-mono">{code}</td>
                        <td className="px-4 py-2">{meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {!doc && (
              <p role="alert" className="mt-10 rounded-xl border border-line bg-subtle p-4 text-sm">
                The endpoint reference could not load right now. The{" "}
                <a href={`${base}/openapi.json`}>OpenAPI document</a> has every endpoint.
              </p>
            )}

            {tags.map((tag) => (
              <section key={tag} aria-labelledby={`tag-${tag}`} className="mt-14">
                <h2 id={`tag-${tag}`} className="m-0 border-b border-line pb-2 text-2xl font-semibold">
                  {tag}
                </h2>
                {operations
                  .filter((o) => (o.op.tags?.[0] ?? "Other") === tag)
                  .map(({ path, method, op }) => {
                    const success = op.responses[method === "post" ? "201" : "200"];
                    const example = success?.content?.["application/json"]?.example;
                    const body = op.requestBody?.content["application/json"]?.example;
                    const url = `${base}${path.replace(/\{(\w+)\}/g, (_, n: string) => `<${n}>`)}`;
                    const scope = op.security?.[0]?.apiKey?.[0];
                    return (
                      <article key={op.operationId} id={op.operationId} aria-labelledby={`${op.operationId}-h`} className="mt-8 scroll-mt-24">
                        <h3 id={`${op.operationId}-h`} className="m-0 text-lg font-semibold">
                          {op.summary}
                        </h3>
                        <p className="m-0 mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold uppercase ${METHOD_STYLE[method] ?? "bg-subtle"}`}>
                            {method}
                          </span>
                          <code className="font-mono">{path}</code>
                          {scope && <span className="text-xs text-muted">Scope: {scope}</span>}
                        </p>
                        {op.description && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{op.description}</p>}
                        {op.parameters && op.parameters.length > 0 && (
                          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                            <table className="w-full border-collapse text-left text-sm">
                              <caption className="sr-only">Parameters for {op.summary}</caption>
                              <thead className="bg-subtle">
                                <tr>
                                  <th scope="col" className="px-4 py-2 font-semibold">Parameter</th>
                                  <th scope="col" className="px-4 py-2 font-semibold">In</th>
                                  <th scope="col" className="px-4 py-2 font-semibold">Description</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {op.parameters.map((p) => (
                                  <tr key={`${p.in}-${p.name}`}>
                                    <td className="px-4 py-2 font-mono">
                                      {p.name}
                                      {p.required && <span className="ml-1 text-xs text-crit">required</span>}
                                    </td>
                                    <td className="px-4 py-2">{p.in}</td>
                                    <td className="px-4 py-2 text-muted">
                                      {p.description ?? ""}
                                      {p.schema?.enum && ` One of: ${p.schema.enum.join(", ")}.`}
                                      {p.schema?.default !== undefined && ` Default ${String(p.schema.default)}.`}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="mt-3 grid gap-3 xl:grid-cols-2">
                          <div>
                            <p className="m-0 mb-1 text-xs font-semibold text-muted">Request</p>
                            <Code label={`Example request: ${op.summary}`}>{curl(method, url, body)}</Code>
                          </div>
                          {example !== undefined && (
                            <div>
                              <p className="m-0 mb-1 text-xs font-semibold text-muted">Response {method === "post" ? "201" : "200"}</p>
                              <Code label={`Example response: ${op.summary}`}>{JSON.stringify(example, null, 2)}</Code>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
              </section>
            ))}
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
