import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nearMissPitcherIdentities, normaliseName } from "./board-player-identity.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BOARDS = path.join(APP, "public/data/mlb/boards");

/*
 * THE REGISTER (P286). Two real people, keyed by their Stats API id — never by a name, because the
 * two spellings are the whole problem. Each is a pitcher whose prop rows carry no identity while
 * the same board names them, with an id, as a probable pitcher of that very game.
 *
 * This register is a BOUND, not an approval. It exists so the third occurrence fails this test the
 * day it lands instead of joining an invisible pile, and so the founder has the ids an ingest-time
 * alias would be keyed on. Adding an id here is a decision to leave a known gap open; it should be
 * accompanied by a reason, and shrinking the register is the only change that needs no argument.
 */
const KNOWN = new Map([
  [804267, { statsApi: "Zac Thornton", provider: "Zach Thornton" }],
  [691951, { statsApi: "Sam Aldegheri", provider: "Samuel Aldegheri" }],
  // Initials, not a nickname — and the largest of the three (16 rows). A normaliser that DELETES
  // punctuation joins this one; one that replaces it with a space does not. The gap is therefore
  // sensitive to a choice no join site states, which is its own reason to fix it at ingest by id.
  [669372, { statsApi: "J.T. Ginn", provider: "JT Ginn" }],
]);

test("normaliseName folds accents and punctuation without merging distinct names", () => {
  assert.equal(normaliseName("José Ramírez"), "jose ramirez");
  assert.equal(normaliseName("  A.J.  Puk "), "a j puk");
  assert.equal(normaliseName(null), "");
  assert.notEqual(normaliseName("Zach Thornton"), normaliseName("Zac Thornton"));
});

test("the detector reports a prefix-variant given name and nothing else", () => {
  const board = {
    date: "2026-09-12",
    games: [{ gamePk: 1, awayProbablePitcherId: 804267, awayProbablePitcherName: "Zac Thornton", homeProbablePitcherId: 543037, homeProbablePitcherName: "Gerrit Cole" }],
    leans: [
      { gamePk: 1, playerId: null, playerRole: "pitcher", playerName: "Zach Thornton", marketKey: "pitcher_strikeouts" },
      { gamePk: 1, playerId: null, playerRole: "pitcher", playerName: "Gerrit Cole", marketKey: "pitcher_strikeouts" },   // spellings agree
      { gamePk: 1, playerId: 999, playerRole: "pitcher", playerName: "Zach Thornton", marketKey: "pitcher_outs" },        // already joined
      { gamePk: 1, playerId: null, playerRole: "batter", playerName: "Zach Thornton", marketKey: "batter_hits" },         // not a probable-pitcher pairing
      { gamePk: 1, playerId: null, playerRole: "pitcher", playerName: "Marcus Cole", marketKey: "pitcher_strikeouts" },   // different given name = different person
      { gamePk: 2, playerId: null, playerRole: "pitcher", playerName: "Zach Thornton", marketKey: "pitcher_strikeouts" }, // no such game on this board
    ],
  };
  const found = nearMissPitcherIdentities(board);
  assert.equal(found.length, 1, `only the prefix variant is a near miss; got ${JSON.stringify(found)}`);
  assert.equal(found[0].statsApiId, 804267);
  assert.equal(found[0].providerName, "Zach Thornton");
  assert.equal(found[0].statsApiName, "Zac Thornton");
});

test("two probable pitchers sharing a surname are never resolved — that is the case guessing gets wrong", () => {
  const board = {
    date: "2026-09-12",
    games: [{ gamePk: 1, awayProbablePitcherId: 1, awayProbablePitcherName: "Zac Thornton", homeProbablePitcherId: 2, homeProbablePitcherName: "Zachary Thornton" }],
    leans: [{ gamePk: 1, playerId: null, playerRole: "pitcher", playerName: "Zach Thornton", marketKey: "pitcher_strikeouts" }],
  };
  assert.deepEqual(nearMissPitcherIdentities(board), [], "ambiguity abstains rather than picking a brother");
});

test("the detector never invents an identity: it reports, and the row is left as it was", () => {
  const row = { gamePk: 1, playerId: null, playerRole: "pitcher", playerName: "Zach Thornton", marketKey: "pitcher_strikeouts" };
  const board = { date: "d", games: [{ gamePk: 1, awayProbablePitcherId: 804267, awayProbablePitcherName: "Zac Thornton" }], leans: [row] };
  nearMissPitcherIdentities(board);
  assert.equal(row.playerId, null, "detection must not mutate the artifact it read");
});

test("every knowably-unjoined pitcher in the committed corpus is one of the registered ids", () => {
  const files = fs.existsSync(BOARDS) ? fs.readdirSync(BOARDS).filter((f) => f.endsWith(".json")) : [];
  assert.ok(files.length > 0, "no committed boards to sweep — this guard would pass vacuously");

  const byId = new Map();
  for (const f of files) {
    let board;
    try { board = JSON.parse(fs.readFileSync(path.join(BOARDS, f), "utf8")); } catch { continue; }
    for (const hit of nearMissPitcherIdentities(board)) {
      const seen = byId.get(hit.statsApiId) ?? { rows: 0, statsApi: hit.statsApiName, provider: hit.providerName, dates: new Set() };
      seen.rows += 1;
      seen.dates.add(hit.date ?? f.replace(".json", ""));
      byId.set(hit.statsApiId, seen);
    }
  }

  const unregistered = [...byId.entries()].filter(([id]) => !KNOWN.has(id));
  assert.deepEqual(
    unregistered.map(([id, v]) => `${id}: "${v.statsApi}" (Stats API) vs "${v.provider}" (odds provider), ${v.rows} row(s)`),
    [],
    "a new pitcher's props cannot be joined to the pitcher the same board names — register the id with a reason, or fix the join at ingest",
  );

  // And the register may not outlive its subjects: an id nobody hits any more is stale bookkeeping.
  for (const [id, want] of KNOWN) {
    const hit = byId.get(id);
    assert.ok(hit, `registered id ${id} (${want.statsApi}) no longer appears — remove it from the register`);
    assert.equal(hit.statsApi, want.statsApi, `id ${id}: the Stats API spelling changed`);
    assert.equal(hit.provider, want.provider, `id ${id}: the provider spelling changed`);
  }
});
