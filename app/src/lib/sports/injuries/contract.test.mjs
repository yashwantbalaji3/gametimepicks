/**
 * Injuries contract guards (Program 162 · Release G).
 *
 * The REAL-SAMPLE fixture below is copied verbatim (fields the contract reads) from the live
 * 2026-08-11 probe recorded in docs/INJURY_SOURCE_EVALUATION.md — real shapes, not invented ones.
 * Synthetic rows then exercise every refusal the evaluation's conditions demand.
 *
 * Run: npx tsx --test src/lib/sports/injuries/contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { INJURY_CONTRACT_VERSION, INJURY_STATUSES, athleteIdFromLinks, normalizeInjuryFeed, availabilityFor } from "./contract.mjs";

const NOW = "2026-08-11T21:30:00Z";
// Real shape from the Aug 11 probe: team id 22 (Arizona), playercard-linked athlete, timestamped.
const REAL_FEED = {
  timestamp: "2026-08-11T20:51:22Z",
  status: "success",
  injuries: [
    {
      id: "22",
      displayName: "Arizona Cardinals",
      injuries: [
        { id: "633224", status: "Active", date: "2026-08-11T17:54Z", athlete: { displayName: "Jeremiyah Love", links: [{ rel: ["playercard", "desktop"], href: "https://www.espn.com/nfl/player/_/id/4870808/jeremiyah-love" }] } },
        { id: "633225", status: "Questionable", date: "2026-08-11T16:00Z", athlete: { displayName: "Sample Veteran", links: [{ rel: ["playercard"], href: "https://www.espn.com/nfl/player/_/id/1234567/sample-veteran" }] } },
      ],
    },
  ],
};

test("REAL SAMPLE · ids extract from playercard links; entries keep team linkage, status, timestamp", () => {
  const out = normalizeInjuryFeed(REAL_FEED, { sport: "nfl", nowIso: NOW });
  assert.equal(out.stale, false);
  assert.equal(out.entries.length, 2);
  assert.deepEqual(out.entries[0], { sport: "nfl", providerTeamId: "22", athleteId: "4870808", athleteName: "Jeremiyah Love", status: "Active", statedAt: "2026-08-11T17:54Z" });
  assert.equal(out.reconciliation.exact, true);
  assert.equal(athleteIdFromLinks([{ rel: ["playercard"], href: "https://www.espn.com/nba/player/_/id/99/x" }]), "99");
  assert.equal(athleteIdFromLinks([{ rel: ["desktop"], href: "https://www.espn.com/nfl/player/_/id/99/x" }]), null, "only the playercard rel counts");
});

test("REFUSALS · unextractable id, missing timestamp, unknown status, missing team id — each quarantines alone, batch survives", () => {
  const feed = {
    timestamp: "2026-08-11T20:51:22Z",
    injuries: [{
      id: "22", displayName: "Arizona Cardinals",
      injuries: [
        { status: "Out", date: "2026-08-11T17:54Z", athlete: { displayName: "No Link", links: [] } },
        { status: "Out", athlete: { displayName: "No Date", links: [{ rel: ["playercard"], href: "https://www.espn.com/nfl/player/_/id/2/x" }] } },
        { status: "Probable", date: "2026-08-11T17:54Z", athlete: { displayName: "New Word", links: [{ rel: ["playercard"], href: "https://www.espn.com/nfl/player/_/id/3/x" }] } },
        { status: "Out", date: "2026-08-11T17:54Z", athlete: { displayName: "Kept Row", links: [{ rel: ["playercard"], href: "https://www.espn.com/nfl/player/_/id/4/x" }] } },
      ],
    }, {
      injuries: [{ status: "Out", date: "2026-08-11T17:54Z", athlete: { displayName: "Ghost Team", links: [{ rel: ["playercard"], href: "https://www.espn.com/nfl/player/_/id/5/x" }] } }],
    }],
  };
  const out = normalizeInjuryFeed(feed, { sport: "nfl", nowIso: NOW });
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].athleteId, "4");
  assert.equal(out.quarantined.length, 4);
  assert.ok(out.quarantined.some((q) => /never name-match/.test(q.reason)));
  assert.ok(out.quarantined.some((q) => /parseable timestamp/.test(q.reason)));
  assert.ok(out.quarantined.some((q) => /UNKNOWN_STATUS "Probable"/.test(q.reason)), "an unlisted status is quarantined, not guessed into a bucket");
  assert.ok(out.quarantined.some((q) => /team without a provider id/.test(q.reason)));
  assert.equal(out.reconciliation.exact, true);
});

test("ABSENCE IS NOT HEALTH · a missing athlete reads UNKNOWN; a present one reads their explicit status", () => {
  const out = normalizeInjuryFeed(REAL_FEED, { sport: "nfl", nowIso: NOW });
  assert.equal(availabilityFor(out, { athleteId: "4870808" }).status, "Active");
  const missing = availabilityFor(out, { athleteId: "0000000" });
  assert.equal(missing.status, "UNKNOWN");
  assert.match(missing.reason, /absence is not health/);
});

test("STALENESS WIDENS · beyond the window even PRESENT entries read UNKNOWN", () => {
  const out = normalizeInjuryFeed(REAL_FEED, { sport: "nfl", nowIso: "2026-08-13T21:30:00Z" });
  assert.equal(out.stale, true);
  const v = availabilityFor(out, { athleteId: "4870808" });
  assert.equal(v.status, "UNKNOWN");
  assert.match(v.reason, /stale/);
  const missingStamp = normalizeInjuryFeed({ injuries: [] }, { sport: "nfl", nowIso: NOW });
  assert.equal(missingStamp.stale, true, "a feed without its own timestamp can never be fresh");
});

test("closed surface: version 1, both sport taxonomies exactly as evaluated, unknown sport throws", () => {
  assert.equal(INJURY_CONTRACT_VERSION, 1);
  assert.deepEqual([...INJURY_STATUSES.nfl], ["Active", "Out", "Questionable", "Injured Reserve", "Suspension"]);
  assert.deepEqual([...INJURY_STATUSES.nba], ["Day-To-Day", "Out"]);
  assert.throws(() => normalizeInjuryFeed({}, { sport: "nhl", nowIso: NOW }));
  assert.throws(() => normalizeInjuryFeed({}, { sport: "nfl" }), "clock is a parameter, never read");
});

test("DISK TRUTH · committed captures are facts-only, exact, and normalize clean through the contract", () => {
  const fs2 = fs; const path2 = path;
  for (const sport of ["nfl", "nba"]) {
    const p = path2.resolve(process.cwd(), "..", "data", "internal", "research", "injuries", sport, "latest.json");
    const raw = fs2.readFileSync(p, "utf8");
    assert.ok(!/shortComment|longComment/.test(raw), `${sport}: editorial prose is never stored`);
    const a = JSON.parse(raw);
    assert.equal(a.dataClass, "PRIVATE_RESEARCH");
    assert.equal(a.reconciliation.exact, true);
    assert.ok(a.entries.length > 0, `${sport}: the first committed capture carries real entries`);
    for (const e of a.entries.slice(0, 50)) {
      assert.ok(/^\d+$/.test(e.athleteId), `${sport}: id-based identity only`);
      assert.ok(INJURY_STATUSES[sport].includes(e.status), `${sport}: closed taxonomy holds on disk`);
    }
  }
});
