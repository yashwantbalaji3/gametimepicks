/**
 * RESEARCH LAB BUILDER INPUT (v1.5) — NODE / BUILD TIME ONLY.
 *
 * Reads the committed v1.4 COMPARE PROJECTION (never the Data Platform, never a provider) plus the v1.3 research
 * page REGISTRY, which is the one source of an entity's slug and page path. Shared by the builder script and the
 * determinism test so both read exactly the same thing. Never imported by a page or a client module.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { COMPARE_PROJECTION_DIR, MATCHUP_SPORTS, PLAYER_COMPARE_SPORTS, TEAM_COMPARE_SPORTS, assertCompareVersion } from "../compare/contract.mjs";
import { RESEARCH_PROJECTION_DIR, assertProjectionVersion } from "../research-pages/contract.mjs";
import { LAB_MODE_SPORTS, LAB_PROJECTION_DIR, labStoredGzipped } from "./contract.mjs";

const text = (abs) => {
  const buf = fs.readFileSync(abs);
  return (abs.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};

/** Every sport any Lab mode reads from, so a blocked sport still gets a counted readiness row. */
const SPORTS = [...new Set([...Object.values(LAB_MODE_SPORTS).flat(), ...TEAM_COMPARE_SPORTS, ...PLAYER_COMPARE_SPORTS, "EPL", "UFC"])];

/** @param {string} repoRoot */
export function readLabInput(repoRoot) {
  const C = path.join(repoRoot, COMPARE_PROJECTION_DIR);
  const R = path.join(repoRoot, RESEARCH_PROJECTION_DIR);
  const lines = (rel) => {
    const abs = path.join(C, rel);
    return fs.existsSync(abs) ? text(abs).split("\n").filter(Boolean).map((l) => assertCompareVersion(JSON.parse(l), rel)) : [];
  };
  const compareReceipt = JSON.parse(text(path.join(C, "receipt.json")));
  const researchReceipt = JSON.parse(text(path.join(R, "receipt.json")));
  const registry = assertProjectionVersion(JSON.parse(text(path.join(R, "index.json"))), "research index.json").entries;

  const teams = {}, players = {}, matchups = {}, labels = {};
  for (const sport of SPORTS) {
    teams[sport] = lines(`teams/${sport}.jsonl.gz`);
    players[sport] = lines(`players/${sport}.jsonl.gz`);
    matchups[sport] = MATCHUP_SPORTS.includes(sport) ? lines(`matchups/${sport}.jsonl.gz`) : [];
    labels[sport] = readLabels(C, sport);
  }
  return {
    compareContentSha256: compareReceipt.contentSha256,
    researchContentSha256: researchReceipt.contentSha256,
    teams, players, matchups, labels, registry,
  };
}

/**
 * The team label table for a sport. The compare selector indexes carry `teams: { id: [name, abbr] }`; the player
 * index has it for every sport with player rows, the team index for MLB/NFL.
 */
function readLabels(C, sport) {
  for (const rel of [`indexes/players-${sport.toLowerCase()}.json`, `indexes/teams-${sport.toLowerCase()}.json`]) {
    const abs = path.join(C, rel);
    if (!fs.existsSync(abs)) continue;
    const doc = assertCompareVersion(JSON.parse(text(abs)), rel);
    if (doc.teams && Object.keys(doc.teams).length) return doc.teams;
  }
  return {};
}

/** Committed Lab projection file content (uncompressed), or null. */
export function readLabFile(repoRoot, rel) {
  const abs = path.join(repoRoot, LAB_PROJECTION_DIR, labStoredGzipped(rel) ? `${rel}.gz` : rel);
  return fs.existsSync(abs) ? text(abs) : null;
}
