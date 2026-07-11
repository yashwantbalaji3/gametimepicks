# Plan 0002 — Pre-Launch Hardening (July 10 soft launch)

**Maintained by:** Claude (VP) · **2026-07-06** · for **Claude Code** · supersedes the quick list in `NEXT-FOR-CLAUDE-CODE.md`
**Objective:** get to a fresh, honest, gate-green soft launch on July 10 with the daily loop as hands-free as our decisions allow. **No model tuning** (sample too small). **No LADDER_V2 money** (preview-only, ADR-0006). Money movement + card approvals stay operator-gated (ADR-0007).

**Definition of done for every item:** all authoritative gates green — money-integrity · forensic · idempotence · health · `tsc` · full tests · `npm run build` · production smoke 9/9. Never deploy red. Report back with proof (gate output); nothing is "done" until gates prove it.

---

### Item 1 — Owner actions (Yash, ~5 min, no code) + document them
Set GitHub secrets `VERCEL_DEPLOY_HOOK_URL`, `ODDS_API_KEY`, `API_FOOTBALL_KEY` → activates `daily-rebuild.yml` and scheduled fetch/settle.
**Code's part:** verify the workflows are wired to those secrets; write/refresh `docs/OWNER_ACTIONS.md` documenting exactly what each secret unlocks, how to rotate it, and how to confirm the scheduled workflows ran. **Money/approval stay manual by design.**
**Accept:** owner doc exists; a dry scheduled run (or manual dispatch) succeeds; no secret is ever printed.

### Item 2 — Odds-API credit-floor guard
Add a fail-closed credit check to `refresh_daily_products.sh`: if remaining credits < floor (default 5,000, env-overridable), abort loudly before any paid fetch. Add a unit test.
**Accept:** test passes; refresh aborts under floor with a clear message; money-md5 unchanged; gates green. (~20 lines.)

### Item 3 — Refresh idempotence test
Run `refresh_daily_products.sh` twice for one date → assert identical artifacts except cosmetic `generatedAt`. Add as a gate-adjacent test.
**Accept:** test passes; the known cosmetic md5 re-stamp is documented, not masked.

### Item 4 — Public README refresh (positioning, ADR-0010)
Rewrite `README.md` to match reality: honest paper-only sports analytics product (Bank Builder, Top 10, Mr. Dub, WC + MLB), the settlement-discipline moat, responsible framing. **Remove the "NBA-only demo" framing.** No real-money/guarantee language. Keep it accurate to current routes and products.
**Accept:** README describes the live product; no stale claims; VP reviews tone against `launch/POSITIONING.md`.

### Item 5 — Pre-launch verification sweep (day-of, best as a fan-out)
All 13 routes 200; 0 undefined/NaN/Homer/stale-active-cards; canonical money exact on `/mr-dub` + `/results`; BB lanes on current slate; Top 10 populated; freshness badges honest; credits > 5,000; **no banned copy anywhere**.
**Accept:** a page-by-page pass table (I can coordinate this as a Cowork QA fan-out). Feeds `launch/GO-NO-GO.md` section A.

### Item 6 — Launch polish (small, safe only)
Only low-risk, high-visibility items: honest empty-state copy where a page could read as "broken" pre-refresh; ensure losing records (Moonshot 0–5, WC Specials 0–17) are shown plainly; confirm disclaimer + Responsible-Use on every route.
**Accept:** no page reads as real-money advice or certainty; no hidden losing records; gates green. **Defer** /results pagination, token unification, drilldowns.

### Item 7 — Keep slates & flagships fresh through launch
Run the nightly loop daily (settle finished slate dry→hand-grade→apply → refresh next → **operator approves** a fresh BB card → gates → push → smoke 9/9) so BB shows a live climb and Top 10 stays current at launch.
**Accept:** ≥2–3 consecutive fresh, gate-green days before July 10; `/ops` "Next action" clean each day.

---

## Sequencing
Item 1 (owner, unblocks all) → 2 + 3 (cheap safety, parallel) → 4 (README) → 7 (run daily from now) → 5 + 6 (day-of). Model tuning and LADDER_V2 explicitly **not** in scope.

## Copy-paste prompt for Claude Code
> **Pre-launch hardening for the July 10 soft launch. Do NOT tune the model and do NOT activate LADDER_V2 money (preview-only). Keep money movement and card approvals operator-gated.**
> 1. Verify `daily-rebuild.yml` and the scheduled fetch/settle workflows are correctly wired to the secrets `VERCEL_DEPLOY_HOOK_URL`, `ODDS_API_KEY`, `API_FOOTBALL_KEY`, and write `docs/OWNER_ACTIONS.md` documenting what each unlocks and how to verify a scheduled run (never print a secret).
> 2. Add a fail-closed Odds-API credit-floor guard (default 5,000, env-overridable) to `refresh_daily_products.sh` with a unit test; abort loudly before any paid fetch when below floor.
> 3. Add a refresh idempotence test (run twice for one date → identical artifacts except `generatedAt`).
> 4. Rewrite `README.md` to match the real product and positioning (honest paper-only sports analytics: Bank Builder, Top 10, Mr. Dub, World Cup + MLB; settlement-discipline moat; responsible framing; remove the "NBA-only demo" story; no real-money/guarantee language).
> 5. Run a full pre-launch verification sweep: all 13 routes 200, 0 undefined/NaN/Homer/stale-active-cards, canonical money exact on /mr-dub and /results, Top 10 populated, freshness badges honest, no banned copy — output a page-by-page pass table.
> 6. Confirm disclaimer + Responsible-Use on every route and that losing records are shown plainly; fix only low-risk empty-state copy.
> 7. Run tonight's nightly loop (settle the finished slate dry-run→hand-grade→apply, roll to the next day with refresh_daily_products.sh, propose a fresh Bank Builder card for my approval, run all gates, deploy, smoke 9/9).
> Report back with gate output for each step. Do not deploy red.
