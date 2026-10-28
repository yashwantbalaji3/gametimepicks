/* POST-BUILD · the NBA social data contract ships (survives the /data prune) and mirrors the committed lanes. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const BASE = path.join(OUT, "data", "social", "nba", "v1");
const LANES = path.join(process.cwd(), "public", "data", "nba", "experimental-public");

test("index, latest and every listed day file are exported; each event mirrors its lane", (t) => {
  if (!fs.existsSync(path.join(OUT, "index.html"))) { t.skip("no export in this run"); return; }
  if (!fs.existsSync(LANES) || !fs.readdirSync(LANES).some((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) { t.skip("no NBA lane committed"); return; }
  const index = JSON.parse(fs.readFileSync(path.join(BASE, "index.json"), "utf8"));
  assert.equal(index.schemaVersion, "gtp-social-nba@1");
  assert.ok(index.days.length > 0);
  const latest = JSON.parse(fs.readFileSync(path.join(BASE, "latest.json"), "utf8"));
  assert.equal(latest.date, index.latest);
  for (const { date } of index.days) {
    const day = JSON.parse(fs.readFileSync(path.join(BASE, `${date}.json`), "utf8"));
    const lane = JSON.parse(fs.readFileSync(path.join(LANES, `${date}.json`), "utf8"));
    assert.equal(day.events.length, lane.games.length, date);
    for (const [i, e] of day.events.entries()) {
      const g = lane.games[i];
      assert.equal(e.eventId, String(g.providerEventId));
      assert.equal(e.frozenAt, g.frozenAt);
      assert.equal(e.receipt.payloadSha256, g.receipt.payloadSha256);
      assert.equal(e.official.favouredTeam, g.elo.state === "FAVOURED" ? g.elo.favoured : null);
    }
    assert.doesNotMatch(JSON.stringify(day), /americanOdds|"odds":|"line":/, `${date}: no price fields`);
  }
});
