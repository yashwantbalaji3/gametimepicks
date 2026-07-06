# Daily Claude Runbook — GameTime Picks

*The exact daily loop. Every command is real and lives in this repo. Run from the repo root unless a block
says `cd app`. Always `export TSX_TSCONFIG_PATH="$PWD/tsconfig.json"` inside `app/`. Decision gates are
**bold**. The one-command path is `roll_to_next_day.sh`; the manual chain below is what it runs, so you can
drive it stage-by-stage when a day needs judgment (an upset, a thin slate, a stopped lane).*

Convention: `D` = today's slate date (ET), `PREV` = the day being settled. Get them with
`TZ=America/New_York date +%F`.

---

## 0. Orient (always first, ~30s)
```bash
cd app && export TSX_TSCONFIG_PATH="$PWD/tsconfig.json"
npx tsx scripts/build-admin-status.mjs            # refresh the machine status
cat public/data/admin/status.json                 # read: canonical money, slate, active lanes, nextAction
git -C .. rev-parse --short HEAD && git -C .. fetch origin main -q && git -C .. log --oneline HEAD..origin/main
```
**Gate:** if `moneyGate.pass` is false → STOP, go to RECOVERY_RUNBOOK.md. If origin has bot commits, inspect
them (they should only touch settled-data/audit files) before any rebase.

---

## 1. Morning — verify + refresh
```bash
# a. Money + health truth
npx tsx scripts/verify-money-integrity.mjs
npx tsx scripts/health-check.mjs --today "$(TZ=America/New_York date +%F)"
# b. Failed overnight workflows?
gh run list --limit 8
# c. Refresh today's display products (real odds; md5-guards money; ends on the health gate)
cd .. && bash scripts/refresh_daily_products.sh --date "$(TZ=America/New_York date +%F)"
```
**Gate:** the refresh prints `✓ canonical money untouched (md5 verified)` and `✓ HEALTHY`. If a workflow
failed overnight, root-cause it (do not paper over it) — see the nightly-settle fix precedent in
`docs/NIGHTLY_SETTLE_FIX_2026-07-06.md`.

### Approve today's Bank Builder card (Product Manager hat)
```bash
cd app
# See the model's proposal for today, then decide:
npx tsx -e "import {buildBankBuilderProposal} from './src/lib/world-cup/bank-builder-proposal.ts'; console.log(JSON.stringify(buildBankBuilderProposal(process.cwd()+'/public/data','$(TZ=America/New_York date +%F)', new Date().toISOString()),null,2))"
```
Decision: Lane A = the safest disciplined card; Lane B = value ONLY if it has real edge (skip negative-to-fair
"value"). If a lane was stopped, **restart it first** (money-safe restart script), then author
`public/data/mr-dub/bank-builder-approved.json` (the proposal verbatim) and promote:
```bash
npx tsx scripts/promote-bank-builder-proposal.mjs --date "$(TZ=America/New_York date +%F)" --apply
```
**Gate:** promote prints `✓ canonical portfolio md5 unchanged`. Approved cards must NOT drift (the only drift
source is hand-editing approved.json).

---

## 2. Afternoon — monitor
```bash
cd app && npx tsx scripts/build-admin-status.mjs && cat public/data/admin/status.json
```
- Started games must not show as pregame. The client `FreshnessBadge` re-derives with the real browser clock,
  so a frozen static export self-corrects — but if you rebuild, a started game is excluded from Top 10 and the
  board flips to "in play". No action needed unless something looks stale after a rebuild.
- **Do NOT settle mid-game.** Settlement is official-final only.

---

## 3. Night — settle → learn → roll → deploy
### One command (preferred when the day is routine)
```bash
bash scripts/roll_to_next_day.sh --apply    # settle PREV → gate → generate D → gate → deploy → smoke → report
```
### Or the manual chain (when the day needs judgment)
```bash
# a. SETTLE the prior day — dry-run FIRST, hand-verify every leg vs official FT, then apply
set -a; source .env; set +a
bash scripts/settle_soccer_day.sh --date "$PREV"            # dry-run: read the graded legs
bash scripts/settle_soccer_day.sh --date "$PREV" --apply    # applies; auto-rolls daily portfolio; runs the money gate
```
**Gate:** the apply ends `✓ soccer settlement pipeline complete` with money-integrity green. Both BB lanes
losing is fine — that's official settlement moving the bankroll (e.g. 17-12 → 17-14). If the money gate fails,
the settlement produced an inconsistent state → investigate, do not push.

```bash
# b. MODEL REVIEW (Quant hat) — settled-only; write docs/MODEL_REVIEW_<PREV>.md
#    Analyse each leg: predicted vs official, market type, why it won/lost. Label proven/directional/insufficient.
#    Change reliability weights ONLY if a settled sample justifies it. Do not overfit one night.
# c. ROLL FORWARD to D (Data Engineer hat) — done by roll_to_next_day.sh, or:
bash scripts/refresh_daily_products.sh --date "$(TZ=America/New_York date +%F)"
# d. GATES (from app/)
cd app && export TSX_TSCONFIG_PATH="$PWD/tsconfig.json"
npx tsc --noEmit -p tsconfig.json
npx tsx --test $(find src -name '*.test.mjs')
npm run build
npx tsx scripts/verify-money-integrity.mjs && npx tsx scripts/forensic-money-audit.mjs && npx tsx scripts/health-check.mjs --today "$(TZ=America/New_York date +%F)"
npx tsx scripts/build-admin-status.mjs   # refresh the status file for the new state
```
**Gate:** tsc clean · all tests pass · build 0 · money-integrity ✓ · forensic PERFECT · health ✓.

### Deploy (Launch Manager hat)
```bash
cd .. && git add app/public/data app/src docs   # stage the real changes (never secrets/build output)
git commit -m "…"                               # logical, honest message; Co-Authored-By trailer
git fetch origin main -q && git rebase origin/main -q   # rebase over the nightly bot; re-run money gate if it moved
git push origin HEAD:main && git push --force-with-lease origin HEAD:june30-reset
# wait ~60-180s for Vercel, then:
cd app && npx tsx scripts/smoke-test-production.mjs      # expect 9/9
```
**Gate:** smoke 9/9 + spot-check the live pages that changed. If CDN lags, poll; if Vercel fails, read logs.

---

## Decision gates cheat-sheet
| Situation | Do |
|---|---|
| `moneyGate.pass` false | STOP → RECOVERY_RUNBOOK.md; never push |
| Game in progress | Leave pending; do not settle |
| Lane stopped + fresh card approved | Restart the lane FIRST, then promote |
| Only negative-to-fair "value" legs | No-play that lane with a reason |
| Thin slate (1 upcoming game) | Widen the board horizon; avoid same-game correlation |
| Any red gate | Fix or revert; never deploy red |
| Nightly workflow failed | Root-cause it; document the fix (don't work around) |
