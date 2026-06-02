# docs/audits

Catalog of model / settlement / calibration / QA audit documents. The
audit docs themselves remain at their original `docs/` paths (no churn); the
authoritative, summarized index is
**[`../MODEL_AUDITS_INDEX.md`](../MODEL_AUDITS_INDEX.md)**.

## Quick links

- Current sprint (2026-06-02): `../MODEL_AUDIT_2026-06-02_PARLAY_QUALITY.md`,
  `../MODEL_CALIBRATION_2026-06-02.md`, `../VOLUME_DISCIPLINE_2026-06-02.md`.
- Settlement learning: `../LEARNING_NOTES_2026-06-01_SETTLEMENT.md`,
  `../LEARNING_NOTES_2026-05-30_SETTLEMENT.md`,
  `../LEARNING_NOTES_2026-05-29_SETTLEMENT.md`.
- Design / methodology: `../MODEL_LEARNING_LOOP.md`,
  `../PARLAY_METHODOLOGY.md`, `../PARLAY_LEG_QUALITY_GATES.md`.
- Reproducible analyses: `app/scripts/model-calibration-analysis.mjs`,
  `shadow-audit-quality-gates.mjs`, `shadow-volume-discipline.mjs`.

**Honest bottom line:** the model's `edgePct`/`confidence` are not
predictive; the public-era hit rate is weak and tracked openly; no
performance claim is made. See `../MODEL_AND_OPTIMIZER.md` and
`../KNOWN_LIMITATIONS_AND_RISKS.md`.
