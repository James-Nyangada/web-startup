# ADR 0001: Custom code platform, tech stack and fix guides

- **Status:** Accepted
- **Date:** 16 November 2026
- **Context:** "EveryVisitor works on any website" update (16 Nov 2026), sections 3.7 and 4.1

## Context

The update asks for three things that touch stored data:

1. Show `sites.platform = custom` in the interface as **Custom code**.
2. Store a custom-coded site's tech stack (React, Next.js, Vue, Laravel, …) in a new
   `sites.tech_stack` column.
3. Map Custom code sites to `generic` fix guides, **or** rename `generic` to `custom` in
   `fix_guides` and update the loader. Pick one and record it here.

What was already in place:

- `sites.framework text null` (migration `0021_site_framework`) already stores the detected tech
  stack, is filled in by detection (`scanner/platform/framework.ts`) on add-site and on first use,
  and is already passed to AI fix suggestions.
- `fix_guides.platform` has a check constraint limited to the `PLATFORMS` list. That list has
  `custom` but **not** `generic`, so no `generic` row could ever be stored there.
- `generic` was used only as a fallback string: in the AI suggestion route, the staff guide
  editor's platform list and the fix-guide coverage table. Guides saved from the staff editor with
  `generic` reached `content_posts` (no constraint) but could not sync into `fix_guides`.

## Decision

1. **Use `custom` as the guide platform.** Custom code guides are stored with
   `platform = custom`, the same value as `sites.platform`, so a site's guides are found by its
   own platform with no mapping. `generic` is retired:
   - Migration `0028_custom_code_guides` renames `content_posts.platform = 'generic'` guides to
     `custom`.
   - The staff API turns an incoming `generic` into `custom`; the AI route accepts `generic` and
     the label "Custom code" and treats both as `custom`.
2. **Reuse `sites.framework` as the tech stack** instead of adding `sites.tech_stack`. A second
   column would hold the same value. `FRAMEWORKS` gains `other` for users whose stack isn't
   listed. The add-site, onboarding and site settings forms now let the user set it, and the
   sites API accepts `framework` on create and update. Switching a site to a website builder
   clears it.
3. **Public URLs use `custom-code`:** guides are served at `/fix/custom-code/<rule>` (for example
   `/fix/custom-code/image-alt`). The guide files are named `custom-code-<rule>.md` and set
   `slug: <rule>` in front matter; the loaders now honour an optional `slug` field. Shopify and
   WordPress URLs are unchanged.
4. **Platform mapping for guides:** Shopify → Shopify guides; WordPress and WooCommerce →
   WordPress guides; every other platform (Wix, Webflow, Squarespace, custom, not sure) → Custom
   code guides, until platform-specific guides exist.
5. **Framework examples** are extra `### <label>` code blocks after `### Incorrect` / `### Correct`
   in the guide's Code example section (`CSS`, `React / Next.js (JSX)`, `Vue`). They are parsed
   into `sections.extraExamples` so they survive the CMS import and the section editor round trip.

## Consequences

- No new column and no backfill. Existing `framework` values become the tech stack shown in the
  app ("Custom code (Next.js)").
- Code that reads the spec's `tech_stack` should read `sites.framework`.
- AI suggestions cached under the `generic` scope will miss the cache once and be regenerated
  under `custom`.
- Adding Wix, Webflow or Squarespace guides later means adding a platform to the guide filter and
  to the mapping in `web/lib/platforms.ts` and `backend/src/shared/platforms.ts`.
