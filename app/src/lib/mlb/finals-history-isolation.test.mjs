/**
 * MLB FINALS HISTORY — ISOLATION + SHAPE (Phase 6 · P601/P608).
 *
 * The founder approved acquiring 2023–2025 regular-season finals for FUTURE research only. Two properties have to
 * hold for that approval to stay true, and both are easy to break silently:
 *
 *  1. NO LIVE CONSUMER. The archive deliberately does NOT live in `data/internal/mlb/linescores/`, because two
 *     committed scripts read that whole directory into team run rates that reach the PUBLIC full-game simulations
 *     (`build-mlb-model-inputs.mjs` filters only `fileDate < date`, and "2023-05-04" < today; and
 *     `ingest-mlb-independent-inputs.mjs` applies no date filter at all). If any app code starts reading the
 *     archive, historical seasons re-enter public numbers — which §6.1 forbids.
 *  2. PRIVATE. `data/internal/**` is outside `app/`, so nothing there is served; this pins that a historical game
 *     id never appears in the static export.
 *
 * It also pins the archive's own honesty rules, because a research dataset that quietly changes shape is worse than
 * no dataset: final games only, regular season only, no imputed values, and one row per (date, gamePk) — a game is
 * stored under ITS OWN official date, so a rescheduled/resumed game cannot be counted twice.
 *
 * Run: npx tsx --test src/lib/mlb/finals-history-isolation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO = path.join(process.cwd(), process.cwd().endsWith("app") ? ".." : "");
const ARCHIVE = path.join(REPO, "data", "internal", "mlb", "linescores-history");
const SEASONS = ["2023", "2024", "2025"];
const present = fs.existsSync(ARCHIVE);

const walk = (dir, test_, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next" && e.name !== "out") walk(p, test_, out); }
    else if (test_(e.name)) out.push(p);
  }
  return out;
};

/*
 * GUARD CHANGED SIDES DELIBERATELY (v1.2 Data Platform). The GameTime Data Platform package is the one
 * permitted reader: it normalizes the archive into the internal platform store (not a model input).
 * The founder's constraint is preserved one level down — data-platform-boundary.test.mjs fails if ANY app
 * code outside the platform package reads the platform store or imports the platform package, so historical
 * seasons still cannot re-enter a live model input through the platform.
 */
const PLATFORM_PACKAGE = [path.join("app", "src", "lib", "data-platform") + path.sep, path.join("app", "scripts", "data-platform") + path.sep];

test("no app code reads the historical archive (it must never reach a live model input)", () => {
  const roots = [path.join(REPO, "app", "src"), path.join(REPO, "app", "scripts")];
  const hits = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const f of walk(root, (n) => /\.(ts|tsx|mjs|js)$/.test(n))) {
      if (f.endsWith("finals-history-isolation.test.mjs")) continue; // this file names it on purpose
      if (PLATFORM_PACKAGE.some((p) => path.relative(REPO, f).startsWith(p))) continue; // the one permitted reader (see above)
      if (fs.readFileSync(f, "utf8").includes("linescores-history")) hits.push(path.relative(REPO, f));
    }
  }
  assert.deepEqual(hits, [], `app code must not read the research archive: ${hits.join(", ")}`);
});

test("the archive lives outside app/ and never appears in the static export", () => {
  assert.ok(!ARCHIVE.includes(`${path.sep}app${path.sep}`), "archive path must be outside app/");
  const out = path.join(REPO, "app", "out");
  if (!fs.existsSync(out) || !present) return; // assert-when-built / assert-when-acquired
  const season = SEASONS.find((s) => fs.existsSync(path.join(ARCHIVE, s)));
  if (!season) return;
  const files = fs.readdirSync(path.join(ARCHIVE, season)).filter((f) => f.endsWith(".json"));
  const sample = JSON.parse(fs.readFileSync(path.join(ARCHIVE, season, files[0]), "utf8"));
  const pk = sample.games?.[0]?.gamePk;
  if (pk == null) return;
  // A 2023–2025 gamePk has no business anywhere in a 2026 public export — EXCEPT the v1.3 MLB team research pages,
  // which publish historical FINAL SCORES as facts through the research projection (never a model input: the
  // projection is built by scripts/research from the platform store, and data-platform/boundary.test.mjs B1 keeps
  // every model and page away from the store itself). Everywhere else the rule is unchanged.
  const RESEARCH_TEAM_PAGES = path.join("teams", "mlb") + path.sep;
  const html = walk(out, (n) => n.endsWith(".html"));
  const hits = html.filter((f) => !path.relative(out, f).startsWith(RESEARCH_TEAM_PAGES)).filter((f) => fs.readFileSync(f, "utf8").includes(String(pk)));
  // positive control: the allowance is exercised (the research pages really carry history), so this is not vacuous.
  if (html.some((f) => path.relative(out, f).startsWith(RESEARCH_TEAM_PAGES))) {
    assert.ok(html.filter((f) => path.relative(out, f).startsWith(RESEARCH_TEAM_PAGES)).some((f) => /MLB-202[345]/.test(fs.readFileSync(f, "utf8"))), "MLB team research pages exist but carry no 2023–2025 season");
  }
  assert.deepEqual(hits.map((f) => path.relative(out, f)), [], `historical gamePk ${pk} leaked into the export`);
});

test("every stored row is final, regular-season, fully scored, and filed under its OWN official date", () => {
  if (!present) return; // assert-when-acquired
  let rows = 0;
  const seen = new Set();
  for (const season of SEASONS) {
    const dir = path.join(ARCHIVE, season);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      assert.equal(j.dataClass, "PRIVATE_RESEARCH", `${season}/${f}: archive rows are private research data`);
      const fileDate = f.slice(0, 10);
      assert.equal(j.date, fileDate, `${season}/${f}: record date must match its filename`);
      for (const g of j.games ?? []) {
        rows += 1;
        assert.equal(g.isFinal, true, `${season}/${f}: only final games are stored`);
        assert.equal(g.gameType, "R", `${season}/${f}: only regular-season games are stored`);
        assert.equal(typeof g.homeRuns, "number", `${season}/${f}: final game carries a home score`);
        assert.equal(typeof g.awayRuns, "number", `${season}/${f}: final game carries an away score`);
        assert.equal(g.officialDate, fileDate, `${season}/${f}: gamePk ${g.gamePk} is filed under ${fileDate} but its official date is ${g.officialDate} — a game must be stored once, under its own date`);
        assert.ok(!seen.has(g.gamePk), `gamePk ${g.gamePk} stored twice — the archive must hold one row per game`);
        seen.add(g.gamePk);
      }
    }
  }
  assert.ok(rows > 0, "archive present but empty");
  assert.equal(seen.size, rows, "distinct gamePks must equal stored rows");
});
