# June 10 — NBA Finals Client-Readiness Audit

## 1. Why did "6 low-risk NBA" show while only 5 cards rendered?
Two different bucketings on one page: the summary read `publicRiskSections.low.nba`
(6 genuine global-optimizer slips), while the legacy lane display capped ~2 visible
per lane + ran a cross-slip diversity filter → 5 surfaced. **Fixed:** NBA is now
presented exclusively via the **NBA Finals Same-Game Cards** section, whose count
strip is derived from the exact cards it renders (5·5·5·5). The coverage grid no
longer shows an NBA row (it now covers only the Main pool · MLB & Mixed), so the
conflicting "NBA 6 Low" number is gone.

## 2. Source of truth for displayed NBA cards
The NBA Finals section + the `buildFinalsCards` generator over the real optimizer
leg pool. One source; the count strip == the rendered cards.

## 3. NBA Finals same-game cards by tier
Low 5 · Medium 5 · High 5 · Longshot 5 (20), real market variety
(PTS/REB/AST/3PM/PRA/BLK/STL), distinct players, ≤1 volatile BLK/STL in Low/Medium,
exact-set dedup, player recurrence ≤2/tier.

## 4. Stake inputs
Every NBA Finals card now has a paper-stake input + live projected payout
(`NbaFinalsStakeRow`). Main-pool MLB/Mixed cards already carry the builder's stake footer.

## 5. Featured/active NBA Bank Builder card
**Castle REB o4.5 + Anunoby PRA o23.5** (+244, 3.44×). Now the **tracked active**
Builder Slip (not "outside the ladder"), stake $211.85 → $728.76.

## 6. Prior June 10 MLB Builder candidate
`selectPlus100BuilderSlip` MLB pick — preserved, shown collapsed as "superseded by
the NBA Finals event slip"; recorded in the override artifact's `replacement` block.

## 7. Honest replacement
Pre-tip user-approved override of today's PENDING rung; settled history untouched;
MLB candidate archived (collapsed) with metadata. No result edit.

## 8. UI cleanup done
- Parlay Lab: NBA Finals primary + stake inputs; coverage grid → Main pool only.
- Bank Builder: NBA Finals active tracked slip; MLB collapsed; "outside the ladder" removed.
- 0 "Needs More Tracking" / "Calibration Watch" in public UI.
