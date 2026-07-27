/**
 * PAIRING COVERAGE CENSUS — measured from live artifacts, never asserted.
 *
 * Runs the canonical pairing selector over a real slate and reports where every row lands, plus
 * WHY the rows that fell out fell out. The gate histogram is the deliverable: a bare comparison
 * rate invites the reading that a low number is a defect, when most of the shortfall is honest
 * scope (families GameTimePicks does not model) or missing upstream data (a lineup not yet posted).
 *
 * Read-only. No network, no credits, no writes outside the optional --json report.
 *
 * Usage:
 *   node app/scripts/measure-pairing-coverage.mjs [--date YYYY-MM-DD] [--json <path>]
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const APP = path.resolve(new URL("..", import.meta.url).pathname);
const DATA = path.join(APP, "public/data/mlb");

const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

const newestDate = (dir) => {
  try {
    return fs
      .readdirSync(path.join(DATA, dir))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .pop()
      ?.replace(/\.json$/, "") ?? null;
  } catch {
    return null;
  }
};

const date = argOf("--date") ?? newestDate("player-props");
if (!date) {
  console.error("no player-props artifact found");
  process.exit(1);
}

const props = readJson(path.join(DATA, `player-props/${date}.json`));
const board = readJson(path.join(DATA, `boards/${date}.json`));
const teamMarkets = readJson(path.join(DATA, `team-markets/${date}.json`));
const sims = readJson(path.join(DATA, `full-game-simulations/${date}.json`));

// ── Import the canonical selector. No logic is reimplemented here; a census that re-derived the
// rules would measure the script instead of the product.
const { getMarketIntelligenceMode, censusPairing, providerKeyFor } = await import(
  path.join(APP, "src/lib/markets/pairing.ts")
);
const { buildGameIntelligence } = await import(path.join(APP, "src/lib/markets/game-intelligence.ts"));
const { PLAYER_FAMILY_BY_PROVIDER_KEY, MODEL_KEY_BY_PLAYER_FAMILY } = await import(
  path.join(APP, "src/lib/markets/types.ts")
);
/** Model artifact key → canonical family, for the model-side pass. */
const MODEL_FAMILY_BY_KEY = Object.fromEntries(
  Object.entries(MODEL_KEY_BY_PLAYER_FAMILY).map(([family, key]) => [key, family]),
);
const { evaluateArtifactFreshness } = await import(path.join(APP, "src/lib/markets/freshness.ts"));

const freshness = evaluateArtifactFreshness(
  { artifactDate: props?.date ?? null, generatedAt: props?.generatedAt ?? null },
  date,
);

// ── Evidence indexes ────────────────────────────────────────────────────────────────────────────
// Team attribution comes from the board, whose own provenance is: probable-pitcher assignment
// (definitive, per side) for pitchers and MLB StatsAPI roster membership for batters. Both are real
// evidence. Neither is a matchup-string guess, which is the thing the resolver exists to refuse.
const gamesByPk = new Map((board?.games ?? []).map((g) => [g.gamePk, g]));
const gameIdToPk = new Map();
const teamByPlayerGame = new Map();
for (const lean of board?.leans ?? []) {
  if (lean.gameId && lean.gamePk != null) gameIdToPk.set(lean.gameId, lean.gamePk);
  if (lean.playerTeamAbbr) {
    teamByPlayerGame.set(`${lean.playerName}|${lean.gameId}`, lean.playerTeamAbbr);
  }
}
// Probable pitchers are side-attributed by MLB StatsAPI, so they resolve the pitcher rows that
// batting orders structurally cannot cover.
for (const g of board?.games ?? []) {
  const gameId = [...gameIdToPk.entries()].find(([, pk]) => pk === g.gamePk)?.[0];
  if (!gameId) continue;
  if (g.awayProbablePitcherName) teamByPlayerGame.set(`${g.awayProbablePitcherName}|${gameId}`, g.awayTeamAbbr);
  if (g.homeProbablePitcherName) teamByPlayerGame.set(`${g.homeProbablePitcherName}|${gameId}`, g.homeTeamAbbr);
}

/** Which model projections exist, keyed the way a comparison would need to join them. */
const modeledRows = new Set();
for (const lean of board?.leans ?? []) {
  if (lean.projection != null) modeledRows.add(`${lean.playerName}|${lean.gameId}|${lean.marketKey}|${lean.line}`);
}

const simByGamePk = new Map((sims?.games ?? []).map((g) => [g.gamePk, g]));

// ── Census: player props ────────────────────────────────────────────────────────────────────────
const results = [];
const familyRollup = new Map();

for (const prop of props?.props ?? []) {
  const family = PLAYER_FAMILY_BY_PROVIDER_KEY[prop.market] ?? null;
  const gamePk = gameIdToPk.get(prop.gameId) ?? null;
  const game = gamePk != null ? gamesByPk.get(gamePk) : null;
  const teamAbbr = teamByPlayerGame.get(`${prop.player}|${prop.gameId}`) ?? null;

  // Cross-check: a resolved team must be one of THIS game's participants. Roster lookup is keyed by
  // name across every team playing today, so a name collision could attach a player to a team that
  // is not even in his game. Verifying participation turns that from a silent error into a refusal.
  const teamIsParticipant =
    teamAbbr != null && game != null && (teamAbbr === game.homeTeamAbbr || teamAbbr === game.awayTeamAbbr);
  const teamMapping = teamIsParticipant ? "RESOLVED_FROM_GAME" : "UNRESOLVED";

  const providerKey = providerKeyFor(family);
  const hasProjection = providerKey
    ? modeledRows.has(`${prop.player}|${prop.gameId}|${providerKey}|${prop.point}`)
    : false;

  const r = getMarketIntelligenceMode({
    sport: "mlb",
    kind: "player",
    family,
    sportsbook: {
      present: true,
      americanOdds: prop.americanOdds ?? null,
      line: prop.point ?? null,
      requiresLine: true,
    },
    model: { present: hasProjection, supportsThreshold: hasProjection },
    freshness,
    eventResolved: game != null,
    teamMapping,
  });
  results.push(r);

  const key = prop.market;
  const roll = familyRollup.get(key) ?? { total: 0, FULL_COMPARISON: 0, MODEL_ONLY: 0, SPORTSBOOK_ONLY: 0, UNAVAILABLE: 0 };
  roll.total += 1;
  roll[r.mode] += 1;
  familyRollup.set(key, roll);
}

// ── Census: the model side the book does not price ──────────────────────────────────────────────
// Iterating only sportsbook rows would structurally report zero MODEL_ONLY, because a family the
// book never posts cannot appear in its own feed. The model-side pass is what makes that visible:
// these are projections GameTimePicks published with no market row to pair against.
const bookRowKeys = new Set(
  (props?.props ?? []).map((p) => `${p.player}|${p.gameId}|${p.market}|${p.point}`),
);
const modelOnlyByFamily = new Map();
for (const lean of board?.leans ?? []) {
  if (lean.projection == null) continue;
  const key = `${lean.playerName}|${lean.gameId}|${lean.marketKey}|${lean.line}`;
  if (bookRowKeys.has(key)) continue;
  const family = MODEL_FAMILY_BY_KEY[lean.marketKey] ?? null;
  const game = lean.gamePk != null ? gamesByPk.get(lean.gamePk) : null;
  const teamAbbr = lean.playerTeamAbbr ?? null;
  const teamIsParticipant =
    teamAbbr != null && game != null && (teamAbbr === game.homeTeamAbbr || teamAbbr === game.awayTeamAbbr);

  const r = getMarketIntelligenceMode({
    sport: "mlb",
    kind: "player",
    family,
    sportsbook: { present: false },
    model: { present: true, supportsThreshold: true },
    freshness,
    eventResolved: game != null,
    teamMapping: teamIsParticipant ? "RESOLVED_FROM_GAME" : "UNRESOLVED",
  });
  results.push(r);
  const roll = modelOnlyByFamily.get(lean.marketKey) ?? { total: 0, MODEL_ONLY: 0, other: 0 };
  roll.total += 1;
  if (r.mode === "MODEL_ONLY") roll.MODEL_ONLY += 1;
  else roll.other += 1;
  modelOnlyByFamily.set(lean.marketKey, roll);
}

// ── Census: game markets ────────────────────────────────────────────────────────────────────────
const gameResults = [];
const gameFreshness = evaluateArtifactFreshness(
  { artifactDate: teamMarkets?.date ?? null, generatedAt: teamMarkets?.generatedAt ?? null },
  date,
);
// Built through the canonical game-intelligence builder rather than re-deriving the gates here, so
// the census measures the product's own decisions instead of a second implementation of them.
const nowIso = new Date(`${date}T17:00:00Z`).toISOString();
const gameDetail = [];
for (const g of Object.values(teamMarkets?.games ?? {})) {
  const gamePk = gameIdToPk.get(g.gameId) ?? null;
  const sim = gamePk != null ? simByGamePk.get(gamePk) ?? null : null;
  const gi = buildGameIntelligence({
    book: g,
    sim,
    gamePk,
    artifact: { date: teamMarkets?.date ?? null, generatedAt: teamMarkets?.generatedAt ?? null },
    todayEt: date,
    nowIso,
  });
  for (const fam of [gi.moneyline, gi.runLine, gi.total]) {
    gameResults.push(fam.intelligence);
    if (fam.intelligence.mode !== "FULL_COMPARISON") {
      gameDetail.push(
        `${gi.awayTeam} @ ${gi.homeTeam} · ${fam.family} · ${fam.intelligence.mode} · ${fam.intelligence.blockedBy.join(",")}`,
      );
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
const playerCensus = censusPairing(results);
const gameCensus = censusPairing(gameResults);

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");

console.log(`\nPAIRING COVERAGE · slate ${date}`);
console.log(`sportsbook prop snapshot: ${freshness.state}${freshness.generatedAt ? ` (${freshness.generatedAt})` : ""}`);
console.log(`game-market snapshot:     ${gameFreshness.state}\n`);

console.log(`── PLAYER PROPS ── ${playerCensus.total} normalized rows`);
for (const [mode, n] of Object.entries(playerCensus.byMode)) {
  console.log(`  ${mode.padEnd(17)} ${String(n).padStart(5)}  ${pct(n, playerCensus.total)}`);
}
console.log(`\n  gates (rows may appear under several):`);
for (const [gate, n] of Object.entries(playerCensus.byGate).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${gate.padEnd(28)} ${String(n).padStart(5)}`);
}

console.log(`\n  by provider family:`);
console.log(`    ${"family".padEnd(22)}${"rows".padStart(6)}${"FULL".padStart(7)}${"MODEL".padStart(7)}${"BOOK".padStart(7)}${"NONE".padStart(7)}`);
for (const [fam, r] of [...familyRollup].sort((a, b) => b[1].total - a[1].total)) {
  console.log(
    `    ${fam.padEnd(22)}${String(r.total).padStart(6)}${String(r.FULL_COMPARISON).padStart(7)}` +
      `${String(r.MODEL_ONLY).padStart(7)}${String(r.SPORTSBOOK_ONLY).padStart(7)}${String(r.UNAVAILABLE).padStart(7)}`,
  );
}

console.log(`\n── GAME MARKETS ── ${gameCensus.total} rows (${Object.keys(teamMarkets?.games ?? {}).length} games × 3 families)`);
for (const [mode, n] of Object.entries(gameCensus.byMode)) {
  console.log(`  ${mode.padEnd(17)} ${String(n).padStart(5)}  ${pct(n, gameCensus.total)}`);
}
if (gameDetail.length) {
  console.log(`\n  game rows that are not FULL_COMPARISON:`);
  for (const d of gameDetail) console.log(`    `);
}
if (Object.keys(gameCensus.byGate).length) {
  console.log(`\n  gates:`);
  for (const [gate, n] of Object.entries(gameCensus.byGate).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${gate.padEnd(28)} ${String(n).padStart(5)}`);
  }
}

if (modelOnlyByFamily.size) {
  console.log(`\n  model-side families the book does not price:`);
  for (const [fam, r] of [...modelOnlyByFamily].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`    ${fam.padEnd(28)} ${String(r.MODEL_ONLY).padStart(5)} MODEL_ONLY of ${r.total}`);
  }
}

// Team-resolution detail, since it is the gate most likely to be misread as a defect.
// Measured over SPORTSBOOK rows only — the denominator has to be the population the claim is about,
// and folding in the model-side pass would understate a rate that was never computed over it.
const bookRows = props?.props ?? [];
const teamResolved = bookRows.filter((p) => {
  const gamePk = gameIdToPk.get(p.gameId);
  const g = gamePk != null ? gamesByPk.get(gamePk) : null;
  const t = teamByPlayerGame.get(`${p.player}|${p.gameId}`);
  return t && g && (t === g.homeTeamAbbr || t === g.awayTeamAbbr);
}).length;
console.log(
  `\n── TEAM RESOLUTION ── ${teamResolved}/${bookRows.length} sportsbook rows carry participant-verified team ` +
    `(${pct(teamResolved, bookRows.length)})`,
);

const jsonPath = argOf("--json");
if (jsonPath) {
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      { date, freshness, playerCensus, gameCensus, byFamily: Object.fromEntries(familyRollup), teamResolved },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${jsonPath}`);
}
console.log("");
