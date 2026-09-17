/**
 * SAVED DESTINATIONS (v1.1.4.1) — the resolver on REAL identities, the NONE case, other sports, and the rule that no
 * Saved consumer renders the href stored at save time.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { resolveSavedDestination } from "./saved-destination.mjs";
import { isSavedForecast } from "./saved-schema.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const code = (rel) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const mlbSaved = (gamePk, startUtc, href, over = {}) => {
  const item = {
    schemaVersion: 1, id: `mlb-${gamePk}`, sport: "mlb", href, startUtc, matchup: "Away @ Home", context: null, family: "Winner",
    value: "X 55%", sub: null, signal: null, modelState: "PUBLIC_EXPERIMENTAL", modelFamily: null, updatedAt: null,
    settlement: { kind: "mlb-game", gamePk, family: "Winner" }, savedAt: "2026-09-01T12:00:00Z", sourceRoute: "/", ...over,
  };
  assert.ok(isSavedForecast(item), "fixture is a valid Saved owner item");
  return item;
};

const manifest = { mlbGamePathByPk: { "823655": "/games/mlb/nyy-vs-min-2026-09-16/" }, mlbBoardDates: ["2026-09-14", "2026-09-15", "2026-09-16"] };

test("SD1 · current-day MLB: the exported game page for this gamePk, labelled as the game", () => {
  const d = resolveSavedDestination(mlbSaved(823655, "2026-09-16T23:40:00Z", "/games/mlb/nyy-vs-min-2026-09-16/"), manifest);
  assert.deepEqual(d, { kind: "GAME", href: "/games/mlb/nyy-vs-min-2026-09-16/", label: "View game" });
});

test("SD2 · ⚠ past-day MLB: the stored game href is NOT returned; the dated board anchored to the gamePk is", () => {
  const d = resolveSavedDestination(mlbSaved(823654, "2026-09-15T23:40:00Z", "/games/mlb/nyy-vs-min-2026-09-15/"), manifest);
  assert.equal(d.kind, "BOARD");
  assert.equal(d.href, "/mlb/board/2026-09-15/#game-823654");
  assert.equal(d.label, "View on the Sep 15 MLB board", "the label names the destination — not 'View game'");
  assert.notEqual(d.href, "/games/mlb/nyy-vs-min-2026-09-15/");
});

test("SD3 · the board date is the ET date of first pitch (a 10:40 PM ET start is still that day)", () => {
  const d = resolveSavedDestination(mlbSaved(900001, "2026-09-16T02:40:00Z", "/games/mlb/x/"), manifest);
  assert.equal(d.href, "/mlb/board/2026-09-15/#game-900001");
});

test("SD4 · ⚠ no provable destination ⇒ NO link (never a known 404): unexported date, missing start, no manifest, bad gamePk", () => {
  const none = { kind: "NONE", href: null, label: null };
  assert.deepEqual(resolveSavedDestination(mlbSaved(1, "2026-06-01T23:00:00Z", "/games/mlb/a-vs-b-2026-06-01/"), manifest), none);
  assert.deepEqual(resolveSavedDestination(mlbSaved(1, null, "/games/mlb/a/"), manifest), none);
  assert.deepEqual(resolveSavedDestination(mlbSaved(823655, START(), "/games/mlb/nyy-vs-min-2026-09-16/"), null), none);
  const bad = { ...mlbSaved(1, "2026-09-15T23:00:00Z", "/x/"), settlement: { kind: "mlb-game", gamePk: "823655", family: "Winner" } };
  assert.deepEqual(resolveSavedDestination(bad, manifest), none, "a non-integer gamePk is not an identity");
});
function START() { return "2026-09-16T23:40:00Z"; }

test("SD5 · ⚠ identity is the gamePk: a stored href naming today's exported page does not make a DIFFERENT game link to it", () => {
  // Same teams, same day, other gamePk (a doubleheader's other game, or a stale slug): never matched by href or names.
  const other = mlbSaved(999999, "2026-09-16T17:05:00Z", "/games/mlb/nyy-vs-min-2026-09-16/");
  const d = resolveSavedDestination(other, manifest);
  assert.equal(d.kind, "BOARD");
  assert.equal(d.href, "/mlb/board/2026-09-16/#game-999999");
});

test("SD6 · other sports are unchanged: their stored href passes through", () => {
  for (const [sport, settlement, href] of [
    ["nfl", { kind: "nfl-event", providerEventId: "401872932", family: "Winner" }, "/nfl/game/401872932/"],
    ["epl", { kind: "epl-event", eventId: "soccer:epl:x", family: "Match result" }, "/epl/match/x/"],
    ["ufc", { kind: "ufc-bout", date: "2026-09-12", red: "a", blue: "b" }, "/ufc/bout/x/"],
  ]) {
    const d = resolveSavedDestination({ ...mlbSaved(1, "2026-09-15T00:00:00Z", href), sport, settlement }, manifest);
    assert.deepEqual(d, { kind: "UNCHANGED", href, label: null }, sport);
  }
});

test("SD7 · deterministic and self-contained: no clock, no network, no settlement or provider state", () => {
  const item = mlbSaved(823654, "2026-09-15T23:40:00Z", "/games/mlb/nyy-vs-min-2026-09-15/");
  assert.deepEqual(resolveSavedDestination(item, manifest), resolveSavedDestination(item, manifest));
  const src = code("src/lib/saved/saved-destination.mjs");
  assert.equal(/Date\.now|new Date\(\)|fetch\(|import /.test(src), false, "no clock, no fetch, no imports (so no results/Live owner can steer it)");
  assert.equal(/Date\.now/.test("const t = Date.now();"), true, "positive control");
});

test("SD8 · ⚠ every Saved consumer resolves through the one owner and never renders the stored href", () => {
  const consumers = ["src/components/saved/saved-list.tsx", "src/components/my/my-gametime.tsx"];
  const STORED_HREF = /href=\{\s*s\.href\b|href=\{\s*item\.href\b|MaybeLink href=\{s\.href/;
  for (const rel of consumers) {
    const src = code(rel);
    assert.match(src, /resolveSavedDestination\(s, routes\)/, `${rel} uses the resolver`);
    assert.equal(STORED_HREF.test(src), false, `${rel} renders a stored href`);
  }
  assert.equal(STORED_HREF.test("<Link href={s.href}>"), true, "positive control: the probe catches the old pattern");
  assert.equal(STORED_HREF.test("<MaybeLink href={s.href || null}"), true, "positive control: and the v1.1.3 preview pattern");
  // EVERY file that reads the Saved store is classified. Regex guesses at "does it iterate saved items" flagged the nav
  // and the brief (they iterate their OWN arrays) — so each non-consumer carries a specific, checkable reason instead,
  // and a new reader fails here until it is classified.
  const NON_LINK_READERS = {
    "src/components/mobile-bottom-nav.tsx": (src) => (src.match(/\bsaved\.[a-zA-Z]+/g) || []).every((m) => m === "saved.ready" || m === "saved.items"),
    "src/components/brief/your-brief.tsx": (src) => !/href=\{/.test(src), // every link is a literal: /saved/, /following/
    "src/components/saved/save-forecast-button.tsx": (src) => !/\bhref\b/.test(src),
  };
  const readers = [];
  const walk = (dir) => { for (const e of fs.readdirSync(path.join(APP, dir), { withFileTypes: true })) { const rel = path.join(dir, e.name); if (e.isDirectory()) walk(rel); else if (/\.tsx$/.test(e.name) && /useSavedForecasts\(\)/.test(read(rel))) readers.push(rel); } };
  ["src/components", "src/app"].forEach(walk);
  assert.deepEqual(readers.sort(), [...consumers, ...Object.keys(NON_LINK_READERS)].sort(), "a new Saved reader must be classified (and, if it renders items, use the resolver)");
  for (const [rel, holds] of Object.entries(NON_LINK_READERS)) assert.ok(holds(code(rel)), `${rel} no longer matches its non-link classification`);
  assert.equal(NON_LINK_READERS["src/components/brief/your-brief.tsx"]("<Link href={s.href}>"), false, "positive control: a brief that links an item fails its classification");
});
