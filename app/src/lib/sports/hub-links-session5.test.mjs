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

test("every hub reaches its teams and players on the Research home, one click from the strip", () => {
  const want = { mlb: "/research#teams-mlb", epl: "/research#teams-epl", nfl: "/research#teams-nfl", ufc: "/research" };
  for (const [sport, items] of Object.entries(HUB_SECTIONS)) {
    const hit = items.find((x) => x.kind === "link" && x.target.startsWith("/research"));
    assert.ok(hit, `${sport}: no Research link`);
    assert.equal(hit.target, want[sport], `${sport}: Research link lands on its own sport's directory`);
  }
  assert.match(fs.readFileSync("src/app/research/page.tsx", "utf8"), /id=\{`teams-\$\{s\.sport\.toLowerCase\(\)\}`\}/, "the Research home renders a #teams-<sport> anchor");
  const built = "out/research/index.html";
  if (!fs.existsSync(built)) return; // unit lane: no export
  const html = fs.readFileSync(built, "utf8");
  for (const s of ["nfl", "mlb", "epl"]) assert.match(html, new RegExp(`id="teams-${s}"`), `the built Research home carries #teams-${s}`);
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
