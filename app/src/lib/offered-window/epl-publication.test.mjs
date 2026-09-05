/**
 * THE EPL PUBLICATION RULE TESTED FOR A STATE THAT DOES NOT EXIST — Program 233 · Release A.
 *
 * Run: npx tsx --test src/lib/offered-window/epl-publication.test.mjs
 *
 * On 2026-09-05 the offered window reported EPL as `WORK_OWED` with seven fixtures owed and
 * `PUBLISHED: 0` — while `soccer/epl/forecasts/2026-09-05.json` was a public artifact carrying seven
 * fixtures with full win/draw/win probabilities, generated at 13:40Z.
 *
 * The rule was:
 *
 *     published: Boolean(set.public) && r.state === "READY"
 *
 * The EPL producer has never emitted a bare `"READY"`. Across every committed artifact its
 * vocabulary is `CURRENT_PRE_EVENT` (58 rows, all carrying probabilities) and `READY_EXCEPT_ODDS`
 * (29 rows, none carrying them). The condition was **unsatisfiable**: no EPL fixture could ever be
 * classified PUBLISHED, so the sport reported owed work every day it published successfully.
 *
 * WHY IT WAS WRITTEN THAT WAY, AND WHY THE FIX IS NOT TO NAME ANOTHER STATE. The comment above it
 * records a real earlier defect: using the set-level `public` flag alone made a `READY_EXCEPT_ODDS`
 * match — whose probabilities are deliberately withheld — report as PUBLISHED. That correction was
 * right about the problem and reached for a state name to solve it, and a state name is exactly the
 * thing that drifts when a producer renames its vocabulary.
 *
 * Publication is not a label. It is whether the numbers actually reached a public surface, so the
 * rule now derives from the presence of the probabilities themselves — which separates the two
 * states perfectly on every row ever committed, and cannot go stale behind a rename.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const BUILDER = path.join(APP, "scripts/offered-window/build-offered-window.mjs");
const FORECASTS = path.join(APP, "public/data/soccer/epl/forecasts");

/** Every EPL forecast row this repository has committed. */
function allRows() {
  if (!fs.existsSync(FORECASTS)) return [];
  return fs.readdirSync(FORECASTS)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(FORECASTS, f), "utf8")).rows ?? []);
}

test("THE PUBLICATION RULE MUST NOT DEPEND ON A STATE THE PRODUCER NEVER EMITS", () => {
  const rows = allRows();
  if (!rows.length) return;
  const vocabulary = new Set(rows.map((r) => r.state).filter(Boolean));
  assert.ok(vocabulary.size > 0, "the producer emits states");

  const src = fs.readFileSync(BUILDER, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
  /* The EPL block's own published line. */
  const eplPublished = /published: Boolean\(set\.public\)[^,\n]*/.exec(code)?.[0] ?? "";
  assert.ok(eplPublished, "the EPL publication rule is findable");

  const named = [...eplPublished.matchAll(/r\.state === "([A-Z_]+)"/g)].map((m) => m[1]);
  for (const s of named) {
    assert.ok(
      vocabulary.has(s),
      `the rule requires state "${s}" and the producer has never emitted it — its vocabulary is ${[...vocabulary].join(", ")}. An unsatisfiable condition reports owed work forever.`,
    );
  }
});

test("probabilities separate published from withheld on every committed row", () => {
  /*
   * The signal the rule now uses. If a `READY_EXCEPT_ODDS` row ever carried probabilities, or a
   * `CURRENT_PRE_EVENT` row ever lacked them, deriving publication from `probs` would be wrong and
   * this fails before the classification does.
   */
  const rows = allRows();
  if (!rows.length) return;
  const withheld = rows.filter((r) => r.state === "READY_EXCEPT_ODDS");
  const published = rows.filter((r) => r.state !== "READY_EXCEPT_ODDS" && r.state);
  assert.ok(withheld.length && published.length, "both regimes are represented in the committed history");
  assert.ok(!withheld.some((r) => r.probs), "a withheld row must never carry probabilities");
  assert.ok(published.every((r) => r.probs), "a pre-event row must always carry them");
});

test("LIVE · a day whose public artifact carries probabilities is not reported as owed", () => {
  const window = (() => {
    const dir = path.join(APP, "..", "data", "internal", "offered-window");
    try {
      const f = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().pop();
      return f ? { date: f.slice(0, 10), doc: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) } : null;
    } catch { return null; }
  })();
  if (!window) return;

  const epl = (window.doc.sports ?? []).find((s) => s.sport === "epl");
  if (!epl) return;

  const artifact = path.join(FORECASTS, `${window.date}.json`);
  if (!fs.existsSync(artifact)) return;
  const doc = JSON.parse(fs.readFileSync(artifact, "utf8"));
  const withProbs = (doc.rows ?? []).filter((r) => r.probs).length;
  if (!doc.public || withProbs === 0) return;

  /*
   * The claim is that a published fixture is not OWED — not that PUBLISHED equals the artifact's
   * row count. A fixture published pre-event and since kicked off is correctly typed STARTED, and
   * STARTED outranks PUBLISHED in the classification; requiring the two counts to match would fail
   * every afternoon for a correct system. (My first version did exactly that.)
   */
  const owed = epl.owed ?? [];
  assert.equal(
    owed.length,
    0,
    `the public EPL artifact for ${window.date} carries ${withProbs} fixtures with probabilities, and the offered window still owes ${owed.length}`,
  );
  const accountedFor = (epl.counts?.PUBLISHED ?? 0) + (epl.counts?.STARTED ?? 0) + (epl.counts?.SETTLED ?? 0);
  assert.ok(
    accountedFor >= withProbs,
    `${withProbs} fixtures carry public probabilities but only ${accountedFor} are typed published/started/settled`,
  );
});
