/**
 * PLAYER PROP TEAM RESOLUTION (Sprint 029 · Phase 2).
 *
 * The defect this guards is a confident wrong attribution: picking a team from the matchup string
 * would be right ~50% of the time and look authoritative every time. Every test below is about
 * refusing to attribute without evidence.
 *
 * Also measures the REAL resolution rate against live artifacts, because a resolver's coverage here
 * is a function of when lineups have posted — it cannot be assumed, only measured.
 *
 * Run: npx tsx --test src/lib/markets/resolve-team.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  indexGames,
  indexLineups,
  isPublishableTeamMapping,
  measureResolution,
  normalizePlayerName,
  resolvePlayerTeam,
} from "./resolve-team.ts";

const GAMES = indexGames([
  { eventId: "evt1", gamePk: 111, homeTeam: "Tampa Bay Rays", awayTeam: "Cleveland Guardians" },
  { eventId: "evt2", gamePk: 222, homeTeam: "Texas Rangers", awayTeam: "Seattle Mariners" },
]);
const LINEUPS = indexLineups([
  { gamePk: 111, home: ["Joc Pederson", "Yandy Díaz"], away: ["José Ramírez"] },
]);

test("a player in a posted lineup resolves to that side, with the opponent", () => {
  const r = resolvePlayerTeam({ playerName: "Joc Pederson", eventId: "evt1" }, GAMES, LINEUPS);
  assert.equal(r.status, "RESOLVED_FROM_GAME");
  assert.equal(r.team, "Tampa Bay Rays");
  assert.equal(r.opponent, "Cleveland Guardians");
  assert.equal(r.evidence, "lineup");

  const away = resolvePlayerTeam({ playerName: "José Ramírez", eventId: "evt1" }, GAMES, LINEUPS);
  assert.equal(away.team, "Cleveland Guardians");
  assert.equal(away.opponent, "Tampa Bay Rays");
});

test("no gameId, or an unknown one, is UNRESOLVED with nothing attached", () => {
  for (const eventId of ["", "not-a-real-event", "evt-does-not-exist"]) {
    const r = resolvePlayerTeam({ playerName: "Joc Pederson", eventId }, GAMES, LINEUPS);
    assert.equal(r.status, "UNRESOLVED", `${eventId || "(empty)"} must be UNRESOLVED`);
    assert.equal(r.team, null);
    assert.equal(r.participants, null, "no game means no participants");
  }
});

test("a known game with NO posted lineup keeps the matchup but refuses a side", () => {
  // The central case: two candidate teams and no evidence to choose between them.
  const r = resolvePlayerTeam({ playerName: "Corey Seager", eventId: "evt2" }, GAMES, LINEUPS);
  assert.equal(r.status, "UNRESOLVED", "knowing the game is not knowing the team");
  assert.equal(r.team, null);
  assert.ok(r.participants, "the matchup is still available");
  assert.equal(r.participants.homeTeam, "Texas Rangers");
  assert.equal(r.participants.awayTeam, "Seattle Mariners");
});

test("team is never inferred from matchup order", () => {
  // The tempting shortcut: "Away @ Home" — take the first name. It would be wrong half the time.
  const r = resolvePlayerTeam({ playerName: "Nobody Here", eventId: "evt2" }, GAMES, LINEUPS);
  assert.equal(r.team, null);
  assert.notEqual(r.team, "Seattle Mariners");
  assert.notEqual(r.team, "Texas Rangers");
});

test("a player absent from both posted orders stays UNRESOLVED (pitchers land here)", () => {
  // Batting orders exclude pitchers and this repo has no probable-pitcher artifact, so pitcher
  // props legitimately resolve UNRESOLVED. A data gap, not a resolver failure.
  const r = resolvePlayerTeam({ playerName: "Some Starting Pitcher", eventId: "evt1" }, GAMES, LINEUPS);
  assert.equal(r.status, "UNRESOLVED");
  assert.equal(r.team, null);
  assert.ok(r.participants, "the game is still known");
});

test("a name on BOTH sides is AMBIGUOUS, not a coin flip", () => {
  const collide = indexLineups([{ gamePk: 111, home: ["Will Smith"], away: ["Will Smith"] }]);
  const r = resolvePlayerTeam({ playerName: "Will Smith", eventId: "evt1" }, GAMES, collide);
  assert.equal(r.status, "AMBIGUOUS", "evidence pointing both ways is not evidence for one");
  assert.equal(r.team, null);
  assert.equal(r.evidence, "lineup", "ambiguity is itself an evidence-backed finding");
});

test("name matching is conservative — no surname-only or partial matches", () => {
  assert.equal(normalizePlayerName("José Ramírez"), "jose ramirez", "accents fold");
  assert.equal(normalizePlayerName("J.T. Realmuto"), "jt realmuto", "punctuation folds");
  assert.equal(normalizePlayerName("  Yandy   Díaz "), "yandy diaz", "whitespace folds");

  // Surname alone must NOT resolve — more than one player can share it.
  const surnameOnly = resolvePlayerTeam({ playerName: "Pederson", eventId: "evt1" }, GAMES, LINEUPS);
  assert.equal(surnameOnly.status, "UNRESOLVED", "a surname is not an identity");
  // Nor a prefix.
  const partial = resolvePlayerTeam({ playerName: "Joc", eventId: "evt1" }, GAMES, LINEUPS);
  assert.equal(partial.status, "UNRESOLVED");
});

test("a provider-supplied team wins and is labelled EXACT", () => {
  const r = resolvePlayerTeam(
    { playerName: "Anyone", eventId: "evt1", providerTeam: "Tampa Bay Rays" },
    GAMES,
    LINEUPS,
  );
  assert.equal(r.status, "EXACT");
  assert.equal(r.evidence, "provider");
  assert.equal(r.opponent, "Cleveland Guardians", "opponent derives from the game");
});

test("only EXACT and RESOLVED_FROM_GAME may back a public team-attributed comparison", () => {
  assert.equal(isPublishableTeamMapping("EXACT"), true);
  assert.equal(isPublishableTeamMapping("RESOLVED_FROM_GAME"), true);
  assert.equal(isPublishableTeamMapping("AMBIGUOUS"), false);
  assert.equal(isPublishableTeamMapping("UNRESOLVED"), false);
});

// ── measured against live artifacts ─────────────────────────────────────────

test("MEASURED: real resolution rate on the live slate", () => {
  const APP = process.cwd();
  const PUB = path.join(APP, "public", "data");
  const REPO = path.join(APP, "..");
  const latest = (dir) =>
    fs.readdirSync(path.join(PUB, dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);

  const date = latest("mlb/player-props").replace(".json", "");
  const props = JSON.parse(fs.readFileSync(path.join(PUB, "mlb/player-props", `${date}.json`), "utf8")).props ?? [];
  const board = JSON.parse(fs.readFileSync(path.join(PUB, "mlb/boards", `${date}.json`), "utf8"));

  // gameId -> gamePk + participants comes from the board leans, the artifact carrying both ids.
  const seen = new Map();
  for (const l of board.leans ?? []) {
    if (l.gameId && !seen.has(l.gameId)) {
      seen.set(l.gameId, {
        eventId: l.gameId,
        gamePk: l.gamePk ?? null,
        homeTeam: l.homeTeamName ?? "",
        awayTeam: l.awayTeamName ?? "",
      });
    }
  }

  // Program 092-095 Lane C: props can legitimately exist for events whose game markets (leans)
  // haven't posted yet — the morning state of evening games. Those props still carry identity:
  // `matchup` ("Away Name @ Home Name"). Join it to the board's SCHEDULE, but only when that
  // team pair maps to exactly ONE scheduled game that date — a doubleheader pair is ambiguous
  // and must stay unresolved (fail-closed), exactly like the upstream nearest-start resolver.
  const scheduleByPair = new Map();
  for (const g of board.games ?? []) {
    const pair = `${g.awayTeamName ?? ""} @ ${g.homeTeamName ?? ""}`;
    scheduleByPair.set(pair, [...(scheduleByPair.get(pair) ?? []), g]);
  }
  for (const p of props) {
    if (!p.gameId || seen.has(p.gameId) || typeof p.matchup !== "string") continue;
    const candidates = scheduleByPair.get(p.matchup) ?? [];
    if (candidates.length !== 1) continue; // ambiguous or unknown pair → stays unresolved
    const g = candidates[0];
    seen.set(p.gameId, {
      eventId: p.gameId,
      gamePk: g.gamePk ?? null,
      homeTeam: g.homeTeamName ?? "",
      awayTeam: g.awayTeamName ?? "",
    });
  }
  const games = indexGames([...seen.values()]);

  const lineupDir = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features/lineup", date);
  const byPk = new Map();
  if (fs.existsSync(lineupDir)) {
    for (const f of fs.readdirSync(lineupDir).filter((x) => x.endsWith(".json"))) {
      const j = JSON.parse(fs.readFileSync(path.join(lineupDir, f), "utf8"));
      const names = (side) => ((j[side] ?? {}).lineup ?? []).map((p) => p.name ?? p.fullName).filter(Boolean);
      const home = names("home");
      const away = names("away");
      if (!home.length && !away.length) continue;
      // Multiple captures per game; keep the fullest.
      const prev = byPk.get(j.gamePk);
      if (!prev || home.length + away.length > prev.home.length + prev.away.length) {
        byPk.set(j.gamePk, { gamePk: j.gamePk, home, away });
      }
    }
  }
  const lineups = indexLineups([...byPk.values()]);

  const resolutions = props.map((p) =>
    resolvePlayerTeam({ playerName: p.player, eventId: p.gameId, providerTeam: p.team ?? null }, games, lineups),
  );
  const m = measureResolution(resolutions);

  console.log(
    `    [resolution ${date}] rows=${m.total} · game-resolved=${m.gameResolved} (${((m.gameResolved / m.total) * 100).toFixed(1)}%)` +
      ` · publishable-team=${m.publishable} (${(m.publishableRate * 100).toFixed(1)}%)` +
      ` · ${JSON.stringify(m.byStatus)} · gamesWithLineups=${byPk.size}`,
  );

  // Structural assertions only — the RATE is time-dependent (lineups post through the day), so
  // pinning a number here would make this test fail for a correct reason every morning.
  assert.ok(m.total > 0, "live props exist");
  assert.equal(m.gameResolved, m.total, "every live prop must resolve to a game via gameId");
  assert.equal(m.byStatus.EXACT, 0, "the feed supplies no team today, so nothing is EXACT");
  assert.ok(m.publishable <= m.total);
  // Whatever resolved must have had real evidence behind it.
  for (const r of resolutions) {
    if (r.status === "RESOLVED_FROM_GAME") assert.equal(r.evidence, "lineup");
    if (r.status === "UNRESOLVED") assert.equal(r.team, null);
  }
});
