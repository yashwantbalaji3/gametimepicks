# UFC Graphics & Simulation UI (2026-07-10)

Original, honest fight-night graphics for the UFC simulator. **All CSS/SVG/components — no UFC/brand logos,
no fighter photos, no external images, no scraped assets.** Fallbacks are initials, never fabricated photos.

## Components

### `app/src/components/ufc/ufc-fight-night-hero.tsx`
An octagon/cage fight-night banner (server-renderable, pure inline SVG + tokens):
- Diagonal cage-grid `<pattern>` + two concentric octagon `<polygon>`s (original vector art).
- Two headliner columns with **initials** discs (parsed from the real event name — no photos).
- Honest badge **"Market-implied sims live"** + "UFC Fight Simulator"; never "model picks live".
- Status chips: `N fights`, `N odds-backed sims`, `Validation N/150`, `Props · provider-needed`.

### `app/src/components/game/probability-bar.tsx` (shared)
A neutral **stacked win-probability bar** driven by a report's `winProbabilities`. Segments are a share of
the total (de-vigged split); labels show each side's %. Works for UFC (2-way) and soccer (3-way). Rendered
in `MultiSportReportShell` → Simulation Output. Never implies a guaranteed outcome; no external assets.

### Provider-needed chips
`MultiSportReportShell` renders roadmap markets (method/round/distance for UFC) as disabled 🔒 chips instead
of a plain text line — so missing markets read as an explicit, honest roadmap.

## Rules honored
- **Allowed & used:** octagon/cage SVG, initials fallbacks, de-vig probability bars, market/status chips,
  provider-needed roadmap chips — all original.
- **Not used:** copyrighted UFC logos, fighter headshots, random/scraped photos, fabricated records/stats.
- **Verified by test** (`ufc-graphics.test.mjs`): hero is inline SVG with an octagon polygon; no `<img>`, no
  external image URL, no `url(https:…)`; probability bar renders segments; page passes real headliners +
  counts; shell shows the bar; unvalidated Expanded method/round/distance become a provider-needed roadmap.

## Honesty
The graphics make UFC feel like a simulator without overclaiming: everything is labeled **market-implied**,
model picks stay gated (0/150), and nothing is a "best bet" / "edge" / "lock". Paper-only.
