# V1 full-site UI/UX revamp — Immersive crimson-black

**Branch:** `uiux-v1-full-site-revamp` (production-candidate PREVIEW — do not merge without approval).
**Approach:** the entire site already runs on shared theme tokens, so V1 is applied by **shifting the global palette** (globals.css) from the warm gold/orange "lava" to V1's crimson-black, then sweeping the inline color literals — this cascades V1 to every route + shared component without rewriting page structure or risking the data-honest pages. Presentation-only: **no production data, settlement, or model logic changed.**

## V1 design tokens (globals.css)
| Token | Before (hot-lava) | After (V1 crimson-black) |
|---|---|---|
| `--lava-bg` | `#0C0806` warm | `#0A0A0B` neutral near-black |
| `--lava-panel/card/card-2` | warm `#17110D…` | `#141416 / #17171A / #1F1F23` |
| `--lava-heat` / `--gtp-bank-heat` | `#FF7A3C` orange | `#F23645` crimson |
| `--lava-ember / magma` | `#FF6A2A / #B3261E` | `#E11D2A / #9B1B16` |
| `--lava-border(-strong)` | orange tints | crimson `rgba(225,29,42,.20/.40)` |
| `--lava-text(/-muted/-faint)` | warm cream | high-contrast `#F5F5F7 / #B6B6BE / #7E7E88` |
| `--vault-gold-bright` (site accent, 156 files) | `#F0C75E` gold | `#F23645` crimson |
| `--vault-gold` (crown) | `#D4AF37` | **kept gold** (Bank Builder crown) |
| `--gtp-bank-lava` gradient | orange→gold | `#9B1B16→#E11D2A→#FF5A3C→#F0C75E` (crimson→ember→gold crown) |
| `--gtp-shell-border`, `--vault-rule`, `--gtp-card*` | orange/warm | crimson / neutral-dark |
| body ambient glow + dot grid | orange | crimson |

Inline literals swept: **0** residual inline gold `rgba(240,199,94)` / `rgba(212,175,55)` and **0** residual inline orange `rgba(255,12x,4x/6x)` across `src/**/*.tsx` (~70 files). Gold remains only on the dedicated crown tokens + the Bank Builder lava-gradient end.

## Routes verified (mobile 390px + desktop 1280px)
`/` (=`/today`), `/today`, `/picks`, `/ufc`, `/results`, `/bank-builder`, `/methodology` — all render V1 crimson-black, **no horizontal overflow**, **no console errors**. Mobile keeps the sticky bottom nav (crimson active); desktop uses the crimson left-rail nav. Crimson accent present on all; **0 residual orange tokens**; gold only on the Bank Builder crown (intentional).

## Data integrity (preserved, unchanged)
- Bank Builder: **$10,376.17 / 5–0 / completed** (untouched).
- UFC Freedom 250: **settled, moneyline 6–1, cards 0–4** (untouched).
- No `app/public/data` files changed. No settlement/model logic touched. No fabricated odds/results/portraits. UFC portraits remain initials fallbacks.

## Tests / build
884 tests pass (the `lava-theme-tokens` guard updated to assert the V1 crimson-black palette + crown gold; the cool-blue dusty guard still passes). `tsc` clean. `npm run build` clean (191 pages). Copy audit clean (only comment disclaimers match). Secret audit clean.

## Honest limitations / recommendation
- This is a **token-driven** revamp (palette + nav/card cascade), not a from-scratch per-page rebuild into bespoke V1 fight-card components. It delivers a cohesive site-wide V1 feel with minimal regression risk; deeper per-page structural work (e.g. a dedicated matchup-card layout on every sport page, full app-shell replacement) can follow on the chosen direction.
- A few warm `rgba(26,16,11)` panel surfaces remain (very subtle dark panels on near-black) — left intentionally; they read neutral and don't clash.
- **Recommendation:** ready for owner review on the preview. Solid to merge as the new default theme; a follow-up pass can add bespoke V1 matchup/hero components per page if desired.
