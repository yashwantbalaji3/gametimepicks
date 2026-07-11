# Plan 0006 — Overnight Ops: July-7 Settlement + Refresh + Website Freshness

**Supervised by:** Claude (VP of Product & Operations, overnight) · **2026-07-07 ~00:50 ET** · for **Claude Code**
**Founder authorization:** settlement (official-final only), refresh/generation, QA, green deploy, website freshness. **NOT authorized:** fabricated settlements, pending-as-loss, weight tuning, LADDER_V2 activation, auto-social, hiding losses, red deploy, forced/questionable cards, anything that breaks money integrity.

## Grounded baseline (VP-verified, 00:50 ET)
- Branch: `june30-reset`. Money: **md5 `b7c35f72` · record 18-14 · bankroll $19,065.40 · crown $20,465.40.**
- July-5 and July-6 already settled. Slate staged for July-7 (3 WC games, 16 MLB). `warnings: []`.
- July-7 BB candidate: **Lane A, Step 2, +281, stake $174.23, legs = "Under 2.5" + "Colombia" → TOTALS-HEAVY.** Currently `awaiting approval`, `activeLanes: 0`.
- It is early on July-7; the July-7 games have **not** been played. So "settle all completed results before July 7" = July-6 and earlier (already settled) **plus** any July-6 player-prop legs whose official stats have since posted.

**VP read:** tonight is primarily **refresh + website freshness + a disciplined BB no-play**, with settlement scoped to anything *newly* official-final (likely just resolving July-6 pending WC-Specials player props if official player stats now exist; otherwise a verified no-op). Do not expect the July-7 slate to settle — those games are in the future.

---

## 1. Overnight sequence (phases, mapped to the AI Company Operating System)
Serial money; Sports Operations Lead sequences; analysts prepare; Code executes.

**Phase 0 — Preflight (SOL).** Confirm branch `june30-reset`, clean tree, money baseline md5 `b7c35f72` / 18-14. Regenerate `admin/status.json`. If the baseline md5 differs, STOP and report (unexpected money state).

**Phase 1 — Settlement (serial; Soccer then Baseball analyst prep → SOL sequences → Code applies).** Identify every fixture that is **official-final but not yet settled** (including July-6 player-prop legs left PENDING). For each, in finality order: dry-run → **hand-verify each leg vs the official final** → `--apply` → re-run money-integrity + forensic **between applies**. Never concurrent money writes. **Leave any unresolved/unsupported player prop PENDING — never a loss.** If nothing new is official-final → a **verified no-op**; money md5 stays `b7c35f72`. Report either way.

**Phase 2 — Model review (per sport, only if new settlement occurred).** Write `docs/MODEL_REVIEW_<sport>_2026-07-06.md` addendum or `_2026-07-07.md` as appropriate, settled-only, labeled proven/directional/insufficient. **No weight tuning.**

**Phase 3 — Refresh / generation for July-7 and forward (Sport analysts → SOL → Code).** Run the normal daily refresh (`refresh_daily_products.sh --date 2026-07-07`, add `--horizon` if the auto-horizon derives short). Regenerate/verify: Today/Home, Top 10, Moonshot, World Cup board, **World Cup Specials only if official data supports** (else honest fewer/no cards), MLB board, Results, Mr. Dub/ledger, `/ops`. Money-md5 must stay unchanged during generation.

**Phase 4 — Bank Builder validation (Soccer Analyst assesses; SOL decides; NO promotion without clear standard).** Evaluate the Step-2 candidate. It is **totals-heavy ("Under 2.5")** — the weakest settled family (10-6; lost July-5). Per founder guardrail #7, **default to NO-PLAY** and set a clean, honestly-labeled no-play/awaiting-approval state with the reason, for founder review in the morning. **Do NOT promote a totals-heavy or otherwise questionable card overnight.** Only promote if the analyst can show it is genuinely draw-protected and meets the reliability standard — which a totals-led card does not. When in doubt: no-play. (Card *approval* is a founder gate; overnight, prefer leaving the decision for Yash over forcing one.)

**Phase 5 — QA (QA Engineer / SOL).** Render/route audit all 14 routes: 0 undefined / NaN / Homer / stale-active / Pass-as-pick; money reconciles on `/results` + `/mr-dub`; **Top 10 now shows July-7** (the prior build showed July-6 — confirm the roll); no stale July-6 active card; banned-copy clean; LADDER_V2 reads preview.

**Phase 6 — Gates (definition of done).** money-integrity · forensic · idempotence · health · tsc · full tests · build. **All green or STOP.**

**Phase 7 — Deploy (Launch Manager / Code).** If every gate is green: build → deploy (`june30-reset`; push with `--force-with-lease` if rebasing over the nightly bot) → **production smoke 9/9**. Confirm `/ops` "Next action" is clean. **If any gate is red: do not deploy.**

**Phase 8 — Report** (format in §7).

---

## 2. Exact Claude Code execution prompt
> **Overnight ops for GameTime Picks — July-7 settlement + refresh + website freshness on branch june30-reset. Founder pre-authorized: official settlement, refresh/generation, QA, green deploy. NOT authorized: fabricated settlements, pending-as-loss, weight tuning, LADDER_V2 activation, auto-social, hiding losses, red deploy, forced/questionable cards, anything breaking money integrity. Money changes ONLY through official settlement; settlement is SERIAL; report proof, never claims.**
>
> **Phase 0 — Preflight:** confirm branch june30-reset + clean tree; confirm money baseline md5 b7c35f72 / record 18-14; regenerate admin/status.json. If money md5 differs from b7c35f72, STOP and report.
>
> **Phase 1 — Settlement (serial):** find every fixture that is official-final but not yet settled, INCLUDING any July-6 player-prop legs still PENDING. For each, in finality order: settle_soccer_day.sh dry-run → hand-verify each leg vs the official final → --apply → re-run money-integrity + forensic before the next. Never settle two sports' money concurrently. Leave unresolved/unsupported player props PENDING, never losses. If nothing new is official-final, record a verified no-op (money md5 unchanged). Do not settle July-7 games (not yet played).
>
> **Phase 2 — Model review:** only if new settlement occurred, write the settled-only MODEL_REVIEW doc (labeled proven/directional/insufficient). No weight tuning.
>
> **Phase 3 — Refresh/generation:** run refresh_daily_products.sh --date 2026-07-07 (add --horizon if needed). Regenerate/verify Today/Home, Top 10, Moonshot, World Cup board, World Cup Specials (only if official data supports — else honestly fewer/no cards), MLB board, Results, Mr. Dub/ledger, /ops. Money md5 must not change during generation.
>
> **Phase 4 — Bank Builder:** the July-7 Step-2 candidate is totals-heavy (Under 2.5 + Colombia). Default to NO-PLAY: set a clean, honestly-labeled no-play/awaiting-approval state with the reason; do NOT promote a totals-heavy or questionable card overnight. Only promote if it is clearly draw-protected and meets the reliability standard (it is not). When in doubt, no-play and leave it for founder approval.
>
> **Phase 5 — QA:** render/route audit all 14 routes (0 undefined/NaN/Homer/stale-active/Pass-as-pick); money reconciles on /results and /mr-dub; confirm Top 10 now shows July-7 (prior build showed July-6); no stale July-6 active card; no banned copy; LADDER_V2 reads preview.
>
> **Phase 6 — Gates:** money-integrity, forensic, idempotence, health, tsc, full tests, build. All green or STOP.
>
> **Phase 7 — Deploy:** if all gates green, build → deploy (june30-reset, --force-with-lease if needed) → production smoke 9/9 → confirm /ops next action clean. If any gate red, STOP, do not deploy, report the blocker.
>
> **Report** in the format below with gate output and before/after money md5.

---

## 3. Approval boundaries (what Code may do vs must leave for Yash)
| Code MAY do overnight (pre-authorized) | Code must NOT do / leave for Yash |
|---|---|
| Settle official-final results (serial, hand-verified) | Fabricate a settlement or treat pending as loss |
| Apply money only via official settlement | Any discretionary money change |
| Refresh/generate July-7 + forward products | Tune model weights · activate LADDER_V2 money |
| Set BB to a clean NO-PLAY / awaiting-approval state | **Promote a totals-heavy or questionable BB/Moonshot card** |
| Run QA + all gates | Deploy red · hide a losing record |
| Deploy + smoke IF all gates green | Auto-post to social |

If a *good* card unambiguously meets the reliability standard, Code may promote it — but tonight's candidate does not, so the expected outcome is **no-play, left for morning approval.**

## 4. If official data is missing
Do **not** fabricate or estimate. Leave the affected legs/products **PENDING** with an honest reason; generate fewer/no cards where data is absent (no forced cards). Record the gap in the report. A verified no-op settlement (money md5 unchanged) is a correct, honest outcome — not a failure.

## 5. If the July-7 Bank Builder is still ambiguous
**Choose NO-PLAY.** Set a clean, clearly-labeled no-play/awaiting-approval state with the reason (totals-heavy / below reliability standard), and leave the promotion decision for Yash in the morning. Never force or promote a questionable card to have "something live." An honest no-play is the on-brand outcome.

## 6. If tests / build / deploy fail
**Stop at the failing gate. Do not deploy.** Do not mask or migrate tests to make them pass. Revert any partial change that isn't money-safe, confirm money md5 is intact, and report the exact failing gate + error + the last-known-green state. A safe non-deploy beats a red deploy.

## 7. Final report format (Code → VP/founder)
```
OVERNIGHT REPORT — July-7 — branch june30-reset @ <commit>
Money: before md5 b7c35f72 (18-14) → after md5 <...> (<W-L>) · integrity <PASS/FAIL> · forensic <PERFECT/FAIL>
Settlement: <fixtures settled + hand-verified vs official | "verified no-op, nothing newly final"> · pending legs left pending: <list>
Model review: <written? which sport | n/a> · weight changes: NONE
Generation: refreshed <Today/Top10/Moonshot/WC board/WC Specials/MLB/Results/Mr-Dub/ops> · slate date <2026-07-07> · Top 10 shows July-7? Y/N
Bank Builder: <NO-PLAY (reason) | promoted (only if clearly standard)> · Moonshot: <state>
QA: 14 routes <pass table> · money reconciles /results+/mr-dub? Y/N · banned copy 0? Y/N · stale July-6 card? N
Gates: integrity/forensic/idempotence/health/tsc/tests/build = <...> · smoke <9/9 | not deployed>
Deploy: <deployed @ <url> | NOT deployed — blocker: <...>>
Next action (/ops): <...>
Blockers / founder decisions for morning: <BB approval · anything red · pending data>
```

---
**VP supervision note:** the single most likely correct outcome tonight is — *nothing new to settle (verified no-op, money unchanged), July-7 slate refreshed and deployed green, Top 10 rolled to July-7, and the Bank Builder left as an honest NO-PLAY for Yash to review.* Any deviation (especially a money-md5 change without an official final behind it, or a promoted totals card) is a red flag I will catch on review.
