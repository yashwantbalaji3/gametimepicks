#!/usr/bin/env node
/**
 * P700 — CAPTURE FPL AVAILABILITY AND BUILD THE ESPN ↔ FPL CROSSWALK CANDIDATES.
 *
 * `EPL_AVAILABILITY_PROVIDER_MATRIX.md` settled the provider question: the Premier League's own
 * FPL API publishes injury, doubt, suspension and unavailability for every registered player —
 * free, keyless, typed, timestamped. The remaining cost was identity, and this is step 2 of that
 * document's own plan: "build the reviewed `espnId ↔ fplId` crosswalk … unresolved stays
 * unresolved."
 *
 * Usage:
 *   node app/scripts/epl/build-fpl-crosswalk.mjs --now <ISO>            # capture + build
 *   node app/scripts/epl/build-fpl-crosswalk.mjs --now <ISO> --dry-run  # print, write nothing
 *   node app/scripts/epl/build-fpl-crosswalk.mjs --now <ISO> --from <file>   # replay a capture
 *
 * ⚠ NO KEY, NO CREDIT, NO PAID PROVIDER. One unauthenticated GET to a public endpoint.
 *
 * ⚠ EDITORIAL PROSE IS NEVER STORED. FPL's `news` is free text ("Knee injury - Expected back 15
 * Oct"). The typed state, the percentage and the timestamp are kept; the sentence is not — the
 * same rule the NFL injuries contract applies to its own feed.
 *
 * ⚠ NOTHING HERE APPLIES AN AVAILABILITY STATE TO ANY PLAYER. It writes a review artifact. The
 * canonical mapping is the reviewed crosswalk, and `AUTO_EXACT` is deterministic evidence, not a
 * review.
 *
 * EXIT CODES
 *   0  built
 *   1  a refusal that names itself (club map incomplete, corpus unreadable, source malformed)
 *   2  the source could not be fetched
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { buildCrosswalk } from "../../src/lib/sports/epl/fpl-crosswalk.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const SQUADS = path.join(ROOT, "data/internal/research/epl/players/squads-2026-27.json");
const OUT_DIR = path.join(ROOT, "data/internal/research/epl/availability");
const SOURCE = "https://fantasy.premierleague.com/api/bootstrap-static/";

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required — this script never reads a live clock"); process.exit(1); }
const DRY = process.argv.includes("--dry-run");
const FROM = arg("--from");

let raw;
if (FROM) {
  try { raw = fs.readFileSync(FROM, "utf8"); } catch (e) { console.error(`REFUSED: --from unreadable: ${e.message}`); process.exit(1); }
} else {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30000) }).catch((e) => ({ ok: false, status: e.message }));
  if (!res.ok) { console.error(`REFUSED: FPL source unreachable (${res.status}) — nothing is written and no state is guessed`); process.exit(2); }
  raw = await res.text();
}
const sourceSha256 = crypto.createHash("sha256").update(raw).digest("hex");

let boot;
try { boot = JSON.parse(raw); } catch (e) { console.error(`REFUSED: source is not JSON: ${e.message}`); process.exit(1); }
if (!Array.isArray(boot.elements) || !Array.isArray(boot.teams) || boot.teams.length !== 20) {
  console.error(`REFUSED: source shape moved — ${boot.elements?.length ?? "no"} elements, ${boot.teams?.length ?? "no"} teams (expected 20)`);
  process.exit(1);
}

let squads;
try { squads = JSON.parse(fs.readFileSync(SQUADS, "utf8")).squads; } catch (e) { console.error(`REFUSED: ESPN squad corpus unreadable: ${e.message}`); process.exit(1); }

const cw = buildCrosswalk({ fplElements: boot.elements, fplTeams: boot.teams, espnSquads: squads });
if (!cw.ok) { console.error(`REFUSED: ${cw.reason}`); process.exit(1); }

const artifact = {
  schemaVersion: 1,
  artifact: "epl-fpl-espn-crosswalk-candidates",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  generatedAt: NOW,
  source: { url: SOURCE, sha256: sourceSha256, bytes: raw.length, elements: boot.elements.length, teams: boot.teams.length },
  espnCorpus: { file: "data/internal/research/epl/players/squads-2026-27.json", squads: squads.length, players: squads.reduce((n, s) => n + (s.players?.length ?? 0), 0) },
  attribution: "Fantasy Premier League public API (fantasy.premierleague.com). Unauthenticated public JSON, point-in-time, facts only.",
  policy: [
    "This artifact is CANDIDATES. The canonical mapping is the reviewed crosswalk; AUTO_EXACT is deterministic evidence, not a review.",
    "Editorial prose (FPL `news`) is never stored — only the typed state, the percentage and the timestamp.",
    "UNRESOLVED stays unresolved. No row is promoted to a mapping by any automatic rule.",
    "Nothing here applies an availability state to any player or any forecast.",
  ],
  counts: cw.counts,
  rows: cw.rows,
};

console.log(JSON.stringify(cw.counts, null, 1));
if (DRY) { console.log("--dry-run: nothing written"); process.exit(0); }
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `crosswalk-candidates-${NOW.slice(0, 10)}.json`);
fs.writeFileSync(out, JSON.stringify(artifact, null, 1));
fs.writeFileSync(path.join(OUT_DIR, "crosswalk-candidates-latest.json"), JSON.stringify(artifact, null, 1));
console.log(`wrote ${path.relative(ROOT, out)} and crosswalk-candidates-latest.json`);
