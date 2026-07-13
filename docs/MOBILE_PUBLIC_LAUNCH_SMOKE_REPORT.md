# Mobile Public-Launch Smoke — 2026-07-13

Served the built static export and checked at mobile width (375px). Focus: the new World Cup semifinal content
+ the honest no-games framing.

## Checked
| page | viewport | horizontal overflow | key content | ✅ |
|---|---|---|---|---|
| `/world-cup` | 375px | **none** (scrollW 375 = clientW 375) | liveness banner readable ("No games today · Mon Jul 13 · WC semifinals Jul 14 & 15"); hero "2 games in focus" (both SFs); nav + bottom-nav usable; money $19,065.40 · 19–14 | ✅ |
| `/` (prior pass) | 375px | none | liveness banner + money chip legible; nav reachable | ✅ |

## Result
- No page-level horizontal overflow on the WC command center at mobile width.
- Liveness banner + WC semifinal framing render cleanly and are legible.
- Global nav + bottom-nav reachable; money/trust chips correct.
- No internal/debug text; no clipped critical CTA on the checked pages.

## Residual (⬜ — verify at launch, low risk)
A **full** mobile sweep of every route (`/today`, `/picks`, `/simulate`, `/mlb`, `/results`, `/ufc`, `/mr-dub`
+ the two SF game reports) at 390/430/768px is still recommended before broad launch. All use the same
responsive `vault-page-shell`; the banner + shell were verified overflow-free, so risk is low — but it's a
manual visual pass worth doing on real devices. No CSS fixes were needed on the checked pages.
