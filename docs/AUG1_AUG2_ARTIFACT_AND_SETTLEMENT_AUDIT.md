# Aug 1 / Aug 2 Artifact & Settlement Audit (Program 100-103)

Per-date, evidence-based. The governing rule: **a date without a legitimate pregame board has no
prediction population, and one may not be manufactured after the fact.**

| Date | Schedule | Board | Patch | Derived | Settlement | Public | Workflow | Class |
|---|---|---|---|---|---|---|---|---|
| 2026-07-31 | official | **YES** — 319/319 natively stamped | none | complete | **SETTLED** Aug 1 03:41 ET: 299 rows · 275 decisive · 146W/129L · 24 void · hit rate 53.09% | published | nightly-settle success | **SETTLED / MEASURABLE** |
| 2026-08-01 | official (15 games) | **NO** | n/a | none | **impossible** — nothing published to settle | never published | morning-projections FAILED 10:42 ET (contract gate) | **GENERATION_BLOCKED / NOT_MEASURABLE** |
| 2026-08-02 | official | **NO** | n/a | none | **impossible** | never published | morning-projections FAILED 10:45 + 11:36 ET (same gate) | **GENERATION_BLOCKED / NOT_MEASURABLE** |
| 2026-08-03 | official (8 games, all evening, first pitch 18:40 ET) | see `AUG3_PREGAME_PUBLICATION_PROOF.md` | append-only eligible | — | pending | — | generation restored | **CURRENT** |

## July 31 — settlement and PROVEN_STAMPED acceptance

Settled by the one canonical writer on Aug 1 (run 30690202015). Accounting is gap-zero against
the published population and the decisive denominator excludes the 24 voids — the exact
correction shipped in Program 092-095, now visibly working in production
(`hit_rate=0.5309` = 146/275, not 146/299).

**Lineage acceptance remains `NOT_YET_STAMPED · 0/299`.** This is honest and unchanged by this
incident: the board rows are natively stamped (319/319 confirmed by the observer), but the
settled-row lineage sidecar has not promoted them. That is a separate, pre-existing open item —
**not** something to force during an incident, and explicitly not a reason to alter settled
history. It is carried forward, not closed.

## Aug 1 / Aug 2 — why they stay empty

Internal pregame market snapshots **do exist** for both days (~120 per day, captured by the
still-healthy `mlb-pregame-capture`). It would therefore be technically possible to build boards
for those dates now. It is **prohibited and wrong**:

- The games are final. Choosing to publish a prediction population after outcomes are known
  admits selection effects no capture timestamp can undo.
- The research corpus, model diagnostics, and record must never contain predictions whose
  publication decision post-dates the result.

Both dates are therefore permanently classified **GENERATION_BLOCKED / NOT_MEASURABLE**, joining
2026-07-29 (generation-blocked) and 2026-07-28 (settlement-quarantined) in the honest-gaps set.

## Public display rules (already enforced by the accounting contract)

Missing slates render as **no valid prediction population**, never as losses; pending is never a
loss; void/unavailable/no-play never enter the decisive denominator. The surviving pregame
snapshots stay in the internal research stream — **they are not predictions** and may not be
promoted into one.
