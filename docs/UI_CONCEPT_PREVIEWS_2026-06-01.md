# UI concept previews — 4 versions for comparison (2026-06-01)

> **⚠️ DESIGN EXPLORATION ONLY. Do NOT merge any concept branch to production.**
> The three concepts are open as **draft PRs** for review. Pick one (or mix
> ideas) and I'll build a production-quality version of the winner later.

**Baseline main:** `d5e75d6` · concepts branch from this commit.

## How each concept is built (important context)
The site is **fully token-driven** (369 CSS variables). Each concept is a
**single branch-isolated CSS override** (`app/src/app/concept-{a,b,c}.css`,
imported after `globals.css`) that remaps **design tokens + chrome only** —
**no markup, data, settlement, optimizer, filter, or business-logic changes.**
So every concept keeps identical structure, navigation, filters, Build My Card,
Bank Builder paper-only behaviour, schedule-only Events, and Results honesty —
**what changes is the visual language** (palette, typography feel, geometry,
density, energy). That makes them safe, fast, and directly comparable, and it's
the right scope for choosing a *direction* before investing in per-component
layout work.

## The 4 versions

| # | Version | PR | Preview URL |
|---|---------|----|-----|
| **V0** | **Current (production)** | — (main `d5e75d6`) | **https://gametimepicks.yashwantbalaji.com** |
| **A** | **Concept A — Terminal premium dashboard** | [#209](https://github.com/yashwantbalaji3/gametimepicks/pull/209) | https://gametimepicks-git-previe-d65faa-yashwantbalaji33-7164s-projects.vercel.app |
| **B** | **Concept B — Card Break social/viral** | [#210](https://github.com/yashwantbalaji3/gametimepicks/pull/210) | https://gametimepicks-git-previe-194520-yashwantbalaji33-7164s-projects.vercel.app |
| **C** | **Concept C — Clean Slate minimal (light)** | [#211](https://github.com/yashwantbalaji3/gametimepicks/pull/211) | https://gametimepicks-git-previe-31bb7c-yashwantbalaji33-7164s-projects.vercel.app |

> The concept preview URLs are **Vercel deployment-protected (HTTP 401 to the
> public)** — open them while signed into your Vercel account, or click
> **"Visit Preview"** in each draft PR's Vercel comment.

## Visual direction of each
- **V0 Current** — dark navy + warm **gold** "vault/casino" theme; Geist + JetBrains Mono; medium radii; premium but warm/heavy.
- **A — Terminal** — cool **near-black slate + electric teal/cyan** accent; hairline borders, small radii (6px), denser command-bar chrome. A Bloomberg-style analytics terminal. (accent `#5EEAD4`)
- **B — Card Break** — vibrant **deep-indigo canvas + magenta/violet gradient washes**; big pill-rounded cards (20–22px), bold gradient headlines, dramatic hover glow. Built to screenshot on X/Reddit. (accent `#FF5CB8`)
- **C — Clean Slate** — calm **LIGHT** theme: warm off-white paper, near-black ink, single **emerald** accent, soft shadows, airy. Beginner-friendly. (accent `#0B8457`)

## Comparison matrix

| Dimension | V0 Current (gold vault) | A — Terminal (teal) | B — Card Break (magenta) | C — Clean Slate (light) |
|---|---|---|---|---|
| **Visual style** | Warm dark casino/premium | Cool dark analytics terminal | Vibrant dark social/energetic | Light, minimal, airy |
| **Navigation** | Same structure (clear) | Same (denser, sharper) | Same (bold pills) | Same (clean, lightened) |
| **Home clarity** | Good | Good, more "data terminal" | Good, more "hype-but-honest" | Good, most approachable |
| **Projections clarity** | Good | Good (mono/data feel) | Good (bigger cards) | Good (airy) |
| **Parlay Lab usability** | Identical (filters/tabs/Build My Card unchanged) | Identical | Identical | Identical |
| **Results readability** | Good | Good (crisp) | Good (bolder) | Good (light, high-contrast main area) |
| **Bank Builder energy/shareability** | Moderate | Moderate (clinical) | **Highest** (gradient, glow, screenshot-ready) | Calm/clear |
| **Mobile 375** | Clean | Clean | Clean | Clean (bottom-nav lightened) |
| **Desktop 1280** | Clean | Clean | Clean | Clean |
| **Empty-state quality** | Honest (unchanged) | Honest (unchanged) | Honest (unchanged) | Honest (unchanged) |
| **Pros** | Established, cohesive, premium | Premium + credible + modern; fits "serious analytics lab" | Eye-catching, growth/marketing, viral | Friendliest for newcomers; clean |
| **Cons** | Warm gold can read "gambling" | Cooler/less warm; subtle | Vibrancy could read less "serious"; gold accents linger in a few hardcoded spots | **Needs follow-up:** a few hardcoded-navy inner panels + the top disclaimer strip don't flip (token override can't reach inline colors) |
| **Best audience** | Current users | Data-savvy / credibility-first | Growth / social acquisition | First-time / casual users |
| **Implementation risk to productionize** | n/a | **Low** (theme tokens) | **Low–med** (a few non-token gold accents to migrate) | **Medium** (migrate hardcoded-navy panels to tokens for a true light theme) |
| **Recommendation** | Baseline | ★ **Strongest fit** | Best for marketing/growth | Best for beginner onboarding |

## Recommendation
- **If the priority is credibility + "serious analytics lab" positioning → Concept A (Terminal).** It looks the most modern/premium, keeps the data-dense feel, and the cool palette distances the product from "gambling hype" while staying honest. Lowest productionization risk (pure tokens).
- **If the priority is growth / shareable cards → Concept B (Card Break).** Most eye-catching and screenshot-friendly; copy stays honest. Slightly more work to migrate a few non-token gold accents.
- **If the priority is beginner onboarding → Concept C (Clean Slate).** Friendliest, but needs the most follow-up (migrate hardcoded-navy panels to tokens) to be a fully polished light theme.

My single pick for this product's positioning: **Concept A.** But this is your call — **nothing is merged.**

## How to review
1. Open each draft PR (#209 / #210 / #211) while signed into Vercel and click **"Visit Preview"** (or the URLs above).
2. Walk the user path on each: Home → Projections → Parlay Lab → Build My Card → Bank Builder → Results.
3. Compare against the current site: **https://gametimepicks.yashwantbalaji.com**.
4. Tell me which direction (or which elements from each) you want, and I'll build a production-quality version of the winner — then we verify + merge that one only.

## Verification (all three)
`tsc --noEmit` clean · `npx tsx --test src/lib/*.test.mjs` → 562/562 · `npm run build` green · no horizontal overflow at 375/1280 · no console errors · no banned copy · Bank Builder paper-only + Events schedule-only + Results honesty preserved (content/logic untouched).

## Reminder
**No concept branch is merged. Do not merge #209/#210/#211 to production** without an explicit decision.
