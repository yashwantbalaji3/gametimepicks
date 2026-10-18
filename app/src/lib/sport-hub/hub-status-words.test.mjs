/**
 * Session 5 · B8 — one set of event-status words on every hub card.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { hubStatusWord } from "./contract.ts";
import { mlbHub, nflHub } from "./adapters.ts";

const WORDS = new Set(["scheduled", "in progress", "final", "postponed", "started or final"]);

test("every source state maps into the shared words; a bare 'started' never claims live or final", () => {
  assert.equal(hubStatusWord("PREGAME", false), "scheduled");
  assert.equal(hubStatusWord("SCHEDULED", false), "scheduled");
  assert.equal(hubStatusWord("IN_PROGRESS", true), "in progress");
  assert.equal(hubStatusWord("FINAL", true), "final");
  assert.equal(hubStatusWord("POSTPONED", false), "postponed");
  assert.equal(hubStatusWord("STARTED", true), "started or final");
  assert.equal(hubStatusWord("UNKNOWN", true), "started or final", "unknown state falls back to the clock");
  assert.equal(hubStatusWord(undefined, false), "scheduled");
});

test("LIVE: MLB and NFL hub rows carry only the shared words (no raw 'pregame' / 'started' / 'unknown')", () => {
  const now = new Date().toISOString();
  for (const m of [mlbHub(now), nflHub(now)]) for (const r of m.rows) assert.ok(WORDS.has(r.status), `${m.sport} ${r.matchup}: "${r.status}"`);
});

test("DS-001 §2: the hub chip shows the shared reader words, translated only at display", async () => {
  const { hubStatusDisplay } = await import("./contract.ts");
  assert.equal(hubStatusDisplay("scheduled"), "Upcoming");
  assert.equal(hubStatusDisplay("in progress"), "Live");
  assert.equal(hubStatusDisplay("final"), "Final");
  assert.equal(hubStatusDisplay("postponed"), "Postponed");
  assert.equal(hubStatusDisplay("started or final"), "Started", "a source that only knows the game began never says Live or Final");
  assert.equal(hubStatusDisplay("anything else"), "anything else", "an unmapped value is shown as-is, never invented");
  const card = (await import("node:fs")).readFileSync("src/components/sport-hub/game-summary.tsx", "utf8");
  assert.equal((card.match(/\{hubStatusDisplay\(r\.status\)\}/g) ?? []).length, 2, "both the event card and the compact row translate the chip");
  assert.doesNotMatch(card, /\{r\.status\}/, "no raw status reaches a reader");
});

