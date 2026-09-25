/**
 * LIVE PLAYER-PROP STATE (Phase 5 · Release A) — the stat so far, and nothing about the finish.
 *
 * THREE OBJECTS, KEPT APART, AND ONLY ONE OF THEM MOVES:
 *
 *   the frozen pregame forecast   ours, immutable once published
 *   the frozen pregame market     the book's price AT CAPTURE, immutable
 *   the live event state          the provider's, ephemeral, replaced on every read
 *
 * This module only ever produces the third. It takes the frozen row as an INPUT and returns it
 * untouched beside the observation, so no code path exists that could rewrite a published forecast
 * or a captured price with a later one.
 *
 * ⚠ NO "ON TRACK", NO PROJECTED FINISH, NO LIVE PROBABILITY. None is validated, and a number that
 * looks like a forecast is read as one however it is labelled. "279 projected · 264.5 line · 163
 * so far · 3Q 8:42" is four facts a reader can compare; "82% on track" is a model we have not built.
 *
 * ── THE PROVIDER, AND WHY NO NEW ONE IS NEEDED ──────────────────────────────────────────────────
 *
 * ESPN's free NFL summary endpoint carries all five authorized families with canonical athlete ids:
 *
 *   passing    C/ATT, YDS, AVG, TD, INT, SACKS, QBR, RTG
 *   rushing    CAR, YDS, AVG, TD, LONG
 *   receiving  REC, YDS, AVG, TD, LONG, TGTS
 *
 * Measured on event 401872932 (DET @ BUF): Jared Goff 3046779 → 327 pass yds, 4 TD; Amon-Ra
 * St. Brown 4374302 → 9 rec, 142 yds, 2 TD. Those ids are ESPN's, which is the SAME id space as
 * `nfl-athlete-<espnId>` in our registry — so the live join is by durable id and never by name.
 * That matters more than it sounds: the identity defect that published "Not offered" for eight
 * priced players cannot occur on this path, because no name is ever compared.
 *
 * ⚠ AN ANYTIME TOUCHDOWN IS SCORED, NEVER THROWN. The passing block's TD column counts touchdown
 * PASSES; a quarterback's anytime-scorer result is his rushing plus receiving touchdowns and
 * nothing else. Reading the wrong column would settle every starting quarterback as a scorer.
 */

/** Board family → how to read it out of an ESPN boxscore block. */
const FAMILY_READS = Object.freeze({
  player_pass_yds: { block: "passing", label: "YDS" },
  player_rush_yds: { block: "rushing", label: "YDS" },
  player_reception_yds: { block: "receiving", label: "YDS" },
  player_receptions: { block: "receiving", label: "REC" },
  // anytime_td is a SUM across two blocks and is handled separately — see touchdownsScored.
});

export const LIVE_FAMILIES = Object.freeze([...Object.keys(FAMILY_READS), "anytime_td"]);

const num = (v) => {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Every athlete stat row in one block, as { espnId: { LABEL: value } }. */
function blockIndex(summary, blockName) {
  const out = new Map();
  for (const teamGroup of summary?.boxscore?.players ?? []) {
    for (const stat of teamGroup?.statistics ?? []) {
      if (stat?.name !== blockName) continue;
      const labels = stat?.labels ?? [];
      for (const a of stat?.athletes ?? []) {
        const id = a?.athlete?.id != null ? String(a.athlete.id) : null;
        if (!id) continue;
        const row = out.get(id) ?? {};
        labels.forEach((l, i) => { row[l] = a?.stats?.[i] ?? null; });
        out.set(id, row);
      }
    }
  }
  return out;
}

/**
 * Touchdowns SCORED by a player, across every block in which a touchdown can be scored.
 *
 * ⚠ NEVER THE PASSING BLOCK. Its TD column counts touchdown PASSES. Reading it would settle every
 * starting quarterback in the league as a scorer.
 *
 * ⚠ AND NEVER POSITION-SPECIFIC ASSUMPTIONS EITHER. A running back's touchdown is not always a
 * rushing touchdown — replayed on DET @ BUF, Jahmyr Gibbs rushed for none and CAUGHT one, so a
 * rushing-only reading would have settled his market as a loss on a game he scored in. Wide
 * receivers take handoffs, linemen catch tackle-eligible passes, and returners and defenders score
 * without touching either block.
 *
 * ⚠ interceptions AND defensive OVERLAP, SO THEY ARE NOT SUMMED. A pick-six is a defensive
 * touchdown AND an interception-return touchdown, and ESPN reports it in both blocks — adding them
 * would display 2 for a player who scored once. The larger of the two is taken, which cannot
 * double-count and still catches either. The cost is under-counting the vanishingly rare player who
 * records a pick-six and a separate fumble-return touchdown in one game; showing "2" for one
 * touchdown is the likelier error and the worse one.
 *
 * Returns null when the player appears in NO scoring block — absent is not zero.
 */
const SCORING_BLOCKS = Object.freeze(["rushing", "receiving", "kickReturns", "puntReturns"]);
const OVERLAPPING_DEFENSIVE_BLOCKS = Object.freeze(["defensive", "interceptions"]);

export function touchdownsScored(summary, espnId) {
  const id = String(espnId);
  let seen = false;
  let total = 0;
  for (const block of SCORING_BLOCKS) {
    const row = blockIndex(summary, block).get(id);
    if (!row) continue;
    seen = true;
    total += num(row.TD) ?? 0;
  }
  let defensive = 0;
  for (const block of OVERLAPPING_DEFENSIVE_BLOCKS) {
    const row = blockIndex(summary, block).get(id);
    if (!row) continue;
    seen = true;
    defensive = Math.max(defensive, num(row.TD) ?? 0);
  }
  return seen ? total + defensive : null;
}

/** The raw stat for one family, or null when this player has no row in that block. */
export function statFor(summary, espnId, family) {
  if (family === "anytime_td") return touchdownsScored(summary, espnId);
  const read = FAMILY_READS[family];
  if (!read) return null;
  const row = blockIndex(summary, read.block).get(String(espnId));
  if (!row) return null;
  return num(row[read.label]);
}

/** PRE / IN_PROGRESS / FINAL from the provider's own status, never from a clock comparison. */
export function phaseOf(summary) {
  const st = summary?.header?.competitions?.[0]?.status ?? summary?.status ?? null;
  const state = st?.type?.state ?? null;
  if (state === "post" || st?.type?.completed === true) return "FINAL";
  if (state === "in") return "IN_PROGRESS";
  return "PRE";
}

function scoreOf(summary) {
  const comps = summary?.header?.competitions?.[0]?.competitors ?? [];
  let home = null, away = null;
  for (const c of comps) {
    const v = num(c?.score);
    if (c?.homeAway === "home") home = v;
    if (c?.homeAway === "away") away = v;
  }
  return home == null || away == null ? null : { home, away };
}

/** The provider's own word on this player's availability during the game, or null. */
export function participationOf(summary, espnId) {
  for (const group of summary?.injuries ?? []) {
    for (const i of group?.injuries ?? []) {
      if (String(i?.athlete?.id ?? "") === String(espnId)) return i?.status ?? null;
    }
  }
  return null;
}

/**
 * The factual live slot for one (player, family).
 *
 * ⚠ A PRE-GAME READ CARRIES NO STAT AND NO SCORE. Zero is a measurement nobody took, and publishing
 * it would make every unstarted game read as a player who has done nothing — the same defect as
 * StatsAPI zeroing an MLB score at "Pre-Game".
 */
export function liveFactual({ summary, espnId, family, observedAt, source = "espn-nfl-summary" }) {
  const phase = phaseOf(summary);
  if (phase === "PRE") {
    return { phase, statValue: null, clock: null, period: null, score: null, participation: participationOf(summary, espnId), observedAt, source };
  }
  const st = summary?.header?.competitions?.[0]?.status ?? null;
  return {
    phase,
    statValue: statFor(summary, espnId, family),
    clock: phase === "IN_PROGRESS" ? st?.displayClock ?? null : null,
    period: phase === "IN_PROGRESS" ? num(st?.period) : null,
    score: scoreOf(summary),
    participation: participationOf(summary, espnId),
    observedAt,
    source,
  };
}

/**
 * Settlement against the FROZEN line — the price we published, never one the book moved to.
 *
 * Returns null unless the provider says the game is FINAL: a settled result on an unfinished game
 * is the single worst thing this module could emit.
 */
export function settle({ summary, espnId, family, frozenLine = null, settledAt, source = "espn-nfl-summary" }) {
  if (phaseOf(summary) !== "FINAL") return null;
  const finalStat = statFor(summary, espnId, family);
  if (finalStat == null) return null;                 // no row is not a zero
  if (family === "anytime_td") {
    return { finalStat, line: null, lineResult: null, yesResult: finalStat > 0, settledAt, source };
  }
  let lineResult = null;
  if (typeof frozenLine === "number" && Number.isFinite(frozenLine)) {
    lineResult = finalStat > frozenLine ? "OVER" : finalStat < frozenLine ? "UNDER" : "PUSH";
  }
  return { finalStat, line: frozenLine ?? null, lineResult, yesResult: null, settledAt, source };
}

/**
 * The whole live row: the frozen truths passed straight through, plus the observation.
 *
 * `frozen` is returned by reference and never copied-with-changes, so there is no code path here
 * that can rewrite a published forecast or a captured price.
 */
export function liveRow({ frozen, summary, espnId, family, observedAt }) {
  const factual = liveFactual({ summary, espnId, family, observedAt });
  const settlement = settle({ summary, espnId, family, frozenLine: frozen?.market?.line ?? null, settledAt: observedAt });
  return { frozen, live: settlement ? { factual, settlement } : { factual } };
}

/** The ESPN athlete id inside a durable board id, or null. Never a name, never a bare number. */
export function espnAthleteId(playerId) {
  const m = /^nfl-athlete-(\d+)$/.exec(String(playerId ?? ""));
  return m ? m[1] : null;
}

/**
 * Build every live row for one game: the frozen block, the observation and the settlement.
 *
 * ⚠ THE FROZEN BLOCK IS SEALED BY THE FIRST WRITE. `prior` is the artifact already published for
 * this game. A prediction that appears there keeps its frozen block byte for byte — because the
 * board is regenerated by the event window and the odds capture keeps buying prices, so re-reading
 * the board mid-game would silently replace the line a reader was shown with one captured after
 * kickoff. `frozenIdentity` is written once and compared on every later run; a newer board value is
 * REFUSED and counted, never absorbed.
 *
 * ⚠ SETTLEMENT IS IDEMPOTENT for the same reason: a settled prediction keeps its original result and
 * its original settledAt, so re-reading a finished box score cannot restamp or re-grade it.
 *
 * Pure: the caller supplies the board, the provider payload, the previous artifact and the clock.
 */
export function buildLiveRows({ providerEventId, board, summary, prior = null, observedAt, hashOf }) {
  const priorById = new Map((prior?.rows ?? []).map((r) => [r.predictionId, r]));
  const identityOf = hashOf ?? ((o) => JSON.stringify(o));
  const rows = [];
  let frozenRefusedNewerBoard = 0;

  for (const p of board?.players ?? []) {
    const id = espnAthleteId(p.playerId);
    if (!id) continue;
    for (const family of LIVE_FAMILIES) {
      const slot = p.markets?.[family];
      if (!slot) continue;
      const predictionId = `${providerEventId}:${p.playerId}:${family}`;
      const fresh = {
        projection: { median: slot.median ?? null, p10: slot.p10 ?? null, p90: slot.p90 ?? null },
        market: slot.market ?? null,
        pricingState: slot.pricingState ?? null,
        participation: p.participation ?? null,
        forecastGeneratedAt: board.generatedAt ?? null,
      };
      const previous = priorById.get(predictionId);
      const frozen = previous?.frozen ?? fresh;
      const frozenIdentity = previous?.frozenIdentity ?? identityOf(fresh);
      if (previous && identityOf(fresh) !== frozenIdentity) frozenRefusedNewerBoard += 1;

      rows.push({
        predictionId, playerId: p.playerId, espnId: id, name: p.name, team: p.team, family, frozenIdentity, frozen,
        live: liveFactual({ summary, espnId: id, family, observedAt }),
        settlement: previous?.settlement ?? settle({ summary, espnId: id, family, frozenLine: frozen.market?.line ?? null, settledAt: observedAt }),
      });
    }
  }
  return { rows, frozenRefusedNewerBoard };
}
