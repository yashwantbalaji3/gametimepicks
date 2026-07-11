# Pre-Launch Hardening — VP Review

**Reviewer:** Claude (VP) · **2026-07-06** · reviewing Code report at commits `c659a600` + `fb07bc60`
**Method:** claims cross-checked against repo artifacts directly (proof > claims). ✅ = I verified in-repo · ☑️ = plausible, not independently run · ⚠️ = watch.

## What I independently verified
- Commits `c659a600` (credit guard + tests) and `fb07bc60` (owner docs + README + Go/No-Go) exist in git log. ✅
- `docs/OWNER_ACTIONS.md` and `docs/JULY_10_GO_NO_GO.md` exist. ✅
- Canonical money: md5 `7a15360b…` matches; record 17-14; current $19,065.40; crown $20,465.40; ROI 189.65×. ✅ (record moved 17-12→17-14 via July-5 losses = −$200 seeds; math consistent.)
- Credit-floor guard in `refresh_daily_products.sh`: checks free `/v4/sports` before paid fetch, aborts on exit 3 below floor (default 5,000, `ODDS_CREDIT_FLOOR` override), advisory when header absent. ✅
- `pipeline/check_odds_key.py` has `--emit-remaining` and `--min-credits`. ✅
- README rewritten: opens "paper-only sports analytics," no real-money, no guarantees, "a losing day is shown as a losing day." Grep for stale framing ("NBA-only," "bundled sample," "demo mode") = **0 hits**; banned-claim grep = **0 hits**. ✅
- Go/No-Go Section A: 9/9 hard blockers green, each with evidence. ✅

## 1. Decision alignment — ✅ PASS
- LADDER_V2 preview-only: ✅ (Go/No-Go §D explicitly defers v2 money, cites ADR-0006).
- Money + card approval gated: ✅ (§E "money movement + card approval stay manual by design").
- No model tuning: ✅ (§D defers weight tuning; report confirms).
- No irresponsible copy: ✅ (README clean; flagged terms are code comments / disclaimer text, not user-facing claims).

## 2. Readiness delta — improved, 9.5 → ~9.7
Biggest gain: the **silent credit-exhaustion risk I flagged is now closed** (fail-closed guard + test). README no longer contradicts the product. Plan 0002 status:
| Item | Status |
|---|---|
| 1 Secrets wired + OWNER_ACTIONS.md | ✅ done (setting them in GitHub = owner action, pending) |
| 2 Credit-floor guard + test | ✅ done, proven |
| 3 Refresh/status idempotence test | ☑️ claimed (+5 tests, 1,619 total) — not independently re-run |
| 4 README refresh | ✅ done |
| 5 13-route verification sweep | ☑️ Code self-audited clean; **independent audit not yet done** |
| 6 Launch polish / copy sweep | ✅ done |
| 7 Nightly loop / fresh slate | ⏳ partial — July-6 settlement pending tonight (USA-Belgium ~10 PM ET); 2–3 fresh-day streak not yet accrued |

## 3. Blocker status — **GO (conditional)**
Section A is green and I verified the money/README/copy pieces. Recommendation: **GO for soft launch**, conditional on two non-code items: (a) owner sets the 3 GitHub secrets for hands-free ops (launch is still GO with the loop run manually), and (b) accrue 2–3 consecutive fresh gate-green days before July 10. No hard blockers remain.

## 4. README / positioning — ✅ sounds right, 2 nits
Tone matches `POSITIONING.md`: honest, paper-only, shows losses, sportsbook-inspired but responsible. Nits (non-blocking):
- **Live link** points to the `gametime-picks.vercel.app` fallback, not the primary custom domain `gametimepicks.yashwantbalaji.com`. Confirm which is the public face and make it primary.
- Consider one plain-English line naming the primary user ("for sports fans who want trustworthy picks without the homework") to seat ADR-0002 in the front door.

## 5. Independent-verification gap
Item 5's route sweep was Code auditing its own work. Per "proof > claims," an **independent** pre-launch audit is worth running before we call GO final — this is exactly the Cowork QA fan-out Code itself recommended, and it's read-only (I can coordinate it as VP).

## Recommended next steps
- **Now (VP-run, read-only):** independent Cowork QA fan-out over 13 routes → produces the page-by-page pass table feeding Go/No-Go §A. I can drive this.
- **Tonight (Claude Code, operator-gated):** July-6 official settlement once USA-Belgium is final → roll to July-7 → propose fresh BB card for approval → gates → deploy → smoke 9/9. This is the real loop and starts the fresh-day streak.
- **Owner (Yash, 5 min):** set the 3 GitHub secrets.
