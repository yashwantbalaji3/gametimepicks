/**
 * audit-sportsbook-coverage.mjs — EVIDENCE-BACKED sportsbook coverage matrix (Sprint 027 · Phase 1).
 *
 * Answers "what sportsbook data does this repo actually have?" by MEASURING the newest committed
 * artifacts, never by grepping for field names. The distinction is the whole point: a field that
 * exists in a type, a schema, or one artifact from June is not production coverage.
 *
 * For each sport × market family it reports:
 *   - recency      newest dated artifact, and its age in days against a supplied --today
 *   - records      how many market rows the newest artifact actually contains
 *   - population   per-field fill rate measured across those rows (line, price, book, timestamps)
 *   - provenance   which timestamps exist, and at what granularity (file-level vs row-level)
 *
 * Coverage verdicts are deliberately conservative:
 *   LIVE      newest artifact is within FRESH_DAYS and its key fields are populated
 *   STALE     artifact exists but is older than FRESH_DAYS — real data, not current data
 *   SPARSE    artifact is current but key fields are largely unpopulated
 *   ABSENT    no dated artifact at all
 *
 * Read-only. Touches no money, writes nothing unless --out is given.
 *
 * Usage:
 *   npx tsx scripts/audit-sportsbook-coverage.mjs --today 2026-07-27
 *   npx tsx scripts/audit-sportsbook-coverage.mjs --today 2026-07-27 --json --out <file>
 */
import fs from "node:fs";
import path from "node:path";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i >= 0 ? process.argv[i + 1] : null;
};
const has = (f) => process.argv.includes(f);

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const PUB = path.join(APP, "public", "data");
const REPO = path.join(APP, "..");

/** A source older than this is real history, not current market data. */
export const FRESH_DAYS = 3;
/** Below this fill rate a field is not dependable enough to build a public surface on. */
export const SPARSE_THRESHOLD = 0.5;

const DATED = /^(\d{4}-\d{2}-\d{2})\.json$/;

/**
 * The artifact families to audit. `rows` extracts the market-bearing records from a parsed
 * artifact so population can be measured uniformly across very different shapes.
 */
const SOURCES = [
  {
    key: "mlb/team-markets",
    sport: "mlb",
    families: ["moneyline", "run_line", "total"],
    dir: path.join(PUB, "mlb", "team-markets"),
    rows: (j) => Object.values(j.games ?? {}),
    fields: {
      line: (g) => g.total?.line != null || g.runLine?.line != null,
      price: (g) => g.moneyline?.home?.odds != null || g.total?.over?.odds != null,
      book: (g) => !!(g.bookmaker ?? j_book),
      eventStart: (g) => !!g.commenceTime,
      rowTimestamp: (g) => !!(g.capturedAt ?? g.lastUpdate ?? g.sourceTimestamp),
      impliedProb: (g) => g.moneyline?.home?.impliedProb != null,
      noVigProb: (g) => g.moneyline?.home?.noVigProb != null,
    },
  },
  {
    key: "mlb/player-props",
    sport: "mlb",
    families: ["player props (by market)"],
    dir: path.join(PUB, "mlb", "player-props"),
    rows: (j) => j.props ?? [],
    fields: {
      line: (p) => p.point != null,
      price: (p) => p.americanOdds != null,
      book: (p) => !!p.provider,
      eventStart: (p) => !!p.startTimeUtc,
      rowTimestamp: (p) => !!(p.capturedAt ?? p.lastUpdate ?? p.sourceTimestamp),
      playerIdentity: (p) => !!p.player,
      teamIdentity: (p) => !!p.team, // entity-mapping quality
    },
  },
  {
    key: "mlb/game-markets",
    sport: "mlb",
    families: ["game markets (legacy)"],
    dir: path.join(PUB, "mlb", "game-markets"),
    rows: (j) => (Array.isArray(j.games) ? j.games : Object.values(j.games ?? {})),
    fields: {},
  },
  {
    key: "nba/game-markets",
    sport: "nba",
    families: ["game markets"],
    dir: path.join(PUB, "nba", "game-markets"),
    rows: (j) => (Array.isArray(j.games) ? j.games : Object.values(j.games ?? {})),
    fields: {},
  },
  {
    key: "mlb/home-run-props",
    sport: "mlb",
    families: ["home run props"],
    dir: path.join(PUB, "mlb", "home-run-props"),
    rows: (j) => j.props ?? j.players ?? [],
    fields: {},
  },
  {
    key: "internal/mlb/team-market-lines",
    sport: "mlb",
    families: ["team market lines (internal)"],
    dir: path.join(REPO, "data", "internal", "mlb", "team-market-lines"),
    rows: (j) => (Array.isArray(j) ? j : Object.values(j.games ?? j.lines ?? {})),
    fields: {},
  },
];

let j_book = null; // file-level bookmaker, so a row-level check can fall back to it

const daysBetween = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function auditSource(src, today) {
  const out = {
    key: src.key,
    sport: src.sport,
    families: src.families,
    dir: path.relative(REPO, src.dir),
    datedFiles: 0,
    newest: null,
    ageDays: null,
    records: 0,
    fileTimestamp: null,
    book: null,
    population: {},
    verdict: "ABSENT",
    notes: [],
  };
  if (!fs.existsSync(src.dir)) {
    out.notes.push("directory does not exist");
    return out;
  }
  const dated = fs.readdirSync(src.dir).filter((f) => DATED.test(f)).sort();
  out.datedFiles = dated.length;
  const undatedCount = fs.readdirSync(src.dir).filter((f) => f.endsWith(".json") && !DATED.test(f)).length;
  if (undatedCount) out.notes.push(`${undatedCount} undated json file(s) — not a daily series`);
  if (!dated.length) {
    out.notes.push("no dated artifacts — cannot be a daily market source");
    return out;
  }

  out.newest = dated.at(-1).replace(".json", "");
  out.ageDays = daysBetween(out.newest, today);

  let j;
  try {
    j = JSON.parse(fs.readFileSync(path.join(src.dir, `${out.newest}.json`), "utf8"));
  } catch (e) {
    out.notes.push(`newest artifact unparseable: ${String(e).slice(0, 60)}`);
    out.verdict = "SPARSE";
    return out;
  }
  out.fileTimestamp = j.generatedAt ?? j.capturedAt ?? null;
  out.book = j.bookmaker ?? j.source ?? null;
  j_book = j.bookmaker ?? null;

  const rows = src.rows(j) ?? [];
  out.records = rows.length;

  for (const [name, fn] of Object.entries(src.fields)) {
    let hit = 0;
    for (const r of rows) {
      try {
        if (fn(r)) hit += 1;
      } catch {
        /* a throwing probe counts as absent — fail closed */
      }
    }
    out.population[name] = rows.length ? Number((hit / rows.length).toFixed(3)) : 0;
  }

  // Verdict — recency first, then whether the essentials are actually filled.
  if (out.ageDays > FRESH_DAYS) {
    out.verdict = "STALE";
    out.notes.push(`newest artifact is ${out.ageDays}d old — history, not current market data`);
  } else if (!out.records) {
    out.verdict = "SPARSE";
    out.notes.push("current artifact contains zero market rows");
  } else {
    const essentials = ["line", "price"].filter((k) => k in out.population);
    const weak = essentials.filter((k) => out.population[k] < SPARSE_THRESHOLD);
    out.verdict = weak.length ? "SPARSE" : "LIVE";
    if (weak.length) out.notes.push(`essential fields under ${SPARSE_THRESHOLD}: ${weak.join(", ")}`);
  }
  if (out.records && !Object.values(out.population).some(Boolean) && Object.keys(src.fields).length === 0) {
    out.notes.push("no field probes defined — recency measured only");
  }
  return out;
}

export function auditAll(today) {
  return SOURCES.map((s) => auditSource(s, today));
}

function main() {
  const today = arg("--today");
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    console.error("[sportsbook-audit] pass --today YYYY-MM-DD (no wall-clock, so runs are reproducible)");
    process.exit(1);
  }
  const results = auditAll(today);

  if (has("--json")) {
    const payload = { today, freshDays: FRESH_DAYS, sparseThreshold: SPARSE_THRESHOLD, sources: results };
    const out = arg("--out");
    if (out) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
      console.log(`[sportsbook-audit] wrote ${out}`);
    } else {
      console.log(JSON.stringify(payload, null, 2));
    }
    return;
  }

  console.log(`[sportsbook-audit] as of ${today} · fresh window ${FRESH_DAYS}d\n`);
  for (const r of results) {
    console.log(
      `${r.verdict.padEnd(7)} ${r.key.padEnd(34)} newest=${String(r.newest ?? "-").padEnd(11)}` +
        ` age=${String(r.ageDays ?? "-").padStart(4)}d  files=${String(r.datedFiles).padStart(3)}  rows=${String(r.records).padStart(5)}`,
    );
    if (r.book) console.log(`        book/source: ${r.book}   fileTimestamp: ${r.fileTimestamp ?? "none"}`);
    const pop = Object.entries(r.population);
    if (pop.length) {
      console.log("        population: " + pop.map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`).join("  "));
    }
    for (const n of r.notes) console.log(`        · ${n}`);
    console.log();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
