#!/usr/bin/env node
/**
 * Freshness guard CLI for the WC player→team map. Compares player-team-map.json to the current
 * player-projections and reports missing / stale / incomplete-coverage.
 *
 * Exit code: 0 by default (surface only — the resolver fails safe, so a gap hides labels, never shows a wrong
 * team). Pass --strict to exit 1 on a "fail" level (missing map or uncovered fixture teams), e.g. in CI.
 *
 * Usage: node app/scripts/check-wc-team-map-freshness.mjs [--date YYYY-MM-DD] [--strict]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateTeamMapFreshness } from "../src/lib/world-cup/wc-team-map-freshness.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, "..", "public/data/world-cup");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const dateArg = (args[args.indexOf("--date") + 1] && !args[args.indexOf("--date") + 1].startsWith("--")) ? args[args.indexOf("--date") + 1] : null;

const load = (dir, file) => {
  const dated = dateArg && fs.existsSync(path.join(DATA, dir, `${dateArg}.json`)) ? `${dir}/${dateArg}.json` : `${dir}/${file}`;
  try { return JSON.parse(fs.readFileSync(path.join(DATA, dated), "utf8")); } catch { return null; }
};

const map = load(".", "player-team-map.json");
const projections = load("player-projections", "latest.json");
const r = evaluateTeamMapFreshness(map, projections);

const tag = r.level === "fail" ? "✗ FAIL" : r.level === "warn" ? "⚠ WARN" : "✓ OK";
console.log(`[wc-team-map] ${tag} — slate ${r.slate ?? "?"} · map ${r.mapSlate ?? "MISSING"} · ${r.fixtureTeams.length} fixture teams`);
for (const i of r.issues) console.log(`   - ${i}`);

if (strict && r.level === "fail") process.exit(1);
