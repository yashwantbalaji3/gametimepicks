# GameTime Picks — UI/UX Operating System

*The operating doc for the UI/UX ownership layer: who owns the look, how a design change is reviewed and
shipped, and the non-negotiables a redesign may never cross. Part of the shared-services function pool of the
[AI Company Operating System](AI_COMPANY_OPERATING_SYSTEM.md); the founder holds the brand gate.*

## Purpose

Keep GameTime Picks feeling like a premium, honest, mobile-first paper sportsbook — consistent across every
surface, real assets or clean fallbacks, no hype, no fabricated money. This doc names the three agents that
own the design layer, the review loop, the quality bar, the non-negotiables, and exactly how a design change
ships.

## Who owns what

| Agent | Owns |
|---|---|
| **[UI/UX Designer](../agents/ui-ux-designer/mission.md)** (lead) | The whole look, end-to-end: visual hierarchy, mobile responsiveness, page consistency, empty/no-play states, badge/status semantics, card + ladder layout, asset usage, accessibility, copy clarity, screenshot QA, competitor-*inspired-but-original* design. Routes brand direction to Yash. |
| **[Visual Systems Designer](../agents/visual-systems-designer/mission.md)** | Design tokens (`--vault-*`), component primitives, and the **asset system** (`TeamLogo`, `FlagBadge`, `PlayerAvatar`, `TeamBadge`) + fallback discipline. See [VISUAL_ASSET_SYSTEM.md](VISUAL_ASSET_SYSTEM.md). |
| **[Product Designer](../agents/product-designer/mission.md)** | Flows, information architecture, empty/no-play states, and copy clarity + honesty. |

Chain: Visual Systems + Product Designer → **UI/UX Designer** → **VP of Product & Operations** → **Yash**
(brand gate).

## The review loop

```
design change ──► self-review vs PRODUCT_DESIGN_REVIEW_TEMPLATE
              ──► UI/UX Designer prioritizes + implements (safe, tested)
              ──► VP of Product & Operations (functional sign-off)
              ──► Yash approves BRAND direction  ◄── gate 4 of the four founder gates
              ──► deploy (branch → gates green → owner approval → ship)
```

The founder holds **gate 4 — public brand direction / posts** (see
[AI_COMPANY_OPERATING_SYSTEM.md](AI_COMPANY_OPERATING_SYSTEM.md)). Design *recommends*; Yash *approves the
look*. Everything below the brand call, the design agents own end-to-end up to the gate.

## The quality bar

Every surface must pass:

- **Visual hierarchy** — the most important thing on the surface is the most prominent; one clear read.
- **Mobile-first responsive** — designed at 375px first; no horizontal body scroll; wide content (tables,
  ladders) scrolls inside its own container.
- **Consistent badges + status** — the same status means the same badge/tone everywhere (product-status +
  freshness semantics are single-sourced).
- **Honest empty states** — a no-play / no-data surface is a *designed* state with a reason, never a blank or
  a broken-looking page.
- **Accessibility** — aria labels on icons/avatars, sufficient contrast, reduced-motion safe (no motion that
  ignores `prefers-reduced-motion`).
- **No undefined / NaN / $NaN** — render-audit clean on every route.
- **Screenshot / textual render QA** — proven by a screenshot or a built-`out/` textual render, not assumed.

## The non-negotiables

These override any aesthetic preference. A redesign that crosses one does not ship.

1. **Paper-only framing, everywhere.** This is a paper-trading analytics product. No real-money language, no
   hype, no guarantees; losses are shown honestly. Money labels are plain-English paper-bankroll terms.
2. **Bank Builder is neutral Lane A / Lane B.** Never survival / value / aggressive / safest / "safe" risk-mode
   words for the lanes. Two independent attempts at the same ladder — no risk modes.
3. **5-step live vs 7-step preview must be unmistakable.** The live, settlement-backed climb is **5 steps**
   ($100 → $10,000). The 7-step profit-locking ladder is a **preview** with no settlement support until
   Plan 0007 flips `BANK_BUILDER_LADDER_VERSION` to `"v2"`. A UI change may never imply the 7-step is live, and
   may never render a fake live 7-step climb. See [BANK_BUILDER_7STEP_SETTLEMENT_SPEC.md](BANK_BUILDER_7STEP_SETTLEMENT_SPEC.md).
4. **Canonical money is never touched by a UI change.** `portfolio.json` / `banked-ladders.json` md5 must not
   move for a display change. Money moves only through official settlement.
5. **Assets are official-source or a clean fallback.** ESPN / MLB-static logos + headshots, Unicode flags; the
   fallback is initials/monogram. Never a broken image, never a fabricated mark, never a copyrighted/non-official
   asset. Never copy a competitor's layout or copy.
6. **Never deploy red; never ship the red token as success.** `--vault-gold-bright` = `#F23645` is RED (a theme
   accent), not gold/success.

## How a design change ships

1. **Branch** off main (never commit a redesign straight to the default branch).
2. **Self-review** against [PRODUCT_DESIGN_REVIEW_TEMPLATE.md](PRODUCT_DESIGN_REVIEW_TEMPLATE.md) — fill in the
   verdict/findings.
3. **Gates green** — the authoritative gates from the
   [Claude Team Operating System](CLAUDE_TEAM_OPERATING_SYSTEM.md): money-integrity + forensic-money-audit
   (md5 unchanged), health, idempotence, `tsc`, full test suite, `npm run build`. A design change must leave the
   money gates byte-identical.
4. **Owner approval** — Yash signs off the brand direction (gate 4).
5. **Deploy** — ship; production smoke 9/9; spot-check the changed surfaces on mobile + desktop.

## Related docs

- [PRODUCT_DESIGN_REVIEW_TEMPLATE.md](PRODUCT_DESIGN_REVIEW_TEMPLATE.md) — the reusable redesign-review checklist.
- [VISUAL_ASSET_SYSTEM.md](VISUAL_ASSET_SYSTEM.md) — the real logo/flag/portrait asset system + fallback rules.
- [vp/plans/0007-seven-step-bank-builder-migration.md](../vp/plans/0007-seven-step-bank-builder-migration.md) — the
  gated 5-step → 7-step ladder migration this doc's non-negotiable #3 protects.
- [AI_COMPANY_OPERATING_SYSTEM.md](AI_COMPANY_OPERATING_SYSTEM.md) · [CLAUDE_TEAM_OPERATING_SYSTEM.md](CLAUDE_TEAM_OPERATING_SYSTEM.md) — the company + execution layers this fits into.
