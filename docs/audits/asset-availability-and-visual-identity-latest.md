# Asset availability + visual identity — audit (2026-06-12)

Audit of REAL image assets in the repo + current provider artifacts, and the honest
fallback used where none exist. Rule enforced everywhere: real asset when available;
intentional fallback (flag / monogram / sport orb) when not; never a faked logo/portrait.

| Sport | League logo | Team logos | Player portraits | Fallback used | Where |
|---|---|---|---|---|---|
| World Cup | **No licensed asset in repo** | No crest files; teams.json carries ISO codes; projections carry `teamLogo` URLs (api-sports) | **Yes** — player-projections carry real `photo` URLs (api-sports) when posted | Unicode flag via FlagBadge (monogram if unknown); identity orb ⚽ | game cards, fixture heroes, official BB card legs, player-prop cards |
| MLB | No licensed asset | None in artifacts | **No** — boards/leg pool carry no photo fields (verified 2026-06-12: 0/463 pool legs) | Initials monogram + team accent; identity orb ⚾ | prop cards, build legs, mixed-card legs |
| NBA | No licensed asset | None in artifacts | None in current artifacts | Initials monogram; identity orb 🏀 | prop cards, build legs |
| UFC | No licensed asset | n/a | None in artifacts | Identity orb 🥊 / octagon framing | UFC hub, games row |
| Mixed | n/a | n/a | n/a | Identity orb 🔀 + per-leg sport orbs | picks/mixed cards |
| Bank Builder | n/a | n/a | n/a | Vault orb 🏦 + ladder/meter motifs | bank-builder, today |

**No licensed league logo assets exist in the repo; generated sport-identity badges
(orbs) are used instead** — documented per the brief; no official marks are faked.
The only binary image asset in the repo remains the brand logo PNG.

Rendering rules implemented: real `photo`/`teamLogo` URL → `<img>` with alt text;
otherwise monogram/orb fallback that is visibly a design element. No broken images
(fallback is the default branch, not an error state).
