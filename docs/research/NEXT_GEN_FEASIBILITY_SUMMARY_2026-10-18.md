# Next-generation feasibility: Simulation Theater V2 and Smart Betslip

**Read-only research, 2026-10-18.** Code was read at `origin/main` `6de21842dd`. Inputs:
- the founder-supplied PropDealer audit (`~/Downloads/competitor-audit.md`, read in full; its evidence images, wireframe and companion prompt were not supplied);
- `COMP-001`;
- the Theater v0 spec.

No implementation, PRs, paid calls, account sign-ups or roadmap edits were made during this research.

**Detailed reports:**
- [`SIMULATION_THEATER_V2_FEASIBILITY_2026-10-18.md`](SIMULATION_THEATER_V2_FEASIBILITY_2026-10-18.md) (302 lines)
- [`SMART_BETSLIP_FEASIBILITY_2026-10-18.md`](SMART_BETSLIP_FEASIBILITY_2026-10-18.md) (436 lines)

## 1. Simulation Theater V2

| Fidelity | Verdict | Effort (estimate) |
|---|---|---|
| **Drive view** (possession, field position, drive results, score, clock, from saved drives) | **Feasible now** | MVP about 6–10 days, local preview only |
| **Same-world player panel** (box score from the *same* sampled game) | Feasible for **future** receipts after a recording-only change | about 5–8 days |
| **Simulated plays** (down and distance, play types, participants) | **Not feasible** without a new play/rules model (NFL-002) | 4–8+ weeks, uncertain |
| **Cinematic** (animated players, camera, ball arcs) | Not honestly feasible until play-level output exists | not estimated |

**What already exists (code-verified):**
- **Drive engine:** `nfl-drive-sim-v2` (`app/src/lib/sports/nfl/sim-v2/engine.mjs`) records one event per drive.
- **Sample runs:** each receipt keeps 5 representative runs with full drive logs. All 168 receipts on `main` have them.
- **Existing page:** `/nfl/simulation/[eventId]/` already shows three of these logs. The audit and COMP-001 missed this page.
- **Player stats discarded:** `receipt.mjs` re-simulates each sample run *with* player stats (`scratch.players`) but saves only the final score, quarters and drives. Keeping those stats is the cheapest way to get a same-world box score.
- **Do not reuse the "five sample games" on `/nfl/game/<id>/`.** They come from the world model, which draws the final score first and has no drive, clock or event order. It is a different engine with different run numbers and opposite home/away ordering, but it shares player IDs. Splicing it onto drive-engine runs must be blocked by a test.

**MVP shape:**
- a build-time adapter reads the existing receipt;
- a pure `stateAt(t)` renderer feeds a hand-written SVG field (target ≤30 KB);
- it has play/pause, seek, 1×/2×/4× speed, next drive, reduced-motion stepping and a full HTML transcript.
- Labels: "SIMULATED · drive-level · movement illustrative · experimental model".
- No animation library: pixi.js is about 215 KB and three about 171 KB gzip, both over the 120 KB budget.

**Vercel cost:** the MVP adds **0 data commits and 0 build triggers**, because drive-engine receipts sit under `data/internal/research/…`, which is not a build input. Only the approved code merges build. Writing Theater JSON into `app/public/data` from the receipt job would add about 2.9 build-triggering commits a day, so it is ruled out.

**Honesty constraints:**
- The drive engine is **shadow/experimental**. Its held-out winner log loss was 0.6468 vs 0.6358 and 0.6419 vs 0.6343 (lower is better), so it is worse on both point estimates, with no intervals reported.
- Every frame carries the experimental label.
- Motion never implies validation.
- No invented plays.

## 2. Smart Betslip / Parlay Lab V2

| Level | Verdict |
|---|---|
| **L0** compare-only (stored prices with a timestamp) | **Feasible now**: no partner, no paid feed, rides the existing capture commits, so 0 extra builds and 0 extra credits |
| **L1** open the sportsbook event page | Technically trivial, **but blocked by GTP's own Terms and responsible-use copy** until founder and counsel change them |
| **L2** prefill a single leg | Plausible for some books through The Odds API `includeLinks`/`includeSids`. Which books return links is **UNVERIFIED** |
| **L3** prefill a multi-leg parlay | **No public evidence** that any book supports it |
| **L4** prefill a same-game parlay with live pricing | **Not feasible** under current policy; founder decision D5 already keeps same-game legs off cards |

**Blocking facts (code-verified):**
1. **GTP's own legal and positioning copy forbids sportsbook links:**
   - the Terms draft (`app/src/lib/legal/texts.mjs:61`): "…link to or partner with any sportsbook";
   - `/responsible-use` (`page.tsx:58`): "There are no affiliate links to sportsbooks";
   - Ask refuses sportsbook links.
   - The 2026-09-24 founder decision states that the displayed price is "NOT LINE SHOPPING". A "compare odds" view reverses it.
2. **GTP stores no sportsbook-side identity:**
   - published ladder legs drop the bookmaker;
   - the slip is keyed by player name, with no event or book.
   - Deep links need book event, market and selection IDs that GTP has never captured.
3. **Freshness:**
   - prices are captured once or twice a day, and legs stay publishable for up to 3 days (`PRICE_MAX_AGE_DAYS = 3`);
   - the provider refreshes every 40–60 s.
   - A "compare odds" claim on those prices would mislead without prominent timestamps.
4. **Offshore books in the public data (new finding, also relevant today):** the provider's `us` region includes offshore, unlicensed books, and `app/public/data/nfl/markets/latest.json` on `main` contains bovada, mybookieag, betus, lowvig and betonlineag. Any compare or link surface needs a licensed-book allowlist.
   - **Separately:** check whether any current page displays prices sourced from those books. This is a founder or counsel review item, not changed during this research.
5. **Affiliate pay models trigger state licensing:** NJ, PA, MI, OH, MA and NY. Only the MI and OH rules were checked at primary sources. These are counsel items, with no legal opinion given.

**Recommended MVP if the founder wants to proceed:**
- L0 only: a timestamped, licensed-book-allowlisted price display built from existing captures;
- no outbound links;
- no paid feed;
- the forecast record kept strictly separate from any commercial surface.

## 3. Proposed roadmap placement (not yet applied)
- **`SIM-THEATER-001`:** already tracked in §2A of the reconciled roadmap as *awaiting founder review; not started*. Add the drive-first MVP, the player-sidecar recording change, and dependencies on NFL-002 (plays), DS-001/UX-001, COST-001 and CONTRACT-001.
- **New `BETSLIP-001`** under PARLAY-001 / post-launch. It depends on:
  - legal (GTP-01 Terms revision, counsel);
  - COST-001 task 7 (runtime data delivery), if freshness beyond the capture cadence is ever required;
  - a licensed-book allowlist;
  - the founder decisions below.

## 4. Founder decisions needed
1. **Theater:** does replaying recorded drive events fall outside the 2026-09-07 animation retirement (P242)?
2. **Theater:** approve recording per-sample player stats in future NFL drive-engine receipts? This is a shadow-research artifact; it does not touch published forecasts.
3. **Betslip:** should GTP ever link to sportsbooks? This reverses current Terms and responsible-use copy, and needs counsel.
4. **Betslip:** is line shopping, a "compare odds" view, acceptable given the 2026-09-24 "NOT LINE SHOPPING" decision?
5. **Betslip:** affiliate compensation: none, or pursue a licensed route (state registrations)?
6. **Data hygiene:** an allowlist that excludes offshore books from public price displays, and a freshness target for any price shown.
