# Product Design Review — Template

*A reusable checklist for reviewing any product-surface redesign before it ships. Copy this file's checklist
into the PR / review note, tick every box, and fill the verdict block. Governed by the
[UI/UX Operating System](UI_UX_OPERATING_SYSTEM.md); the non-negotiables below are binding.*

## How to use

1. Copy the checklist + fill-in block below into the review.
2. Prove each item (screenshot, built-`out/` render, or inspected value) — don't assume.
3. Any unchecked non-negotiable = **do not ship**. Fix or descope first.

## Checklist

**Visual hierarchy**
- [ ] The single most important thing on the surface is the most prominent; one clear read.
- [ ] Secondary content is subordinate, not competing.

**Mobile / responsive (375px)**
- [ ] Designed + verified at 375px width first.
- [ ] No horizontal body scroll; wide content (tables, ladders, charts) scrolls inside its own container.
- [ ] Tap targets and spacing are usable on mobile.

**Consistency with sibling surfaces**
- [ ] Badges, cards, chips, spacing match the sibling surfaces (nothing bespoke-for-no-reason).
- [ ] Ladder step count + copy agree with every other surface (driven by the version constant, not hard-coded).

**Empty / no-play state quality**
- [ ] The no-data / no-play state is a *designed* state with a reason — never a blank or broken-looking page.
- [ ] It reads honestly ("No qualified <product> today", etc.), not as an error.

**Badge / status semantics**
- [ ] The same status renders the same badge/tone as everywhere else (product-status + freshness single-sourced).
- [ ] No status is faked (e.g. "Live today" on a stale slate — freshness re-derives against the real clock).

**Team logo / flag + player portrait usage & fallbacks**
- [ ] Logos/flags/portraits come from the asset system (`TeamLogo` / `FlagBadge` / `PlayerAvatar`), not ad-hoc.
- [ ] Every image has a working monogram/initials fallback on error (no broken image, no fabricated mark).
- [ ] Correct source per sport (see [VISUAL_ASSET_SYSTEM.md](VISUAL_ASSET_SYSTEM.md)); WC uses flags (no portraits).

**Accessibility**
- [ ] aria labels on icons / avatars / status chips.
- [ ] Sufficient contrast (esp. against the vault palette).
- [ ] Reduced-motion safe — no animation that ignores `prefers-reduced-motion`.

**Copy clarity + honesty**
- [ ] Paper-only framing; no real-money language, no hype, no guarantees.
- [ ] Losing records shown honestly, not hidden.
- [ ] Bank Builder lanes are neutral **Lane A / Lane B** — no survival/value/aggressive/safest/"safe" words.

**Render cleanliness**
- [ ] No `undefined`, `NaN`, or `$NaN` on any state of the surface.

**Money safety**
- [ ] No canonical money change — `portfolio.json` / `banked-ladders.json` md5 unchanged.
- [ ] This is a display-only change (settlement/accounting untouched).

**5-step-live vs 7-step-preview clarity**
- [ ] The live climb reads as **5-step** ($100 → $10,000); the 7-step ladder is clearly a **preview**.
- [ ] Nothing implies the 7-step is live or renders a fake live 7-step climb (see [BANK_BUILDER_7STEP_SETTLEMENT_SPEC.md](BANK_BUILDER_7STEP_SETTLEMENT_SPEC.md)).

**Red-token discipline**
- [ ] `--vault-gold-bright` (`#F23645`, RED) is not repurposed as gold/success.

**Proof + gates**
- [ ] Screenshot or textual render attached for each changed state (default + empty + mobile).
- [ ] Gates green: money-integrity + forensic-money-audit (md5 unchanged), health, idempotence, `tsc`, tests,
      `npm run build`. Post-deploy: production smoke 9/9.

## Fill-in

- **Surface:** _(route / component, e.g. `/bank-builder` ClimbHero)_
- **Reviewer:** _(agent + Yash sign-off state)_
- **Verdict:** _(SHIP / SHIP-WITH-FIXES / HOLD)_
- **Findings:**
  1. _…_
  2. _…_
- **Money md5:** _(before → after; must be unchanged for a display change)_
- **Brand sign-off (Yash):** _(pending / approved)_

## Related docs

- [UI_UX_OPERATING_SYSTEM.md](UI_UX_OPERATING_SYSTEM.md) — the ownership layer + non-negotiables.
- [VISUAL_ASSET_SYSTEM.md](VISUAL_ASSET_SYSTEM.md) — asset sources + fallback rules.
- [BANK_BUILDER_7STEP_SETTLEMENT_SPEC.md](BANK_BUILDER_7STEP_SETTLEMENT_SPEC.md) — the 5-vs-7-step truth.
- [vp/plans/0007-seven-step-bank-builder-migration.md](../vp/plans/0007-seven-step-bank-builder-migration.md).
