# Screenshots Guide

Capture these after the Vercel deployment goes live so the README,
portfolio site, and social posts can use real images.

Save all screenshots to `visuals/` in the repo. Recommended format: PNG,
2x retina (so a 1280px-wide viewport produces a 2560px-wide image).

Use Chrome's built-in screenshot tool: open DevTools → Cmd+Shift+P →
"Capture full size screenshot" or "Capture screenshot".

---

## 1. Home hero

- **URL:** https://gametimepicks.yashwantbalaji.com
- **Viewport:** 1440×900 desktop
- **What should be visible:** persistent disclaimer banner at top, nav,
  hero headline ("Transparent model leans on NBA player props."), the
  two CTA buttons, and the four KPI tiles
- **File name:** `visuals/home.png`

## 2. Model Board with filters open

- **URL:** https://gametimepicks.yashwantbalaji.com/board
- **Viewport:** 1440×900 desktop
- **State:** scroll position at top so the filter bar is visible
- **What should be visible:** disclaimer banner, nav with "Model Board"
  active, the date headline, the Data Source badge showing the current
  mode, the schedule strip, the filter bar (market / confidence / type /
  team / edge slider / sort), and at least 2-3 prop cards below
- **File name:** `visuals/board.png`

## 3. Model Board with a filter applied

- **URL:** https://gametimepicks.yashwantbalaji.com/board
- **Viewport:** 1440×900 desktop
- **State:** click "High" on the confidence filter so only high-confidence
  leans show; the "showing 3 of 12 props" counter and "clear filters"
  button should be visible
- **What should be visible:** filter bar with High highlighted, filtered
  list, count text
- **File name:** `visuals/board-filtered.png`

## 4. Player Trends with sparklines

- **URL:** https://gametimepicks.yashwantbalaji.com/trends
- **Viewport:** 1440×900 desktop
- **State:** market toggle on PTS (default)
- **What should be visible:** search box, market toggle, and at least 4
  player cards each showing the sparkline, L5/L10/season averages,
  splits, and recent games row
- **File name:** `visuals/trends.png`

## 5. Player Trends with REB toggle

- **URL:** https://gametimepicks.yashwantbalaji.com/trends
- **Viewport:** 1440×900 desktop
- **State:** click REB on the market toggle so sparklines update
- **What should be visible:** REB highlighted in the toggle, sparklines
  showing rebound trends, REB column highlighted in lime in the L5/L10/
  season tables
- **File name:** `visuals/trends-reb.png`

## 6. Results page

- **URL:** https://gametimepicks.yashwantbalaji.com/results
- **Viewport:** 1440×900 desktop, full-page screenshot (Capture full size)
- **What should be visible:** the headline hit rate, the sample-data note
  if in demo mode, the 5 KPI tiles, both hit-rate bar charts (by market
  and by confidence), the calibration scatter with explainer text, and
  the recent-settled table
- **File name:** `visuals/results.png`

## 7. Methodology flow + formulas

- **URL:** https://gametimepicks.yashwantbalaji.com/methodology
- **Viewport:** 1440×900 desktop
- **State:** scroll position at "Flow" section so the diagram is centered
- **What should be visible:** the seven-step flow diagram (NBA data →
  market line → projection → model probability → edge → confidence →
  tracked result), and the first formula block (Projection) below it
- **File name:** `visuals/methodology-flow.png`

## 8. Methodology data sources / mode explainer

- **URL:** https://gametimepicks.yashwantbalaji.com/methodology
- **Viewport:** 1440×900 desktop
- **State:** scroll to the "Demo, Live, Hybrid" section
- **What should be visible:** the three mode cards side by side with the
  lime/amber/grey dots
- **File name:** `visuals/methodology-modes.png`

## 9. Responsible Use page

- **URL:** https://gametimepicks.yashwantbalaji.com/responsible-use
- **Viewport:** 1440×900 desktop, full-page screenshot
- **What should be visible:** the headline ("Read this before anything
  else."), and the 9 disclosure blocks
- **File name:** `visuals/responsible-use.png`

## 10. Mobile Model Board

- **URL:** https://gametimepicks.yashwantbalaji.com/board
- **Viewport:** 390×844 (iPhone 14 Pro)
- **State:** open Chrome DevTools, toggle device emulation, set to
  iPhone 14 Pro, capture full-size screenshot
- **What should be visible:** stacked nav, disclaimer banner, the schedule
  strip scrolling horizontally, the filter bar wrapping to multiple rows
  (controls in vertical stack), at least one prop card
- **File name:** `visuals/mobile-board.png`

## 11. Data Source badge close-up

- **URL:** https://gametimepicks.yashwantbalaji.com/board
- **Viewport:** 1440×900 desktop, but crop the screenshot to just the
  Data Source badge area (about 800×120px after cropping)
- **What should be visible:** the badge alone showing DATA · Demo (or
  Live), NBA source, ODDS source, SYNCED timestamp, and the FALLBACKS
  row at the bottom
- **File name:** `visuals/data-source.png`

## 12. Mobile Player Trends

- **URL:** https://gametimepicks.yashwantbalaji.com/trends
- **Viewport:** 390×844 (iPhone 14 Pro)
- **What should be visible:** stacked controls, one player card showing
  the sparkline, L5/L10/season table responsive (might wrap), splits row
- **File name:** `visuals/mobile-trends.png`

## OG / social card (optional)

For LinkedIn / X link previews, capture a 1200×630 image showing the home
hero. Save as:

- `visuals/og-card.png` — 1200×630, lime accent text and the hero KPIs
  visible

If you add this, also drop it into `app/public/og.png` and add to the
`metadata.openGraph.images` array in `app/src/app/layout.tsx`.

---

## After capturing

1. Move all PNGs into `visuals/`
2. Update the README screenshots section with proper image markdown
3. Commit and push:

```bash
git add visuals/*.png
git commit -m "screenshots after launch"
git push
```

Vercel redeploys automatically.
