# Post-settlement full-site rebrand v2 — audit (2026-06-12)

Base: `6cd626f` · against the settled state $1,423.64 / Step 4 / 3–0 (verified pre-work,
unchanged post-work). Presentation-only sprint — zero data-artifact mutation.

## Weaknesses found → fixes shipped

1. **Muddy, low-contrast text** — `--vault-text-faint` was #6E6447 (≈3.3:1). Tokens
   brightened in one place (globals.css): text #F7EFDC, mute #C9BC97, faint #948A6E
   (≥4.6:1 on card surfaces). Every page inherits.
2. **Tiny metadata type** — shared components bumped: BoardStatTile label 8.5→10 / sub
   9.5→11 / value 21→22; today + sport-card stat labels 8.5→10; suggested-card sublabels
   9.5→10.5; official-card economics labels 8.5→10; details summary 9→10.
3. **Flat page base** — stadium-light wash on `body` (two faint radial floodlights, gold +
   cyan, fixed attachment). Pure background, zero layout impact.
4. **Bank Builder not a flagship story** — hero now tells the run: record-aware sub-line,
   a "3 wins cleared · 3–0" strip with per-step sport-icon chips (real ledger values:
   $211.85 ⚾ / $728.76 🏀 / $1,423.64 ⚽), a breathing "Step 4 · next decision pending"
   chip, and a **$100 → $10,000 progress meter** (real linear share: 14%) with a
   motion-gated shimmer. Cleared tower rungs now carry the subtle `.gtp-spark` sparkle.
5. **Cross-game card leak on fixture pages** (screenshot bug: Canada-vs-Bosnia page
   showed the USA-Paraguay Over 2.5 card) — fixture pages now show ONLY cards whose
   EVERY leg belongs to that fixture (`cardBelongsToFixture`, unit-tested). Cross-game
   cards remain on /picks where the context is explicit.
6. **Mixed-card legs unlabeled by sport** — each leg on a mixed card now carries its
   sport orb (⚽/⚾/🏀); suggested cards gained the hover-lift.
7. **Build flow unclear** — visual 3-step framing (1 choose → 2 add legs → 3 stake) and
   per-leg sport orbs when no real photo exists.
8. **Picks BB filter unexplained** — one-line explainer beside the "Bank Builder
   eligible" toggle (the ladder gates, in plain words).
9. **WC player-props empty state was bare text** — now a polished "Books haven't posted
   player props yet" card (honest, no debug text).

## Confirmed already-strong (no churn)

Nav/IA groups (Today/Bankroll/Sports/Learn — June-12 sprint), sport hub identity orbs +
accents, fixture hero flags, results trust strip, learn methodology cards, mobile bottom
nav. Mobile: new strips use flex-wrap; meter is fluid-width; no new horizontal overflow.

## Animations

New: meter shimmer (3.6s), cleared-rung sparkle. Both + every prior animation gated
behind `prefers-reduced-motion` (verified: gates updated alongside the new keyframes).
No JS animation library.

## Verification

Tests 812 pass (incl. new fixture-filter suite) · tsc + build clean · copy audit clean ·
stale-state sweep clean ($1,423.64 current everywhere; $728.76 only as the historical
Step-3 stake; no $444.19; no pending Step-3 card) · production verified post-deploy.
