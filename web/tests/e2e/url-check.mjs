// Every URL that worked before the CMS migration must still work afterwards (staff spec P8-06).
// Reads the old URL list from the content shipped with the site (blog posts and fix guides),
// then requests each one from a running site and fails on anything but a 200, or a redirect
// that ends on a 200. Run after `npm run content:import` in the backend.
//   WEB_URL=http://localhost:3000 node tests/e2e/url-check.mjs
import { readFileSync } from "node:fs";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";

function slugsFrom(file, pattern) {
  const text = readFileSync(new URL(file, import.meta.url), "utf8");
  return [...text.matchAll(pattern)].map((m) => m.slice(1));
}

const blog = slugsFrom("../../lib/blog-data.ts", /^\s{4}slug:\s*"([^"]+)"/gm).map(([slug]) => `/blog/${slug}`);
const guides = slugsFrom("../../lib/fix-guides-data.ts", /"platform":\s*"([^"]+)",\s*\n\s*"slug":\s*"([^"]+)"/g).map(
  ([platform, slug]) => `/fix/${platform}/${slug}`,
);
const paths = ["/blog", "/fix", "/changelog", "/legal/terms", "/legal/privacy", "/legal/refunds", ...blog, ...guides];

if (paths.length < 10) throw new Error("Could not read the old URL list; check the patterns in this script.");

let failures = 0;
for (const path of paths) {
  const res = await fetch(WEB + path, { redirect: "follow" });
  if (res.status !== 200) {
    failures++;
    console.log(`FAIL ${res.status} ${path}`);
  }
}
console.log(`${paths.length - failures}/${paths.length} URLs still work.`);
if (failures) process.exit(1);
