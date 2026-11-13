/**
 * The player board is addressable per game: "#game-<event id>" opens /nba/projections on one game, and the hub's
 * Official Forecast rows link there. These pin the fragment contract and the two ends that must agree on it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { boardGameHash, gameFromHash, boardOptions, boardRows } from "./projection-board-ops.mjs";
import { STATS } from "./experimental-public-lane.mjs";

const SRC = new URL("../../../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, SRC), "utf8");
const lane = JSON.parse(fs.readFileSync(new URL("../../../../public/data/nba/experimental-public/latest.json", import.meta.url), "utf8"));

test("a game's fragment round-trips to the same game", () => {
  for (const id of ["401909296", "401909304"]) assert.equal(gameFromHash(boardGameHash(id), ["401909296", "401909304"]), id);
  assert.equal(gameFromHash("game-401909296", ["401909296"]), "401909296", "location.hash without the # is accepted");
});

test("a fragment that names no game on this board selects nothing", () => {
  const ids = ["401909296"];
  for (const h of ["", "#", null, undefined, "#game-", "#game-999", "#nba-boards", "#game-401909296&x=1", "#game-<script>", "#GAME-401909296", `#game-${"1".repeat(41)}`]) {
    assert.equal(gameFromHash(h, ids), "", String(h));
  }
});

test("every game in the committed lane is reachable by its fragment, with player rows behind it", () => {
  const { matchups } = boardOptions(lane);
  const ids = matchups.map((m) => m.id);
  const rows = boardRows(lane, STATS);
  for (const g of lane.games) {
    const id = gameFromHash(boardGameHash(g.providerEventId), ids);
    assert.equal(id, String(g.providerEventId));
    if (g.players.away.length + g.players.home.length > 0) assert.ok(rows.some((r) => r.game === id), `${g.away.abbr} @ ${g.home.abbr} has rows on the board`);
  }
});

test("the hub's forecast row and the board use the one fragment helper", () => {
  const hub = read("components/nba/experimental-lane.tsx");
  assert.match(hub, /href=\{`\/nba\/projections\/\$\{boardGameHash\(g\.providerEventId\)\}`\}/, "hub row links to the board on its game");
  const board = read("components/nba/projection-board.tsx");
  assert.match(board, /gameFromHash\(window\.location\.hash, gameIds\)/, "board reads the fragment against its own games");
  assert.match(board, /boardGameHash\(id\)/, "board writes the same fragment back");
});
