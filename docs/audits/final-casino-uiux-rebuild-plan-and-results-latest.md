# Final casino UI/UX rebuild — plan + results

Run: 2026-06-12 ~21:34 UTC · Base `9ac4add`.

## 1. Current-state verification (before edits)
- Bank Builder artifact: **$1,423.64 / Step 4 / 3–0**, Step-4 card **pending** (+155,
  US-or-Paraguay DC −290 FanDuel + Luinder Avila K Under 3.5 −112 DraftKings, projected
  $3,623.97). June-11 settled (3 wins). 821 tests green on main.
- Step-4 guardrail re-check (live): **Avila Pre-Game, home probable** (MLB Stats API
  gamePk 824102); **USA–Paraguay scheduled 9:00 PM EDT** (ESPN). Both legs valid → KEEP,
  no mutation.

## 2. Page-by-page diagnosis (what THIS sprint adds vs already-shipped)
Already live (PRs #452–#462, verified): Today leads with the Bank Builder lava spotlight
(counts hero removed); /bank-builder lava meter + heat rungs; props explorer Top-Picks
default + last-5 drawers; fixture-only suggested cards; games-first hubs; WC team logos +
portraits + MLB headshots; competition badges; calm lineup labels; product-header chips;
Picks quick lanes (4) + collapsed matrix; Build progress rail + sticky slip.

Gaps this sprint closes:
- **Lava energy is confined to Bank Builder.** The user explicitly wants MORE lava across
  the site → promote it to the primary-CTA + active energy layer (Today nav, game-card
  primary CTA, fixture Build CTA) without losing readability.
- **Headshot/monogram fallback is duplicated** in 3 components → centralize as
  `PlayerAvatar` (single real-vs-fallback decision, testable).
- **Picks lanes are 4, the brief specifies 7** (Recommended / Lower risk / Higher return /
  World Cup / MLB / Mixed / Bank Builder eligible) with one-line copy.

## 3. Visual problems (screenshots)
Dull palette (graphite reads premium but low-energy); lava only on one page; suggested
cards still feel like dark text boxes (their leg data carries NO per-leg image — honest
limit, documented in the asset audit); Picks lanes too few to map intent.

## 4. Color directions evaluated (3)
- **A. Lava Sportsbook — CHOSEN (hybrid).** Keep the graphite base + sport accents
  (readable, already shipped); promote the existing magma `--gtp-bank-lava`/`--gtp-bank-heat`
  to the GLOBAL action + active-state energy (primary CTAs, active filter chips, live-slate
  ember). Gold stays crown-only; emerald=win, red=loss unchanged. This is exactly the
  user's stated preference ("liked the lava, wants more") with accessibility preserved.
- B. Vegas Neon — rejected: magenta/animated-rays read cheap and hurt contrast.
- C. Premium Modern — rejected: it's essentially today's graphite, which the user calls dull.

## 5. Selected direction rationale
Lava-as-action is the lowest-risk way to inject the requested energy after many rebrands:
it touches the eye-catching action layer (where energy belongs) rather than recoloring
every surface, keeps body text on the high-contrast graphite, and reuses tokens already
shipped — so no token sprawl.

## 6. Implementation checklist
1. `.gtp-cta-lava` (lava-gradient primary button) + `.gtp-chip-heat` (ember active chip),
   reduced-motion safe.
2. Adopt lava CTA: Today flashcard nav top-rail, game-card "View game", fixture "Build
   from this game".
3. `PlayerAvatar` component (real photo → monogram) adopted in PlayerPropCard,
   OfficialCandidateCard, SuggestedCard; unit-tested.
4. Picks → 7 lanes with the brief's labels + one-line copy.
5. Asset-coverage audit doc.
6. Step-4 guardrail: verified KEEP (above) — no card/ledger change.

## 7. Asset inventory → see `final-asset-identity-coverage-latest.md`.

## 8. Risks + regression guardrails
- Lava overuse → readability: confined to action/active layer; body stays graphite; tested
  copy/contrast.
- No data mutation: UI-only diff; Step-4 artifact + ledger untouched (re-asserted in tests).
- Settlement: NOT performed here — tonight's official-finals settlement is a separate run.

— Results appended after implementation. —

## RESULTS (implemented)
1. **Lava promoted to the action layer**: `.gtp-cta-lava` (magma primary button),
   `.gtp-chip-heat` (ember active filter), `.gtp-ember-dot` — reduced-motion gated.
   Adopted on the Today flashcard rails, the games "View game" CTA + active sport chips,
   and the fixture "Build from this game" CTA. Bank Builder lava (meter/rungs/spotlight)
   unchanged. Graphite base + body text untouched → energy without losing readability.
2. **PlayerAvatar** centralizes headshot→monogram in one place; adopted in PlayerPropCard,
   SuggestedCard legs, and the Step-4 OfficialCandidateCard. Unit-tested (real URL → img;
   no URL → monogram; consumers route through it).
3. **Picks → 7 lanes** (Recommended · Lower risk · Higher return · World Cup · MLB · Mixed
   sport · Bank Builder eligible) with live counts + one-line copy; matrix stays the
   collapsed "Card counts by sport × risk" breakdown; header reduced to one sentence.
4. **Step-4 guardrail**: Avila Pre-Game home probable + USA–Paraguay scheduled (both
   re-verified live) → KEEP, pending, no ledger/card mutation.
5. **Bug/stale sweep**: copy + stale audits clean (no $100 paper, $444.19, raw PRE-LINEUP,
   Step-3 pending, Flex/Plus100 clutter); fixture cards stay fixture-only.

## Verification
824 tests pass (+3 PlayerAvatar) · tsc + build clean · copy/stale audits clean.

## Limitations / next
- Suggested-card legs lack per-leg images in the artifacts (orbs used) — a generator
  enrichment, not a UI fix.
- Licensed MLB/NBA/FIFA logos don't exist → monograms + generated badges (documented).
- Tonight's operational item (separate from this UI sprint): settle the Step-4 card from
  official finals after the games; withdraw if Avila is scratched pre-game.
