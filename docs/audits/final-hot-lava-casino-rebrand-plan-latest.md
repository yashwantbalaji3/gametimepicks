# Final hot-lava casino rebrand — plan + results

Run: 2026-06-12 ~23:30 UTC · Base `b390dd4` (main). Design/UI sprint — no settlement, no
Bank Builder ledger mutation.

## 0. Current-state verification
- Bank Builder **$1,423.64 / Step 4 / 3–0**, Step-4 card **pending** (+155, US-or-Paraguay
  DC −290 FanDuel + Avila K Under 3.5 −112 DraftKings, return $3,623.97, profit +$2,200.33).
  June-11 settled (3–0). Avila re-verified Pre-Game home probable.
- 833 tests green on main. Much already shipped: MLB official team logos, by-player props
  grouping, deeper ambient lava, 7-lane Picks, Build rail, Bank Builder lava, PlayerAvatar,
  TeamMark, CompetitionBadge.

## 1. Visual problems observed (code + screenshots)
- **The base read "graphite + gold," not lava.** `--vault-bg` was cool blue-graphite
  `#0A0B10`, and EVERY card border/rule/glow was gold-tinted `rgba(212,175,55,…)` — so the
  lava only ever appeared on CTAs and Bank Builder, exactly the "random/inconsistent"
  complaint. (127 gold-tint usages in globals.css.)
- **No real headline face.** Geist loaded for everything; the `font-display` class was a
  Tailwind no-op (no `display` key), so headings had no premium character.
- **Vague fixture tab "Projections"** didn't distinguish team/game markets from player props.

## 2. Pages inspected
/today, /games, MLB + WC fixtures, /picks, /build, /bank-builder, /mlb, /world-cup,
product header, command rail, globals.css tokens, tailwind.config.ts.

## 3. Where real assets exist vs fallback
Per `final-asset-logo-portrait-coverage-latest.md`: MLB team logos REAL (official
mlbstatic from team ids), WC team logos/flags + portraits REAL (api-sports), MLB/NBA
headshots REAL. NBA team marks + WC competition badge = honest generated fallbacks. No
fabricated/licensed marks. Unchanged by this sprint.

## 4. Color directions evaluated (3)
1. **Graphite + lava accents (current)** — REJECT: lava confined to CTAs; base stays cool;
   this is precisely what the user calls dull/inconsistent.
2. **Full lava casino (CHOSEN)** — warm volcanic-obsidian base, ember borders/rules sitewide,
   warm cream text, molten CTAs, crown gold reserved for brand/Bank Builder, emerald success
   / crimson loss. Coherent and on-brief without sacrificing contrast.
3. **Neon Vegas (red/orange/purple/cyan)** — REJECT: noisy, hurts contrast, reads cheap.

## 5. Selected direction + accessibility
Full lava casino, implemented as a **token-level** change so it cascades everywhere
components already read `var(--vault-*)`:
- Warm surfaces: `--vault-bg #0C0806`, `--gtp-shell #0D0907`, `--gtp-card #1C140E`,
  panels `#17110D…#2B201A` (warm obsidian, red-brown undertone; still very dark).
- Ember structure: `--vault-border`/`--vault-rule`/`--gtp-card-border`/`--gtp-shell-border`
  → `rgba(255,120,60,…)` (lava ember) instead of gold tint.
- Text unchanged warm cream `#F8F4E9` / mute `#C9BC97` → contrast ≥ ~12:1 on the warm base
  (hand-checked; readability preserved — the explicit non-negotiable).
- Crown gold (`--vault-gold*`), emerald success, crimson loss, risk/sport accent hues all
  preserved as semantic accents.
- **Font:** Space Grotesk added (`--font-headline`); Tailwind `display` key wires the
  `font-display` class (headings/titles/odds/labels) to it; body stays Geist. JetBrains
  Mono unchanged. Space Grotesk ships tabular figures → odds/bankroll align.

## 6. Fixture tab clarity
"Projections" → **"Team & game props"**; "Player Props" → **"Player props"**; "Suggested
Cards" → **"Suggested cards"**. Player-props tab already has Top picks + market tabs +
**By player** grouped view + team filter + search + last-5 drawers (shipped prior).

## 7. Risks + non-regression guardrails
- Readability: only surfaces/borders warmed; text + contrast unchanged; verified live
  (cream on `#0D0907`).
- Reduced motion: no new animation; existing lava utilities already `prefers-reduced-motion`
  gated.
- Data: zero artifact/ledger mutation; Step-4 pending; $1,423.64 shown on 184 built pages;
  $728.76 remains only as Step-3 ledger HISTORY (`$728.76 → $1,423.64`), never as current.
- No fabricated odds/markets/logos/portraits/logs/settlements.

## RESULTS (implemented + verified)
- Warm volcanic base + ember borders cascaded to **62 cards** live; `font-display` headlines
  render **Space Grotesk** (verified in preview + built CSS); fixture tabs relabeled.
- **837 tests** (+4 `lava-theme-tokens`) · tsc + static build clean.
- Built output: warm hexes (`#0c0806/#0d0907/#17110d/#1c140e`) + ember `255,120,60` in CSS;
  Space Grotesk loaded; tab labels present; 60 MLB logos /games + 4 fixture; Step-4 intact;
  banned-copy 0; $1,423.64 on 184 pages.

## Limitations / next
- Tiny inline metadata sizes (9–10px) not globally enlarged — inline styles can't be
  overridden by a token; a per-component pass is follow-up work, partially mitigated by the
  warmer/higher-contrast text.
- NBA official team marks still monograms; suggested-card legs still orb/avatar (artifacts
  carry no per-leg image).
- Operational (separate): settle Step-4 from official finals tonight; withdraw if Avila
  scratched.
