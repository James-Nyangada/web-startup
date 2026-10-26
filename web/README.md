# EveryVisitor web (working name)

Next.js 16 (App Router) + Tailwind CSS v4 + GSAP implementation of the Claude Design v3 handoff in `../project/`.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
```

## Routes

| Route | Design file | Screens |
| --- | --- | --- |
| `/` | Home and Free Check v3 | S-01 home, S-03 free check (input → progress → result) |
| `/sites/oakhaus` (`?tab=issues`) | Site Workspace v3 | S-24 overview, S-25 issues, S-26 drawer, flow F-04 |
| `/overview` | Agency Overview v3 | S-20, layouts 1a / 1b / 1c (switcher at top) |
| `/portal`, `/portal/oakhaus` | Client Portal v3 | S-60, S-61 (agency-branded, mobile-first) |
| `/foundations` | Foundations v3 | D1 tokens, type, components |
| `/accessibility-notes` | Accessibility Notes v3 | Handoff annotations |

## Structure

- `app/globals.css` — v3 design tokens as CSS variables (light + `[data-theme="dark"]`), exposed to Tailwind via `@theme inline` (`bg-surface`, `text-ink`, `text-crit`, `shadow-card`, …).
- `app/layout.tsx` — fonts (Instrument Serif, Manrope, JetBrains Mono via `next/font`) and a pre-paint script that applies the saved or OS theme.
- `lib/` — severity vocabulary, mock data, GSAP setup (`lib/gsap.ts` registers ScrollTrigger + `useGSAP`).
- `components/` — shared UI (app shell, badges, icons, theme toggles, `Collapse`, reveal hooks, focus trap) plus one folder per screen.

## Motion

GSAP drives the hero entrance, scroll reveals (`data-reveal`, `data-reveal="stagger"`), free-check step transitions, the chart line draw, score count-ups, accordions, and the drawer, dialog, toast and mobile nav. Durations follow spec 4.6: 150 ms for hover and focus, 200 ms for panels, ease-out. Every animation goes through `gsap.matchMedia`, so with `prefers-reduced-motion: reduce` slides become short fades and decorative motion is skipped.
