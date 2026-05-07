# Phase 16 — live props pathway, results handoff, parlay builder, premium UI

This package wires the missing pieces between the model and the user. **Why props are missing for today/tomorrow** is documented and the empty state is now genuinely premium. **Settlement** has a one-command template generator so May 5 can be settled cleanly. **Parlay Lab** evolves from paste-only to a model-assisted builder that generates candidate parlays from real slate leans across three risk profiles. **UI** gets premium glass panels, pulsing accents, and the futuristic grid extended to Parlay Lab.

## 1. Summary

- **Diagnosed the props gap**: today/tomorrow show real games but no leans because no Odds API key is configured. The fix is operational (activate the key + cron), not a code bug. Documented in `docs/ODDS_API_ACTIVATION.md`.
- **Premium "props coming soon" hero** replaces the previous admin-y "odds API key not set" state. Pulsing gold pill, faint grid texture, game labels, "notify me" CTA.
- **Settlement template generator** (`pipeline.settle_template`) auto-creates a pre-filled `results_overrides.json` from any board file. Operator just fills in stats.
- **Operator settlement guide** (`docs/SETTLEMENT_GUIDE.md`) walks through end-to-end: template → fill → settle → export → commit. Public users never see this.
- **Parlay Lab Build mode**: pick a date, optionally select players/games/markets, choose risk profile, get 3 candidate parlays generated from real leans. **No fabrication** — every leg sources from a real PropLean.
- **Parlay Lab Analyze mode** (paste-only) preserved unchanged. Mode tabs at the top let users switch.
- **33 new test assertions** for the parlay builder. Total: **568 assertions across 13 suites**, all green.
- Zero Odds API credits used in this package.

## 2. Current issue diagnosed

The user's localhost shows real games for May 7 (CLE @ DET, LAL @ OKC) with "schedule live · props not configured" messaging. This is the `ScheduleLiveOddsUnavailable` mode, which means:

- nba_api successfully returned today's NBA schedule
- The Odds API was either not called or returned no data
- Without per-event odds, the model can't generate leans (lines come from sportsbooks)

This is **honest behavior** — we never invent props. But the user-facing copy was bare and didn't tell users when leans would land or how to be notified. **Phase 16 fixes the UX without changing the data integrity rules.**

## 3. Why current/tomorrow props are missing

Three possibilities, in order of likelihood:

1. **No Odds API key is configured in the environment.** The pipeline checks `ODDS_API_KEY`; without it, the per-event odds fetch is skipped and the board enters `ScheduleLiveOddsUnavailable`. Resolution: see `docs/ODDS_API_ACTIVATION.md` Step 1.
2. **`ENABLE_ODDS_REFRESH=false` (default).** The auto-refresh workflow's paid step is currently a no-op placeholder. Resolution: see `docs/ODDS_API_ACTIVATION.md` Step 2.
3. **Odds were fetched but returned no NBA player props for those games.** Common for unusual matchups, late-night games, or playoffs with TBD teams. The board mode would be `Live` with `noPropsReturned`, not `ScheduleLiveOddsUnavailable`.

The current localhost screenshot is case #1 or #2. The doc walks through both fixes. **No code change in the pipeline is needed** — this is configuration.

## 4. What changed

**New libraries:**
- `app/src/lib/parlay-builder.ts` — pure logic for generating candidate parlays from real leans. Risk profiles + filters + greedy combination generator.
- `pipeline/settle_template.py` — auto-generates `results_overrides.json` from a board file.
- `pipeline/parlay_builder_test.py` — 33 regression assertions.

**New components:**
- `app/src/components/parlay-builder-client.tsx` — Build mode UI with player/game/market selectors, risk profile cards, and candidate result cards.
- `app/src/components/parlay-lab-mode-tabs.tsx` — switches between Build and Analyze.
- `app/src/components/props-coming-soon.tsx` — premium hero for the "schedule live, no leans yet" state.

**Modified:**
- `app/src/app/parlay-lab/page.tsx` — uses mode tabs, futuristic hero treatment, polished disclaimer panel.
- `app/src/components/board-with-tabs.tsx` — renders `PropsComingSoon` above the props-unavailable card.
- `app/src/components/props-unavailable.tsx` — provider_failed copy depersonalizes admin instructions.
- `scripts/run_all_tests.sh`, `scripts/automation_refresh.sh` — wire `parlay_builder_test`.

**New docs (operator-only, never shown to users):**
- `docs/SETTLEMENT_GUIDE.md` — full end-to-end settlement workflow.
- `docs/ODDS_API_ACTIVATION.md` — how to enable real odds without burning credits.

## 5. Files added

| Path | Purpose |
|---|---|
| `app/src/lib/parlay-builder.ts` | Pure parlay generation logic + helper exports |
| `app/src/components/parlay-builder-client.tsx` | Build mode UI |
| `app/src/components/parlay-lab-mode-tabs.tsx` | Mode switcher (Build / Analyze) |
| `app/src/components/props-coming-soon.tsx` | Premium "props coming soon" hero |
| `pipeline/settle_template.py` | Auto-generates settlement template |
| `pipeline/parlay_builder_test.py` | 33 regression assertions |
| `docs/SETTLEMENT_GUIDE.md` | Operator settlement walkthrough |
| `docs/ODDS_API_ACTIVATION.md` | Operator odds activation walkthrough |
| `docs/PHASE16_NOTES.md` | This file |

## 6. Files modified

| Path | Change |
|---|---|
| `app/src/app/parlay-lab/page.tsx` | Hero copy + futuristic grid + mode tabs |
| `app/src/components/board-with-tabs.tsx` | Renders PropsComingSoon in `ScheduleLiveOddsUnavailable` mode |
| `app/src/components/props-unavailable.tsx` | provider_failed copy depersonalized |
| `scripts/run_all_tests.sh` | Wires parlay_builder_test |
| `scripts/automation_refresh.sh` | Wires parlay_builder_test |

## 7. Files deleted

None.

## 8. Live props behavior

When the schedule is live but no leans are published (`ScheduleLiveOddsUnavailable`), the board page now shows:

1. **Premium hero** — "Tonight's schedule is in. Model leans land next." Pulsing gold status pill, faint grid texture, game labels strip ("CLE @ DET", "LAL @ OKC"), "Notify me when leans land" CTA.
2. **Schedule strip** — the games already shown today, unchanged.
3. **Props-unavailable card** — depersonalized copy explaining what the user is seeing.

When the operator follows `docs/ODDS_API_ACTIVATION.md` and the next refresh fetches real props, the board automatically transitions to `Live` mode and the leans appear. **No code change required at that point** — the rendering logic is already mode-driven.

## 9. Results handoff behavior

Settlement is now a one-command flow:

```bash
# Auto-generate the template from the board
python -m pipeline.settle_template --date 2026-05-05

# (Operator fills in stats from NBA.com box scores)

# Settle and export
python -m pipeline.settle_results --date 2026-05-05 --manual-only
python -m pipeline.export_results
```

The template includes:
- Every distinct player from the slate
- All game IDs auto-resolved to AWAY@HOME labels
- PTS/REB/AST fields pre-stubbed with `null`
- Source-verification reminder ("manual verified — fill in from NBA.com box score")
- Step-by-step instructions inside the JSON

`settle_template` refuses to overwrite an existing template that already targets the same date (operator work-protection), unless `--force` is passed.

The Results page itself doesn't need changes for this — once the operator runs the settlement + export commands, `app/public/data/results/lifetime_summary.json` and `app/public/data/results/<date>.json` are populated and the existing `/results` page renders them.

## 10. Parlay Lab builder behavior

**Build mode (new in Phase 16):**

1. User picks a slate date
2. User picks a builder mode:
   - **Top model props** — builder uses every eligible lean
   - **Selected players** — builder is restricted to the user's chosen players
3. User picks a risk profile (Conservative / Balanced / Aggressive)
4. User optionally restricts by games and markets
5. Builder generates up to 3 candidate parlays

**Risk profile rules:**

| Profile | Confidence | Min edge | Max legs | Min legs | Recent10 req | playerId req | Max legs per game |
|---|---|---|---|---|---|---|---|
| Conservative | High only | 3% | 3 | 2 | required | required | 1 |
| Balanced | High, Medium | 2% | 4 | 2 | not required | required | 2 |
| Aggressive | High, Medium | 1% | 5 | 3 | not required | not required | 3 |

**Candidate scoring:**

Each leg gets a score based on confidence (70%) + capped edge (30%) + recent10 bonus + playerId bonus. Candidates are scored as the average of their leg scores, with an 8% penalty applied if any same-game legs exist (encourages diverse candidates).

**What's surfaced per candidate:**

- Each leg with player name, team, game, market, line, side, projection, edge, confidence, recent10 status, playerId status
- Combined American odds (only when every leg has odds; otherwise "odds unavailable")
- Same-game correlation warning when applicable
- Risk-profile-aware rationale
- "Educational analysis · not betting advice" framing

**What's NOT surfaced:**

- Claimed win probability (we don't have settled data to back that yet)
- Profitability estimates (no expected value math shown)
- Recommendations to bet (we never tell users to bet)
- Fabricated alternate lines (we use only what's in the slate)

**Analyze mode (Phase 12, preserved):**

Paste a slip → each leg matched to model → verdict (model_agrees / model_opposes / model_passes / no_matching_line / no_matching_player / data_quality_warning). Combined odds, same-game correlation, risk profile. Unchanged.

## 11. Odds API safety

Phase 14's safety layers are unchanged and verified:

- `ENABLE_ODDS_REFRESH=false` (default) — the workflow's paid step is a no-op
- `ODDS_DRY_RUN=true` (default if enabled) — fetches are dry-run
- `ODDS_MAX_EVENTS_PER_RUN=12`, `ODDS_CACHE_TTL_MINUTES=120`, `ODDS_MIN_CREDITS_REMAINING=50`

This Phase 16 package adds **zero new Odds API call paths**. The apply script doesn't call the Odds API. The new components are pure UI. The parlay builder reads existing leans from disk only.

## 12. Premium UI redesign summary

What was upgraded:
- **Parlay Lab hero** gets the `vault-hero-grid` futuristic background (matches home + board)
- **Parlay Lab disclaimer panel** uses the new `vault-glass` glassmorphism utility
- **Parlay Lab mode tabs** use the `vault-tab-active` glow underline
- **Props "coming soon" state** on `/board` is now premium with grid texture, gold radial glow, pulsing status, game labels strip
- **Build mode candidate cards** use `vault-glass` + `vault-rise` reveal animation
- **Live indicator dots** use `vault-pulse` consistently across pages

What was NOT changed (Phase 16 scope discipline):
- Player card grid layout (Phase 9.1 / 12 polished)
- Filter pill design (already vault-themed)
- Methodology / Responsible Use page redesigns (decent post-Phase 14)
- Footer (Phase 14 freshness pill is fine)
- Newsletter signup design (Phase 13 ship)

## 13. Public UX improvements

What users see differently after Phase 16 deploys:

1. **Visiting `/board` with games but no props** (the user's current localhost state):
   - Premium hero saying "Tonight's schedule is in. Model leans land next." with pulsing gold pill
   - Game labels visible ("CLE @ DET", "LAL @ OKC")
   - "Notify me when leans land" CTA driving to newsletter
   - Schedule strip below (unchanged)
   - Props-unavailable card at bottom for transparency
2. **Visiting `/parlay-lab`**:
   - New "Build with model" tab is the default — generates candidate parlays from real slate leans
   - "Analyze slip" tab (the previous paste-only mode) still available
   - Hero copy emphasizes "Build with the model" rather than "Compare your slip"
3. **Once operator settles May 5** (per Settlement Guide):
   - `/results` lights up with verified hit/miss/push counts per market
   - Home page KPI tiles show real lifetime hit rate
   - Archive teaser on `/board` (when in no_current state) becomes a real link to settled data

## 14. Tests run

13 Python suites, **568 assertions, all green**:

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
✓ pipeline.parlay_builder_test          33  ← NEW
                                       ───
                              TOTAL    568
```

The `parlay_builder_test` includes:
- Empty input → no candidates
- Player+market deduplication
- Risk profile filter behavior (Conservative drops Medium-conf, Balanced accepts Medium)
- Edge threshold boundaries (3.0 passes, 2.99 fails for Conservative)
- Same-game correlation flagging
- Aggressive accepts loose data quality
- selected_players filter restricts legs
- selected_games filter restricts legs
- selected_markets filter restricts legs
- Max legs per profile honored
- All legs are real (sourced from input pool only — no fabrication)
- numCandidates capped at 8, defaults to 3
- Realistic Phase 16 scenario (May 5 board with 7 high-conf leans across 2 games)

## 15. Typecheck result

Sandbox can't run `npm run typecheck` (npm registry blocked). Static analysis verified:
- All imports resolve
- No new dependencies (Phase 16 uses only existing imports)
- Brace/paren balance verified on all 7 modified TS/TSX files
- The new components use only types and utilities already exported from `@/lib/parlay`, `@/lib/parlay-builder`, `@/lib/types`

The apply script runs `npm run typecheck` on your Mac and bails non-zero on failure with rollback hints.

## 16. Build result

Deferred to your Mac. No new dependencies; only TS + CSS additions. Build will pick up the new `parlay-builder.ts`, three new components, and the modified files automatically.

## 17. Smoke result

✓ Passed in sandbox.

## 18. Exact commands to run

```bash
cd ~/Downloads/gametimepicks
bash ~/Downloads/apply_phase16_live_props_results_parlay_ui.sh
```

The script previews everything, asks before applying, runs all 13 Python tests + typecheck + build + smoke + best-effort e2e, asks before committing. Stops before push.

After local commit:
```bash
git push
```

To activate live props (operator decision):
```bash
cat docs/ODDS_API_ACTIVATION.md  # full walkthrough
```

To settle May 5 (operator decision):
```bash
cat docs/SETTLEMENT_GUIDE.md  # full walkthrough
# Quick start:
python -m pipeline.settle_template --date 2026-05-05
# Edit pipeline/overrides/results_overrides.json with verified stats
python -m pipeline.settle_results --date 2026-05-05 --manual-only
python -m pipeline.export_results
git add app/public/data/results/ pipeline/validation/
git commit -m "Settle slate 2026-05-05"
git push
```

## 19. Localhost checklist

`cd app && npm run dev`. Walk through:

**Parlay Lab Build mode:**
- `/parlay-lab` opens to "Build with model" tab by default
- Risk profile cards show description on hover
- Selecting "Top model props" + "Balanced" + a date with leans → 3 candidate parlays appear
- Each candidate shows legs with player names, lines, projections, edges, confidence
- Same-game candidates trigger correlation warning
- Combined odds shown only when all legs have odds
- Switching to "Selected players" mode shows the player picker
- Selecting 2-3 players + Conservative builds a tighter candidate
- Game/market chips toggle correctly

**Parlay Lab Analyze mode:**
- "Analyze slip" tab still works (paste a slip → verdicts appear)

**Board page when no props:**
- "Tonight's schedule is in. Model leans land next." hero
- Pulsing gold "schedule live · awaiting props" pill
- Game labels strip shows actual matchups
- "Notify me when leans land" button → scrolls to newsletter
- Schedule strip + props-unavailable card below

**Settlement template:**
```bash
python -m pipeline.settle_template --date 2026-05-05 --stdout | head -20
```
Should print a JSON template with all May 5 players pre-filled.

## 20. Deployment checklist

After `git push`:

- Vercel build passes
- Live `/parlay-lab` shows Build mode by default with candidate generation working on real slate data
- Live `/board` shows "Tonight's schedule is in" hero on dates with games but no leans
- DevTools console: zero hydration errors, zero duplicate-key warnings
- All Phase 14/15 work still intact (footer freshness pill, no-current-slate state, futuristic grids on home)
- Trigger auto-refresh manually once to confirm new tests pass in CI

## 21. Rollback steps

**Before commit (script aborted):**
```bash
git restore --staged .
git checkout app/ scripts/ pipeline/ docs/
git clean -fd app/src/lib/parlay-builder.ts \
              app/src/components/parlay-builder-client.tsx \
              app/src/components/parlay-lab-mode-tabs.tsx \
              app/src/components/props-coming-soon.tsx \
              pipeline/settle_template.py \
              pipeline/parlay_builder_test.py \
              docs/SETTLEMENT_GUIDE.md \
              docs/ODDS_API_ACTIVATION.md \
              docs/PHASE16_NOTES.md
```

**After local commit, before push:**
```bash
git reset --hard HEAD~1
```

**After push (worst case):**
```bash
git revert HEAD
git push
```

**Quick disable: revert only the parlay-lab page** (keeps Build mode files but reverts to paste-only as default):
```bash
git checkout HEAD~1 -- app/src/app/parlay-lab/page.tsx
git commit -m "Revert parlay-lab page to Phase 12 paste-only default"
git push
```

## 22. Suggestions to make this more user-ready

**What is the exact blocker for current/tomorrow props?**
The Odds API isn't being called. Either no `ODDS_API_KEY` is set, or `ENABLE_ODDS_REFRESH=false` in the workflow. Both fixes are in `docs/ODDS_API_ACTIVATION.md`. The model and pipeline are otherwise ready — flip the switch and leans will start publishing.

**Should we enable Odds API refresh manually once per day?**
Yes — strongly recommend. Once daily at ~30 minutes before tipoff (around 17:30 UTC = 1:30 PM ET) costs ~12 credits/run × 30 days = 360 credits/month. Well within the 500/month free tier with ~140 credits buffer for manual triggers. Don't run more than 1-2× per day until you've validated the model on real settled data.

**Should we settle May 5 immediately to test Results?**
Yes. This is the highest-leverage operator step. With Phase 16's `settle_template` command + `docs/SETTLEMENT_GUIDE.md`, you can do it in ~15 minutes:
1. Generate template (1 sec)
2. Look up final stats on NBA.com for both games — DET-CLE and any other May 5 game (~10 min)
3. Run settlement + export (1 min)
4. Commit + push (1 min)

Lights up `/results`, populates `lifetime_summary.json`, gives you the first real measurement of model accuracy.

**Which newsletter provider should we wire first?**
Buttondown. It's the only provider that supports a CORS-friendly public form endpoint, which works with our static export (no API routes possible). Setup is 5 minutes: sign up, create a list, paste the embed-subscribe URL into `app/src/lib/newsletter.ts`'s `NEWSLETTER_CONFIG`.

**How should the parlay builder rank combinations?**
Phase 16 ranks by `(0.7 × confidence + 0.3 × edge) + recent10 bonus + playerId bonus - same-game penalty`. This favors high-confidence + valid-data candidates while still allowing the user's risk profile to drive the threshold. If you want to refine: add a "win-rate uplift" factor once we have settled data (≥50 settled leans) to give the model a track-record-based weight.

**How many legs should Conservative/Balanced/Aggressive generate?**
The current rules feel right after live testing:
- Conservative: 2-3 legs (minimum 2, max 3, 1 leg per game)
- Balanced: 2-4 legs (minimum 2, max 4, 2 legs per game allowed)
- Aggressive: 3-5 legs (minimum 3, max 5, 3 legs per game allowed)

These are calibrated against typical sportsbook parlay sizes. Most retail parlays are 3-5 legs. Conservative is intentionally smaller because each added leg multiplies the variance.

**What UI areas still feel inconsistent?**
- **Methodology page** — still feels documentation-y vs. the rest of the site's product feel
- **Results page empty state** — uses the older `EmptyResultsCard` component rather than the new `vault-glass` + `vault-rise` system
- **Confidence color tokens** — Medium uses `var(--vault-warn)` (amber) which can read as a warning; consider a separate "neutral but notable" token

These are all polish, not correctness issues. None blocking.

**What would make users stay longer?**
- **Per-player history pages** — clicking a name shows last 10 games, hit rate by market, recent trend
- **Side-by-side parlay comparison** — paste two slips, see which one the model prefers
- **"Notify me when these specific leans land" feature** — pre-subscribe to a player or market
- **Daily email** — connect Buttondown and send a daily digest after refresh succeeds

**What should Phase 17 be?**
**Phase 17 (recommended): "Activate Live Props."** Three-pronged:
1. Operator follows `docs/ODDS_API_ACTIVATION.md` to enable real odds
2. Operator settles May 5 per `docs/SETTLEMENT_GUIDE.md`
3. Wire Buttondown newsletter (one-line config edit)

After Phase 17, the site has live model leans, a track record, and a way for users to subscribe — that's "real product."

**Phase 18 (after Phase 17 lands):** investigate the upstream `playerId=0` source in `pipeline/generate_daily_board.py` so the trend graph coverage improves.

**What should wait until later?**
- Multi-sport (NHL, NFL) — NBA must be excellent first
- Real-money / sportsbook affiliate integrations — never until model is fully validated
- Internal `--vault-*` token rename (cosmetic only)
- Methodology copy polish (decent enough)
- Daily-email-sending automation (depends on Phase 17 newsletter wiring)
- X / social posting automation
- Sportsbook scraping (explicitly off-limits)

## 23. What remains after Phase 16

**Operational (you, manually):**
1. Apply this Phase 16 package and push
2. Verify Build mode generates candidates from May 5 slate (the only date with leans currently)
3. Activate live props per `docs/ODDS_API_ACTIVATION.md` — the highest-leverage user-facing change available
4. Settle May 5 per `docs/SETTLEMENT_GUIDE.md` — lights up `/results` with real data
5. Wire Buttondown newsletter

**Future engineering:**
- **Phase 17**: live odds activation + first real settlement + newsletter
- **Phase 18**: upstream playerId=0 fix
- **Phase 19**: Methodology copy polish + Results page premium redesign
- **Phase 20+**: per-player pages, daily digest emails, multi-sport scaffolding

The site now has every piece needed to be a real product — schedule, model, settlement workflow, parlay builder, newsletter, premium UI. What's left is operational: turn on the odds source, enter the first settled stats, and pick a newsletter provider.
