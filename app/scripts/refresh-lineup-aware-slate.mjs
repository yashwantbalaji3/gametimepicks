#!/usr/bin/env -S npx tsx
/**
 * Lineup-aware World Cup refresh (JS side). Run AFTER the pipeline pulls fresh team odds + player props
 * for the date. Regenerates the role-screened World Cup Specials + the coverage matrix. When the
 * official starting XI is posted it upgrades player roles to confirmed_starter (and benches out-of-XI
 * players); otherwise roles stay projected/market-implied. Preview-isolated: in `preview_only` mode it
 * writes ONLY to the preview namespace and never to production latest artifacts.
 *
 *   cd app && npx tsx scripts/refresh-lineup-aware-slate.mjs --date 2026-06-20 --mode preview_only
 *
 * Modes: preview_only (default) | auto_public_board | auto_launch_full
 * Bank Builder / Moonshot are NEVER auto-placed here (candidate-only) regardless of mode.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJune20SpecialsPreview } from "../src/lib/world-cup/world-cup-specials-preview.ts";
import { loadTodaySlate } from "../src/lib/parlays/ui-loader.ts";
import { buildCoverageMatrix } from "../src/lib/parlays/coverage-matrix.ts";
import { loadMoonshotLane } from "../src/lib/moonshot/moonshot-lane.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP, "public", "data");
const AF_LEAGUE = process.env.WC_API_FOOTBALL_LEAGUE ?? "1";
const AF_SEASON = process.env.WC_API_FOOTBALL_SEASON ?? "2026";
const norm = (s) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const date = arg("date", new Date().toISOString().slice(0, 10));
const mode = arg("mode", "preview_only");
const nowIso = arg("now", new Date().toISOString());
const preview = mode === "preview_only";

const writeJson = (p, obj) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n"); };
const cp = (from, to) => { if (fs.existsSync(from)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); } };

/**
 * Fetch the confirmed starting XI for upcoming WC games whose lineups are posted. Returns the set of
 * normalized player names AND the set of normalized team names that have a posted XI — so the regrader
 * can confirm/bench ONLY players on teams whose lineups are up, and leave the rest projected. Empty
 * sets when no key / nothing posted.
 */
async function fetchConfirmedXI() {
  const key = (process.env.API_FOOTBALL_KEY ?? "").trim();
  if (!key) return { names: new Set(), teams: new Set() };
  const af = async (p) => (await fetch(`https://v3.football.api-sports.io/${p}`, { headers: { "x-apisports-key": key } })).json();
  const names = new Set(), teams = new Set();
  try {
    const fx = await af(`fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}&date=${date}`);
    for (const f of fx.response ?? []) {
      if (f.fixture?.status?.short !== "NS") continue; // only upcoming games
      const lu = await af(`fixtures/lineups?fixture=${f.fixture.id}`);
      const resp = lu.response ?? [];
      const total = resp.reduce((n, t) => n + (t.startXI?.length ?? 0), 0);
      if (total < 22) continue; // this game's XI is not fully posted yet — leave it projected
      for (const t of resp) {
        if (t.team?.name) teams.add(norm(t.team.name));
        for (const s of t.startXI ?? []) if (s.player?.name) names.add(norm(s.player.name));
      }
    }
  } catch { /* keep whatever we have */ }
  return { names, teams };
}

async function main() {
  const { names: confirmedStarters, teams: postedTeams } = await fetchConfirmedXI();

  // The Specials builder reads previews/june20/* — sync it from the freshly-pulled production WC data.
  for (const [kind, file] of [["projections", "projections.json"], ["player-projections", "player-projections.json"], ["parlays", "parlays.json"]]) {
    cp(path.join(DATA, "world-cup", kind, `${date}.json`), path.join(DATA, "previews", "june20", file));
  }

  const specials = buildJune20SpecialsPreview({ nowIso, confirmedStarters, postedTeams });
  const slate = loadTodaySlate(date, nowIso);
  const coverage = buildCoverageMatrix(slate, loadMoonshotLane(), nowIso);

  const specialsTarget = preview
    ? path.join(DATA, "previews", "lineup-refresh", date, "world-cup-specials.json")
    : path.join(DATA, "world-cup", "world-cup-specials.json");
  const coverageTarget = preview
    ? path.join(DATA, "previews", "lineup-refresh", date, "coverage-matrix.json")
    : path.join(DATA, "parlays", "coverage-matrix.json");
  writeJson(specialsTarget, specials);
  writeJson(coverageTarget, coverage);

  const summary = {
    date, mode, nowIso, preview,
    lineupsPosted: specials.lineupsPosted, confirmedStartersCount: confirmedStarters.size,
    postedTeams: [...postedTeams],
    specialsCards: specials.cards.length,
    roleCounts: {
      confirmed: specials.cards.flatMap((c) => c.legs).filter((l) => l.roleTier === "confirmed_starter").length,
      keyAttacker: specials.cards.flatMap((c) => c.legs).filter((l) => l.roleTier === "key_attacker").length,
      projected: specials.cards.flatMap((c) => c.legs).filter((l) => l.roleTier === "projected_starter").length,
    },
    coverage: Object.fromEntries(coverage.rows.map((r) => [r.scope, r.total])),
    grandTotal: coverage.grandTotal,
    bankBuilder: "candidate-only (never auto-placed by this script)",
    moonshot: "candidate-only (never auto-placed by this script)",
    wroteProduction: !preview,
  };
  writeJson(path.join(DATA, "automation", "lineup-refresh-summary.json"), summary);
  console.log(`[lineup-refresh] ${date} mode=${mode} preview=${preview} XI=${confirmedStarters.size} cards=${specials.cards.length} coverage=${coverage.grandTotal}`);
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
