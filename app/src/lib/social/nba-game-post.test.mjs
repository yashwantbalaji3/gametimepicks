import assert from "node:assert/strict";
import { test } from "node:test";

import { CAPTION_PLAYER_RULE, gamePostCaption, gamePostCaptionProblems, gamePostClaims, selectCaptionPlayers } from "./nba-game-post.mjs";
import { CC_KIND, CONTENT_TYPE, nextRevision, xWeighted } from "./social-package.mjs";
import { CARD_FOOTER, DISCLOSURE } from "../../../scripts/social/game-day-cards.mjs";

const pl = (id, name, pts, reb = 4, ast = 2.9) => ({ providerAthleteId: id, name, medians: { pts, reb, ast } });
const PL = [pl("1", "Brandon Miller", 19.4, 4, 2.9), pl("2", "Anthony Davis", 15.4, 8.5, 2.1), pl("3", "Flagged Star", 30)];

test("players: highest points without a verdict; a fallback is recorded", () => {
  const a = selectCaptionPlayers(PL, [{ playerId: "3", market: "reb" }]);
  assert.deepEqual(a.players.map((p) => p.name), ["Brandon Miller", "Anthony Davis"]);
  assert.equal(a.fallback, false);
  assert.equal(a.rule, CAPTION_PLAYER_RULE);
  const b = selectCaptionPlayers(PL, ["1", "2"].map((playerId) => ({ playerId, market: "pts" })));
  assert.deepEqual(b.players.map((p) => p.name), ["Flagged Star", "Brandon Miller"]);
  assert.equal(b.fallback, true);
  assert.deepEqual(b.fallbackPlayers, ["1"]);
  assert.equal(selectCaptionPlayers(PL, [{ playerId: "3", market: "threePm" }]).players[0].name, "Flagged Star");
});

test("caption: the founder's form, claims cover every number, rules enforced", () => {
  const players = PL.slice(0, 2);
  const text = gamePostCaption({ awayName: "Charlotte Hornets", homeName: "Washington Wizards", winnerNickname: "Hornets", players });
  assert.equal(text, "🏀 Charlotte Hornets vs Washington Wizards tonight!\n\nOur model projects the Hornets to win.\n\nTwo players to watch:\n🔥 Brandon Miller: 19.4 PTS | 4.0 REB | 2.9 AST\n🔥 Anthony Davis: 15.4 PTS | 8.5 REB | 2.1 AST\n\nFull predictions below 👇");
  assert.ok(xWeighted(text) <= 280);
  const claims = gamePostClaims(players, "x");
  assert.deepEqual(gamePostCaptionProblems(text, claims), []);
  assert.ok(gamePostCaptionProblems(text, claims.slice(1)).length);
  for (const bad of ["50% sure", "a — b", "odds", "best bets", "parlay", "our picks", "see https://x.co", "not betting advice"]) assert.ok(gamePostCaptionProblems(bad, []).length || bad === "not betting advice", bad);
});

test("revision moves with an image or caption, not on an identical render", () => {
  const prior = { images: [{ sha256: "a" }], caption: "c", commandCenter: { captions: [{ text: "t" }] } };
  const same = { images: [{ sha256: "a" }], caption: "c", ccCaption: "t" };
  assert.equal(nextRevision(null, same), 1);
  assert.equal(nextRevision(prior, same), 1);
  assert.equal(nextRevision(prior, { ...same, images: [{ sha256: "b" }] }), 2);
  assert.equal(nextRevision({ ...prior, revision: 2 }, { ...same, ccCaption: "u" }), 3);
});

test("footer is one constant with one line; game post is a known type with no queue kind", () => {
  assert.deepEqual([...CARD_FOOTER.lines], ["Model projections · Not betting advice"]);
  assert.equal(DISCLOSURE, CARD_FOOTER.lines[0]);
  assert.equal(CC_KIND.NBA_GAME_POST, null);
  assert.equal(CONTENT_TYPE.NBA_GAME_POST, "NBA_GAME_POST");
});
