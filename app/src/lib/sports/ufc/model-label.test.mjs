import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ufcModelLabel, ufcCorpusSourceLabel, ufcNotModelledLabel } from "./model-label.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("model id becomes a plain label; the fingerprint survives as a short version", () => {
  assert.equal(ufcModelLabel("ufc-fight-model@e657fc40b64d"), "UFC fight model, version e657fc4");
  assert.equal(ufcModelLabel("something-else@1"), "UFC fight model");
  assert.equal(ufcModelLabel(null), null);
});

test("corpus source never shows the scraper package name", () => {
  assert.equal(ufcCorpusSourceLabel("scrape_ufc_stats (GPL-3.0)"), "UFCStats fight records");
  assert.equal(ufcCorpusSourceLabel("other_scraper"), "public fight records");
  assert.equal(ufcCorpusSourceLabel(""), null);
});

test("notModelled keys are named, unknown keys de-camel-cased", () => {
  assert.equal(ufcNotModelledLabel("moneyline"), "Moneyline");
  assert.equal(ufcNotModelledLabel("methodOfVictory"), "Method of victory");
  assert.equal(ufcNotModelledLabel("fighterPropsByRound"), "Fighter props by round");
});

test("reader-facing UFC pages print no raw model id, scraper name or raw key", () => {
  const files = {
    bout: read("../../../app/ufc/bout/[boutId]/page.tsx"),
    chaos: read("../../../app/cage-chaos/page.tsx"),
    hub: read("../../../components/sports/ufc-card.tsx"),
  };
  for (const [name, src] of Object.entries(files)) {
    assert.doesNotMatch(src, /\{card\.model\.id\}|\$\{card\.model\.id\}/, `${name} prints the raw model id`);
    assert.doesNotMatch(src, /\$\{card\.model\.corpus\.source\}/, `${name} prints the raw corpus source`);
  }
  assert.doesNotMatch(files.hub, /: k\}/, "hub falls back to the raw notModelled key");
});
