/**
 * COMPARE BUILDER INPUT (v1.4) — NODE / BUILD TIME ONLY. Reads the committed v1.3 RESEARCH PROJECTION (never the Data
 * Platform) into the plain shape `assembleCompareProjection` takes. Shared by the builder script and the determinism
 * test so both read exactly the same thing. Never imported by a page or a client module (compare-projection.test CX4).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { RESEARCH_PROJECTION_DIR, RESEARCH_SPORTS, assertProjectionVersion } from "../research-pages/contract.mjs";
import { COMPARE_PROJECTION_DIR, MATCHUP_SPORTS } from "./contract.mjs";

const text = (abs) => {
  const buf = fs.readFileSync(abs);
  return (abs.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};

/** @param {string} repoRoot */
export function readResearchInput(repoRoot) {
  const R = path.join(repoRoot, RESEARCH_PROJECTION_DIR);
  const lines = (rel) => (fs.existsSync(path.join(R, rel)) ? text(path.join(R, rel)).split("\n").filter(Boolean).map((l) => assertProjectionVersion(JSON.parse(l), rel)) : []);
  const receipt = JSON.parse(text(path.join(R, "receipt.json")));
  const index = assertProjectionVersion(JSON.parse(text(path.join(R, "index.json"))), "index.json").entries;
  const teams = {}, players = {}, labels = {};
  for (const s of RESEARCH_SPORTS) {
    teams[s] = lines(`teams/${s}.jsonl.gz`);
    players[s] = lines(`players/${s}.jsonl.gz`);
    labels[s] = assertProjectionVersion(JSON.parse(text(path.join(R, `labels/${s}.json`))), `labels/${s}`).teams;
  }
  return { researchContentSha256: receipt.contentSha256, index, teams, players, labels };
}

/** Matchup ids the COMMITTED compare projection already publishes (the durability floor for the next build). */
export function readPublishedMatchupIds(repoRoot) {
  const C = path.join(repoRoot, COMPARE_PROJECTION_DIR);
  return Object.fromEntries(MATCHUP_SPORTS.map((s) => {
    const abs = path.join(C, `matchups/${s}.jsonl.gz`);
    return [s, fs.existsSync(abs) ? text(abs).split("\n").filter(Boolean).map((l) => JSON.parse(l).gameId) : []];
  }));
}

/** Committed compare projection file content (uncompressed), or null. */
export function readCompareFile(repoRoot, rel) {
  const abs = path.join(repoRoot, COMPARE_PROJECTION_DIR, rel.endsWith(".jsonl") ? `${rel}.gz` : rel);
  return fs.existsSync(abs) ? text(abs) : null;
}
