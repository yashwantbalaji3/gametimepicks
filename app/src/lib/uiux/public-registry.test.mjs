/**
 * PUBLIC VOCABULARY + CAPABILITY/STATUS REGISTRY guards (founder directive 2026-10-23 public readiness · audit A-T05).
 *
 *   one registry     lib/public-registry.ts is the one place a sport's public facts live; the gates are READ from the
 *                    capability registry, never re-decided (eligibility unchanged)
 *   same facts       Methodology, Home, Today, the Simulate lobby, Ask and the nav read it (F04, F09, F11)
 *   honest words     the five founder terms, verbatim; retired phrases absent from source copy; no "efficient market"
 *                    claim from a no-play (F12); the NFL win chance is never said to come from the score simulation (F04)
 *
 * The built-page counterpart (retired phrases on every rendered public page) is public-vocabulary.test.mjs.
 * Run (from app/): npx tsx --test src/lib/uiux/public-registry.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const R = await import("../public-registry.ts");
const CAP = await import("../sport-capability-registry.ts");
const { MARKET_COVERAGE } = await import("../market-coverage.ts");
const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
/** A route exists when each segment is a directory under src/app — or a dynamic [param] directory — ending in page.tsx. */
function routeExists(route) {
  let dir = path.join(APP, "src/app");
  for (const seg of route.split("/").filter(Boolean)) {
    if (fs.existsSync(path.join(dir, seg))) { dir = path.join(dir, seg); continue; }
    const dyn = fs.readdirSync(dir).find((d) => /^\[[^.].*\]$/.test(d));
    if (!dyn) return false;
    dir = path.join(dir, dyn);
  }
  return fs.existsSync(path.join(dir, "page.tsx"));
}

test("the five public terms are the founder's, verbatim, and every one has its one-line meaning", () => {
  assert.deepEqual(Object.values(R.PUBLIC_TERMS), ["Official Forecast", "Predicted Player Statistics", "Game Simulation", "What-if Scenario", "Model Performance", "Historical Results", "Unavailable"]);
  for (const t of Object.values(R.PUBLIC_TERMS)) assert.ok(R.PUBLIC_TERM_MEANING[t]?.length > 20, t);
  for (const p of ["Unvalidated experimental simulation", "Experimental model projections", "Research-only prototype", "Experimental feature"]) {
    assert.ok(R.RETIRED_PUBLIC_PHRASES.includes(p), `${p} is retired`);
  }
});

test("presentation, not permission: every sport's gates are the capability registry's own answers", () => {
  for (const s of R.PUBLIC_SPORTS) {
    assert.equal(s.capability, CAP.capabilityState(s.key), `${s.key}: state read, not re-decided`);
    assert.equal(s.productEligible, CAP.canEnterPredictionProducts(s.key), `${s.key}: product eligibility read from the gate`);
    // a sport that may not enter products never reads as if it could
    if (!s.productEligible) assert.doesNotMatch(JSON.stringify(s), /\b(pick|best bet|lock|recommended)\b/i, s.key);
    for (const f of Object.values(s.features)) {
      if (f.availability === "NOT_SUPPORTED") assert.ok(f.note.length > 10, `${s.key}: an unsupported feature says why`);
      if (f.href) {
        const route = f.href.replace(/[?#].*$/, "").replace(/^\/|\/$/g, "");
        assert.ok(routeExists(route), `${s.key}: ${f.href} is a real route`);
      }
    }
    // Model Performance never claims proven skill
    assert.doesNotMatch(s.features.modelPerformance.note, /\b(proven|beats?|outperforms?|validated to)\b/i, `${s.key}: no skill claim`);
  }
  assert.equal(R.PUBLIC_SPORTS.filter((s) => s.productEligible).map((s) => s.key).join(), CAP.FULL_MODEL_SPORTS.filter((k) => R.publicSport(k)).join());
});

test("F09: a supported feature that has nothing for a slate says 'not published yet', an unsupported one says Unavailable — never 'by design'", () => {
  assert.match(R.availabilityLine("nba", "gameSimulation"), /not published yet for this slate/);
  assert.match(R.availabilityLine("nba", "officialForecast"), /not published yet for this slate/);
  assert.match(R.availabilityLine("ufc", "gameSimulation"), /^Unavailable — /);
  const lobby = read("src/lib/simulate/day-view.ts");
  assert.doesNotMatch(lobby, /schedule-only — no simulation is published, by design/);
  assert.match(lobby, /availabilityLine\("nba", "officialForecast"\)/, "the NBA row reads the registry");
  assert.match(lobby, /nba\/experimental-public\/\$\{date\}\.json/, "published = the slate's frozen public lane snapshot carries the game");
});

test("F11: Ask states its OWN access from the registry — NFL live is read through the gateway, never 'unavailable product-wide'", () => {
  assert.deepEqual([...R.ASSISTANT_LIVE_SPORTS], ["MLB", "NFL"], "Production's live gateway publishes MLB and NFL (LIVE_PUBLIC_SPORTS)");
  const ask = read("src/app/ask/page.tsx");
  assert.doesNotMatch(ask, /NFL live state is not available/);
  assert.match(ask, /ASSISTANT_LIVE_SPORTS/);
});

test("F12: a no-play is stated as the rules' result at that snapshot, never as proof the market is efficient", () => {
  for (const f of ["src/components/game/mlb-simulation-result-summary.tsx", "src/components/game/soccer-simulation-report-v2.tsx", "src/components/game/wc-simulation-result-summary.tsx"]) {
    assert.doesNotMatch(read(f), /market is efficient|market being efficient/i, f);
  }
  assert.match(read("src/components/game/mlb-simulation-result-summary.tsx"), /No candidate passed the rules at this snapshot/);
});

test("F04: Methodology reads the registry and the runtime statuses; no stale per-sport claim survives", () => {
  const m = read("src/app/methodology/page.tsx");
  assert.match(m, /PUBLIC_SPORTS\.map\(/, "the by-sport cards are the registry's");
  assert.match(m, /buildCommandCenter\(/, "Model Performance 'now' lines are the runtime lane statuses");
  for (const stale of [/MLB is the only sport producing model output/, /NBA is frozen history/, /There is no fight model/, /soccer is closed/, /only sport currently producing model output/]) {
    assert.doesNotMatch(m, stale, String(stale));
  }
  const nflWin = MARKET_COVERAGE.find((x) => x.sport === "nfl" && x.market === "moneyline");
  assert.doesNotMatch(nflWin.publicExplanation, /same simulation/i, "the NFL win chance comes from the team rating, not the score simulation");
  assert.match(nflWin.publicExplanation, /team rating/);
});

test("same facts everywhere: Home, Today, the lobby, Methodology, Ask and the nav all read lib/public-registry", () => {
  for (const f of ["src/app/methodology/page.tsx", "src/app/today/page.tsx", "src/lib/simulate/day-view.ts", "src/app/ask/page.tsx", "src/lib/sports/catalog.ts", "src/lib/command-center/nba-lane.ts", "src/components/simulation-coverage-matrix.tsx"]) {
    assert.match(read(f), /from "@\/lib\/public-registry"/, `${f} reads the registry`);
  }
  assert.match(read("src/app/page.tsx"), /nbaLane\(/, "Home's NBA lane is the registry-reading lane");
});

test("retired phrases stay out of the source copy of every surface this directive owns", () => {
  const owned = [
    "src/app/nba/page.tsx", "src/components/nba/experimental-lane.tsx", "src/components/nba/hub-overview.tsx",
    "src/app/nba/simulation/[eventId]/page.tsx", "src/lib/sports/catalog.ts",
    "src/lib/simulation-theater/nba/possession/public-route.mjs", "src/app/methodology/page.tsx", "src/app/ask/page.tsx", "src/lib/command-center/nba-lane.ts",
  ];
  for (const f of owned) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$|^\s*\*.*$/gm, ""); // comments are not copy
    for (const p of R.RETIRED_PUBLIC_PHRASES) assert.ok(!src.toLowerCase().includes(p.toLowerCase()), `${f}: "${p}"`);
  }
});

test("the Theater's labels.mjs (plain-Node-importable, so the terms are inlined) speaks exactly the registry's terms", async () => {
  const { PUBLIC_TERMS_USED } = await import("../simulation-theater/nba/possession/labels.mjs");
  for (const [k, v] of Object.entries(PUBLIC_TERMS_USED)) assert.equal(v, R.PUBLIC_TERMS[k], k);
});
