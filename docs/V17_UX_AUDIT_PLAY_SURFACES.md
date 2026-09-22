# v1.7 — UX audit: Play surfaces (Bank Builder · Moonshot · Parlay Center · results/history)

**Scope:** the surfaces the repaired products ship on. Not a full-site redesign (that is v2.1). Audited
against the charter's K1 dimensions with the render map of 2026-09-22; changes shipped in this program are
marked **[shipped]**, everything else is the prioritized backlog for v1.9 / v2.1.

## 1. Findings by surface

### /bank-builder
| Dimension | Finding | Disposition |
|---|---|---|
| Immediate comprehension | The hero answers "which step, which lane, which cycle" (`Step N of M · Cycle N`) and shows the card's legs with kickoff. Good. | keep |
| Terminology / claims | "Record 5–0" beside live lanes was the June-frozen completed-ladder record (audit S3). | **[shipped]** record label now reads the official protected record (35–34 at audit) — the same number the homepage, /today and /results print |
| Information hierarchy | No surface said which sports could contribute today or why a sport is absent; a thin slate looked like a broken product. | **[shipped]** "Today's eligible universe" above the hero: per-sport counts, plain reasons, and the market-priced caveat |
| Claims | "we lock profit as the ladder climbs" (7-step preview), "the model holds rather than forcing a weak ladder" (skipped card), a hardcoded World Cup market record in the v2 preview. | **[shipped]** reworded; numbers removed; guarded by `v17-play-surface-copy.test.mjs` |
| Empty / no-play state | "Model pass — holding for a stronger slate" attributes a market-price shortfall to a model. Pinned by three older guards. | backlog B-1: reword to "No card reaches this step's price today" once the shadow selector is adopted (its reason codes map 1:1) |
| Settlement clarity | Cleared-step details read from receipts; pending is labelled. Good. The "What the record systems say" block still exposes two stores disagreeing (audit S1/S2). | backlog B-2: retire the frozen stores (`dual-bank-builder-active.json`, `moonshot-lane/active.json`) and the parallel `bank-builder/summary-latest.json` product, then delete the reconciliation block |
| History | No cycle table (cycle → furthest step → outcome). The receipts own it; the page shows only settled cards. | backlog B-3: a receipt-derived cycle table (owner: `ladder-position.mjs currentRunSteps`), public data only |
| Mobile ~375 px | Hero tiles wrap to one column; ladder rails scroll vertically; no horizontal overflow. Verified in the built export. | keep |
| Touch / focus / contrast | Existing a11y gate (2-layer) passes; new section uses tokens only, no raw colours. | keep |
| Clicks to core action | Home → Bank Builder (1) → card visible (0). Meets the three-click principle. | keep |

### /moonshot
| Dimension | Finding | Disposition |
|---|---|---|
| Comprehension | Header + `ProductLanesLadder` show leg count, price, stake → return, both lanes. Good. | keep |
| Variance language | Descriptor said "Faster ladder" with no variance word. | **[shipped]** "Faster ladder · high variance · 2 legs a day · …" |
| Owner status per leg | Each leg shows odds and provider; it does not say the probability is market-implied. | backlog M-1: a per-card "market construction" chip once the shadow selector's `probabilityBasis` is public |
| Disagreement disclosure | Two settled counts (0–7 legacy vs 4–32 lanes) are disclosed side by side. Honest; dense. | backlog M-2: collapse the legacy era behind an expandable detail after the legacy lane is retired (B-2) |
| Eligible universe | none | **[shipped]** same component as /bank-builder |
| Mobile | The reconciliation `<dl>` wraps to 2×2 at 375 px; fine. | keep |

### /mr-dub
| Dimension | Finding | Disposition |
|---|---|---|
| Claims | h2 eyebrow "The methodology, proven"; title "$100 → $19.5K journey" (no artifact carries $19.5K); meta description repeated it. | **[shipped]** "The record, as settled" · "The $100 → $10K ladders"; description rewritten; two pinned tests repointed |
| Record framing | "35–34 · $16,165 profit" pairs a Bank-Builder-only record with a bankroll that also deducts Moonshot seeds (Rule S convention, audit S10). | backlog D-1: label the record "Bank Builder 35–34" everywhere it appears beside the bankroll (the achievement banner already does) |
| Stale prose | Header comment cites a 19-39 four-product record. | comment only; backlog D-2 |

### /build (Parlay Center) and /results/parlay-lab
| Dimension | Finding | Disposition |
|---|---|---|
| Claims | Tier records with hit rate and ROI and standard-error language; "not an expectation of profit" present. Honest. | keep |
| Terminology | "optimizer" banned in copy and enforced; "edge" appears as `edgePct` in the World Cup flex card (unmounted). | backlog P-1: delete `world-cup-flex-card.tsx` |
| Density | Four tiers × record × ROI on one screen at 375 px is dense but scrollable. | backlog P-2 (v2.1) |

## 2. Cross-cutting
- **Guards:** no tout-word guard scanned /mr-dub or /moonshot (audit A6). **[shipped]** `v17-play-surface-copy.test.mjs` bans `proven`, `lock… profit`, `$19.5K`, `the model holds`, `guaranteed`, `sure thing`, `banker`, `can't lose` across the three pages and their component folders, pins the record-label owner and the universe mounts.
- **Reduced motion:** the new section has no motion. Existing P262 role tokens unchanged.
- **Payload:** the new section adds one small server-rendered list; no client JS.

## 3. Prioritized backlog (for v1.9 Results & Trust v2 / v2.1 UI)
1. **B-2** Retire the frozen stores and the parallel optimizer-derived "Bank Builder" ledger; delete the reconciliation block (needs founder decision on the legacy Moonshot era display).
2. **B-1 / M-1** Public no-play reasons and `probabilityBasis` chips once the shadow selector is adopted.
3. **B-3** Receipt-derived cycle table on /bank-builder and /moonshot history.
4. **D-1** Record labels always name the product beside a bankroll.
5. **P-1** Delete unmounted `world-cup-flex-card.tsx`, `dual-ladder-board.tsx`, `home-hero.tsx`, `nba-finals-stake-row.tsx`.
6. **Full-site (v2.1):** navigation/homepage word ceiling, results IA, broadcast × terminal visual direction.
