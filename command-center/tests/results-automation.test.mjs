import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createFileStore } from "../ledger/store.mjs";
import { createResultsAutomation, replyText } from "../orchestrator/results-automation.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { REPO_ROOT } from "../lib/util.mjs";
import { tempDir } from "./helpers.mjs";

const src = gitDataSource(REPO_ROOT, "d367dd50fac6"); // Oct 28 lane + finals: ATL predicted, MIA won; CLE predicted, CLE won
const clock = () => "2026-10-29T12:00:00.000Z";
const post = (eventId, favoured) => ({ postId: `p${eventId}`, decisionId: `d${eventId}`, receipt: { providerPostId: "1", canonicalUrl: "u" }, package: { kind: "nba-game", eventId, favoured, date: "2026-10-28" } });

test("settles from the official finals, records wins and misses once, sends nothing, flags a mismatch", async () => {
  const b = await (await import("../recap/results-accuracy.mjs")).resultsAccuracy({ src, date: "2026-10-28" });
  const win = b.games.find((g) => g.correct), miss = b.games.find((g) => !g.correct), bad = b.games.filter((g) => g.correct)[1];
  const store = createFileStore({ dir: path.join(tempDir("gtp-ra-"), "ledger"), clock });
  const posts = [post(win.eventId, win.predictedWinner), post(miss.eventId, miss.predictedWinner), post(bad.eventId, "XXX"), post("nope", "ATL")];
  const a = createResultsAutomation({ store, clock, posts: () => posts, dataSource: () => src });
  assert.deepEqual(await a.tick(), { checked: 4, recorded: 2, waiting: 1, exceptions: 1 });
  assert.equal((await a.tick()).recorded, 0, "once only");
  const s = a.state();
  assert.deepEqual(s.outcomes.map((o) => o.outcome).sort(), ["MISS", "WIN"]);
  assert.ok(s.outcomes.every((o) => o.replyState === "PREPARED_NOT_SENT"));
  assert.equal(s.exceptions[0].code, "PREDICTION_MISMATCH");
  assert.match(replyText("MISS", "ATL", "k"), /missed/);
});
