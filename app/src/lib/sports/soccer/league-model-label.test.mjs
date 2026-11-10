/**
 * MOD-10 (2026-11-09): Ligue 1 (and every non-EPL league page) never names the Premier League as its model. The label and
 * description only: the model id stays the code's identifier (same split-Poisson code, refit on the league's own results;
 * joins and validation records key on it), and dated forecast files already written are not rewritten.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("MOD-10: the league forecast builder labels the model by its own league; the id is unchanged", () => {
  const src = read("scripts/soccer/build-league-forecasts.mjs");
  const model = src.match(/model: \{ id: EPL_MODEL_ID,[^\n]*\},/)?.[0];
  assert.ok(model, "the artifact's model block");
  assert.doesNotMatch(model, /Premier League/, "no other league's name in the model label or description");
  assert.match(model, /label: `\$\{L\.name\} split-Poisson model \(v1\)`/);
  assert.match(model, /description: `a split-Poisson model \(v1\), fit only on \$\{L\.name\}'s own results`/);
});

test("MOD-10: the league page says the model is fit on that league, not 'the same model as our Premier League page'", () => {
  const page = read("src/components/soccer/league-forecast-page.tsx");
  assert.doesNotMatch(page, /same model as our Premier League page/);
  assert.match(page, /split-Poisson match model fit only on \{name\}&rsquo;s own results/);
});

test("MOD-10: frozen dated Ligue 1 forecasts are not rewritten (they keep the text they were published with)", () => {
  const dir = path.join(APP, "public", "data", "soccer", "ligue-1", "forecasts");
  const dated = fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n));
  assert.ok(dated.length > 0);
  for (const n of dated) assert.equal(JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")).model?.id, "epl-model-v1-split-poisson", `${n}: id untouched`);
});
