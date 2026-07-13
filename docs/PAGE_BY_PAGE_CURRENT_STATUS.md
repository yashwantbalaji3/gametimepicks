# Page-by-Page Current Status — 2026-07-13

What each major page actually shows on the verified ET date **2026-07-13** (newest slate 07-11). Verified against
the BUILT static export, not just source.

| Page | Status | Visible date | Data source | Problems | Launch | Action |
|---|---|---|---|---|---|---|
| `/` Home | honest | "No games today · Mon Jul 13 · most recent Jul 11" | portfolio + MLB board + top10 | UFC preview surfaced (experimental) on flagship | 🟢 | decide UFC card |
| `/today` | honest | banner Jul 13 + header "Latest slate · Jul 11" | canonical loaders | h1 "Today's Picks" + pinned "Simulate Today's Games" CTA under banner (caveated) | 🟢 | P2 soften CTA on no-games days |
| `/world-cup` | honest | banner Jul 13; "next up · semifinals Jul 14-15" | `world-cup/*` | route name "round-of-32" stale vs SF stage (cosmetic) | 🟢 | — |
| `/mlb` | honest | banner + "MLB · latest slate" + "All-Star break; resumes Jul 17" | `data-mlb` | hero "Games today N · 07-11" copy nit | 🟢 | P2 copy |
| `/simulate` | usable | real ET; MLB rows from 07-11 board | `SimulateLobby` | identical to `/games`; verify MLB rows not labelled "today" | 🟡 | dedupe + verify |
| `/games` | usable | = `/simulate` | same | duplicate route, label/title drift | 🟡 | collapse/redirect |
| `/picks` | honest | banner + date-gated cards | normalizers + `loadTodaySlate` | nav "Picks Lab" / title "Parlay Lab" drift | 🟢 | P2 label |
| `/build` | honest | "no eligible legs" empty state | `build-legs` | overlaps `/picks` conceptually | 🟢 | P2 IA |
| `/moonshot` | honest | banner; lane "stopped" 0-1 | `moonshot-lane` + portfolio | none | 🟢 | — |
| `/results` | usable | settled history | `parlay-results` (era-filtered) | legacy `results/` frozen 06-13 vs `mlb/results/` 07-11 — two systems | 🟡 | pick canonical results source |
| `/ufc` | experimental | Jul 11 card "Completed — awaiting settlement · Experimental" | `ufc/*` (fail-closed) | advertises a finished card that never settles; results frozen 05-16; `-internal-` files served | 🟡 | settle/relabel; rename files; decide scope |
| `/mr-dub` Daily Dashboard | honest | settled portfolio | `mr-dub/flagship` | nav vs page-title drift | 🟢 | — |
| `/bank-builder` | honest | No-play · awaiting Step 3 · paper exposure $25 | canonical BB loaders | "open exposure $25" is paper seed, not official $0 — label clarity | 🟢 | P2 label "paper exposure" |
| `/ops` | **exposed** | internal ops dashboard | `admin/status.json` | **publicly reachable; leaks tooling/playbooks** | 🔴 | exclude from export (founder) |
| `/preview/june20` | **exposed+stale** | June-20 review build | `previews/june20/*` | **publicly reachable; stale "settlement pending"** | 🔴 | delete/exclude (founder) |
| `/sports` | honest (fixed) | "no live slate today" · cards "Off today" | WC/MLB/NBA/UFC loaders | was "Live today" on stale slate — **fixed this pass**; orphaned (0 inbound links) | 🟡 | link or retire |
| `/projections` | usable | hero "Jul · today" (frozen clock) | `loadProjectionsPayload` | NBA-centric off-season; no banner; unlinked | 🟡 | gate "today" sub / relabel |
| `/methodology` `/about` `/learn` `/responsible-use` `/market-guide` | honest | static | static/canonical | none | 🟢 | — |
| NBA `/nba*` · NHL `/nhl*` · IPL `/ipl*` · `/homer-nukes` · `/trends` | intentional | off-season/retired/pending | per-sport | honestly labelled | ⚪ | keep |

## Cross-page checks
- **Stale-as-live:** none on current routes — built export has **zero "Live today"** (after the `/sports` fix).
- **Internal-artifact leak:** none (`out/` has no `data/internal`); caveat = 4 UFC `-internal-*.json` files on the
  public surface (hygiene, not a data/internal leak).
- **Overclaim / forbidden terms:** none rendered (all "lock/EV/guaranteed" hits are negations, hedged
  definitions, comments, or the allowed profit-lock sense — see `STALE_COPY_AND_FORBIDDEN_CLAIMS_SCAN.md`).
- **Money consistency:** every surface reads the canonical 19-14 / $19,065.40 / $0; md5 `affe6b21`.
