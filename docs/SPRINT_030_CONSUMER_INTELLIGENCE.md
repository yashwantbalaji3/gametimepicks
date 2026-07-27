# Sprint 030 — Consumer Intelligence Expansion

Durable log. Sprint 029 (`docs/SPRINT_029_MARKET_INTELLIGENCE.md`) built the canonical intelligence
layer; this sprint turns it into a cohesive consumer product.

Status labels: SHIPPED · PROVEN IN PRODUCTION · LOCALLY VALIDATED · BLOCKED · DEFERRED FOR DATA ·
DEFERRED FOR FOUNDER / LEGAL

| | |
|---|---|
| Start HEAD | `6081b9c0` → reconciled onto bot `1fe79033` |
| End HEAD | `ae7ae0b0` |
| Suite | 3040 → **3054 total · 3050 pass · 0 fail · 4 skip** |
| TypeScript / build | clean |
| Money | `affe6b21071f2b3be96bb2774eb347c3` unchanged |
| Bank Builder lock | `cb80473f88f3cb5f67208fa568925295` unchanged |

---

## Phase 0 — Reconcile + production proof · SHIPPED

Fast-forwarded onto `1fe79033` (pregame archive metadata, data-only, `[skip ci]`).

### Market Center is PROVEN IN PRODUCTION

`https://gametimepicks.yashwantbalaji.com/markets/` → `HTTP 200`, 991,104 bytes, hero copy
`Sportsbook prices next to our simulations`, and **`Player props (1530)`**.

That count is the proof. The pre-`14d47b68` loader had no model-side pass and could only ever
produce 1,251 rows. Rendering 1,530 requires it, so production is serving `14d47b68` or later.

**Not claimed:** that `6081b9c0`'s historical framing is deployed. That branch renders nothing when
the snapshot is current, so a current-slate page is byte-identical either way. It stays LOCALLY
VALIDATED until the first stale day.

### How deploys actually happen — and the gap · DEFERRED FOR FOUNDER

Deploys occur through **Vercel's Git integration on push to `main`**. That is why the consumer work
is live.

What does NOT happen is the daily rebuild. `.github/workflows/daily-rebuild.yml` is DORMANT — run
`30266726514` (2026-07-27T12:38Z, 7s) logged verbatim:

```
##[notice]VERCEL_DEPLOY_HOOK_URL is not set — daily-rebuild is DORMANT (no-op).
```

This matters specifically for a static export: the build bakes its clock, so on a day with no push
the site's clock stops. The stale-snapshot framing is the honest fallback; the daily rebuild is the
actual fix. **Setting `VERCEL_DEPLOY_HOOK_URL` in repo secrets is a founder action** (instructions
are in that workflow's header).

---

## Phase 1 — Game Report integration · SHIPPED · LOCALLY VALIDATED

A "Model vs Market" tab on the MLB Game Report, built from the SAME `buildGameIntelligence()` call
that powers `/markets`. The report does no sportsbook math and makes no eligibility decision — it
renders the mode the pairing layer decided.

### The report already had a market path

`buildMlbGameCenter` (`lib/mlb-team-markets.ts`) is a market-ONLY presenter that predates the
canonical layer. It reads the same de-vigged artifact fields, so its numbers do not contradict the
new section. What it lacks: the model side, sign-correct run-line handling, and **any freshness
gate** — on a stale day it would present an old snapshot as the current market.

Rather than add a third path, the canonical intelligence was attached alongside it.
**Follow-up: retire `MlbGameCenter` in favour of the canonical layer** (it is rendered as
`marketSnapshotNode` in `game-detail-page.tsx` and referenced by `mlb-simulation-report-v2.tsx`, so
it needs its own change).

### One freshness rule, shared

`resolveFreshnessReference()` moved into `lib/markets/freshness.ts`. It was previously inlined in
the Market Center loader where only one surface could use it. Two surfaces disagreeing about
whether the same snapshot is current is exactly the contradiction this layer exists to prevent.

The ET clock is now pinned once per slate rather than read per game, so two games in one report set
cannot be framed differently across a date boundary.

### Cross-surface agreement is asserted, not assumed

`lib/markets/cross-surface-agreement.test.mjs` runs against the LIVE slate: for every game both
surfaces cover, mode / sportsbook figures / comparison / signed line / run-line derivation must be
identical. Verified to catch divergence — pointing the report at a different reference date fails
it (mutation confirmed applied first).

### Browser-verified on the hardest case

CLE @ CIN is the one game on this slate where the home team **lays** the run line. The report
renders `Cincinnati Reds -1.5 · 33.6%` — the exact canonical value, correctly below the 51.3% win
probability. The sign convention holds end to end. No console errors; no overflow at 375px.

⚠️ The MLB report sits behind a **simulate-first reveal gate** ("Generate Simulation", ~10s
animation). The tabs do not exist in the server HTML — to QA the report you must click through the
reveal first.

---

## Phase 4 — `/markets` hardening · SHIPPED · LOCALLY VALIDATED

The 200-row ceiling is gone. Pagination at 50/page; all 1,530 rows reachable
(`1–50 of 1,530 matching rows · Page 1 of 31`).

**Census semantics preserved** — the requirement most likely to be broken silently. Mode filters
count over the full dataset (230 / 279 / 1,021), never the visible page. Filtering to Model + market
shows `1–50 of 230` while the other mode counts stay unchanged: the count describes the dataset,
the range describes the window.

Any filter change resets to page 1, and `paginate()` clamps an out-of-range index rather than
trusting it — otherwise a narrowed result set strands the reader on a page that no longer exists,
which reads as "no rows".

`paginate()` is pure and exported so guards assert directly: no row dropped, none duplicated, order
preserved. Mutations (counts describing the page; flooring the page count so the last partial page
vanishes) were verified applied and both caught.

**Payload stays 968 KB, deliberately.** All rows remain in the client payload because filtering and
counting are dataset-wide; shipping only a page would make the mode counts a lie. The real waste —
duplicated per-row constants — was already removed in Sprint 029 (2.4 MB → 968 KB).

### e2e coverage added but NOT executed · BLOCKED

`app/e2e/markets.spec.ts` — 7 tests, parses and lists. It cannot run here:

- no Playwright browsers installed (`~/Library/Caches/ms-playwright` is empty)
- `playwright.config.ts` `webServer` is `npm run dev`, which returns **500** for these pages under
  `output: export`

Every assertion was instead verified manually through the browser against the built export. To make
the harness real: `npx playwright install chromium` and point `webServer` at the built output
(`npm run build && python3 -m http.server 4173 --directory out`).

---

## Not started

Phases 2 (/today), 3 (homepage), 6 (snapshot retention), 7 (movement gating), 8–10 (broader sports,
graduation pipeline, next-sport research), 11 (Bank Builder evidence), 12 (Moonshot accounting),
13–15 (entities, UX, reliability).

Highest remaining consumer value, in order: **/today**, then **homepage** — both now have a
ready-made canonical source in `lib/markets/load.ts` + `buildGameIntelligence`, so neither needs new
derivation work, only integration.

## Commands

```bash
cd app && npx tsx --test $(find src -name '*.test.mjs')   # read "# fail", not $?
cd app && npx tsc --noEmit
cd app && npx tsx scripts/measure-pairing-coverage.mjs
cd app && npm run build && python3 -m http.server 4173 --directory out   # browser QA
```

---

# Sprint 031 — Consumer Journey Convergence

Start `f33e77cc` → end `5bd91172`. Suite 3054 → **3066 total · 3062 pass · 0 fail · 4 skip**.
Money `affe6b21…` and lock `cb80473f…` unchanged throughout.

## Phase 1 — Legacy game-center convergence · SHIPPED · LOCALLY VALIDATED

`buildMlbGameCenter` enforced NO freshness — on a stale day it rendered an earlier slate's prices as
the current market. There was exactly **one** production construction site (`game-detail.ts`), which
made this bounded.

`lib/markets/game-center-adapter.ts` now projects `GameIntelligence` into the legacy
`MlbGameCenter` shape. The interface is unchanged, so `mlb-game-center.tsx`,
`mlb-simulation-report-v2` and the simulation runner keep working untouched — but every number comes
from `buildGameIntelligence` and the freshness gate is inherited.

Guards assert two opposing obligations, because checking only the first would pass with the gate
deleted:

- **PARITY** — on the live slate the adapter reproduces the legacy builder exactly (moneyline,
  total, run line, teams, first pitch, disclosure) on every game it rendered.
- **DIVERGENCE** — on a stale snapshot the adapter returns null where the legacy builder still
  returns live-looking probabilities.

⚠️ This is a documented **compatibility shim, not a destination**. Three components still consume
the legacy shape; retiring it means migrating them to `GameIntelligence` directly.

## Phase 4 — Playwright against the built export · SHIPPED

`webServer` now serves the **exported directory** (the same artifact production serves), not
`next dev` (which 500s under `output: export`).

`python3 -m http.server` was tried first and is **single-threaded** — parallel workers dropped
requests and produced spurious 404s, so the markets spec passed alone and failed in a full run.
Replaced with `app/scripts/serve-export.mjs` (also honours `trailingSlash`, serves the exported 404).

```bash
cd app && npm run e2e:install   # once
cd app && npm run e2e           # build + serve + test
cd app && npm run e2e:fast      # reuse existing out/
```

### The harness immediately found a shipped bug

The Market Center passed team **display names** to `TeamLogo`, so the CDN was asked for
`arizonadiamondbacks.png`. All **24 logos 404'd** and the `onError` fallback drew initials
monograms — screenshots looked correct, the logos had simply never loaded. A visual fallback that
hides a defect is worse than a visible break.

Fixed by carrying `homeTeamAbbr`/`awayTeamAbbr` on `GameIntelligence`, distinct from display names.
That exposed a second real mismatch: **StatsAPI says `AZ`, ESPN serves `ari`** — now an explicit
verified alias in `TeamLogo`. **24 console 404s → 0; markets.spec.ts 7/7 executed.**

### ⚠️ 15 pre-existing e2e specs are STALE — newly visible, not new

Full e2e: **31 passed / 15 failed**. The failures are in `navigation`, `newsletter`, `parlay-lab`
and `admin-copy` specs that rotted silently because the harness never ran. Verified as stale rather
than broken product: `/parlay-lab/`, `/results/` and `/board/` all return 200 with real headings,
and `nav exposes all primary routes` expects `/board` and `/parlay-lab` in the primary nav, which an
earlier IA prune deliberately removed.

**Left failing rather than weakened or deleted.** Deciding what those specs should now assert is a
separate unit with real intent behind it — the charter forbids making them green by weakening them.

## Not started this sprint

Phases 2 (/today), 3 (homepage), 5 (production proof for the new commits), 6–7 (snapshot retention,
movement gating), 8–10 (broader sports, graduation, research), 11–12 (Bank Builder, Moonshot),
13–15 (entities/UX, reliability/ops).

Highest remaining value: **/today**, then **homepage** — both need integration only, since
`lib/markets/load.ts` and `buildGameIntelligence` already supply everything.

Still **DEFERRED FOR FOUNDER**: `VERCEL_DEPLOY_HOOK_URL` (daily-rebuild remains a no-op; a day with
no push leaves the static export's clock stale).
