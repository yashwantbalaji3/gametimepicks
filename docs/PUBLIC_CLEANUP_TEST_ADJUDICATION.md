# Public Cleanup — Test Adjudication Matrix

**Program:** 073–075 · **Date:** 2026-07-30 · **Rule:** no test was deleted to reduce a failure count; every one of the 52 failures received an explicit ruling with evidence. Full per-assertion detail lives in two places: the adjudicating comments now inside each rewritten test file (the durable record), and the three cluster agents' complete matrices in the program working logs.

## Outcome totals

| Decision | Count | Meaning |
|---|---|---|
| **RETAIN** | 5 | The removal was wrong — the surface was restored (all in the World Cup Specials accountability ledger) |
| **MIGRATE** | ~6 | The guarantee outlived its surface and moved (UFC truth pins → `ufc-archive.test.mjs`; Bank Builder record → crown-record-visibility guard) |
| **REWRITE** | ~22 | The guarantee stands, the surface or policy wording changed (methodology math blocks, sport-chrome rescoping, split two-half tests, inverted negatives) |
| **REMOVE** | ~17 | The surface is deliberately retired and no shared guarantee is lost (live-tournament chrome, dead-component rendering pins) |
| **RESOLVED BY INTEGRATION** | 2 | `workflow-failure-visibility` ×2 — already fixed on `main` (`d60cd7b1`), landed via merge |

End state: **3,556 tests · 3,552 pass · 0 fail · 4 skipped** on the integrated tree.

## Cluster rulings

### 1 · UFC (13 assertions + 1 file-level)

**Route ruling: `/ufc` = dated settled ARCHIVE, overriding the cleanup's redirect.** The redirect was half right — the hub's Projections/Suggested-Cards/Markets/simulator shape contradicted a scaffold-only sport — but it orphaned the UFC 250 settled record (6–1, graded from the official ESPN MMA scoreboard), which had **zero** other public surface: `/results` carries no UFC section. Preserving accountability records is a hard rule, so the page now renders the official settlement fail-closed, clearly dated, with an explicit no-record note for the never-settled second card and no predictive shape. Four dead chrome components and the homepage preview loader were deleted with their rendering tests; every truth guarantee (a settled card never presents as upcoming; no fabricated markets; unvalidated model output never renders) migrated into `ufc-archive.test.mjs` and the rewritten `ufc-public-ready`/`ufc-stale-card-gate` with known-positive **and** known-negative pins. A mutation probe on the final-state gate failed the new pins as designed and restored byte-identically. 65/65 scoped.

### 2 · World Cup + Specials (13 assertions across 6 files)

Live-tournament chrome (in-focus counts, pilot props board, Model Picks tab, lineup badges, homepage specials box, the round-of-32 dynamic route) — **REMOVE** with their dead components, under the closed-destination precedent. **But stubbing `/world-cup-specials` had destroyed the only public surface of the settled Specials ledger — RESTORED** (it was already a dated, RETIRED-labelled archive before the cleanup) with archive hardening; both accountability pins pass unchanged. The `round-of-32-static-params` guard existed to stop a build failure on a dynamic export route; it died with the route after verifying no dynamic World Cup route remains. The world-cup-closeout precedent guard stayed green throughout.

### 3 · Methodology + homepage + sport chrome (13 assertions)

Twelve **REWRITE**, one **MIGRATE**. The rewritten `/methodology` contract now pins the research-terminal framing: registry-truthful coverage, the seven math blocks with **difference-not-edge** plus an explicit no-"edge" negative, and the first-slate concentration lesson kept as a lesson (one content edit added it back) without the celebratory chip row. The Bank Builder completed-record guarantee **migrated** to a crown-record-visibility guard (canonical figures known-positive + a 49-route known-negative literal scan). The 7-step-ladder pin inverted to "presented nowhere as live". Sport-chrome loops rescoped to `/mlb`, the one surviving sport center.

### 4 · Integrator rulings (12 assertions in files no cluster owned, + collisions)

| Test | Ruling |
|---|---|
| `world-cup-specials` homepage-box render + overflow (2) | REMOVE — the homepage deliberately no longer advertises a retired product; the ledger's own archive page is the tested surface |
| `world-cup-specials-preview` Confirmed-starter badge | REMOVE — live-lineup feature, dead with its component |
| `daily-portfolio-revamp` WC-tab + /mr-dub two-half test | REWRITE — split; the `/mr-dub` daily-portfolio half keeps its pin |
| `june16-curated-picks` Player-Picks tab order | REMOVE — live-era tab ordering; the model-qualified *policy* keeps its own guards |
| `june16-launch-polish` WC portrait + game link | REMOVE — retired presentation |
| `simulate-lobby-premium` GamesExperience + R32 banner | REWRITE — split; lobby half retained, R32 half inverted to "no href/banner", deliberately not matching the data import the lobby legitimately keeps for game-script signals |
| `model-qualified-props` WC page mounts (2) | REMOVE — policy tests retained (11/11), page mounts died with the surface |
| `product-reset-phase-a` /ufc redirect pin | REWRITE — archive ruling wins; no-Simulation-Center claim preserved for both routes |
| `product-reset-phase-b` three-sport-center loop | REWRITE — rescoped to `/mlb` |
| `spotlight-event` #6 destination-retired pin | REWRITE — an archive is still not a live destination; added "the archive mounts no spotlight" |
| `home-restructure` "UFC Simulations" label pin | REWRITE — the label itself was the live-coverage implication; now pins "UFC · Settled archive" positively and bans the old label |
| `workflow-failure-visibility` ×2 | RESOLVED BY INTEGRATION (main `d60cd7b1`) |

Two real content defects surfaced by adjudication and fixed: the homepage sold `/ufc` as "UFC Simulations · Enter", and the archive banner used internal registry vocabulary ("scaffold-only in the capability registry") — both now public language.
