import { validateOddsArtifact } from "./epl-artifacts.ts";
const v = validateOddsArtifact({
  schemaVersion: 1, competition: "epl", season: "2026-27", dataClass: "FIXTURE_SAMPLE",
  generatedAt: "2026-07-30T00:00:00Z", source: "synthetic", public: false,
  rows: [{
    eventId: "soccer:epl:arsenal-v-chelsea:20260822t1400", kickoffIso: "2026-08-22T14:00:00Z",
    capturedAt: "2026-08-22T16:00:00Z", market: "MATCH_RESULT_1X2", book: "b",
    prices: { HOME: -125, DRAW: 260, AWAY: 340 },
  }],
});
console.log(JSON.stringify({ accepted: v.accepted.length, codes: v.rejected.map((r) => r.code) }));
