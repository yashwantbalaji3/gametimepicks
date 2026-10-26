/**
 * POST-BUILD · settled EPL match pages lead with the official result (founder P1 2026-10-26), read from the built export:
 * every graded fixture's page carries the "What happened" panel with the ledger's full-time score, and a fixture the
 * ledger has not graded carries none.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const OUT = path.join(APP, "out");
const ledger = fs.readFileSync(path.join(APP, "public/data/soccer/epl/results/graded-forecasts.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("every graded fixture's built page shows its official full-time score; ungraded pages show no result panel", (t) => {
  if (!fs.existsSync(path.join(OUT, "index.html"))) { t.skip("no export in this run"); return; }
  const dir = path.join(OUT, "epl", "match");
  const pages = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "index.html")));
  const graded = new Map(ledger.map((g) => [g.eventId, g]));
  let withPanel = 0;
  for (const slug of pages) {
    const html = fs.readFileSync(path.join(dir, slug, "index.html"), "utf8");
    const m = /data-epl-what-happened="([^"]+)"/.exec(html);
    if (!m) continue;
    const g = graded.get(m[1]);
    assert.ok(g, `${slug}: a result panel for an ungraded fixture (${m[1]})`);
    assert.match(html, new RegExp(`Full time: [^<]* ${g.actual.homeGoalsFT} – ${g.actual.awayGoalsFT} `), `${slug}: the ledger's score`);
    withPanel += 1;
  }
  assert.equal(withPanel, ledger.length, "every graded fixture's page carries the panel");
});
