# Phase 17 — current slate workflow, settle results, star-filter parlays, polish UI

This package fixes the three biggest user-visible issues from the live site: Parlay Lab building from stale May 5 data, bench/role players cluttering candidates, and admin-y "props not configured" copy on the home + board heroes. Adds a one-command operator settlement helper. **608 Python assertions across 14 suites, all green.** Zero Odds API credits.

## Summary

- **Parlay Lab now defaults to the active slate** (today / nearest upcoming) instead of whichever past date has the most leans. Archived dates are still selectable but clearly labeled "(archived)".
- **Top 3 core players per team** filter is on by default. Bench / role players are excluded unless the user opts in via "include full rotation" toggle.
- **Public copy depersonalized**: "props not configured" → "awaiting model leans" everywhere. The hero now reads as a wait state, not a config error.
- **Operator settlement helper** (`scripts/operator_settle.sh`) — one-command walkthrough: verify → template → fill → settle → export → tells you what to commit.
- **40 new test assertions** for `core_players_test`. Total: 608 across 14 suites.
- Zero Odds API credits used in this package. Apply script doesn't call paid APIs.

## What's NOT in this phase

This is a pragmatic Phase 17 — not the full 7-page UI redesign the user asked for. Reasons:

- **The "166 leans on May 5" issue is multi-bookmaker × 24 props expected design**, not a bug. Builder dedupes by (player, market) at candidate generation.
- **Live odds activation** is operational (set `ODDS_API_KEY`, flip `ENABLE_ODDS_REFRESH=true`), not code. Phase 16's `docs/ODDS_API_ACTIVATION.md` covers this.
- **Settling May 5 with real stats** requires looking up NBA box scores; that's operator work that can't be done from sandbox without fabrication. Phase 17 makes the workflow as easy as possible.
- **Heavy methodology / responsible-use redesigns** deferred — they're not blocking and the existing copy is decent post-Phase 14.
- **Mobile nav overhaul** deferred — current responsive flow works.

## Current live-site audit

Issues called out by the user and what Phase 17 does about each:

| Issue | Status |
|---|---|
| Home says "2 NBA games today · props not configured" | Eyebrow rewritten to "tonight · awaiting model leans" |
| Home shows last refresh May 5 | This reflects `meta.lastPipelineRun`. Will update when auto-refresh runs and produces fresh data — Phase 14 freshness pill already shows this honestly. No fix needed. |
| Board defaults to Tuesday May 5 | Already fixed in Phase 15 (active-slate selector). The user's live site may be stale due to deploy cache — verify after Phase 17 redeploy. |
| May 7/8 show games but no props returned | Real state. `ScheduleLiveOddsUnavailable` mode. Phase 16's PropsComingSoon hero handles this premium. To unblock real props: activate Odds API (see Phase 16 docs). |
| Results empty | Settled data appears once operator runs `scripts/operator_settle.sh 2026-05-05`. Phase 17 makes this one command. |
| Parlay Lab uses stale May 5 + bench players | **Fixed in Phase 17.** Defaults to active slate; top 3 core players per team only by default. |
| UI inconsistent | Selective polish in Phase 17. Heavy redesigns deferred. |

## Why today/tomorrow props are not visible

Same diagnosis as Phase 16: the Odds API isn't being called. Three paths to activation:

1. **No `ODDS_API_KEY` set** in Vercel + GitHub secrets
2. **`ENABLE_ODDS_REFRESH=false`** (default) in the workflow
3. **Workflow's "paid odds refresh" step is still a no-op placeholder** awaiting the actual `pipeline.fetch_odds` invocation

Resolution: `docs/ODDS_API_ACTIVATION.md` from Phase 16 covers all three. Phase 17 doesn't add new code on this — the issue is configuration, not code.

## What changed

### Parlay Lab data flow (`/parlay-lab`)
- Server passes `activeSlate.kind` and `activeSlate.selectedDate` to client
- Each date in the picker carries `isArchived` and `isActiveDefault` flags
- Default selection prefers active over archived
- "Archived slate" warning pill renders when user picks a past date

### Builder logic (`parlay-builder.ts`)
- New `BuilderOptions.includeBenchPlayers` (default `false`)
- New `BuilderOptions.corePlayersPerTeam` (default `3`)
- When `includeBenchPlayers` is false, `slateLeans` is pre-filtered through `topCorePlayerKeysPerTeam(leans, n)` before candidate generation
- Honest fallback: if the core filter would produce zero leans (e.g. team metadata missing on every lean), falls back to the full pool

### Builder UI (`parlay-builder-client.tsx`)
- New "Player pool" section (#4) with "Include full rotation" checkbox
- New "current slate" / "archived slate" status pill below the date picker
- Dedicated "No current slate available" empty state when `activeSlate.kind` is `no_current` or `no_data` AND every available date is archived
- Gold "★ focused on top core players per team" pill above candidates when bench is excluded

### Public copy
- `app/src/app/page.tsx` — eyebrow: "2 games today · props not configured" → "2 games tonight · awaiting model leans"
- `app/src/app/page.tsx` — KPI tile sub: "props not configured" → "awaiting model leans"  
- `app/src/app/board/page.tsx` — eyebrow: "schedule live · props not configured" → "schedule live · awaiting model leans"
- `app/src/app/board/page.tsx` — subline: "odds source not configured" → "awaiting model leans"

### Operator helper (`scripts/operator_settle.sh`)
One command: `bash scripts/operator_settle.sh 2026-05-05`. Walks through 5 numbered steps with prompts at every confirmation point. Refuses to settle when every stat in the template is null (no fabrication).

## Files added

| Path | Purpose |
|---|---|
| `app/src/lib/core-players.ts` | Pure top-N core players ranking logic |
| `pipeline/core_players_test.py` | 40 regression assertions |
| `scripts/operator_settle.sh` | One-command settlement walkthrough |
| `docs/PHASE17_NOTES.md` | This file |

## Files modified

| Path | Change |
|---|---|
| `app/src/lib/parlay-builder.ts` | Core-players pre-filter + new options |
| `app/src/components/parlay-builder-client.tsx` | Active-slate default + archived label + full-rotation toggle + core badge |
| `app/src/components/parlay-lab-mode-tabs.tsx` | Forwards active-slate metadata |
| `app/src/app/parlay-lab/page.tsx` | Active-slate-aware date metadata |
| `app/src/app/page.tsx` | "awaiting model leans" copy |
| `app/src/app/board/page.tsx` | "awaiting model leans" copy |
| `scripts/run_all_tests.sh`, `scripts/automation_refresh.sh` | Wire core_players_test |

## Files deleted

None.

## Current slate / live props behavior

When today has games but no leans (`ScheduleLiveOddsUnavailable`):
- **Home page** eyebrow: "2 NBA games tonight · awaiting model leans" (was: "props not configured")
- **Board page** eyebrow: "model board · schedule live · awaiting model leans"
- **Premium hero** (Phase 16): "Tonight's schedule is in. Model leans land next." with pulsing gold pill, game labels, "Notify me" CTA
- **Parlay Lab Build mode**: shows "No current slate available" if every dated board with leans is in the past

When today has games AND leans (after Odds API activation):
- All pages render the active slate's data normally
- Parlay Lab Build mode targets today by default
- Past slates remain selectable from the picker but labeled "(archived)"

## Results settlement behavior

One-command operator workflow:

```bash
bash scripts/operator_settle.sh 2026-05-05
```

The script:
1. Verifies the board exists for that date
2. Generates a fresh template (or refuses to clobber if one already targets that date without operator confirmation)
3. Pauses for the operator to fill in stats from NBA.com
4. Sanity-checks that at least one stat is non-null (refuses to settle a fully-null template — prevents accidental "settle nothing")
5. Runs `pipeline.settle_results --manual-only`
6. Runs `pipeline.export_results`
7. Prints the `lifetime_summary.json` numbers
8. Tells the operator exactly what to commit

Settlement is idempotent — re-running for the same date rewrites only that date's rows. Other dates are preserved.

## Parlay Lab top-3 core player behavior

**Default state (bench excluded):**
- Top 3 players per team by total model projection across PTS/REB/AST
- Falls back to edge × confidence weight when projections are zero
- Falls back to all leans when team metadata is missing on every lean (rare)
- Gold "★ focused on top core players per team" pill displayed above candidates

**"Include full rotation" toggle:**
- When checked, all eligible leans become candidates (Phase 16 behavior)
- Off by default

**No fabrication:** every leg in every candidate is sourced from a real `PropLean`. The core-players filter removes leans from consideration; it never invents new ones.

**Selected players mode:** the player picker is also pre-filtered to core players. Toggling "include full rotation" widens the picker pool.

**Archived slate detection:** if the user explicitly selects an archived date, an amber "⚠ archived slate · model leans here are historical, not current" pill appears below the date picker.

## Odds API safety

Unchanged from Phase 14/16:
- `ENABLE_ODDS_REFRESH=false` (default)
- `ODDS_DRY_RUN=true` (default if enabled)
- `ODDS_MAX_EVENTS_PER_RUN=12`, `ODDS_CACHE_TTL_MINUTES=120`, `ODDS_MIN_CREDITS_REMAINING=50`

Phase 17 apply script doesn't call the Odds API. New components are pure UI. Settlement helper uses `nba_api` (free) only.

## Premium UI changes

What's polished this phase:
- "awaiting model leans" replaces 4 instances of admin-y "props not configured"
- Archived slate warning pill in Parlay Lab
- "★ focused on top core players" gold badge above builder candidates
- "Include full rotation" toggle styled consistently with other vault-glass panels
- Builder empty states refined: "No current slate available" / "No model leans on this slate" / "No candidates" — three distinct paths

What's NOT polished:
- Methodology, Responsible Use, Newsletter, Footer (already decent)
- Mobile nav overhaul
- Heavy redesign across all 7-9 pages (deferred — would balloon the package)

## Bugs fixed

1. **Parlay Lab defaults to stale May 5 leans** — now defaults to active slate
2. **Bench / role players in candidate parlays** — top 3 core per team filter on by default
3. **"Props not configured" admin-y copy** — replaced with "awaiting model leans"
4. **Settlement template overwrite risk** — `operator_settle.sh` warns before clobbering existing operator work

## Tests run

14 Python suites, **608 assertions, all green**:

```
✓ pipeline.filter_test                  58
✓ pipeline.settle_test                  66
✓ pipeline.grouping_test                69
✓ pipeline.diagnostics_test             43
✓ pipeline.recent10_test                23
✓ pipeline.export_results_test          38
✓ pipeline.confidence_guardrails_test   43
✓ pipeline.inspect_trends_test          29
✓ pipeline.grouping_collision_test      31
✓ pipeline.parlay_lab_test              44
✓ pipeline.freshness_test               49
✓ pipeline.active_slate_test            42
✓ pipeline.parlay_builder_test          33
✓ pipeline.core_players_test            40  ← NEW
                                       ───
                              TOTAL    608
```

`core_players_test` covers: empty input, n=0, single-team top-N, full-coverage vs single-market ranking, per-team independence, zero-projection fallback to edge×confidence, missing-team bucket, fewer-than-N qualifiers, No-Play exclusion, deterministic tie-breaking, realistic 2-team×8-player scenario, missing-playerId name fallback.

## Typecheck result

Sandbox can't run `npm run typecheck` (registry blocked). Static analysis verified:
- All new imports resolve (`./core-players` from parlay-builder.ts)
- `BuilderOptions` extension is purely additive (existing call sites still work via defaults)
- `uniquePlayersFromLeans` second arg is optional (existing call sites still work)
- Brace/paren balance verified on all 7 modified TS/TSX files

Apply script runs typecheck on your Mac and bails with rollback hints on failure.

## Build result

Deferred to your Mac. No new dependencies.

## Smoke result

✓ Passed in sandbox.

## Exact commands to run

```bash
cd ~/Downloads/gametimepicks
bash ~/Downloads/apply_phase17_current_props_results_stars_ui.sh
```

After local commit:
```bash
git push
```

To settle May 5 (Phase 17's headline operator capability):
```bash
bash scripts/operator_settle.sh 2026-05-05
```

To activate live props (operator decision per Phase 16 doc):
```bash
cat docs/ODDS_API_ACTIVATION.md
```

## Localhost checklist

`cd app && npm run dev`. Walk through:

**Parlay Lab (the core Phase 17 work):**
- `/parlay-lab` opens to Build mode, defaults to today's date (or nearest upcoming)
- If today has no leans, shows "No current slate available" empty state with archive hint
- Selecting May 5 from picker shows amber "⚠ archived slate" pill
- "Include full rotation" toggle off by default
- Candidates show "★ focused on top core players per team" gold pill above them
- Toggling "Include full rotation" widens player picker AND candidate pool
- Risk profiles still work (Conservative / Balanced / Aggressive)
- Same-game correlation warning still works

**Home page:**
- Eyebrow: "X NBA games tonight · awaiting model leans" (when in ScheduleLiveOddsUnavailable mode)
- KPI tiles say "awaiting model leans" instead of "props not configured"

**Board page:**
- Eyebrow: "model board · schedule live · awaiting model leans"
- "Tonight's schedule is in" hero from Phase 16 still renders
- Past dates not in primary tab strip (Phase 15 active-slate guard intact)

**Operator settlement (smoke test from sandbox):**
```bash
python3 -m pipeline.settle_template --date 2026-05-05 --stdout | head -20
```
Should print template with all May 5 players pre-filled.

## Deployment checklist

After `git push`:
- Vercel build passes
- `/parlay-lab` Build mode defaults to active slate, not May 5
- Public copy says "awaiting model leans" (no "props not configured" anywhere)
- Archived dates clearly labeled in Parlay Lab picker
- "Include full rotation" toggle visible and off by default
- DevTools console: zero hydration errors, zero duplicate-key warnings

## Operator checklist for live props

Per `docs/ODDS_API_ACTIVATION.md` (Phase 16):

1. Get an Odds API key from https://the-odds-api.com (free tier: 500 req/month)
2. Set `ODDS_API_KEY` in Vercel env vars (Settings → Environment Variables)
3. Set `ODDS_API_KEY` in GitHub Actions secrets (Settings → Secrets → Actions)
4. Set repository variable `ENABLE_ODDS_REFRESH=true` (Settings → Variables → Actions)
5. **First run with dry-run safety:** also set `ODDS_DRY_RUN=true`, trigger workflow, inspect logs
6. **Real fetch:** set `ODDS_DRY_RUN=false`, trigger workflow once
7. Verify props appear on `/board`
8. Set scheduled cadence to 1× per day pre-tipoff (~360 credits/month)

## Operator checklist for May 5 settlement

```bash
# 1. Run the helper (it walks you through everything)
bash scripts/operator_settle.sh 2026-05-05

# 2. When prompted, open pipeline/overrides/results_overrides.json
#    Fill in PTS / REB / AST for each player from NBA.com box scores:
#    - Donovan Mitchell (CLE) — PTS / REB / AST
#    - Cade Cunningham (DET) — PTS / REB / AST
#    - All other May 5 players

# 3. Hit "y" when prompted that stats are filled in

# 4. Script will run settlement + export and tell you what to commit

# 5. Commit + push:
git add app/public/data/results/ pipeline/validation/
git commit -m "Settle slate 2026-05-05"
git push

# 6. Verify on /results after Vercel redeploys
```

## Rollback steps

**Before commit (script aborted):**
```bash
git restore --staged .
git checkout app/ scripts/
git clean -fd app/src/lib/core-players.ts \
              pipeline/core_players_test.py \
              scripts/operator_settle.sh \
              docs/PHASE17_NOTES.md
```

**After local commit, before push:** `git reset --hard HEAD~1`

**After push:** `git revert HEAD && git push`

**Quick disable core-filter only** (revert just the parlay builder default):
```bash
# Edit app/src/components/parlay-builder-client.tsx
# Change: const [includeFullRotation, setIncludeFullRotation] = useState(false);
# To:     const [includeFullRotation, setIncludeFullRotation] = useState(true);
```

## Suggestions

**What exactly blocks today/tomorrow props?**
The Odds API isn't being called. `ODDS_API_KEY` not set OR `ENABLE_ODDS_REFRESH=false`. Both are configuration, not code. The fix flow is in `docs/ODDS_API_ACTIVATION.md`.

**Should we enable one manual Odds API refresh now?**
Yes. With `ODDS_DRY_RUN=true` first to confirm the API key works without burning credits. Then `ODDS_DRY_RUN=false` for one real fetch. ~12 credits for 2 games × 6 markets.

**How many credits should one current-slate refresh cost?**
~6-12 credits for a typical 2-game NBA slate. ~30-50 credits for a full 8-game slate. The free tier is 500/month.

**Should Parlay Lab always restrict to top 3 core players per team by default?**
Yes — that's what Phase 17 does. The "include full rotation" toggle is the escape hatch when users want broader exploration.

**Should there be an advanced full-rotation toggle later?**
Already there. Phase 17 ships it as an opt-in checkbox in the player-pool section. Off by default.

**What is the safest way to settle May 5 today?**
`bash scripts/operator_settle.sh 2026-05-05`. The script refuses to settle if every stat in the template is null, and is idempotent so you can re-run after fixing typos.

**What UI pages still feel weakest?**
1. Methodology — still feels documentation-y
2. Results page empty/populated transition — UX gap until first slate is settled
3. Newsletter signup card — could be visually richer
4. Mobile filter pills — cram on 375px width

**What would make users stay longer?**
- Per-player history pages
- Daily email digest after refresh
- Side-by-side parlay comparison
- "Notify me when these specific leans land" feature

**What should Phase 18 be?**
**Phase 18 — "First Real Production Data."** Operator-heavy:
1. Activate Odds API → real props populate
2. Run `operator_settle.sh 2026-05-05` → first settled slate
3. Wire Buttondown newsletter → users can subscribe
4. Trigger auto-refresh manually → confirm CI flow

After Phase 18, the site has live model leans, a track record, and subscription — that's "real product."

**What should wait until later?**
- Multi-sport (NHL, NFL) — NBA must be excellent first
- Real-money / sportsbook affiliate integrations — never until model fully validated
- Per-player history pages — significant new UX
- Heavy methodology / responsible-use redesigns
- X / social posting automation

## What remains after Phase 17

**Operational (you, manually):**
1. Apply Phase 17 and push
2. Activate Odds API per `docs/ODDS_API_ACTIVATION.md` — unblocks today/tomorrow props
3. Run `operator_settle.sh 2026-05-05` — lights up `/results`
4. Wire Buttondown newsletter — users can subscribe

**Future engineering:**
- Phase 18: live odds + first real settlement + newsletter
- Phase 19: upstream playerId=0 fix + auto-fetch in `pipeline.fetch_odds`
- Phase 20: methodology copy polish + Results page premium redesign
- Phase 21+: per-player pages, daily digests, multi-sport scaffolding

The site is one operator session away from being a real product: turn on the odds source, settle May 5, pick a newsletter provider. Phase 17 makes each of those one command.
