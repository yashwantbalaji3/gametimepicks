/**
 * P248 · Release A — the population/outcome contract's adversarial fixtures, plus a live
 * false-match audit of the real corpus. Every state the charter names is exercised with a
 * fixture that would have been misclassified under some earlier rule; the live section audits
 * the fallback for FALSE MATCHES (join "success" is not join correctness) and enumerates the
 * unmatched residue explicitly rather than letting it vanish into a percentage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  POPULATION_CONTRACT_VERSION,
  classifyParticipation,
  outcomeForAbsentCandidate,
  normName,
} from "./participation-truth.mjs";

const APP = process.cwd();

/** A tiny synthetic season sheet: one REG week-1 team, one postseason WC game. */
const FIX = {
  schemaVersion: 2,
  players: {
    "REG|1|KC|travis kelce": [61, 0, 2],
    "REG|1|KC|justin watson": [0, 0, 14],       // special-teams only
    "REG|1|KC|zeroed rowman": [0, 0, 0],        // a 0/0/0 sheet row still means DRESSED
    "REG|1|KC|marquise brown": [40, 0, 0],      // nickname target ("Hollywood")
    "REG|1|KC|alex smith": [10, 0, 0],
    "REG|1|KC|jonathan smith": [0, 5, 0],
    "WC|19|KC|travis kelce": [55, 0, 0],        // nflverse numbers playoff weeks 19+
  },
  byLast: {
    "REG|1|KC|kelce": { "travis kelce": [61, 0, 2] },
    "REG|1|KC|watson": { "justin watson": [0, 0, 14] },
    "REG|1|KC|rowman": { "zeroed rowman": [0, 0, 0] },
    "REG|1|KC|brown": { "marquise brown": [40, 0, 0] },
    "REG|1|KC|smith": { "alex smith": [10, 0, 0], "jonathan smith": [0, 5, 0] },
    "WC|19|KC|kelce": { "travis kelce": [55, 0, 0] },
  },
  teamWeeks: ["REG|1|KC", "WC|19|KC"],
};
const REG1 = { week: 1, seasonType: 2, dateUtc: "2025-09-07T17:00Z" };

test("contract version is stamped and the doc version is enforced LOUDLY", () => {
  assert.equal(POPULATION_CONTRACT_VERSION, 2);
  assert.throws(
    () => classifyParticipation({ part: { schemaVersion: 1 }, game: REG1, teamAbbr: "KC", playerName: "x" }),
    /schemaVersion 1/,
    "a v1 doc must refuse, never silently collapse states",
  );
});

test("ADVERSARIAL · each named state resolves distinctly, never a default zero or silent void", () => {
  const c = (name, game = REG1) => classifyParticipation({ part: FIX, game, teamAbbr: "KC", playerName: name });
  // played on offense
  assert.deepEqual([c("Travis Kelce").state, c("Travis Kelce").matchMethod], ["PLAYED_OFFENSE", "exact"]);
  // special-teams only — dressed, volume props settle 0, NOT a DNP
  assert.equal(c("Justin Watson").state, "PLAYED_NO_OFFENSE");
  // a 0/0/0 sheet row is still a dressed player
  assert.equal(c("Zeroed Rowman").state, "PLAYED_NO_OFFENSE");
  // nickname variant resolves through the UNIQUE last-name fallback
  const hollywood = c("Hollywood Brown");
  assert.deepEqual([hollywood.state, hollywood.matchMethod, hollywood.matchedName], ["PLAYED_OFFENSE", "unique-last-name", "marquise brown"]);
  // same-name collision NEVER guesses
  const smith = c("Josh Smith");
  assert.equal(smith.state, "AMBIGUOUS_IDENTITY");
  assert.equal(smith.candidates.length, 2);
  // absent from a complete team sheet = did not dress
  assert.equal(c("Kareem Hunt").state, "DID_NOT_DRESS");
  // no sheet for the team-game at all = SOURCE_MISSING, never an inference about the player
  assert.equal(classifyParticipation({ part: FIX, game: REG1, teamAbbr: "SF", playerName: "Brock Purdy" }).state, "SOURCE_MISSING");
  // postseason: corpus week 1 in January = Wild Card, found at nflverse week 19
  const wc = classifyParticipation({ part: FIX, game: { week: 1, phase: null, seasonType: 3, dateUtc: "2026-01-11T18:00Z" }, teamAbbr: "KC", playerName: "Travis Kelce" });
  assert.equal(wc.state, "PLAYED_OFFENSE");
  // traded player: on this team's sheet he is simply absent — DID_NOT_DRESS for THIS game;
  // his presence on another team's sheet is that team-game's classification, not this one's.
  assert.equal(c("Traded Elsewhere").state, "DID_NOT_DRESS");
});

test("OUTCOMES · absent-candidate scoring follows the market meaning of each state", () => {
  assert.deepEqual(outcomeForAbsentCandidate({ state: "PLAYED_OFFENSE" }).kind, "SCORED");
  assert.equal(outcomeForAbsentCandidate({ state: "PLAYED_NO_OFFENSE" }).actual, 0);
  assert.equal(outcomeForAbsentCandidate({ state: "DID_NOT_DRESS" }).kind, "VOID");
  assert.equal(outcomeForAbsentCandidate({ state: "AMBIGUOUS_IDENTITY", candidates: ["a", "b"] }).kind, "EXCLUDED");
  assert.equal(outcomeForAbsentCandidate({ state: "SOURCE_MISSING" }).kind, "EXCLUDED");
  assert.throws(() => outcomeForAbsentCandidate({ state: "???" }), /unknown participation state/);
});

test("LIVE · false-match audit: unique-last-name resolutions almost always agree on the first initial", () => {
  // Join SUCCESS is not join CORRECTNESS: a fallback could "find" the wrong person. For every
  // stat-recording corpus player, resolve by contract and, when the fallback fired, compare
  // first initials (nicknames — Gabe/Gabriel, Chig/Chigoziem, Hollywood/Marquise — usually
  // keep the surname AND differ in the first token, so an initial mismatch is possible for a
  // legitimate nickname; a HIGH rate would mean the fallback is matching different people).
  const seasons = [2023, 2024, 2025].map((y) =>
    [y, JSON.parse(fs.readFileSync(path.join(APP, `../data/internal/research/nfl/participation-truth-v1/${y}.json`), "utf8"))]);
  let exact = 0; let fallback = 0; let initialMismatch = 0; const mismatches = [];
  for (const [y, part] of seasons) {
    const corpus = JSON.parse(fs.readFileSync(path.join(APP, `../data/internal/research/nfl/player-events-v1/${y}.json`), "utf8"));
    for (const g of corpus.games) {
      if ((g.seasonType ?? 0) === 1) continue;
      for (const p of g.players ?? []) {
        if (!["passAtt", "rushAtt", "targets"].some((k) => (p[k] ?? 0) > 0)) continue;
        const c = classifyParticipation({ part, game: g, teamAbbr: p.teamAbbr, playerName: p.name });
        if (c.matchMethod === "exact") exact += 1;
        else if (c.matchMethod === "unique-last-name") {
          fallback += 1;
          if (normName(p.name)[0] !== c.matchedName[0]) {
            initialMismatch += 1;
            if (mismatches.length < 12) mismatches.push(`${y} ${p.teamAbbr} "${p.name}" -> "${c.matchedName}"`);
          }
        }
      }
    }
  }
  assert.ok(exact > 15000, `exact matches carry the join (${exact})`);
  assert.ok(fallback / (exact + fallback) < 0.03, `fallback share ${(fallback / (exact + fallback) * 100).toFixed(2)}% — the fallback must stay a minority path`);
  /*
   * Initial mismatch turned out to be the WRONG instrument: the first audit flagged 72/273 and
   * every sampled case was a legitimate nickname alias (Drew/Andrew Ogletree, Hollywood/
   * Marquise Brown, Bam/Zonovan Knight, Zeke/Ezekiel Turner) — the exact population the
   * fallback exists to serve. It stays as a reported diagnostic with a loose cap; the REAL
   * correctness invariants are below: a fallback that matched a different person would (a)
   * flicker across the season as rosters change, or (b) let two different corpus names claim
   * one snap row in the same game.
   */
  assert.ok(initialMismatch <= fallback * 0.5, `initial-mismatch diagnostic ${initialMismatch}/${fallback}: ${mismatches.slice(0, 6).join("; ")}`);
});

test("LIVE · fallback correctness invariants: season-stable mapping, one claimant per snap row", () => {
  const seasons = [2023, 2024, 2025].map((y) =>
    [y, JSON.parse(fs.readFileSync(path.join(APP, `../data/internal/research/nfl/participation-truth-v1/${y}.json`), "utf8"))]);
  const flicker = []; const collisions = [];
  for (const [y, part] of seasons) {
    const corpus = JSON.parse(fs.readFileSync(path.join(APP, `../data/internal/research/nfl/player-events-v1/${y}.json`), "utf8"));
    const seasonMap = new Map(); // corpus name+team -> Set(matchedName)
    for (const g of corpus.games) {
      if ((g.seasonType ?? 0) === 1) continue;
      const claims = new Map(); // matchedName+team -> corpus names claiming it in THIS game
      for (const p of g.players ?? []) {
        if (!["passAtt", "rushAtt", "targets"].some((k) => (p[k] ?? 0) > 0)) continue;
        const c = classifyParticipation({ part, game: g, teamAbbr: p.teamAbbr, playerName: p.name });
        if (!c.matchedName) continue;
        const mk = `${p.teamAbbr}|${c.matchedName}`;
        (claims.get(mk) ?? claims.set(mk, new Set()).get(mk)).add(normName(p.name));
        if (c.matchMethod === "unique-last-name") {
          const sk = `${p.teamAbbr}|${normName(p.name)}`;
          (seasonMap.get(sk) ?? seasonMap.set(sk, new Set()).get(sk)).add(c.matchedName);
        }
      }
      for (const [mk, names] of claims) {
        if (names.size > 1 && collisions.length < 8) collisions.push(`${y} ${g.week} ${mk} <- ${[...names].join(" + ")}`);
      }
    }
    for (const [sk, matched] of seasonMap) {
      if (matched.size > 1 && flicker.length < 8) flicker.push(`${y} ${sk} -> ${[...matched].join(" | ")}`);
    }
  }
  assert.deepEqual(collisions, [], `two corpus names claimed one snap row: ${collisions.join("; ")}`);
  assert.deepEqual(flicker, [], `a fallback mapping flickered across the season: ${flicker.join("; ")}`);
});

test("LIVE · the unmatched residue is enumerated and typed, never silently excluded", () => {
  const index = JSON.parse(fs.readFileSync(path.join(APP, "../data/internal/research/nfl/participation-truth-v1/index.json"), "utf8"));
  const v = index.validation;
  assert.ok(v.rate >= 0.99, "join validation floor");
  const residue = v.statRecordingPlayers - v.resolvedWithSnaps;
  assert.ok(residue === v.sampleMisses.length || v.sampleMisses.length === 10,
    `the residue (${residue}) must be fully enumerated in sampleMisses unless it exceeds the sample cap`);
});
