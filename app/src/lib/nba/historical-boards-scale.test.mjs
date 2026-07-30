/**
 * NBA identity at scale — the full committed board corpus, READ-ONLY.
 *
 * The readiness assessment graded gate G2 as FAIL with the note "identity groundwork exists but is
 * untested at scale". A contract that resolves a hand-written fixture proves nothing about a corpus
 * that contains three game-id namespaces, two team-abbreviation conventions, empty off-season
 * scaffolds, and whatever else 61 real files accumulated.
 *
 * So this test loads every board on disk and asserts one thing per board: identity resolution is
 * INJECTIVE, or every unresolvable row is explicitly refused with a reason. There is no third
 * outcome — a row that neither resolves nor refuses is the silent failure the whole contract exists
 * to eliminate.
 *
 * Nothing is written. Board bytes are hashed before and after and compared.
 *
 * Run: npx tsx --test src/lib/nba/historical-boards-scale.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildNbaIdentityIndex,
  matchOddsEvent,
  resolveByGameId,
  validateNbaEvent,
} from "./nba-adapter.ts";
import { validateIdentities } from "../identity/event-identity.ts";
import { canonicalTeamId } from "./identity-contract.ts";
import { TIPOFF_SCHEMA_EPOCH } from "./tipoff-schema.ts";

const BOARDS_DIR = path.resolve(process.cwd(), "public/data/boards");
const AT = "2026-07-30T00:00:00Z";

function boardFiles() {
  return fs
    .readdirSync(BOARDS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
}

function loadBoard(file) {
  return JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, file), "utf-8"));
}

function scheduleRows(board, date) {
  return (board.games ?? []).map((g) => ({
    gameId: String(g.gameId ?? ""),
    date: g.date ?? date,
    homeTeam: g.homeTeamAbbr ?? g.homeTeamFull ?? null,
    awayTeam: g.awayTeamAbbr ?? g.awayTeamFull ?? null,
    tipoffIso: g.tipoffIso ?? null,
    status: g.status ?? null,
  }));
}

test("every committed board resolves injectively or refuses explicitly", () => {
  const files = boardFiles();
  // 61 committed board files, of which 28 carry games (2026-05-04 -> 06-13). The rest are the
  // off-season scaffolds the cron keeps emitting — real artifacts with an empty slate, and part of
  // what "at scale" has to survive.
  assert.ok(files.length >= 61, `expected the historical corpus, found ${files.length} boards`);

  let boardsWithGames = 0;
  let identities = 0;
  const refusalCodes = new Map();

  for (const file of files) {
    const date = file.replace(/\.json$/, "");
    const board = loadBoard(file);
    const rows = scheduleRows(board, date);
    if (rows.length === 0) continue;
    boardsWithGames += 1;

    const index = buildNbaIdentityIndex(rows, AT);
    identities += index.identities.length;
    for (const r of index.refusals) {
      refusalCodes.set(r.code, (refusalCodes.get(r.code) ?? 0) + 1);
    }

    // No row may vanish: it is either an identity or a refusal carrying a reason.
    assert.equal(
      index.identities.length + index.refusals.length,
      rows.length,
      `${date}: ${rows.length} schedule rows produced ${index.identities.length} identities and ${index.refusals.length} refusals`,
    );

    // Universal invariants: no duplicate eventId, no provider id claimed by two events.
    assert.deepEqual(validateIdentities(index.identities), [], `${date}: identity invariants`);

    // Sport-specific structure.
    for (const identity of index.identities) {
      assert.deepEqual(validateNbaEvent(identity), [], `${date}: ${identity.eventId}`);
    }

    // The game-id crosswalk is injective, and every board game resolves back to itself through it.
    assert.ok(index.byGameId.isInjective, `${date}: game-id index collided`);
    for (const row of rows) {
      const resolved = resolveByGameId(index.byGameId, row.gameId);
      if (!resolved) continue; // refused above, with a reason
      const teams = new Set(resolved.participants.map((p) => p.name));
      assert.equal(teams.size, 2, `${date}: ${row.gameId}`);
    }
  }

  assert.equal(boardsWithGames, 28, "boards carrying at least one game");
  assert.equal(identities, 37, "every game row across the corpus became an identity");
  assert.equal(refusalCodes.size, 0, `unresolvable rows: ${[...refusalCodes].join(", ")}`);
  // Refusals are allowed — they are the honest outcome for a row we cannot identify — but they must
  // all carry a known code rather than appearing as an unexplained shortfall.
  for (const code of refusalCodes.keys()) {
    assert.ok(
      ["UNRESOLVED_TEAM", "SAME_TEAM_BOTH_SIDES", "MISSING_DATE", "MISSING_GAME_ID"].includes(code),
      `unexpected refusal code ${code}`,
    );
  }
});

test("every board lean joins to exactly one identity, or to none", () => {
  let joined = 0;
  let unjoined = 0;

  for (const file of boardFiles()) {
    const date = file.replace(/\.json$/, "");
    const board = loadBoard(file);
    const index = buildNbaIdentityIndex(scheduleRows(board, date), AT);
    if (index.identities.length === 0) continue;

    for (const lean of board.leans ?? []) {
      const resolved = resolveByGameId(index.byGameId, String(lean.gameId ?? ""));
      if (resolved) {
        joined += 1;
        // The lean's own team must be one of the two the identity names. This is the check that
        // would have caught a market attached to the wrong game.
        const teams = new Set(resolved.participants.map((p) => p.name));
        const leanTeam = lean.team ?? null;
        if (leanTeam) {
          const code = canonicalTeamId(leanTeam);
          if (code) {
            assert.ok(
              teams.has(code),
              `${date}: lean team ${leanTeam} (${code}) is not in game ${lean.gameId} (${[...teams].join(" v ")})`,
            );
          }
        }
      } else {
        unjoined += 1;
      }
    }
  }

  // 2,204 leans exist across the corpus; every one resolves to exactly one game through the
  // namespaced id index, and every one names a team that game actually contains.
  assert.equal(joined + unjoined, 2204, "every lean is accounted for");
  assert.ok(joined > 2000, `expected the historical lean corpus to join, got ${joined}`);
});

test("the odds→game join by team FULL NAME is replaced, not merely wrapped", () => {
  // The real hazard the readiness doc names: boards write "NY"/"SA" while an odds feed writes
  // "New York Knicks"/"San Antonio Spurs". A full-name join cannot reconcile them; the tricode join
  // must. Exercised against a real board rather than a fixture.
  const file = boardFiles().find((f) => (loadBoard(f).games ?? []).length > 0);
  assert.ok(file, "no board with games found");
  const date = file.replace(/\.json$/, "");
  const board = loadBoard(file);
  const index = buildNbaIdentityIndex(scheduleRows(board, date), AT);
  const game = board.games[0];

  const { identity, refusal } = matchOddsEvent(index, {
    eventId: "odds-fullname",
    homeTeam: game.homeTeamFull,
    awayTeam: game.awayTeamFull,
    date: game.date ?? date,
  });
  assert.equal(refusal, null, refusal?.message);
  assert.ok(identity, "full-name odds event must resolve through the tricode contract");
  assert.deepEqual(
    identity.participants.map((p) => p.name).sort(),
    [canonicalTeamId(game.homeTeamAbbr), canonicalTeamId(game.awayTeamAbbr)].sort(),
  );
});

test("the historical corpus stays research-ineligible and unmodified", () => {
  const before = new Map();
  for (const file of boardFiles()) {
    before.set(file, crypto.createHash("sha256").update(fs.readFileSync(path.join(BOARDS_DIR, file))).digest("hex"));
  }

  let eligible = 0;
  for (const file of boardFiles()) {
    const date = file.replace(/\.json$/, "");
    if (date >= TIPOFF_SCHEMA_EPOCH) continue;
    for (const g of loadBoard(file).games ?? []) {
      if (g.tipoffIso || g.researchEligible) eligible += 1;
    }
  }
  assert.equal(
    eligible,
    0,
    "a pre-epoch board acquired a tip-off instant or an eligibility flag — that evidence cannot have been captured",
  );

  for (const [file, hash] of before) {
    const after = crypto.createHash("sha256").update(fs.readFileSync(path.join(BOARDS_DIR, file))).digest("hex");
    assert.equal(after, hash, `${file} was modified by a read-only scale test`);
  }
});
