#!/usr/bin/env node
/**
 * CROSS-SPORT EVENT IDENTITY AUDIT — the runner.
 *
 *   node app/scripts/audits/build-event-identity-audit.mjs --now <ISO> [--json <path>] [--fail-on-findings]
 *
 * The judgement lives in `src/lib/audits/event-identity-audit.mjs`; this only finds the artifacts
 * and names each population's identity. It reads committed bytes and writes one internal artifact —
 * it never repairs a row and never decides an identity.
 *
 * MLB is audited over EVERY committed board date, not just today's. Both defects this exists for
 * were invisible until one particular row landed in the gap, and the row that found them was three
 * days old.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditPopulation, rollUpSport, worstVerdict } from "../../src/lib/audits/event-identity-audit.mjs";
import { assignPublicGameSlugs } from "../../src/lib/mlb/public-game-slug.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(APP, "public", "data");
const ROOT = path.join(APP, "..");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }

const read = (...seg) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, ...seg), "utf8")); } catch { return null; } };
const listDates = (dir) => {
  try {
    return fs.readdirSync(path.join(DATA, dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
  } catch { return []; }
};

/* ── MLB ──────────────────────────────────────────────────────────────────────────────────────── */

function mlbPopulations() {
  const pops = [];
  const dates = listDates("mlb/boards");
  for (const date of dates) {
    const board = read("mlb", "boards", `${date}.json`);
    const games = board?.games ?? [];
    if (games.length === 0) continue;

    // The board itself: gamePk is the identity, and the public slug is derived by the shared rule.
    const { slugs } = assignPublicGameSlugs(
      games.map((g) => ({ away: g.awayTeamAbbr, home: g.homeTeamAbbr, date, key: g.gamePk })),
    );
    pops.push(auditPopulation({
      sport: "mlb", scope: `boards/${date}`, rows: games.map((g, i) => ({ ...g, publicSlug: slugs[i] })),
      identityOf: (g) => g.gamePk,
      slugOf: (g) => g.publicSlug,
    }));

    const upstream = new Set(games.map((g) => String(g.gamePk)).filter(Boolean));

    const sims = read("mlb", "full-game-simulations", `${date}.json`)?.games ?? [];
    if (sims.length) {
      pops.push(auditPopulation({
        sport: "mlb", scope: `full-game-simulations/${date}`, rows: sims,
        identityOf: (g) => g.gamePk, slugOf: (g) => g.slug, upstream,
      }));
    }

    const preds = read("mlb", "predictions", `${date}.json`)?.predictions ?? [];
    if (preds.length) {
      pops.push(auditPopulation({
        sport: "mlb", scope: `predictions/${date}`, rows: preds,
        identityOf: (g) => g.gamePk, slugOf: (g) => g.slug, upstream,
      }));
    }
  }
  return pops;
}

/* ── NFL ──────────────────────────────────────────────────────────────────────────────────────── */

function nflPopulations() {
  const pops = [];
  const schedule = read("nfl", "schedule", "latest.json");
  const rows = schedule?.rows ?? [];
  if (rows.length) {
    pops.push(auditPopulation({
      sport: "nfl", scope: "schedule/latest", rows,
      identityOf: (r) => r.providerEventId,
    }));
  }
  const index = read("nfl", "index.json");
  const events = index?.events ?? [];
  if (events.length) {
    /*
     * The index's events are FORECASTS, and a forecast may legitimately outlive its schedule row
     * (a settled game leaves the forward capture). So no `upstream` here — an unjoined forecast is
     * a window statement, not an identity defect, and reporting it as one would cry wolf daily.
     */
    pops.push(auditPopulation({
      sport: "nfl", scope: "index.events", rows: events,
      identityOf: (e) => e.providerEventId,
    }));
  }
  return pops;
}

/* ── UFC ──────────────────────────────────────────────────────────────────────────────────────── */

function ufcPopulations() {
  const pops = [];
  const card = read("ufc", "card-latest.json");
  const bouts = card?.bouts ?? [];
  if (bouts.length) {
    pops.push(auditPopulation({ sport: "ufc", scope: "card-latest", rows: bouts, identityOf: (b) => b.boutId }));
  }
  const odds = read("ufc", "odds-latest.json");
  const priced = odds?.bouts ?? [];
  if (priced.length) {
    pops.push(auditPopulation({
      sport: "ufc", scope: "odds-latest", rows: priced,
      identityOf: (b) => b.boutId,
      upstream: new Set(bouts.map((b) => String(b.boutId)).filter(Boolean)),
    }));
  }
  return pops;
}

/* ── EPL ──────────────────────────────────────────────────────────────────────────────────────── */

function eplPopulations() {
  const pops = [];
  for (const [scope, doc] of [["graded-picks", read("epl", "graded-picks.json")]]) {
    const rows = doc?.picks ?? doc?.rows ?? [];
    if (rows.length) {
      pops.push(auditPopulation({
        sport: "epl", scope, rows,
        identityOf: (r) => r.fixtureId ?? r.matchId ?? r.eventId ?? null,
      }));
    }
  }
  return pops;
}

/* ── MAIN ─────────────────────────────────────────────────────────────────────────────────────── */

const sports = [
  rollUpSport("mlb", mlbPopulations(), { readable: listDates("mlb/boards").length > 0 }),
  rollUpSport("nfl", nflPopulations(), { readable: read("nfl", "index.json") != null }),
  rollUpSport("ufc", ufcPopulations(), { readable: read("ufc", "card-latest.json") != null }),
  rollUpSport("epl", eplPopulations(), { readable: read("epl", "graded-picks.json") != null }),
];

const state = worstVerdict(sports.map((s) => s.verdict));
const payload = {
  schemaVersion: 1,
  artifact: "event-identity-audit",
  dataClass: "INTERNAL_DERIVED",
  generatedAt: NOW,
  state,
  note:
    "Identity and slug reconciliation across every sport's committed artifacts. NO_EVENTS means the checks were vacuous for that sport, which is a statement about the window rather than a pass.",
  sports,
  totals: {
    rows: sports.reduce((n, s) => n + s.rows, 0),
    findings: sports.reduce((n, s) => n + s.findings.length, 0),
  },
};

const OUT = arg("--json", path.join(ROOT, "data", "internal", "audits", "event-identity.json"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

for (const s of sports) {
  const line = `[identity] ${s.sport.padEnd(4)} ${s.verdict.padEnd(9)} rows ${String(s.rows).padStart(5)} · findings ${s.findings.length}`;
  if (s.verdict === "FINDINGS" || s.verdict === "UNKNOWN") console.error(line); else console.log(line);
  const byKind = new Map();
  for (const f of s.findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  for (const [kind, n] of byKind) console.error(`             ${kind}: ${n}`);
  for (const f of s.findings.slice(0, 6)) console.error(`               ${f.scope}: ${f.detail}`);
  if (s.findings.length > 6) console.error(`               … and ${s.findings.length - 6} more`);
}
console.log(`[identity] ${state} · ${payload.totals.rows} rows · ${payload.totals.findings} findings`);
console.log(`[identity] wrote ${path.relative(process.cwd(), OUT)}`);

process.exit(process.argv.includes("--fail-on-findings") && state === "FINDINGS" ? 1 : 0);
