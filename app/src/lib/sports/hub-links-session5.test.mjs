/**
 * Session 5 · B8 — hub cross-links and refusal reasons.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { HUB_SECTIONS } from "./hub-sections.ts";

test("Live is linked only where /live has a live adapter (MLB, NFL); Ask from every hub", () => {
  const adapters = fs.readdirSync("src/lib/live/adapters").map((f) => f.match(/^espn-(\w+)\.mjs$/)?.[1]).filter(Boolean);
  for (const [sport, items] of Object.entries(HUB_SECTIONS)) {
    const live = items.some((x) => x.kind === "link" && x.target === "/live");
    assert.equal(live, ["mlb", "nfl"].includes(sport), `${sport}: a Live link must not promise live data /live does not show`);
    if (live) assert.ok(adapters.includes(sport) || sport === "mlb", `${sport}: Live link without a live adapter`);
    assert.ok(items.some((x) => x.kind === "link" && x.target === "/ask" && x.label === "Ask"), `${sport}: no Ask link`);
  }
  assert.ok(fs.existsSync("src/app/live") && fs.existsSync("src/app/ask"));
});

test("EPL's strip names the fixture list as what it is", () => {
  const item = HUB_SECTIONS.epl.find((x) => x.target === "schedule");
  assert.equal(item.label, "Fixture list");
});

test("WIRED: /cards states a capability-gated ladder's own reason, not the generic 'empties as events start'", () => {
  const page = fs.readFileSync("src/app/cards/[sport]/page.tsx", "utf8");
  const gate = page.indexOf("const gated = loadSportLabCapabilityRefusal(params.sport);");
  assert.ok(gate > 0);
  assert.ok(page.indexOf("data-ladder-refusal=\"CAPABILITY_GATED\"", gate) > gate);
  assert.ok(page.indexOf("A ladder is built only from events that have not started", gate) > page.indexOf("if (gated)", gate), "the gated branch returns before the generic sentence");
  const lib = fs.readFileSync("src/lib/parlays/sport-lab-cards.ts", "utf8");
  assert.match(lib, /raw\?\.state === "CAPABILITY_GATED" && typeof raw\.reason === "string"/);
});
