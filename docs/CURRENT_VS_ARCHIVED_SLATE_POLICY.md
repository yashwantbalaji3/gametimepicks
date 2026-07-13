# Current vs Archived Slate Policy (2026-07-12)

The rule that keeps the site honest on a thin / no-games day.

## Policy
1. **"Current" is the REAL ET date, never the newest committed slate date.** A page may only present a slate as
   *today's live action* when that slate's date equals the real ET date (`freshness.currentEtDate()`) AND it has
   games. This is decided by `lib/slate-liveness.ts` → `computeSlateLiveness(...).status === "live-today"`.
2. **When today has no games, say so.** The newest committed slate is shown as the **most recent / archive**,
   clearly labelled "Most recent slate: <date> (N days ago)", never as "today". The `SlateLivenessBanner`
   renders this on every current route; it also names the next scheduled focus (e.g. WC semifinals Jul 14 & 15).
3. **Older slates are reachable, not active.** July-11 content stays linked (results, the knockout board, the
   MLB board) as an archive — it is not deleted, but it does not drive any "today" framing.
4. **A freshness badge alone is not sufficient.** The badge ("Latest slate · N days ago") is a *second* honest
   signal; the primary signal is the liveness banner, which changes what the page *says* (no games today), not
   just a small chip. Both re-derive with the real client clock post-hydration.
5. **Never fabricate a current slate.** If no real games exist today, the honest states are: no-games banner +
   next-focus (from the public tournament calendar, dates only) + product cards → No Play. No invented games,
   odds, cards, or picks.

## Where it's enforced
- Liveness verdict: `lib/slate-liveness.ts` (pure, tested).
- Next focus (dates only, matchups TBD): `lib/wc-tournament-calendar.ts`, `lib/mlb-season-calendar.ts`.
- Banner: `components/slate-liveness-banner.tsx`, wired into `/`, `/today`, `/mlb`, `/picks`, `/moonshot`,
  `/world-cup`. (`/simulate`, `/games`, `/results`, `/world-cup/round-of-32` already anchored on the real clock.)
- Pins: `lib/slate-liveness.test.mjs` (verdict + calendar honesty + route wiring), plus the built-HTML check
  that no current route emits "Live today" while the slate is behind.

## Known residual (blunt)
Section-level headers below the banner (e.g. the `/today` "Today's Picks" hero, `/mlb` "today's slate" eyebrow)
still use "today" wording. They are now clearly caveated by the prominent "No games today" banner above them and
by the real-clock freshness badge, so the page no longer *reads* as live — but a future polish pass could
relabel those headers to "Most recent slate" for belt-and-suspenders consistency. Left out of this pass to avoid
touching the ~15 slate-coupled tests; the banner already resolves the founder-cited "shows July-11 as active"
problem. See `EMPTY_THIN_SLATE_HARDENING_LOG.md`.
