# Production Go/No-Go Smoke Report — 2026-07-13

Against the **deployed** site `https://gametime-picks.vercel.app` (not local). Prod HEAD = `e605efee` (the
launch-blocker cleanup is live). All checks below were run with `curl -sL`.

## HTTP status
| route | prod status | expected | ✅ |
|---|---|---|---|
| `/` `/today` `/picks` `/simulate` `/games` | 200 | 200 | ✅ |
| `/mlb` `/mlb/board` `/mlb/power` `/world-cup` `/results` `/ufc` `/mr-dub` | 200 | 200 | ✅ |
| **`/ops`** | **404** | 404 / inaccessible | ✅ |
| **`/preview/june20`** | **404** | 404 / inaccessible | ✅ |
| `/parlays` `/parlay-lab` `/nba/parlays` | 200 (client-redirect) | clean redirect | ✅ |

## Content integrity (prod)
| check | result | ✅ |
|---|---|---|
| Aliases emit a Next error shell? | **No** (`__next_error__`=0 on all 4 aliases incl. `/games`) | ✅ |
| UFC `-internal-` JSON served? | **No** (`/data/ufc/*-internal-*.json` → 404) | ✅ |
| `data/internal` exposed? | **No** | ✅ |
| Stale "Live today" on old slate? | **No** ("No games today · Mon, Jul 13") | ✅ |
| Money display | **19-14 / $19,065.40** | ✅ |
| MLB All-Star-break framing | "All-Star break; second half resumes Jul 17" | ✅ |
| Forbidden betting claims in rendered copy | None | ✅ |

## Deploy freshness
Prod is on the latest commit (the `/ops`+`/preview` 404 behaviour and the alias fixes are from the most recent
pushes). **The World Cup semifinal predictions generated in THIS mission are committed but not yet deployed** —
they deploy on the next push to `main` (Vercel auto-build). Re-smoke `/world-cup` + the SF game reports after
that deploy to confirm the semifinals render on prod.

## Verdict
Production go/no-go: **GREEN** for the launch-blocker items. No internal exposure, no broken redirects, no
stale-as-live, money correct. Next prod re-smoke is only to confirm the just-committed WC semifinals after deploy.
