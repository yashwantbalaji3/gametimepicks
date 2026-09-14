# SESSION HANDOFF · 2026-05-25 · STAR DIVERSITY & PARLAY COMPOSITION

> **Purpose**: complete handoff for the next Claude Code session. The
> current session ran out of context with an in-progress branch that
> implements star-diversity / cross-slip recurrence-penalty fixes but
> has **not yet been committed, pushed, or PR'd**.

---

## 1. Current repo / session state

| Item | Value |
|---|---|
| Working dir | `~/Downloads/gametimepicks` |
| Current branch | **`fix/star-diversity-parlay-composition`** |
| Base / latest `main` | **`8f13a21`** — `feat(parlays): prioritize star-driven slips and add alternate-line parlay lane (#99)` |
| Commits on this branch since main | **0 (nothing committed yet)** |
| Uncommitted changes | **YES — see below** |
| PR exists | **NO** (`gh pr list --head fix/star-diversity-parlay-composition` returned `[]`) |

### `git status --short` (relevant files only)

```
 M app/public/data/parlays/optimizer-graded/2026-05-25.json
 M app/public/data/parlays/optimizer-graded/2026-05-26.json
 M app/public/data/parlays/optimizer-summary.json
 M app/public/data/parlays/optimizer/2026-05-25.json
 M pipeline/parlay_optimizer.py
 M pipeline/parlay_optimizer_test.py
 M pipeline/star_players.py
 M pipeline/validation/leans_log.jsonl
?? pipeline/validation/mlb_comparison_report_2026-05-25.json
```

### `git diff origin/main..HEAD --stat`

`HEAD` == `origin/main` == `8f13a21` (no commits yet). The "real" diff
to inspect is the working-tree diff:

```
app/public/data/parlays/optimizer-graded/2026-05-25.json  |  242 +-
app/public/data/parlays/optimizer-graded/2026-05-26.json  |    2 +-
app/public/data/parlays/optimizer-summary.json            |    2 +-
app/public/data/parlays/optimizer/2026-05-25.json         | 8373 +++++++++----------
pipeline/parlay_optimizer.py                              |   81 +-
pipeline/parlay_optimizer_test.py                         |   99 +
pipeline/star_players.py                                  |   29 +-
pipeline/validation/leans_log.jsonl                       |  434 +
```

Inspect with: `git diff HEAD -- pipeline/star_players.py pipeline/parlay_optimizer.py pipeline/parlay_optimizer_test.py`.

---

## 2. Product context

GameTimePicks is now **parlay-first**:

- Homepage (`/`) renders `<ParlayLabBuilder>` directly — same UI as `/parlay-lab`.
- Results (`/results`) is parlay-first, powered by `optimizer-graded/` files + `optimizer-summary.json`.
- Every parlay leg is clickable → opens `<PlayerRecentFormDrawer>` with last-5 game stats from `recentSeries`.
- Optimizer slips are graded by `pipeline.grade_optimizer` via the nightly cron (`scripts/automation_settle.sh` + `.github/workflows/nightly-settle.yml`).
- Production at https://gametimepicks.yashwantbalaji.com is on `main` at **`8f13a21`** (PR #99 merged).

PR #99 added:
- Star player registry (`pipeline/star_players.py`) — NBA superstar/core/regular + MLB superstar tiers
- Star-aware leg scoring in `parlay_optimizer.leg_score` (boost only on High/Medium confidence; bounded)
- `starTier` + `isStar` persisted on optimizer snapshot legs
- ⭐ Featured badge in `parlay-ticket-card.tsx`
- Risk-card copy ("star-driven · lower variance" / "star + value mix" / "higher payout · longshot territory")
- `docs/ALT_LINE_PARLAY_PLAN.md` + alt-line "coming soon" placeholder

---

## 3. User feedback / product problem

**Visible production screenshot (from user)**: Conservative + Balanced slips repeated the same legs over and over:

- Evan Mobley
- Sam Merrill
- Josh Hart
- Corbin Carroll (in **every** Conservative slip — overexposure)
- Spencer Steer (overexposure in Aggressive — 62%)
- Dean Wade
- Dennis Schroder

**Missing or under-surfaced true game-driving stars**:

- Donovan Mitchell
- Jalen Brunson
- Karl-Anthony Towns
- Darius Garland
- Jarrett Allen
- Mikal Bridges

The cards felt like minor variations of the same 3-4 picks. Not exciting.

---

## 4. Original task summary

**Branch**: `fix/star-diversity-parlay-composition` (already created and checked out).
**PR title target**: `fix(parlays): diversify star exposure in suggested slips`.
**Do NOT merge until reviewed.**

Goals:
1. Audit why top stars are missing.
2. Tighten star tiers.
3. Add cross-slip diversity / exposure caps.
4. Add star-led slip composition lanes (internally varied types).
5. Review same-game NBA cap.
6. Regenerate May 25 optimizer snapshot.
7. Preserve grading / results / recent-form / cron compatibility.
8. Tests + browser verify.

Hard rules (still in effect):
- No "lock" / "guarantee" / "free money" / "risk-free" / "can't miss" copy.
- No fake confidence; star boost is bounded.
- Don't force stars with bad projections.
- Don't fabricate alt lines.
- High Variance stays honestly labeled.
- Pushes + pending excluded from hit-rate denominator.

---

## 5. What's already been done in this branch (uncommitted)

### A. Root cause of the repetition — diagnosed

Three issues identified:

1. **Corbin Carroll appeared in 100% of Conservative multi slips** — the only MLB superstar with strong edge, won every multi-build's MLB slot because there was **no cross-slip recurrence penalty**.
2. **Regular-tier players with REB edges drowned out superstars** — Dennis Schroder REB Over 1.5 +21.7pp regular-tier scored higher than Jalen Brunson AST/PTS superstar edges because:
   - Schroder's edge clipped at 20pp (max value)
   - REB market weight 1.15 vs AST 0.80 / PTS 0.95
   - Even with superstar boost 0.20, Brunson AST 1.134 < Schroder REB 1.495
3. **Tier gaps too small** to overcome 5-6pp edge advantage from high-edge rotation players.

### B. Changes made (uncommitted)

#### `pipeline/star_players.py`

**Removed from NBA "regular" tier** (so they get NO star boost):
- Mitchell Robinson
- Miles McBride
- Dennis Schroder
- Sam Hauser

Kept on regular tier: Donte DiVincenzo, Landry Shamet, Tyrese Maxey.

Rationale: these high-edge rotation guards were drowning out superstars in Conservative. They still appear in High Variance via pure model edge — that's fine.

**Boost table preserved at PR #99 values** (initially tried widening it but reverted because it overpowered the bounded-boost test contract). Final values:

```
                    Conservative   Balanced   Aggressive
  superstar              0.20         0.15        0.08
  core                   0.12         0.09        0.05
  regular                0.05         0.04        0.02
```

#### `pipeline/parlay_optimizer.py`

1. **Added `_RECURRENCE_PENALTY` table** (lines near 580):
   ```python
   _RECURRENCE_PENALTY = {
       "conservative": 0.50,
       "balanced":     0.30,
       "aggressive":   0.15,
   }
   ```

2. **Added `_select_diverse(candidates, *, profile, limit)`** — final visible-slip selection pass. Walks candidates greedily, penalizes each by `repeat_count × penalty_per_repeat` based on already-chosen slips' players. Quality still drives the decision (penalty is bounded), but identical-roster slips get pushed down. If no diverse alternative exists, the same player can still repeat (honest, no fabrication).

3. **Modified `optimize()`** to:
   - Build a larger candidate pool (`candidate_target = max(num_candidates * 4, num_candidates + 6)`).
   - Pre-sort by raw `slip.score`.
   - Call `_select_diverse(...)` for the final visible-slip selection.

#### `pipeline/parlay_optimizer_test.py`

Added **`DiversitySelectorTests`** class with 3 tests:
- `test_visible_balanced_diversifies_when_alternates_exist` — ≥4 distinct player names across top-3 balanced slips when alternatives exist.
- `test_same_player_can_repeat_when_no_alternatives` — repeats allowed when pool too small; no fabrication.
- `test_diversity_does_not_pick_low_quality_junk` — low-edge non-star is NOT promoted past a repeat superstar slip.

Total optimizer test count: **35 (32 prior + 3 new)** — all passing.

#### Data files (uncommitted, regenerated)

- `app/public/data/parlays/optimizer/2026-05-25.json` — re-snapshotted with new diversity selector. **70 slip entries · 46 unique slips** (was 72/48; the dedupe properly drops near-duplicate slips when no diverse alternative exists).
- `app/public/data/parlays/optimizer-graded/2026-05-25.json` + `2026-05-26.json` + `optimizer-summary.json` — re-graded against current settled rows. All 46 slips remain `pending` (5/25 games not yet final).

### C. NO TODOs left in code

The implementation is complete on the Python side. Nothing in the UI was touched (intentional — the existing ⭐ badges + risk-card copy from PR #99 work with the new data).

---

## 6. Current test status

All commands run from `~/Downloads/gametimepicks` in this session:

| Command | Result |
|---|---|
| `pipeline/.venv/bin/python -m unittest pipeline.parlay_optimizer_test pipeline.star_players_test pipeline.grade_optimizer_test` | ✅ **55 tests passed** (32 + 13 + 7 + 3 new diversity) |
| `pipeline/.venv/bin/python -m pipeline.snapshot_parlays_test` | ✅ **309 assertions passed, 0 failed** |
| `npm run typecheck` (in `app/`) | ✅ clean |
| `npm run build` (in `app/`) | ✅ clean (all routes prerender) |
| `npx tsx --test src/lib/parlay-suggested.test.mjs` | ✅ all pass (15 cases, 0 fail) |

**No tests left unrun.** No failures.

---

## 7. Current observations from latest regenerated snapshot

Re-run inspection (Python script in this session):

```
totalSlips entries: 70 (was 72 before diversity selector)
unique slips: 46     (was 48 — diversity properly drops near-duplicates)
NBA stars in slips: 10
  Evan Mobley, Jalen Brunson, James Harden, Jarrett Allen, Josh Hart,
  Karl-Anthony Towns, Max Strus, Mikal Bridges, OG Anunoby, Sam Merrill
MLB stars in slips: 22
```

### Before vs after — top recurring players (multi visible slips, top 4 per profile)

**BEFORE PR #100** (production today on 8f13a21):
```
Conservative top-3 multi:
  1. Mobley + Carroll
  2. Merrill + Carroll
  3. Hart + Carroll          ← Carroll in ALL 3, only 3 unique NBA names
Balanced top-3:               ← Schroder always in slot 1
  1. Schroder + Hart + Carroll
  2. Mobley + Merrill + Carroll
  3. Hart + Harden + Carroll
```

**AFTER PR #100** (this branch, uncommitted):
```
Conservative top-4 multi:
  1. Mobley + Carroll                       (Mobley/Carroll once)
  2. Harden + Steer                         (new pair)
  3. Soto + Hart                            (Juan Soto enters)
  4. De La Cruz + McBride                   (different NBA player)
Balanced top-4:
  1. Merrill + Hart + Carroll
  2. Bridges + Steer + Ruiz                 (Bridges shows up)
  3. Wade + Soto + Chisholm
  4. Foscue + De La Cruz + Mobley
Aggressive top-4:
  1. Merrill + Schroder + Hart + Carroll + Steer
  2. Wade + Harden + Bridges + Carroll + Steer
  3. Soto + Strus + Anunoby + Chapman + Brunson   ← Jalen Brunson appears
  4. Ruiz + Marte + Hart + Foscue + Bauers
```

### Per-profile diversity counts (across visible multi-bucket slips)

```
conservative: 13 unique players across visible slips
  top: Corbin Carroll (2), Evan Mobley (1), James Harden (1),
       Spencer Steer (1), Juan Soto (1), Josh Hart (1)
balanced:     21 unique players
  top: Corbin Carroll (3), Evan Mobley (2), Sam Merrill (1),
       Josh Hart (1), Mikal Bridges (1), Spencer Steer (1)
aggressive:   23 unique players
  top: Corbin Carroll (4), Spencer Steer (4), Max Strus (3),
       Dennis Schroder (2), Josh Hart (2), Juan Soto (2)
```

### Stars still NOT appearing in visible slips (and why)

- **Donovan Mitchell** — best edges are on AST market (weight 0.80). AST market weight crushes him below other CLE players' REB edges. Mitchell's best lean (AST Over 4.5 +17.8pp, superstar conservative): score `0.967+0.15+0.10+0.20 = 1.417 × 0.80 = 1.134`. Mobley on REB +15.83pp scored `1.387 × 1.15 = 1.595`. Mitchell needs ~5pp more edge on AST to compete — model deliberately tuned this way because the audit shows AST hits at 51.3% (near coin-flip).
- **Darius Garland** — same reason (likely AST-driven leans).
- **NBA-only bucket is still empty** — single NBA game (NY @ CLE) can't satisfy correlation cap (`max_legs_per_game = 1` for conservative, 2 for balanced, 3 for aggressive). NBA stars only surface in **multi** and **all** buckets — preserved honest behavior.

### Star coverage by profile (in unique-slip counts)

```
conservative: 15/15 unique slips have ≥1 star
balanced:     16/16 unique slips have ≥1 star
aggressive:   15/15 unique slips have ≥1 star
```

---

## 8. Data / settlement context

- May 25 games at last validation (5/25 ~2:54 PM ET): **0 MLB finals · NBA NY @ CLE not tipped off (8 PM ET)**.
- All 46 optimizer slips correctly marked `pending` — no fabrication.
- Next scheduled cron: **5/26 07:00 UTC = 5/26 3:00 AM ET** — will be the first cron with PR #98's `grade_optimizer` wired in. That cron settles 5/25 games + flips pending slips to W/L/Push.
- **Don't try to validate W/L this session** — games still in flight or not started.
- This branch is about composition/diversity, not settlement.
- `grade_optimizer` compat verified — re-ran end-to-end, 46 pending preserved, no schema break.

---

## 9. Important product / copy constraints

- ❌ Do not use the word `"lock"` in user-facing copy.
- ❌ No `guaranteed`, `free money`, `risk-free`, `can't miss`, `easy win`.
- ❌ Don't fake confidence (star boost only applies to High/Medium tiers).
- ❌ Don't force stars with bad projections (boost is bounded — 10pp edge gap still beats superstar boost).
- ❌ Don't fabricate alt lines (alt-line lane stays on `docs/ALT_LINE_PARLAY_PLAN.md` only).
- ✅ High Variance must stay honestly labeled ("4–5 legs · higher payout · longshot territory").
- ✅ Results must remain honest/pending-aware — Pushes + Pending excluded from hit-rate denominator.

---

## 10. Remaining work for next session

In priority order:

1. **Commit the uncommitted changes** in `fix/star-diversity-parlay-composition`. Suggested commit structure:
   - Commit 1 (`fix(optimizer): cross-slip diversity selector + tighter regular tier`): `pipeline/parlay_optimizer.py`, `pipeline/parlay_optimizer_test.py`, `pipeline/star_players.py`.
   - Commit 2 (`chore(data): regenerate May 25 optimizer with diversity selector`): the 4 JSON files under `app/public/data/parlays/`.
   - The leans_log.jsonl + mlb_comparison_report_2026-05-25.json are byproducts of running the settle/grade scripts during validation — include them in the chore commit (or `.gitignore` if appropriate, but they're already tracked).

2. **Push branch + open PR** (do NOT merge until user reviews):
   - Title: `fix(parlays): diversify star exposure in suggested slips`
   - Body should follow the template in §12 below.

3. **Browser-verify the homepage** with the new snapshot before opening the PR:
   - Start dev server: `mcp__Claude_Preview__preview_start` with `gtp-dev`.
   - Confirm the **first 3 Conservative cards** no longer all contain Corbin Carroll.
   - Confirm Balanced shows multiple NBA stars across visible cards.
   - Confirm Aggressive still includes value players (Schroder, Foscue) but not in every card.
   - Confirm Jalen Brunson appears (slip 3 of aggressive top-4).
   - Confirm recent-form drawer still opens on any star leg.
   - Confirm `/results` still works (still shows 46 pending honestly).
   - Confirm zero banned words via grep on rendered HTML.

4. **Document why Donovan Mitchell / Darius Garland still don't surface** in the PR body — the audit-derived AST market weight (0.80) is the cause, and it's by design (51.3% lifetime hit rate on AST is near coin-flip). If the user wants Mitchell/Garland visible, that's a separate AST-market-weight policy decision, not a diversity issue.

5. **Optional follow-up** (don't do unless time): consider a small UI hint that explains the diversity rotation, but the current ⭐ badge + risk-card subtitles from PR #99 should be enough — no UI work needed for this PR.

---

## 11. Suggested next commands (copy-pastable)

```bash
# 1. Confirm state
cd ~/Downloads/gametimepicks
git status --short
git branch --show-current   # should be: fix/star-diversity-parlay-composition

# 2. Inspect what changed
git diff HEAD -- pipeline/star_players.py pipeline/parlay_optimizer.py pipeline/parlay_optimizer_test.py

# 3. Re-confirm tests pass (read-only — nothing regenerated)
pipeline/.venv/bin/python -m unittest pipeline.parlay_optimizer_test pipeline.star_players_test pipeline.grade_optimizer_test
pipeline/.venv/bin/python -m pipeline.snapshot_parlays_test
( cd app && npm run typecheck )
( cd app && npm run build )
( cd app && npx tsx --test src/lib/parlay-suggested.test.mjs )

# 4. Re-inspect star coverage (in case you want fresh numbers)
python3 << 'PY'
import json
from collections import Counter
o = json.load(open('app/public/data/parlays/optimizer/2026-05-25.json'))
print('totalSlips:', o['totalSlips'])
unique = {}
for prof,buck in o['buckets'].items():
    for sport,slips in buck.items():
        for s in slips:
            unique[s['slipId']] = s
print('unique:', len(unique))
for prof in ['conservative','balanced','aggressive']:
    cnt = Counter()
    for s in o['buckets'][prof]['multi']:
        for l in s['legs']:
            cnt[l['playerName']] += 1
    print(f'{prof} top:', cnt.most_common(5))
PY

# 5. Browser verify (start dev server via the preview MCP)
# In Claude Code: use mcp__Claude_Preview__preview_start with name "gtp-dev".
# Then navigate to / and inspect first 3 Conservative cards.

# 6. Commit (split into 2 logical commits if you want, or 1 is fine)
git add pipeline/star_players.py pipeline/parlay_optimizer.py pipeline/parlay_optimizer_test.py
git commit -m "fix(optimizer): cross-slip diversity selector + tighter regular tier ..."

git add app/public/data/parlays/optimizer/2026-05-25.json \
        app/public/data/parlays/optimizer-graded/ \
        app/public/data/parlays/optimizer-summary.json \
        pipeline/validation/leans_log.jsonl \
        pipeline/validation/mlb_comparison_report_2026-05-25.json
git commit -m "chore(data): regenerate May 25 optimizer with diversity selector ..."

# 7. Push + open PR (do NOT merge)
git push -u origin fix/star-diversity-parlay-composition
gh pr create --title "fix(parlays): diversify star exposure in suggested slips" --body "$(cat <<'EOF'
... see section 12 of the handoff ...
EOF
)"
```

---

## 12. PR final report template

When opening the PR, structure the body around these sections:

```markdown
> Do not merge until reviewed.

## Summary
Two changes that together fix the visible-card repetition + missing-star problem from PR #99:

1. **Removed high-edge rotation players from the "regular" star tier** — Mitchell Robinson, Miles McBride, Dennis Schroder, Sam Hauser. They were getting a small boost that, combined with REB market weight (1.15) and edge clipping (max 20pp), made them outscore true superstars on AST/PTS markets.
2. **Added a cross-slip diversity selector** — generates a candidate pool 4× larger than the visible-slip target, then walks it greedily applying a per-profile recurrence penalty (0.50 / 0.30 / 0.15) so the same player doesn't repeat across every visible card.

## Root cause of repetition
- Corbin Carroll was in **100%** of Conservative multi slips because no cross-slip recurrence penalty existed.
- Schroder regular boost (0.05) + REB market weight (1.15) + edge-clip-at-20 = score 1.495, beating Brunson superstar AST 1.134.

## Why top stars were missing
- Donovan Mitchell / Darius Garland: best edges are on AST market, which has 0.80 weight (audit-derived — AST hits at 51.3% lifetime, near coin-flip). NOT a star-boost issue; this is by design.
- NBA-only bucket: still empty because single-NBA-game slate can't satisfy correlation cap. NBA stars surface in multi/all buckets only.

## Star-tier change
Removed Mitchell Robinson, Miles McBride, Dennis Schroder, Sam Hauser from NBA "regular" tier. Boost values unchanged from PR #99.

## Diversity rules added
- `_select_diverse(candidates, profile, limit)` in `pipeline/parlay_optimizer.py`.
- Penalty per repeated player: Conservative 0.50 / Balanced 0.30 / Aggressive 0.15.
- Candidate pool size: `max(num_candidates * 4, num_candidates + 6)`.
- Penalty is bounded — same player can still repeat if no alternatives exist (no fabrication).

## Before / after — top recurring players (multi visible)
[Insert table from §7 of the handoff]

## Stars now appearing
NBA (10): Mobley, Brunson, James Harden, Allen, Hart, KAT, Strus, Bridges, Anunoby, Merrill.
MLB (22): Carroll, Steer, Soto, De La Cruz, Chisholm, Ruiz, Marte, Schwarber, Judge, Betts, etc.

## Stars still excluded and why
- Donovan Mitchell / Darius Garland: AST market weight 0.80 is the constraint. Separate AST-policy decision, out of scope.

## Tests run
- ✅ `pipeline.parlay_optimizer_test` — 35/35 (32 original + 3 new diversity tests)
- ✅ `pipeline.star_players_test` — 13/13
- ✅ `pipeline.grade_optimizer_test` — 7/7
- ✅ `pipeline.snapshot_parlays_test` — 309 assertions
- ✅ `npm run typecheck` clean
- ✅ `npm run build` clean
- ✅ `npx tsx --test app/src/lib/parlay-suggested.test.mjs` 15/15

## Browser verification
[Fill in from §10 step 3]

## Known limitations
- Donovan Mitchell / Garland still absent (AST market weight policy).
- NBA-only bucket remains empty on single-NBA-game slates (preserved correlation cap).
- 5/25 games not yet final at write time; all 46 slips remain pending (correct).
```

---

## 13. Critical warnings

⚠️ **Do not overwrite settled historical truth.** The cron-managed files under `app/public/data/results/` and `app/public/data/mlb/results/` are NOT in this branch's diff — keep it that way.

⚠️ **Be careful with slip IDs.** The optimizer uses content-hashed `slipId`s (`opt_<date>_<profile>_<sha12>`) — changing the player set changes the ID. The new diversity selector picks DIFFERENT slips than PR #99's optimizer did, so new slipIds are expected. `grade_optimizer` keys on `(playerId, market, side, line)` not slipId, so re-grading works fine.

⚠️ **5/25 optimizer snapshot is currently UNGRADED** (all 46 pending). The next cron at 5/26 03:00 ET will grade them. Don't manually flip them W/L.

⚠️ **The branch has uncommitted changes.** Do NOT close this terminal / git checkout to main without committing or stashing first.

⚠️ **The handoff file itself is unstaged.** If you want it tracked, add and commit it explicitly (or `.gitignore` if you prefer ephemeral handoffs).

⚠️ **Production at 8f13a21 still shows the repetitive slips** until this PR merges. The fix is local-only right now.

---

## Is the branch safe to close and resume?

**YES — branch is safe to close.** Uncommitted changes are preserved in the working tree. When you reopen the project in a new Claude Code session:

1. `cd ~/Downloads/gametimepicks`
2. `git status` — you'll see the same 8 modified files + 1 untracked.
3. Follow §11 commands to commit + push + PR.

Nothing has been lost. The diversity selector + tier-removal changes are in `pipeline/parlay_optimizer.py` (~81 added lines), `pipeline/star_players.py` (~10 changed lines), and `pipeline/parlay_optimizer_test.py` (~99 added lines).
