/**
 * mlb-slate-completeness-gate.mjs — the PRODUCTION verification step + daily health monitor for the MLB slate.
 *
 * Checks the 4 public artifacts a complete daily MLB slate needs and derives an HONEST slate status. It NEVER
 * fabricates a market or a ready state; it only reports what exists. Money-safe: reads public/data/mlb + writes one
 * internal status file. Writes data/internal/mlb/pregame-archive/status/mlb-production-health.json (public:false).
 *
 *   REQUIRED to publish : board + game-simulations   (a bare board with no sim is "SIMULATION_PENDING")
 *   IF-AVAILABLE        : team-markets, player-props  (absent ⇒ "AWAITING_MARKET_DATA", never a fake ready state)
 *
 * Exit code: 0 when the slate is publishable (board + sim present) OR there are simply no games; non-zero only when
 * --fail-closed is set AND the board is missing (so a CI publish step can abort a broken slate).
 *
 *   node app/scripts/mlb-slate-completeness-gate.mjs --date 2026-07-22
 *   node app/scripts/mlb-slate-completeness-gate.mjs --date 2026-07-22 --fail-closed
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const PUB = path.join(APP, "public", "data", "mlb");
const OUT = path.join(REPO, "data/internal/mlb/pregame-archive/status");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** PURE honest slate-status derivation — never a fake ready state. */
export function deriveSlateStatus({ hasBoard, boardGames, hasSim, hasTeamMarkets, hasPlayerProps }) {
  if (!hasBoard) return { slateStatus: "NO_BOARD", readyToPublish: false, publicLabel: "Board pending" };
  if (boardGames === 0) return { slateStatus: "NO_GAMES", readyToPublish: true, publicLabel: "No games scheduled" };
  if (!hasSim) return { slateStatus: "SIMULATION_PENDING", readyToPublish: false, publicLabel: "Simulation pending" };
  if (!hasTeamMarkets && !hasPlayerProps) return { slateStatus: "AWAITING_MARKET_DATA", readyToPublish: true, publicLabel: "Awaiting market data" };
  return { slateStatus: "READY", readyToPublish: true, publicLabel: "Slate ready" };
}

function main() {
  const args = process.argv.slice(2);
  const FAIL_CLOSED = args.includes("--fail-closed");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);

  const board = readJson(path.join(PUB, "boards", `${date}.json`));
  const sim = readJson(path.join(PUB, "game-simulations", `${date}.json`));
  const teamMarkets = readJson(path.join(PUB, "team-markets", `${date}.json`));
  const playerProps = readJson(path.join(PUB, "player-props", `${date}.json`));

  const boardGames = board ? (board.games?.length ?? 0) : 0;
  const simGames = sim ? (sim.games?.length ?? 0) : 0;
  const simPicks = sim ? (sim.games || []).reduce((a, g) => a + ((g.generatedPicks || g.picks || []).length), 0) : 0;
  const teamMarketGames = teamMarkets ? Object.keys(teamMarkets.games || teamMarkets.byGame || {}).length || (Array.isArray(teamMarkets) ? teamMarkets.length : 0) : 0;
  const propCount = playerProps ? (playerProps.props?.length ?? (Array.isArray(playerProps) ? playerProps.length : 0)) : 0;

  const present = { board: !!board, simulation: !!sim, teamMarkets: !!teamMarkets, playerProps: !!playerProps };
  const missing = Object.entries(present).filter(([, v]) => !v).map(([k]) => k);

  // honest slate status — never a fake ready state
  const { slateStatus, readyToPublish, publicLabel } = deriveSlateStatus({ hasBoard: !!board, boardGames, hasSim: !!sim, hasTeamMarkets: !!teamMarkets, hasPlayerProps: !!playerProps });

  // Runtime facts the gate cannot compute from artifacts alone:
  //  • creditsRemaining — the paid ingests write it to a sidecar (odds-credits.json); the gate does NOT call the paid API.
  //  • buildStatus      — the build runs AFTER this gate, so it is "pending" until a post-build finalize pass sets MLB_BUILD_STATUS.
  const creditsSidecar = readJson(path.join(OUT, "odds-credits.json"));
  const creditsRemaining = creditsSidecar && Number.isFinite(creditsSidecar.remaining) ? creditsSidecar.remaining : null;
  const buildStatus = process.env.MLB_BUILD_STATUS || "pending";

  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-production-health", date,
    // Flat daily-monitor fields (the founder's at-a-glance health row):
    boardGenerated: !!board, teamMarketsGenerated: !!teamMarkets, playerPropsGenerated: !!playerProps, simulationGenerated: !!sim,
    slateStatus, missingArtifacts: missing, creditsRemaining, buildStatus,
    readyToPublish, publicLabel,
    // Detailed per-artifact counts:
    artifacts: {
      board: { present: !!board, games: boardGames },
      simulation: { present: !!sim, games: simGames, picks: simPicks, runCount: sim?.runCount ?? null, artifactHash: sim?.artifactHash ?? null },
      teamMarkets: { present: !!teamMarkets, games: teamMarketGames },
      playerProps: { present: !!playerProps, props: propCount },
    },
    credits: { remaining: creditsRemaining, floor: Number(process.env.ODDS_API_MIN_CREDITS_REMAINING ?? process.env.ODDS_CREDIT_FLOOR ?? 2000), note: "creditsRemaining is read from the ingest sidecar (odds-credits.json); this gate never calls the paid API." },
    note: "REQUIRED to publish: board + game-simulations. team-markets/player-props are if-available; their absence yields AWAITING_MARKET_DATA, never a fabricated ready state. No fabrication.",
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "mlb-production-health.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, `mlb-production-health-${date}.json`), JSON.stringify(report, null, 2));

  console.log(`\n=== MLB PRODUCTION HEALTH ${date} ===`);
  console.log(`  board:        ${present.board ? "✓" : "✗"} (${boardGames} games)`);
  console.log(`  simulation:   ${present.simulation ? "✓" : "✗"} (${simGames} games, ${simPicks} picks, ${report.artifacts.simulation.runCount ?? "-"} runs)`);
  console.log(`  team markets: ${present.teamMarkets ? "✓" : "✗"} (${teamMarketGames} games)`);
  console.log(`  player props: ${present.playerProps ? "✓" : "✗"} (${propCount} props)`);
  console.log(`  SLATE STATUS: ${slateStatus}  ·  publishable: ${readyToPublish}  ·  public label: "${publicLabel}"  ·  missing: [${missing.join(",")}]`);
  console.log(`  credits:      ${creditsRemaining ?? "-"} remaining  ·  build: ${buildStatus}`);
  console.log(`  health → data/internal/mlb/pregame-archive/status/mlb-production-health.json`);

  if (FAIL_CLOSED && slateStatus === "NO_BOARD") { console.error("[gate] FAIL-CLOSED: no board — refusing to mark the slate ready."); process.exit(1); }
  process.exit(0);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
