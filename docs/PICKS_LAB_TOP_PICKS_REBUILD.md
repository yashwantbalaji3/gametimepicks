# Picks Lab Rebuild + Build Consolidation (2026-07-10)

Yash: *"Picks Lab doesn't make sense; Build duplicates it; users should build from top model picks, not raw
props."* This pass de-cluttered Picks Lab around the model's top picks and reframed `/build` as the
secondary advanced builder — a safe, tested, production slice. Official money md5 `affe6b21…` unchanged,
19-14, $0. Suite 2057 green.

---

## Diagnosis

`/picks` was already reading the right data — it leads with **Model Top 10 picks · <today>** (the
cross-sport top-picks board, same as `/today`) — but three things made it read as "raw inventory":
1. the page **header said "Parlay Lab"** while the nav said "Picks Lab" (inconsistent);
2. the full **optimizer coverage marketplace** (`ParlaysExplorer` — by-risk cards + the eligible-leg
   matrix) rendered **inline, above the fold**, burying the top picks under a dense table;
3. `/build` rendered a near-identical `BuildExperience` leg pool, reading as a duplicate.

Note: neither page actually shows *raw sportsbook inventory* — both pools are already **model-qualified**
(odds-backed, pre-event, role-quality screened; raw props excluded). The problem was *framing + ordering*,
not the data.

## What shipped

- **Picks Lab is now "Picks Lab" everywhere** — header eyebrow + title relabeled from "Parlay Lab", with
  top-picks framing + paper-only copy: *"Build a paper parlay from today's top model-qualified picks. Only
  qualified model reads appear here — we hide raw props that don't clear reliability, data and settlement
  filters. Paper-only; no bet is placed."*
- **Leads with the top picks** — the **Model Top 10** board stays at the top; the dense optimizer coverage
  marketplace (`ParlaysExplorer`) moved **behind a collapsed "Advanced — optimizer coverage & the full
  eligible-leg marketplace" disclosure**, so the page opens on the model's strongest reads, not a table.
- **`/build` reframed as the advanced builder** — title "Build" → "Build a Card", eyebrow "Advanced
  builder", primary CTA "Open Picks Lab", copy: *"The advanced, full-leg builder — start with Picks Lab
  for the model's top picks, or use this to add any model-qualified leg…"*. Command-rail descriptor →
  "Advanced builder → Picks Lab". The route + the working builder are kept (no deep-link break, no
  nav-item-count test churn); it's just clearly secondary now.

## Deferred (honest — larger, riskier work)

- **A dedicated top-picks pool artifact** (`public/data/picks-lab/top-picks-<date>.json`) with the exact
  category groups (Best Overall / Safer Reads / Value Edges / Player Props / Team Markets / UFC Fight
  Week / Longshots) — the Model Top 10 already covers the "top picks only" need; a fuller grouped pool +
  the interactive **custom paper-card builder with presets** (Bank Builder / Balanced / Moonshot) is a
  client-state build best done as its own tested pass.
- Merging `/build` into `/picks` (route-level) — kept as an alias-by-framing for now (no redirect in
  static export); a true redirect/merge is a follow-up.

## Guardrails

No formula/pick/model change. No card activated. Official money untouched (md5 `affe6b21…`). Generate gate
intact (top-picks board is the existing gated surface). No raw sportsbook inventory exposed. Internal
artifacts stay internal.
