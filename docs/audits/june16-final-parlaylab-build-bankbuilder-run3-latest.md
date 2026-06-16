# June 16 — Final push: WC count fix + Bank Builder V2 Run #3 decision

_Branch `june16-final-parlaylab-build-bankbuilder-run3` off main `0af6ba4`._

## Baseline
- Run #1 completed ($100→$10,376.17, 5–0); Run #2 closed (0/2); UFC 250 settled — all preserved.
- June 16 schedule: **4** WC group fixtures (France/Senegal, Iraq/Norway, Argentina/Algeria,
  Austria/Jordan), but only **3** have odds-backed projections (Austria/Jordan uncovered by the
  books). 15 MLB games. Now 20:10 UTC: France kicked off (19:00Z); Iraq/Norway (22:00Z) and
  Argentina/Algeria (01:00Z) upcoming → **2 upcoming WC games**.

## World Cup count fix (DONE)
The homepage said "4 World Cup matches today" (raw schedule count) while only 3 fixtures had model
content. Fixed: the Today headline + the World Cup hero/stat now use the **in-focus** count
(odds-backed projection `matchCount` = 3) → **"3 World Cup games in focus"**. The schedule/Games tab
still lists all 4 scheduled fixtures, with uncovered ones shown as odds-pending and a
"3 in focus · 4 scheduled" eyebrow. Regression test added.

## Bank Builder V2 re-evaluation + Argentina moneyline (DONE → honest block)
Re-ran the gate on the live slate. **Decision: `evaluating` (no launch).**
- **Argentina moneyline (−240, 66% model) was explicitly evaluated → survival score 59, does NOT
  clear the 80 bar** (a moneyline has no draw cover, so it is more fragile). The stronger,
  less-fragile Argentina legs that DO clear are **Argentina or Draw (92)** and **Argentina DNB
  (84)**. Surfaced in the artifact `notes` and on the /bank-builder V2 panel ("Notable candidates
  evaluated").
- 4 legs cleared the survival bar (Norway-or-Draw 93, Argentina-or-Draw 92, Argentina-DNB 84,
  Norway-DNB 81) but span only **2 upcoming games** — two lanes would both depend on Norway +
  Argentina holding (**over-correlated**), which the owner's own rule says to avoid. A differentiated
  dual run needs ≥3 independent upcoming games. All MLB legs are single-player props (fragile/DNP) →
  rejected; MLB has no team markets in the board. → **No Run #3 launched.** Run #2 untouched.
- The launcher already allows shared games / survival-first returns / ≥1 WC leg per lane (relaxed in
  the prior PR); the only remaining blocker is genuine game independence (2 games), which cannot be
  faked without creating correlated lanes.

## Verification
- `tsc` clean · **939/939 tsx tests + 11 V2 python tests pass** · build clean (195 pages) · copy +
  secret audits clean. Browser: "3 games in focus" headline + V2 Argentina note verified.

## Deferred (honest)
Suggested-card pipeline using curated picks; full Parlay Lab marketplace + Build leg-row survival
visuals; player props inside generated cards; methodology rewrite. These remain follow-ups; this
push prioritized the two sharpest asks (count bug + the Run #3/Argentina decision).
