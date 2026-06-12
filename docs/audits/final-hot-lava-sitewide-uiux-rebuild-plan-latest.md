# Final hot-lava sitewide UI/UX rebuild — plan + results

Run: 2026-06-12 ~23:55 UTC · Base `2542a2c` (main). Design/UI sprint — no settlement, no
ledger mutation.

## 1. Bank Builder state + non-mutation proof
- **$1,423.64 / Step 4 / 3–0**, Step-4 card **pending** (+155, US-or-Paraguay DC −290
  FanDuel + Avila K Under 3.5 −112 DraftKings, return $3,623.97, profit +$2,200.33). June-11
  settled (3 wins). Avila re-verified Pre-Game home probable.
- This diff touches only theme CSS, font config, and font-size literals across presentation
  components — **no `/data/`, ledger, or Step-4 artifact in the diff**. Verified: $1,423.64
  on built pages; $728.76 only as Step-3 ledger history.

## 2. Complaints addressed
"Still feels partly like the old dusty gold/graphite; lava only in isolated areas; fonts;
props hard to digest; metadata too tiny." The prior two PRs (#464/#465) warmed the *base*
tokens and added ember borders, MLB logos, by-player grouping, Space Grotesk, and tab
clarity — but the site still read cool because the **cards themselves were hardcoded cool
navy**.

## 3. Root cause found (the key fix)
**264 components hardcoded `rgba(7, 11, 26, …)` — a cool navy-blue card background — inline**,
overriding the warm `--vault-*` tokens. So the dominant surface (cards) stayed blue-navy
even after the base was warmed. Also `#0b0f1f`, `rgba(11,15,31,…)`, `#070B1A` cool shells.

## 4. Hot-lava design system (this sprint)
- **Warm every card surface**: all cool-navy `rgba(7,11,26,*)` → warm volcanic
  `rgba(26,16,11,*)` (238 in components + 26 in globals); cool shells warmed too. Cards now
  read as lava-glass, not navy.
- **Canonical `--lava-*` namespace** added (`--lava-bg/panel/card/card-2/border/
  border-strong/heat/ember/magma/glow/text/text-muted/text-faint/gold/success/danger`); the
  legacy `--vault-bg/panel/border/border-strong/text/text-mute` now **reference** it, so lava
  is the single source of truth and gold is reserved for crown/Bank-Builder/success.
- (Already live from #465: ember borders/rules, Space Grotesk headlines via the Tailwind
  `display` key, warm base.)

## 5. Font system
Space Grotesk (`--font-headline`) drives the `font-display` class (headings, titles, odds —
tabular figures); body stays Geist; JetBrains Mono for data. Verified loaded in built CSS.

## 6. Readability (metadata floor)
Lifted the tiny-text floor: all inline `fontSize` 8/8.5/9/9.5 → **10** (217), Tailwind
`text-[8–9.5px]` → `text-[10px]` (18), globals sub-10 CSS rules → 10 (8), and the computed
player-avatar initials to 10. **No primary metadata below 10px remains.** Documented
exception: the 2-character team-abbreviation *corner chip* on player avatars stays 9px (a
decorative overlay where 10px+ overflows the small avatar) — verified the ONLY sub-10 token
in built HTML, scoped to avatar badges.

## 7. Asset / logo status (unchanged, verified intact)
MLB official team logos (mlbstatic from real ids) on /games + MLB fixtures; WC team
logos/flags + portraits (api-sports); MLB/NBA headshots; CompetitionBadge + monograms as
honest non-official fallbacks. Step-4 card shows USA/Paraguay flags + Avila headshot + book
badges. No fabricated marks.

## 8. Fixture + player-prop UX (already live, intact)
Tabs: Overview / Team & game props / Player props / Suggested cards / Markets. Player props:
Top picks + By player (collapsible, avatar + market count + best edge + last-5 drawers) +
market tabs + team filter + search. Suggested cards fixture-only.

## 9. Three-click navigation (intact)
Today → Games → fixture; Today → Picks → card; Today → Build → legs; Today → Bank Builder.

## 10. QA checklist + guardrails
tsc + 838 tests + static build clean; warm cards present / cool-navy 0 in built HTML; lava
tokens in CSS; Step-4 + $1,423.64 intact; MLB logos 60 on /games; banned-copy 0; no new
animation (reduced-motion safe). Production re-verify post-deploy.

## RESULTS
Cards warmed sitewide (238+26+ shells); `--lava-*` namespace canonical with `--vault-*`
wired to it; readability floored at 10px (avatar corner-chip the one documented 9px
exception); **838 tests** (+ updated theme test, + warm-card test). tsc + build clean. Live
preview: suggested cards + picks read warm volcanic-glass, fully readable. Production
verification appended after deploy.
