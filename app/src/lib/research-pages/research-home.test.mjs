/**
 * RESEARCH HOME (2026-10-05) — unit + contract guards (no built export).
 *
 *  RH1  the "who gets a page" copy shows only the readiness receipt's numbers, never its engineering notes
 *  RH2  mutation probe: a bar moved in the receipt moves on the page with no hand edit
 *  RH3  the team forecast-history join is exact-id: every TEAM subject in the Forecast Ledger is a team research id
 *  RH4  source shape: the stale beta page is gone; the history section links games through game-links only
 *
 * Run: npx tsx --test src/lib/research-pages/research-home.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { inclusionCopy } from "./research-home.ts";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const ROOT = path.join(APP, "..");
const readiness = JSON.parse(fs.readFileSync(path.join(ROOT, "data/research-projection/v1/readiness.json"), "utf8"));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "data/research-projection/v1/index.json"), "utf8")).entries;
const SPORTS = ["NFL", "MLB", "EPL", "UFC"];

const copyOf = (t) => SPORTS.map((s) => { const c = inclusionCopy(s, t); return `${c.team ?? ""} ${c.player}`; }).join(" ");

test("RH1 inclusion copy carries the receipt's numbers and none of its engineering notes", () => {
  const text = copyOf(readiness.thresholds);
  const allowed = new Set(JSON.stringify(readiness.thresholds).match(/\d+/g));
  const shown = text.match(/\d+/g) ?? [];
  assert.ok(shown.length >= 8, `numbers shown: ${shown.join(",")}`);
  for (const n of shown) assert.ok(allowed.has(n), `"${n}" is not a number the readiness receipt carries`);
  for (const bad of [/noindex/i, /ESPN/, /PARTIAL/, /id-keyed/i, /undefined/, /NaN/]) assert.doesNotMatch(text, bad);
  for (const s of SPORTS) assert.ok(inclusionCopy(s, readiness.thresholds).player.length > 10, s);
  assert.equal(inclusionCopy("UFC", readiness.thresholds).team, null, "UFC has no team pages");
});

test("RH2 mutation probe: a moved bar moves the copy", () => {
  const moved = { ...readiness.thresholds, MLB_MIN: 977, EPL_MIN: 988, UFC_MIN: 999, NFL_RECENT_MIN: 966 };
  const text = copyOf(moved);
  for (const n of ["977", "988", "999", "966"]) assert.ok(text.includes(n), `copy does not follow the receipt (${n})`);
  assert.ok(!text.includes(` ${readiness.thresholds.MLB_MIN} recorded games`), "the old MLB bar is not hard-coded");
});

test("RH3 every TEAM subject in the Forecast Ledger is an exact team research id (the team history join)", () => {
  const teamIds = new Set(index.filter((e) => e.kind === "team").map((e) => e.id));
  const dir = path.join(ROOT, "data/internal/forecast-ledger/v1");
  const subjects = new Set();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (r.subjectType === "TEAM") subjects.add(r.subjectId);
    }
  }
  assert.ok(subjects.size >= 32, `team subjects in the ledger: ${subjects.size}`);
  const missing = [...subjects].filter((id) => !teamIds.has(id));
  assert.deepEqual(missing, [], "a ledger team subject with no team research page would silently show no history");
});

test("RH4 source shape: the beta page is gone, team pages read the history, games link through game-links", () => {
  const code = (f) => fs.readFileSync(path.join(APP, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const home = code("src/app/research/page.tsx");
  for (const stale of ["Public Beta", "30 qualifying", "MILESTONES", "SportOverviewHero"]) assert.ok(!home.includes(stale), `/research still carries "${stale}"`);
  assert.match(home, /researchIndex\(\)/, "team list comes from the research registry");
  assert.match(home, /inclusionCopy\(/, "coverage copy comes from the receipt");
  const team = code("src/app/teams/[sport]/[slug]/page.tsx");
  assert.match(team, /<ForecastHistorySection subjectId=\{t\.id\}/, "team page reads its own ledger rows by exact id");
  const hist = code("src/components/research-pages/forecast-history-section.tsx");
  assert.match(hist, /from "@\/lib\/research-pages\/game-links"/);
  assert.doesNotMatch(hist, /["'`]\/(nfl\/game|games\/mlb|epl\/match|ufc\/bout)\//, "no hand-built game URL");
  assert.doesNotMatch(hist, /rows\.slice\(0, limit\)\s*;\s*\n\s*if/, "older rows are kept, not dropped");
});
