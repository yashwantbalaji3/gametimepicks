/**
 * POPULATION & OUTCOME CONTRACT (P248 · Release A1) — THE versioned owner of "who is in an
 * evaluation, what did they do, and why is anyone excluded". Every NFL player-family
 * evaluation must consume THIS module and stamp POPULATION_CONTRACT_VERSION on its receipt;
 * a promotion that does not reference the current contract version is not comparable to one
 * that does — inconsistent example definitions are how approvals kept reversing (P246→P247).
 *
 * THE STATES THAT MUST NEVER COLLAPSE (each has a distinct market meaning):
 *   PLAYED_OFFENSE      offensive snaps > 0 — stats settle, a zero is a real zero.
 *   PLAYED_NO_OFFENSE   dressed, defense/special-teams only (or a 0/0/0 sheet row) — an active
 *                       player's volume props settle 0; he did not "miss" the game.
 *   DID_NOT_DRESS       team sheet exists for the game and he is not on it — prop markets VOID.
 *   AMBIGUOUS_IDENTITY  a last-name fallback found MORE THAN ONE candidate — never a guess;
 *                       excluded, typed, COUNTED.
 *   SOURCE_MISSING      no snap sheet exists for that team-game at all — excluded, typed,
 *                       COUNTED; absence of the sheet is not evidence about the player.
 *
 * Snap counts are PARTICIPATION evidence, not a universal sportsbook settlement rule: a
 * market-settled claim still needs that book's own void rules verified. Model-only evaluation
 * under this contract states its conditioning ("scored over participants; DNP void") and is
 * never labeled a sportsbook-settled record.
 *
 * Identity discipline (WC-matchId / P170-B lessons): exact normalized name first; last-name
 * fallback ONLY when unique within the same team-game; postseason rounds map corpus weeks
 * {1:WC, 2:DIV, 3:CON, 5:SB} onto nflverse game_type (their playoff weeks are numbered 19-22).
 * Every classification carries its matchMethod so an audit can find false matches, not just
 * join successes.
 */

export const POPULATION_CONTRACT_VERSION = 2;

export const PARTICIPATION_STATES = Object.freeze([
  "PLAYED_OFFENSE",
  "PLAYED_NO_OFFENSE",
  "DID_NOT_DRESS",
  "AMBIGUOUS_IDENTITY",
  "SOURCE_MISSING",
]);

const POST_ROUND = { 1: ["WC"], 2: ["DIV"], 3: ["CON"], 5: ["SB"], 4: ["CON", "SB"] };

export function normName(n) {
  return String(n)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[.'`-]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/\s+/g, " ").trim();
}

/** The (gameType, week) keys a corpus game may live under in the snaps source. */
function keysFor(game) {
  const wk = game.week;
  const month = game.dateUtc ? Number(game.dateUtc.slice(5, 7)) : null;
  const postseason = game.seasonType === 3 || game.phase === 3 || (wk != null && wk <= 5 && (month === 1 || month === 2));
  const tries = [];
  if (postseason) {
    for (const round of POST_ROUND[wk] ?? ["WC", "DIV", "CON", "SB", "POST"]) {
      for (let w = 18; w <= 23; w += 1) tries.push([round, w]);
      tries.push([round, wk]);
    }
  } else {
    tries.push(["REG", wk]);
  }
  return tries;
}

const compOf = (v) => (Array.isArray(v) ? { off: v[0] ?? 0, def: v[1] ?? 0, st: v[2] ?? 0 } : null);

/**
 * Classify one player's participation in one game against the season's snap sheet.
 * @param {{schemaVersion: number, players: Record<string, number[]>, byLast: Record<string, Record<string, number[]>>, teamWeeks: string[]}} part
 * @returns {{state: string, snaps: {off:number,def:number,st:number}|null, matchMethod: string|null, matchedName?: string, candidates?: string[]}}
 */
export function classifyParticipation({ part, game, teamAbbr, playerName }) {
  if (part?.schemaVersion !== 2) {
    // Fail LOUDLY (the P246 TDZ silent-no-op lesson): a v1 doc has no components and no
    // coverage set — classifying against it would silently collapse the states this contract
    // exists to separate.
    throw new Error(`participation-truth doc schemaVersion ${part?.schemaVersion} — contract v${POPULATION_CONTRACT_VERSION} needs v2 (rebuild build-nfl-participation-truth)`);
  }
  const nm = normName(playerName ?? "");
  const tries = keysFor(game);
  const teamWeekSet = part.__teamWeekSet ?? (part.__teamWeekSet = new Set(part.teamWeeks ?? []));

  for (const [gt, w] of tries) {
    const v = part.players[`${gt}|${w}|${teamAbbr}|${nm}`];
    if (v != null) {
      const snaps = compOf(v);
      return { state: snaps.off > 0 ? "PLAYED_OFFENSE" : "PLAYED_NO_OFFENSE", snaps, matchMethod: "exact", matchedName: nm };
    }
  }
  const last = nm.split(" ").at(-1) ?? nm;
  for (const [gt, w] of tries) {
    const cands = part.byLast[`${gt}|${w}|${teamAbbr}|${last}`];
    if (cands) {
      const names = Object.keys(cands);
      if (names.length === 1) {
        const snaps = compOf(cands[names[0]]);
        return { state: snaps.off > 0 ? "PLAYED_OFFENSE" : "PLAYED_NO_OFFENSE", snaps, matchMethod: "unique-last-name", matchedName: names[0] };
      }
      return { state: "AMBIGUOUS_IDENTITY", snaps: null, matchMethod: "last-name-collision", candidates: names };
    }
  }
  const covered = tries.some(([gt, w]) => teamWeekSet.has(`${gt}|${w}|${teamAbbr}`));
  return covered
    ? { state: "DID_NOT_DRESS", snaps: null, matchMethod: "absent-from-complete-team-sheet" }
    : { state: "SOURCE_MISSING", snaps: null, matchMethod: null };
}

/**
 * Outcome for a NO-BOXSCORE-ROW candidate under one participation state. (A candidate WITH a
 * boxscore row is scored by the family's own row rule — that path never reaches here.)
 * @returns {{kind: "SCORED"|"VOID"|"EXCLUDED", actual?: number, reason: string}}
 */
export function outcomeForAbsentCandidate(participation) {
  switch (participation.state) {
    case "PLAYED_OFFENSE":
    case "PLAYED_NO_OFFENSE":
      return { kind: "SCORED", actual: 0, reason: `${participation.state}: dressed and recorded nothing in this market — settles 0` };
    case "DID_NOT_DRESS":
      return { kind: "VOID", reason: "DID_NOT_DRESS: prop markets void a DNP" };
    case "AMBIGUOUS_IDENTITY":
      return { kind: "EXCLUDED", reason: `AMBIGUOUS_IDENTITY: ${participation.candidates?.length ?? "several"} same-surname candidates — never a guess` };
    case "SOURCE_MISSING":
      return { kind: "EXCLUDED", reason: "SOURCE_MISSING: no snap sheet for this team-game — absence of the sheet is not evidence" };
    default:
      throw new Error(`unknown participation state ${participation.state}`);
  }
}

/** Fresh accounting object — every evaluation reconciles its whole population through one of these. */
export function newPopulationAccounting() {
  return { contractVersion: POPULATION_CONTRACT_VERSION, scoredWithRow: 0, scoredPlayedNoRow: 0, voidDidNotDress: 0, excludedAmbiguous: 0, excludedSourceMissing: 0 };
}

/** Legacy shim for the builder's join-rate validation: total snaps or null. */
export function participationLookup(part, game, teamAbbr, playerName) {
  const c = classifyParticipation({ part, game, teamAbbr, playerName });
  if (c.snaps == null) return null;
  return c.snaps.off + c.snaps.def + c.snaps.st;
}
