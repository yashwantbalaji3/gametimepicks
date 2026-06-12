# End-to-end casino UI/UX rebuild — plan + execution audit

Run: 2026-06-12 ~21:15 UTC · Base `ab92380` · Baseline verified: $1,423.64 / Step 4 / 3–0,
Step-4 card pending (+155, US-or-Paraguay DC + Avila K U3.5), June-11 settled, 818 tests.

## PHASE 1 — PLAN (written before any code change)

### A. Problems observed (screenshots + complaint list)
1. `/today` opens with the "What's live today" counts hero — low-value, repeats numbers
   available elsewhere; the user explicitly wants it gone.
2. Bank Builder (the flagship 3–0 story) sits BELOW suggested cards on /today.
3. Graphite palette (v4) reads premium but DULL — the user wants energy back without the
   old muddy navy/gold; Bank Builder specifically should feel "hot" (lava/summit).
4. /picks: filters exist but the entry point is utilitarian; no "Recommended"/"High
   return" fast lanes.
5. /build: 3-step labels exist but no visual progress rail; desktop slip not sticky.
6. Imagery: WC logos/portraits + MLB headshots live; suggested-card legs use orbs where
   no artifact image exists (MLB mixed-leg labels carry no playerId — documented limit).

### B. 3-click flows (verified targets)
Home → Bank Builder (1) · Home → Games → fixture (2) · Home → Picks → card (2) ·
Home → Build → sport → legs (3) · all preserved by this plan.

### C. Color directions evaluated (3)
1. **Premium Neon Sportsbook — CHOSEN.** Keep the v4 graphite base (premium, readable);
   inject energy with (a) a **magma heat system for Bank Builder** (`--gtp-bank-heat`
   #FF7A3C, `--gtp-bank-lava` gradient deep-red→orange→gold) driving the ladder meter,
   active rung, and the new Today spotlight; (b) brighter body floodlights; (c) existing
   emerald/cyan live accents. Gold stays the crown/premium accent — no longer carrying
   the whole brand.
2. Stadium Night (blue-violet washes) — rejected: re-introduces the cool/muddy cast the
   navy era suffered from.
3. Casino Vault (burgundy/emerald/gold) — rejected: burgundy + gold reads dated and
   collides with the red=loss semantic.

### D. Asset strategy (unchanged honesty rules)
Real: WC team logos (api-sports artifact URLs), WC portraits, MLB Static headshots, ISO
flags, artifact book labels. Generated (documented): competition badges, sport orbs,
monograms. No MLB/NBA team logos exist — monograms remain.

### E. Animation strategy
CSS-first, reduced-motion-gated (existing gate block extended): lava meter heat shimmer,
heat pulse on the active rung, spotlight ember gradient. Sparkle remains ONLY on settled
hits (already true) — pending cards never celebrate.

### Planned implementation list
1. `/today`: REMOVE the "What's live today" hero → top order becomes (1) **Bank Builder
   spotlight** (bankroll/step/record + pending-card one-liner + heat meter + CTA),
   (2) flashcard nav with one-line descriptions, (3) sports cards, (4) top-cards preview,
   (5) yesterday strip. Remove the now-duplicated lower Bank Builder module.
2. Heat tokens + Bank Builder lava treatment (meter fill, tower active rung, /bank-builder
   hero wash).
3. `/picks`: quick-lane flashcards (Recommended · High return) above the sport pills.
4. `/build`: Sport → Game → Legs → Stake progress rail; sticky desktop slip.
5. Bug sweep: duplicated paper-only disclosures, stale copy, counts.
6. Tests: today ordering (Bank Builder before suggested cards, hero gone), heat tokens
   present, prior 818 suite stays green.

— Execution log + verification appended below after implementation. —

## EXECUTION LOG (post-implementation)

1. **Heat system** (`globals.css`): `--gtp-bank-heat #FF7A3C`, `--gtp-bank-heat-dim`,
   `--gtp-bank-lava` (deep-red→orange→gold), `.gtp-meter-fill--lava`, `.gtp-heat-pulse`
   (reduced-motion gated); body floodlights warmed/brightened.
2. **/today reorder**: "What's live today" counts hero REMOVED. New order — (1) Bank
   Builder heat spotlight (bankroll headline, 3–0 · Step 4 · $3,500 goal line, today's
   card one-liner with +155/$3,623.97/pending, lava $100→$10,000 meter, lava CTA),
   (2) flashcard nav with one-line descriptions (+ Results card), (3) sports cards,
   (4) suggested-cards preview, (5) official card detail, (6) yesterday strip. The
   redundant lower "paper ladder" stats module was removed.
3. **/bank-builder lava treatment**: meter → lava gradient; "next decision pending" chip
   + active tower rung → magma heat pulse; cleared rungs keep settled emerald + sparkle
   (celebration stays settled-only; the pending card never celebrates).
4. **/picks quick lanes**: Recommended · High return · World Cup · Mixed sport flashcards
   above the filter pills (each maps to honest filters); matrix stays collapsed below.
5. **/build**: visual progress rail (1 Sport → 2 Game → 3 Legs → 4 Stake with live ✓
   states) replacing the text step label; desktop slip column now sticky.
6. **Bug sweep**: trimmed 2 duplicated paper-only disclosures on /today (header chip +
   footer + per-card caveats retain compliance); verified no stale values, no raw
   PRE-LINEUP, fixture-only cards, counts consistent.
7. **Step-4 protection verified at ship time**: artifact pending (+155), ledger 3 wins,
   summary $1,423.64 / Step 4 / 3–0; **Avila re-checked via MLB Stats API → Pre-Game,
   home probable**. No mutation anywhere in this sprint (UI-only diff).

## Verification
821 tests pass (818 + 3 new layout/heat tests) · tsc + build clean · copy + stale audits
clean · production verified post-deploy (see PR).

## Honest limitations
- Mixed-card MLB legs still render orbs (trimmed artifact legs carry no playerId for
  headshot construction — generator change would be a data-sprint item).
- "Lava" is expressed as heat gradients/pulses, not literal volcano illustration —
  tasteful per the brief's "if tasteful" qualifier.
- Per-card paper caveats remain (data-driven, compliance-positive).
