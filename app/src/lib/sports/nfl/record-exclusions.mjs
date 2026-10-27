/**
 * NFL · RECORD EXCLUSIONS — append-only, sha-pinned. Committed receipts are never rewritten or deleted; a receipt that
 * is labelled pre-kickoff but rests on evidence captured at/after kickoff is listed here instead, and every reader of
 * record (record-eligibility.mjs → forecastOfRecord, the frozen carry) treats it as NOT the forecast of record. The
 * record is then the newest revision whose inputs all precede kickoff — the event-window contract applied, not a new
 * policy.
 *
 * Receipts written from 2026-10-26 on record each input's own `sourceAsOf` (`inputs`) and are judged from it directly;
 * this list exists for receipts written before they did. An entry names the receipt by file AND by the identity a
 * reader holds without the file (event, generatedAt, model.inputHash), pins the file's sha256 (record-exclusions.test
 * checks it against the committed bytes), and carries the evidence, found by the read-only sweep
 * app/scripts/nfl/audit-nfl-post-kickoff-inputs.mjs (2026-10-26: 1 receipt revision and 1 board restamp this season,
 * both PIT @ NO; no displayed value differed).
 *
 * APPEND ONLY: record-exclusions.test.mjs pins every entry's digest; an edited or removed entry fails it.
 */
export const RECORD_EXCLUSIONS = Object.freeze([
  Object.freeze({
    file: "data/internal/nfl/forecast-receipts/2026-10-25/401873011-rev-1329Z.json",
    sha256: "48e5eefde43e99c7bc0372b12587c099651572cc1a3ecf7593d7f0369f0b38e4",
    providerEventId: "401873011",
    matchup: "PIT @ NO",
    kickoffUtc: "2026-10-25T13:30Z",
    generatedAt: "2026-10-25T13:29:54Z",
    inputHash: "7b06983a4ac1245b",
    reason: "INPUT_AFTER_KICKOFF",
    evidence: {
      input: "injuries", // the NFL injuries capture (research/injuries/nfl/latest.json) as committed in `commit`; provenance, never read here
      field: "sourceAsOf",
      stamp: "2026-10-25T13:30:12Z",
      commit: "dd185ac39e",
      note: "nfl-event-window run 40197487730: the orchestrator refused this event (injuries stamp at/after kickoff); the forecast builder did not check and wrote this revision",
    },
    recordInstead: "data/internal/nfl/forecast-receipts/2026-10-25/401873011-rev-1236Z.json",
    displayedValueDiffers: false,
    addedAt: "2026-10-26",
  }),
]);

/** Does this receipt body match an exclusion? By identity, so readers that hold only bodies apply it too. */
export function exclusionFor(receipt) {
  if (!receipt) return null;
  const id = String(receipt.providerEventId ?? "");
  return RECORD_EXCLUSIONS.find((x) => x.providerEventId === id && x.generatedAt === receipt.generatedAt && x.inputHash === (receipt.model?.inputHash ?? null)) ?? null;
}
