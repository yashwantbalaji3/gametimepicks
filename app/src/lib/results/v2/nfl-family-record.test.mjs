/**
 * Session 5 · B7 — NFL season-to-date record by prop family, folded from the week reconciliation (the owner).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { nflFamilyRecord, nflFamilyRows } from "./nfl-family-record.mjs";

const wk = (key, props, games = [], gamesFinal = 16, gamesPending = 0) => ({ key, label: key, report: { period: { label: key }, summary: { gamesFinal, gamesPending, props }, games } });

test("the owner's weekly family summaries fold into one season record; voids never enter the denominator", () => {
  const r = nflFamilyRecord([
    wk("2-01", [{ id: "player_receptions", label: "Receptions", group: "player", target: 0.8, checks: 100, hits: 81, voids: 12 }]),
    wk("2-02", [{ id: "player_receptions", label: "Receptions", group: "player", target: 0.8, checks: 120, hits: 99, voids: 9 }]),
  ]);
  const f = r.families[0];
  assert.deepEqual({ won: f.total.won, lost: f.total.lost, void: f.total.void, decisive: f.total.decisive }, { won: 180, lost: 40, void: 21, decisive: 220 });
  assert.equal(f.total.hitRate, 180 / 220);
  assert.equal(f.byWeek.length, 2);
});

test("a pending week contributes nothing and is listed as pending — never counted as misses", () => {
  const r = nflFamilyRecord([wk("2-03", [{ id: "winner", label: "Winner", checks: 16, hits: 11, voids: 0 }]), wk("2-04", [], [], 0, 16)]);
  assert.equal(r.families[0].total.lost, 5);
  assert.deepEqual(r.weeks.at(-1), { key: "2-04", label: "2-04", gamesFinal: 0, gamesPending: 16 });
});

test("drill-down rows are the owner's graded rows for that family, outcome verbatim", () => {
  const report = { games: [{ matchup: "PIT @ CLE", team: [{ prop: "winner", outcome: "MISS" }], players: [{ name: "A", team: "PIT", prop: "player_receptions", low: 1, median: 3, high: 6, actual: 4, outcome: "HIT" }, { name: "B", team: "PIT", prop: "player_receptions", outcome: "VOID" }, { name: "C", team: "PIT", prop: "player_receptions", outcome: "NO_LINE" }] }] };
  const rows = nflFamilyRows(report, "player_receptions");
  assert.deepEqual(rows.map((x) => x.outcome), ["HIT", "VOID"], "NO_LINE is not a graded row");
});

test("LIVE: on the committed weeks, drill-down rows reproduce the owner's own per-family counts", () => {
  const dir = path.join(process.cwd(), "public/data/nfl/reconciliation");
  const idx = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  const weeks = idx.weeks.map((w) => ({ key: w.key, label: w.label, report: JSON.parse(fs.readFileSync(path.join(dir, `${w.key}.json`), "utf8")) }));
  const rec = nflFamilyRecord(weeks);
  assert.ok(rec.families.length > 0);
  for (const { key, report } of weeks) {
    for (const p of report.summary.props ?? []) {
      const rows = nflFamilyRows(report, p.id);
      const hits = rows.filter((x) => x.outcome === "HIT").length;
      const misses = rows.filter((x) => x.outcome === "MISS").length;
      assert.equal(hits, p.hits, `${key} ${p.id}: drill-down hits must equal the owner's summary`);
      assert.equal(hits + misses, p.checks, `${key} ${p.id}: drill-down decided rows must equal the owner's checks`);
    }
  }
  const total = rec.families.reduce((s, f) => s + f.total.decisive, 0);
  const owner = idx.weeks.reduce((s, w) => s + (w.overall?.checks ?? 0), 0);
  assert.equal(total, owner, "the season fold must equal the sum of the owner's weekly checks");
});

test("WIRED: /results/nfl renders the season fold, and the drill-down reads the owner's week file", () => {
  const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const page = strip(fs.readFileSync("src/app/results/nfl/page.tsx", "utf8"));
  assert.match(page, /const season = nflFamilyRecord\(readAllNflWeekReports\(\)\);/);
  assert.match(page, /data-results-slice="nfl-family-season"/);
  assert.match(page, /\{f\.total\.won\}\/\{f\.total\.decisive\}/, "numerator and denominator are shown together");
  const drill = strip(fs.readFileSync("src/components/results/nfl-family-drilldown.tsx", "utf8"));
  assert.match(drill, /fetch\(`\/data\/nfl\/reconciliation\/\$\{weekKey\}\.json`\)/);
  assert.match(drill, /nflFamilyRows\(await res\.json\(\), familyId\)/);
});

test("nfl/reconciliation/ is INTENTIONALLY public: declared to the export prune, and every file is PUBLIC_DERIVED", () => {
  const prune = fs.readFileSync("scripts/prune-internal-routes.mjs", "utf8");
  assert.match(prune, /const ALWAYS_PUBLIC_DATA_DIRS = \[[^\]]*"nfl\/reconciliation\/"/, "the drill-down fetches week files at runtime; the prune refuses an undeclared runtime /data/ path");
  const dir = path.join(process.cwd(), "public/data/nfl/reconciliation");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).dataClass, "PUBLIC_DERIVED", `${f} must be public-derived to be served`);
  }
});
