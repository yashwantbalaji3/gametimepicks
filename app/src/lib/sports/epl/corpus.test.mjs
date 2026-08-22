/**
 * The training set: a frozen base, an accreted season, and a cutoff that prevents leakage.
 *
 * Run: npx tsx --test src/lib/sports/epl/corpus.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { BASE_CORPUS, CURRENT_CORPUS, corpusKey, loadEplCorpus } from "./corpus.mjs";
import { fitEplStrength } from "./strength-state.mjs";

const REPO = path.resolve(process.cwd(), "..");
const base = JSON.parse(fs.readFileSync(path.join(REPO, BASE_CORPUS), "utf8"));

test("THE BASE CORPUS IS FROZEN — four validated seasons, never written to by accretion", () => {
  assert.equal(base.rows.length, 1520, "2022-23 through 2025-26, 380 matches each");
  const seasons = [...new Set(base.rows.map((r) => r.season))].sort();
  assert.deepEqual(seasons, ["2022-23", "2023-24", "2024-25", "2025-26"]);
  // Accretion writes to its own file. A defect there must not be able to corrupt the history the
  // model was validated against — the same discipline as never overwriting raw MLB predictions.
  const accretion = fs.readFileSync(path.join(process.cwd(), "scripts/epl/accrete-epl-corpus.mjs"), "utf8");
  assert.doesNotMatch(accretion, /writeFileSync\([^)]*BASE_CORPUS/, "accretion must never write the base corpus");
  assert.match(accretion, /writeFileSync\([^)]*CURRENT_CORPUS/, "accretion writes only the current-season file");
});

test("the loader concatenates base and current, chronologically", () => {
  const out = loadEplCorpus(REPO);
  assert.equal(out.base, 1520);
  assert.equal(out.rows.length, out.base + out.current);
  for (let i = 1; i < out.rows.length; i++) {
    assert.ok(String(out.rows[i - 1].dateUtc) <= String(out.rows[i].dateUtc), "rows must be in date order for a walk-forward fit");
  }
});

test("LEAKAGE · a settled match is invisible to a fit whose cutoff precedes it", () => {
  const out = loadEplCorpus(REPO);
  const current = out.rows.filter((r) => r.season === "2026-27");
  if (!current.length) return; // nothing accreted yet
  const first = current.sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)))[0];
  const kickoff = Date.parse(first.dateUtc);

  /*
   * Compared as a VALUE, not as an object graph.
   *
   * The fitted state carries `displayName`, a closure, and two separately-built closures are never
   * reference-equal — so a deepEqual over the whole state fails on two identical fits and reads as a
   * leakage alarm. It did, and the alarm was mine, not the model's.
   */
  const comparable = (st) => ({
    matchesFitted: st.matchesFitted,
    muHome: st.muHome,
    muAway: st.muAway,
    knownClubs: [...st.knownClubs].sort(),
    stats: [...st.stats.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  });

  // The property that lets a result be accreted the instant it settles: the FIT decides what it may
  // see, not the file. At the cutoff, base+current must be indistinguishable from base alone.
  const atKickoff = comparable(fitEplStrength({ rows: out.rows, cutoffIso: new Date(kickoff).toISOString() }));
  const baseOnly = comparable(fitEplStrength({ rows: base.rows, cutoffIso: new Date(kickoff).toISOString() }));
  assert.deepEqual(atKickoff, baseOnly, "a match at or after the cutoff must not reach the fit");
  assert.equal(atKickoff.matchesFitted, base.rows.length, "every historical match, and nothing newer");

  // And one second later it MUST differ, or accretion is decorative and nothing is being learned.
  const after = comparable(fitEplStrength({ rows: out.rows, cutoffIso: new Date(kickoff + 1000).toISOString() }));
  assert.notDeepEqual(after, baseOnly, "once a match is in the past the model must actually learn from it");
  assert.equal(after.matchesFitted, base.rows.length + 1, "exactly the one settled match joins the fit");
  // And the clubs it involved are now known to the model, which is the cold start beginning to clear.
  assert.equal(after.knownClubs.includes("coventry city"), true, "a promoted club enters the fit by playing");
});

test("the promoted clubs are exactly who the cold start is about", () => {
  // Coventry City and Hull City appear nowhere in four seasons of top-flight results, which is why
  // the fit falls back to a league-average stand-in and produced Hull City at 42.2% at home to
  // Manchester United against a market price of 10.6%. Accretion is the only thing that ever
  // changes that, so the premise is pinned rather than assumed.
  const names = new Set(base.rows.flatMap((r) => [r.home, r.away]));
  assert.equal(names.has("Coventry City"), false, "no top-flight history — this is the cold start");
  assert.equal(names.has("Hull City"), false);
  assert.equal(names.has("Arsenal"), true, "an established club must be present, or the check is meaningless");
});

test("identity is club-pair plus DAY — a rescheduled kickoff is the same match", () => {
  const a = { home: "Arsenal", away: "Coventry City", dateUtc: "2026-08-21T19:00Z" };
  const b = { home: "Arsenal", away: "Coventry City", dateUtc: "2026-08-21T19:15Z" };
  assert.equal(corpusKey(a), corpusKey(b), "a fifteen-minute move is not a different match");
  // Sorted, so a swapped home/away reading cannot admit the same fixture twice.
  assert.equal(corpusKey(a), corpusKey({ home: "Coventry City", away: "Arsenal", dateUtc: "2026-08-21T19:00Z" }));
  assert.notEqual(corpusKey(a), corpusKey({ ...a, dateUtc: "2026-12-26T15:00Z" }), "the reverse fixture IS a different match");
});

test("a row in both files is counted once", () => {
  // The accretion script refuses to add a match the base already holds, but a loader that trusted
  // that is one bad merge away from double-weighting a season.
  const out = loadEplCorpus(REPO);
  const keys = out.rows.map(corpusKey);
  assert.equal(new Set(keys).size, keys.length, "no match may appear twice in the fitted corpus");
});

test("an unreadable BASE refuses rather than fitting on the current season alone", () => {
  // Silently proceeding would leave the model catastrophically under-trained while still returning
  // a state that looks like a working fit.
  assert.throws(() => loadEplCorpus("/nonexistent-repo-root"), /refusing to fit on a partial history/);
});
