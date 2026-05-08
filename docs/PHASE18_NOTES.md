# Phase 18 — production data flow, results, newsletter wiring, UX

This is a **focused Phase 18** — not the 5-subphase mega-package the user prompt described, because most of those items are operator work the apply script can't perform from sandbox. What it CAN do is unblock everything: the workflow no-op that was preventing live props is replaced with the real call, an operator diagnostic tells you exactly what's blocking props in plain English, Buttondown is wired with a one-env-var activation path, and the methodology + responsible-use pages get the futuristic hero treatment for visual consistency. **646 Python assertions across 15 suites, all green.** Zero Odds API credits.

## Summary

- **Workflow paid step is no longer a no-op.** Replaced the Phase 14 placeholder with a real `pipeline.generate_daily_board` invocation. Today's slate (and tomorrow's, opportunistically) gets generated when `ENABLE_ODDS_REFRESH=true` and the API key is set. Bails cleanly with an actionable message when the key is missing.
- **Operator diagnostic** (`pipeline/diagnose_props.py`) tells you exactly what's blocking props in plain English. Zero credits used. Run it locally or in CI.
- **Buttondown one-env-var activation.** Set `NEXT_PUBLIC_BUTTONDOWN_USERNAME` in Vercel and the newsletter goes live next deploy. No code edit needed.
- **Premium hero treatment** extended to Methodology + Responsible Use pages — futuristic grid background, pulsing gold pill, consistent typography.
- **38 new test assertions** for playerId coverage; total **646 across 15 suites**.

## Current live-site audit

| User-reported issue | Phase 18 status |
|---|---|
| Today/tomorrow props not visible | **Unblocked.** Workflow now actually fetches when `ENABLE_ODDS_REFRESH=true` + `ODDS_API_KEY` set. Operator must enable. |
| Results empty (May 5 unsettled) | **Operator-only.** Phase 17's `scripts/operator_settle.sh 2026-05-05` is the path. Can't be done from sandbox without fabricating stats. |
| recent10 coverage low (~12%) | **Diagnosed.** Root cause is missing playerIds upstream. Can't be fully fixed without nba_api regenerate, which is operator work. Phase 18 ships the regression test that locks the threshold. |
| Parlay Lab uses archived May 5 | Already fixed in Phase 17. Phase 18 doesn't change parlay logic. |
| Newsletter is just a foundation | **Wired.** Buttondown activates via `NEXT_PUBLIC_BUTTONDOWN_USERNAME` env var. |
| UI inconsistent across pages | Methodology + Responsible Use upgraded. Other pages already done. |
| Public QA | Verified — no admin phrases on any public page. |

## Why today/tomorrow props are not visible

Three blockers, in order. Run `python -m pipeline.diagnose_props` to confirm exactly which apply to your environment:

1. **`ODDS_API_KEY` not set** in GitHub Actions secrets and/or Vercel env vars
2. **`ENABLE_ODDS_REFRESH ≠ 'true'`** in repository variables (default is `false`)
3. **Workflow paid step was a no-op** — fixed by Phase 18

Phase 18 fixes #3. #1 and #2 are configuration — covered in `docs/ODDS_API_ACTIVATION.md` (Phase 16).

## Live odds activation plan

Step-by-step (operator):

1. Visit https://the-odds-api.com — sign up (free tier: 500 requests/month)
2. Copy your API key
3. **GitHub:** Settings → Secrets and variables → Actions → New repository secret
   - Name: `ODDS_API_KEY`
   - Value: your key
4. **Vercel:** Project → Settings → Environment Variables
   - Name: `ODDS_API_KEY`
   - Value: your key
   - Apply to: Production, Preview, Development
5. **GitHub variables:** Settings → Variables → Actions tab
   - `ENABLE_ODDS_REFRESH = true`
   - Leave `ODDS_DRY_RUN = true` for the first run
6. Trigger workflow manually: Actions → auto-refresh → Run workflow
7. Inspect logs — should show "ODDS_API_KEY=present", "ODDS_DRY_RUN=true"
8. If clean, set `ODDS_DRY_RUN = false` and trigger again
9. Verify props appear on `/board`

Ongoing cadence recommendation: **once daily ~1 hour before tipoff** (~12 credits/run × 30 days = 360/month). Stays under the 500/month free tier with buffer.

## May 5 settlement plan

Phase 17's `scripts/operator_settle.sh` already handles this. **Verbatim flow:**

```bash
bash scripts/operator_settle.sh 2026-05-05
```

The script:
1. Verifies the May 5 board exists
2. Generates a fresh template with all distinct players pre-filled
3. Pauses for the operator to fill in PTS / REB / AST from NBA.com
4. Validates ≥1 non-null stat (refuses to settle empty templates — prevents accidental no-op publish)
5. Runs `pipeline.settle_results --manual-only`
6. Runs `pipeline.export_results`
7. Prints `lifetime_summary.json` numbers
8. Prints commit/push instructions

Idempotent — re-running with corrected stats only rewrites May 5's rows.

## playerId/recent10 coverage findings

Current sandbox state (verified by `inspect_trends`):

```
2026-05-05.json   24 leans   3 with recent10   12% coverage
                  2 distinct playerIds   1 zero-pid lean
```

**Root cause:** the May 5 board was generated when nba_api was unavailable, so most leans got playerId=0. The `attach_recent10` step can only hydrate leans where playerId > 0.

**Fix path:**
1. Operator: ensure nba_api is in the workflow's pip install
2. Re-run `pipeline.generate_daily_board --date 2026-05-05` with nba_api available
3. Most playerIds will resolve correctly
4. Re-run `pipeline.attach_recent10` 
5. Coverage should jump to 80%+ on the May 5 board

**Phase 18 ships:**
- `pipeline.diagnose_props` — checks if nba_api is importable
- `pipeline.playerid_coverage_test` — locks the threshold (warns when <50%)

The actual board regeneration is operator work. Once nba_api is in the workflow env, the next refresh will fix coverage automatically.

## Parlay Lab current-props behavior

Unchanged from Phase 17. Already correct:
- Defaults to active slate (today / nearest upcoming)
- Top 3 core players per team filter on by default
- "Include full rotation" toggle off by default
- Archived dates labeled
- Same-game correlation warnings
- Risk profiles (Conservative / Balanced / Aggressive)

Once live odds activate per Phase 18's workflow change, Parlay Lab will start generating candidates from real today's leans automatically. **No code change needed at activation.**

## Newsletter provider recommendation

**Buttondown.** Reasons:
- **Static-export-friendly** — uses a public form-action endpoint, no API routes needed (Next.js's `output: "export"` precludes API routes)
- **No frontend secrets** — the embed-subscribe URL is meant to be public
- **Free tier** — 100 subscribers free, $9/mo for 1000. More than enough for early stage.
- **Handles unsubscribe automatically** — built into every email
- **Simple setup** — 5 minutes from signup to first subscriber working
- **Beehiiv** is the strong runner-up but requires a server-side API key to handle subscriptions, which doesn't fit static export without deploying a separate Vercel Function. More moving parts.

**Phase 18 wiring:** `app/src/lib/newsletter.ts` now reads `NEXT_PUBLIC_BUTTONDOWN_USERNAME` at build time. Set it in Vercel env vars and the newsletter activates on next deploy. **No code edit needed.**

## Premium UI changes

Pages upgraded to use the futuristic-grid hero treatment:
- **Methodology** — eyebrow now reads "methodology · transparent by design" with pulsing gold pill, hero gets `vault-hero-grid` background
- **Responsible Use** — eyebrow reads "responsible use · educational only" with pulsing gold pill, hero gets `vault-hero-grid`

Both are now visually consistent with home + board + parlay-lab heroes from Phases 15–17.

What's NOT changed this phase (defer): Newsletter signup card visual richness, footer redesign, mobile filter pills, Results page redesign (will polish once first slate is settled and there's actual content to design around).

## Bugs fixed

1. **Workflow paid step was a no-op** — Phase 14 placeholder echo replaced with real generate_daily_board call
2. **No operator diagnostic for "why are props missing"** — Phase 18 ships diagnose_props
3. **Buttondown not wired** — now activates via single env var
4. **Methodology + Responsible Use heroes inconsistent** — now match other premium pages

## Files added

| Path | Purpose |
|---|---|
| `pipeline/diagnose_props.py` | Operator diagnostic — what's blocking props |
| `pipeline/playerid_coverage_test.py` | 38 regression assertions for coverage |
| `docs/PHASE18_NOTES.md` | Release notes |

## Files modified

| Path | Change |
|---|---|
| `.github/workflows/auto-refresh.yml` | Paid step now calls `pipeline.generate_daily_board` with full env |
| `app/src/lib/newsletter.ts` | Reads `NEXT_PUBLIC_BUTTONDOWN_USERNAME` at build time |
| `app/src/app/methodology/page.tsx` | Futuristic grid hero |
| `app/src/app/responsible-use/page.tsx` | Futuristic grid hero |
| `scripts/run_all_tests.sh`, `scripts/automation_refresh.sh` | Wire playerid_coverage_test |

## Files deleted

None.

## Tests run

15 Python suites, **646 assertions, all green**:

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
✓ pipeline.core_players_test            40
✓ pipeline.playerid_coverage_test       38  ← NEW
                                       ───
                              TOTAL    646
```

## Typecheck result

Sandbox can't run `npm run typecheck` (registry blocked). Static analysis verified:
- `newsletter.ts` env-var read is type-safe (`process.env.X` is `string | undefined`)
- All hero markup uses existing classes (`vault-hero-grid`, `vault-pulse`)
- No new dependencies
- Brace/paren balance verified on all modified files

Apply script runs typecheck on your Mac.

## Build result

Deferred to your Mac. No new dependencies; Next.js will bake `NEXT_PUBLIC_BUTTONDOWN_USERNAME` at build time if set.

## Smoke result

✓ Passed in sandbox.

## Exact commands to run

```bash
cd ~/Downloads/gametimepicks
bash ~/Downloads/apply_phase18_production_data_results_newsletter_ui.sh
```

After local commit:
```bash
git push
```

To diagnose blockers (local or CI):
```bash
python3 -m pipeline.diagnose_props
```

To settle May 5 (operator):
```bash
bash scripts/operator_settle.sh 2026-05-05
```

To activate Buttondown (operator):
```
Vercel → Settings → Environment Variables
  Name:  NEXT_PUBLIC_BUTTONDOWN_USERNAME
  Value: <your buttondown username>
  Apply to: Production
```

## Localhost checklist

`cd app && npm run dev`. Walk through:

- `/methodology` — pulsing gold "methodology · transparent by design" pill in hero, futuristic grid background
- `/responsible-use` — pulsing gold "responsible use · educational only" pill, futuristic grid
- `/parlay-lab` — Build mode still defaults to active slate (Phase 17 still intact)
- `/board` — premium "props coming soon" hero still renders (Phase 16 still intact)
- `/` — eyebrow says "awaiting model leans" not "props not configured" (Phase 17 still intact)

Run diagnostic:
```bash
python3 -m pipeline.diagnose_props
```
Should report 3 blockers (no key, refresh disabled, nba_api not in venv) — that's expected pre-activation.

## Deployment checklist

After `git push`:
- Vercel build passes
- Newsletter signup form activates IF `NEXT_PUBLIC_BUTTONDOWN_USERNAME` is set, otherwise stays in "coming soon" state
- DevTools console: zero hydration errors, zero duplicate-key warnings
- Methodology + Responsible Use pages render with new heroes

After Odds API activation:
- Trigger workflow manually with `ODDS_DRY_RUN=true` first
- Logs should show "ODDS_API_KEY=present"
- No props expected yet (dry-run)
- Set `ODDS_DRY_RUN=false`, trigger again
- Props should appear on `/board` after the workflow's auto-commit

## Operator checklist for live odds

```
1. https://the-odds-api.com → sign up → copy key
2. GitHub Settings → Secrets and variables → Actions → New secret
     Name:  ODDS_API_KEY
     Value: <your key>
3. Vercel Project Settings → Environment Variables
     Name:  ODDS_API_KEY
     Value: <your key>
     Apply: Production, Preview, Development
4. GitHub Settings → Variables → Actions tab
     ENABLE_ODDS_REFRESH = true
     ODDS_DRY_RUN        = true     ← keep TRUE for first run
5. Actions → auto-refresh → Run workflow
6. Inspect logs:
   ✓ "ODDS_API_KEY=present"
   ✓ "ODDS_DRY_RUN=true"
   ✓ "✓ paid odds refresh complete"
7. Set ODDS_DRY_RUN=false
8. Run workflow again
9. Visit /board — props should appear
10. Set scheduled cadence (default 9 daily times → reduce to 1×/day pre-tipoff)
```

## Operator checklist for May 5 settlement

```
bash scripts/operator_settle.sh 2026-05-05
```

When prompted, open `pipeline/overrides/results_overrides.json` and fill in PTS / REB / AST for each player from NBA.com box scores. Press y to continue. Script handles settle + export + tells you what to commit.

## Operator checklist for newsletter provider

**Buttondown (5 minutes):**

1. Visit https://buttondown.email → sign up → confirm email
2. Note your username (in the dashboard URL, e.g. `dashboard.buttondown.email/yashwantbalaji` → username is `yashwantbalaji`)
3. **Vercel:** Settings → Environment Variables
   - Name: `NEXT_PUBLIC_BUTTONDOWN_USERNAME`
   - Value: `<your username>`
   - Apply to: Production
4. Trigger a deploy (push any commit)
5. Visit `/` and scroll to newsletter signup → enter test email
6. Check your Buttondown dashboard → you should see the test subscription
7. Welcome email + double-opt-in are configured in Buttondown's UI

**No code change needed.** The `newsletter.ts` change in Phase 18 already reads the env var at build time.

## Rollback steps

**Before commit (script aborted):**
```bash
git restore --staged .
git checkout app/ scripts/ pipeline/ .github/
git clean -fd pipeline/diagnose_props.py \
              pipeline/playerid_coverage_test.py \
              docs/PHASE18_NOTES.md
```

**After local commit, before push:** `git reset --hard HEAD~1`

**Quick disable Buttondown** (revert to "coming soon"):
- Remove `NEXT_PUBLIC_BUTTONDOWN_USERNAME` env var from Vercel
- Trigger redeploy

**Quick disable workflow change** (revert to no-op paid step):
- Edit `.github/workflows/auto-refresh.yml`
- Replace the new paid step with the original `echo "no-op"` block

## Suggestions

**What exactly blocks today/tomorrow props?**
Run `python -m pipeline.diagnose_props` to get a precise read. Most likely: `ODDS_API_KEY` not set + workflow paid step was a no-op (Phase 18 fixes the second).

**Should we enable one manual Odds API refresh now?**
Yes — start with `ODDS_DRY_RUN=true` to verify the key works. Then `ODDS_DRY_RUN=false` for one real fetch. ~6-12 credits.

**How many credits should one current-slate refresh cost?**
~6-12 for a 2-game slate. ~30-50 for a full 8-game slate.

**Should live odds refresh run once daily or every few hours?**
Once daily, ~1 hour before tipoff (typically 6 PM ET = 22:00 UTC). 360 credits/month vs the 500 free-tier ceiling. Hourly during games would burn through the tier in 6 days.

**What is the safest way to settle May 5 immediately?**
`bash scripts/operator_settle.sh 2026-05-05`. Phase 17 makes this one command.

**Which newsletter provider should we choose and why?**
Buttondown. Static-export-friendly, no API routes needed, no frontend secrets, handles unsubscribe automatically, free tier covers first 100 subscribers.

**What is the fastest way to improve recent10 coverage for star players?**
1. Ensure nba_api is in the workflow's `pip install` step
2. Trigger workflow manually after activation
3. Coverage should jump from 12% to 80%+ on freshly generated boards (matched playerIds = recent10 hydrates)

**Which UI pages still feel weakest?**
1. Newsletter signup card visual richness
2. Results page (will polish once there's settled data)
3. Footer
4. Mobile filter pills (cramped at 375px)

**What would make users stay longer?**
- Per-player history pages (last 10 games + hit rate by market)
- Daily email digest after refresh succeeds
- Side-by-side parlay comparison
- "Notify me when these specific leans land" feature

**What should Phase 19 be?**
**Phase 19 — "First Real Production Slate."** Operator-driven phase:
1. Activate Odds API per Phase 18's checklist
2. Run workflow with dry-run, then real
3. Settle May 5 with operator_settle.sh
4. Activate Buttondown
5. Validate end-to-end: live props on `/board`, real results on `/results`, working newsletter

**What should wait until later?**
- Multi-sport (NHL, NFL) — NBA must be excellent first
- Real-money / sportsbook affiliate integrations — never until model fully validated
- Per-player history pages
- Daily email automation (depends on Phase 19 newsletter activation)
- X / social posting
- Sportsbook scraping (explicitly off-limits)
- Heavy methodology copy expansion

## What remains after Phase 18

**Operational (you, manually):**
1. Apply Phase 18 and push
2. Run `python -m pipeline.diagnose_props` — confirms 3 blockers
3. Activate Odds API per checklist above
4. Run `bash scripts/operator_settle.sh 2026-05-05`
5. Activate Buttondown via single env var

**Future engineering:**
- Phase 19: validate the full production flow end-to-end
- Phase 20: per-player history pages + daily email automation
- Phase 21: methodology copy polish + Results page redesign
- Phase 22+: multi-sport scaffolding

The site is one operator session away from "real product." Phase 18 makes the diagnostic + activation flow as concrete as possible without burning paid API credits or fabricating data.
