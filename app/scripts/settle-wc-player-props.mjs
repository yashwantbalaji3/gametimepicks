/**
 * settle-wc-player-props — grade the exposed World Cup player props against a FINISHED match's official
 * per-player statistics (API-Football fixture player-statistics) into a SEPARATE paper/model ledger.
 *
 * HARD GUARANTEES:
 *   · Never touches app/public/data/mr-dub/portfolio.json, the 19-14 record, or any money artifact.
 *   · Never fabricates: if the stats provider returns no data for the fixture (e.g. the current FREE
 *     API-Football plan has no access to the 2026 season), it FAILS CLOSED — writes nothing, exits 0,
 *     and prints why. A prop with no matching player stat grades "ungradable", never guessed.
 *   · Writes only data/internal/world-cup/prop-settlement/<fixture>.json (paper/model, not web-served).
 *
 * Usage: node app/scripts/settle-wc-player-props.mjs --fixture <apiFootballFixtureId> --date <YYYY-MM-DD>
 * Requires API_FOOTBALL_KEY. Settlement is not wired to any product — props stay excluded from Bank
 * Builder / Moonshot regardless (see market-coverage.isProductEligible).
 */
import fs from "node:fs";
import path from "node:path";
import { buildPropSettlementLedger, normName } from "../src/lib/world-cup/wc-prop-settlement.ts";
import { loadWcPlayerProps } from "../src/lib/world-cup/wc-player-props.ts";

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const fixtureId = arg("--fixture");
  const date = arg("--date");
  const key = (process.env.API_FOOTBALL_KEY || "").trim();
  if (!fixtureId || !date) {
    console.error("usage: --fixture <apiFootballFixtureId> --date <YYYY-MM-DD>");
    process.exit(2);
  }
  if (!key) {
    console.log("[settle-wc-props] API_FOOTBALL_KEY missing — fail closed, nothing settled.");
    process.exit(0);
  }

  // Pull official per-player stats for the finished fixture.
  const res = await fetch(`https://v3.football.api-sports.io/fixtures/players?fixture=${fixtureId}`, {
    headers: { "x-apisports-key": key },
  }).then((r) => r.json()).catch(() => null);

  const rows = res?.response ?? [];
  if (!rows.length) {
    // Free-plan / season-access / not-finished → NO fabrication. Fail closed.
    console.log(`[settle-wc-props] no player stats for fixture ${fixtureId} (errors: ${JSON.stringify(res?.errors ?? {})}). ` +
      `Fail closed — nothing settled. (The FREE API-Football plan has no 2026-season access; a paid tier is required.)`);
    process.exit(0);
  }

  // Normalize provider stats: name -> {goals, shots, shotsOnTarget, assists}.
  const statsByPlayer = {};
  for (const team of rows) {
    for (const pl of team.players ?? []) {
      const s = pl.statistics?.[0] ?? {};
      statsByPlayer[normName(pl.player?.name ?? "")] = {
        goals: s.goals?.total ?? 0,
        shots: s.shots?.total ?? null,
        shotsOnTarget: s.shots?.on ?? null,
        assists: s.goals?.assists ?? 0,
      };
    }
  }

  // Grade the committed props for the fixture (match by fixture string is out of scope; grade the whole slate).
  const propsData = loadWcPlayerProps();
  const props = (propsData?.fixtures ?? []).flatMap((fx) =>
    fx.props.map((p) => ({ player: p.player, market: p.market, pick: p.pick, line: p.line })));
  const ledger = buildPropSettlementLedger(String(fixtureId), props, statsByPlayer);

  // Write to the INTERNAL paper/model ledger (never web-served, never money).
  const outDir = path.join(process.cwd(), "..", "data", "internal", "world-cup", "prop-settlement");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${date}-fixture-${fixtureId}.json`);
  fs.writeFileSync(out, JSON.stringify({ date, fixtureId, ...ledger }, null, 2) + "\n");
  console.log(`[settle-wc-props] wrote ${out} → ${ledger.summary.graded} graded ` +
    `(W${ledger.summary.win}/L${ledger.summary.loss}/void${ledger.summary.void}/ungradable${ledger.summary.ungradable}). Paper/model only.`);
}

main();
