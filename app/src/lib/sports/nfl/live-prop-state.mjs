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

/**
 * A provider cell as a number, or null when it is not a measurement.
 *
 * ⚠ AN EMPTY CELL IS NOT A ZERO, AND `Number("")` IS 0. That coercion is the trap: a blank or
 * whitespace-only cell would arrive as a measured zero, which is a stat we were never told. A player
 * who genuinely recorded nothing and a player the provider has no figure for must stay
 * distinguishable all the way to settlement — one settles UNDER, the other is NO_MEASUREMENT and is
 * never graded at all. "--" and "-" already failed to parse; "" did not.
 *
 * A REAL zero still passes through as 0, because a measured zero IS a result.
 */
const num = (v) => {
  if (v == null) return null;
  const raw = String(v).trim();
  if (raw === "") return null;
  const n = Number(raw.replace(/,/g, ""));
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
 * double-count and still catches either.
 *
 * ⚠ AND THIS IS A V1 HEURISTIC OVER AGGREGATES, NOT AN EXACT COUNT. It is stated plainly because
 * the number reaches a reader. Taking the larger UNDER-counts the player who records a pick-six AND
 * a separate fumble-return touchdown in the same game — real, rare, and wrong in the safer
 * direction, since showing "2" for one touchdown is the likelier error and the more damaging.
 *
 *   THE STRONGER IMPLEMENTATION IS EVENT-LEVEL, NOT AGGREGATE. ESPN's summary carries
 *   `scoringPlays`, each with its own scorer and play type. Counting distinct scoring PLAYS
 *   attributed to an athlete is exact by construction: it cannot double-count one play reported in
 *   two stat blocks, and it cannot merge two genuinely separate ones. That is the correct future
 *   implementation and it is recorded here as owed work rather than left implied by silence.
 *
 *   V1 uses the aggregate because the yes/no market — which is what is actually settled — is
 *   identical under both readings: `finalStat > 0` is unaffected by the de-duplication choice. Only
 *   the DISPLAYED count can differ, and only in the rare double-defensive-score case.
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
 * SETTLEMENT STATES. Every one is a claim a reader can act on, and the absences are typed apart.
 *
 *   PENDING           the game is not final. Never a result, and never a field that reads like one.
 *   SETTLED           a measurement exists and was graded against the frozen line.
 *   NO_MEASUREMENT    the game is final and the provider reports no stat row for this player.
 *
 * ⚠ NO_MEASUREMENT IS NOT AN UNDER, AND IT IS NOT AN ANYTIME-TOUCHDOWN LOSS. A player who never
 * appears in a stat block may have been inactive, may have dressed and not recorded one, or may be
 * missing from a feed that has not finished updating. Those settle differently at different books,
 * and WE DO NOT HOLD THE BOOK'S RULE. Grading it as a loss because zero is less than the line would
 * be inventing a void rule and stating it as fact.
 */
export const SETTLEMENT_STATES = Object.freeze(["PENDING", "SETTLED", "NO_MEASUREMENT"]);

/**
 * Settlement against the FROZEN line — the price we published, never one the book moved to.
 *
 * Returns PENDING unless the provider says the game is FINAL: a settled result on an unfinished
 * game is the single worst thing this module could emit.
 *
 * TWO RESULTS, KEPT APART. `lineResult` is a FACT about the stat and the line (OVER / UNDER / PUSH,
 * or YES / NO for a one-sided market). `forecastResult` is OUR record: did the side our projection
 * implied land? A reader comparing the two is comparing a fact to a claim, which is the point.
 */
export function settle({ summary, espnId, family, frozenLine = null, projection = null, participation = null, settledAt, source = "espn-nfl-summary" }) {
  if (phaseOf(summary) !== "FINAL") {
    return { state: "PENDING", finalStat: null, line: frozenLine ?? null, lineResult: null, forecastResult: null, settledAt: null, source };
  }
  const finalStat = statFor(summary, espnId, family);
  if (finalStat == null) {
    return {
      state: "NO_MEASUREMENT",
      finalStat: null, line: frozenLine ?? null, lineResult: null, forecastResult: null,
      participationAtFreeze: participation ?? null,
      reason: "the provider reports no stat row for this player in this family at FINAL. Whether he was inactive, dressed without recording one, or is missing from a feed still updating is not distinguished here — and which of those a sportsbook voids rather than settles is its rule, not ours.",
      bookRuleUnknown: true,
      settledAt, source,
    };
  }
  if (family === "anytime_td") {
    const yes = finalStat > 0;
    return {
      state: "SETTLED", finalStat, line: null, lineResult: yes ? "YES" : "NO",
      /* A one-sided market has no projected side to grade unless a probability was published. */
      forecastResult: "NOT_APPLICABLE",
      settledAt, source,
    };
  }
  let lineResult = null;
  let forecastResult = null;
  if (typeof frozenLine === "number" && Number.isFinite(frozenLine)) {
    lineResult = finalStat > frozenLine ? "OVER" : finalStat < frozenLine ? "UNDER" : "PUSH";
    if (typeof projection === "number" && Number.isFinite(projection)) {
      const impliedSide = projection > frozenLine ? "OVER" : projection < frozenLine ? "UNDER" : null;
      forecastResult = impliedSide === null ? "PUSH"
        : lineResult === "PUSH" ? "PUSH"
          : impliedSide === lineResult ? "WIN" : "LOSS";
    }
  }
  return { state: "SETTLED", finalStat, line: frozenLine ?? null, lineResult, forecastResult, settledAt, source };
}

/**
 * One live row from a frozen block the caller already holds. Thin; `buildLiveRows` is the owner of
 * the sealing, provenance and reconciliation rules.
 */
export function liveRow({ frozen, summary, espnId, family, observedAt }) {
  const factual = liveFactual({ summary, espnId, family, observedAt });
  const settlement = settle({
    summary, espnId, family,
    frozenLine: frozen?.market?.line ?? null,
    projection: frozen?.projection?.median ?? null,
    participation: frozen?.participation ?? null,
    settledAt: observedAt,
  });
  return { frozen, live: { factual, settlement } };
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
export function buildLiveRows({ providerEventId, kickoffUtc, board, summary, prior = null, observedAt, hashOf, reconciliationWindowMs = RECONCILIATION_WINDOW_MS }) {
  const priorById = new Map((prior?.rows ?? []).map((r) => [r.predictionId, r]));
  const identityOf = hashOf ?? ((o) => JSON.stringify(o));
  const kickoffMs = Date.parse(String(kickoffUtc ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
  const rows = [];
  let frozenRefusedNewerBoard = 0;
  let frozenRefusedNoPregameSnapshot = 0;
  let reconciled = 0;
  let recoveredFromNoMeasurement = 0;

  /* The first instant we saw this game FINAL. It anchors the reconciliation window, so it is
     recorded once and carried, never recomputed from the current clock on every read. */
  const isFinal = phaseOf(summary) === "FINAL";
  const finalFirstObservedAt = prior?.finalFirstObservedAt ?? (isFinal ? observedAt : null);
  const finality = isFinal ? finalityAt({ finalFirstObservedAt, nowIso: observedAt, windowMs: reconciliationWindowMs }) : null;

  /*
   * ⚠ A FROZEN BLOCK MAY ONLY BE MINTED FROM EVIDENCE CAPTURED BEFORE KICKOFF.
   *
   * This producer only runs once a game has STARTED, so the first write always happens after
   * kickoff — which means without this check it would happily freeze whatever the board says at
   * that moment, including a board the event window regenerated mid-game and a price the odds
   * capture bought after the first snap. That is a post-kickoff line presented as the pre-kickoff
   * one: the exact dishonesty the frozen slot exists to prevent, arriving through the front door.
   *
   * So a snapshot must PROVE it predates kickoff. Anything else fails closed to no frozen block —
   * the live state still renders, and the row says plainly that it has nothing to compare against.
   */
  const pregameProvenance = (fresh) => {
    if (!Number.isFinite(kickoffMs)) return { ok: false, reason: "no parseable kickoff for this event — a pregame claim cannot be checked, so none is made" };
    const boardMs = Date.parse(fresh.forecastGeneratedAt ?? "");
    if (!Number.isFinite(boardMs)) return { ok: false, reason: "the board carries no generation stamp, so it cannot show it predates kickoff" };
    if (boardMs >= kickoffMs) return { ok: false, reason: `the board was generated at ${fresh.forecastGeneratedAt}, at or after kickoff ${kickoffUtc} — freezing it would publish a post-kickoff forecast as a pregame one` };
    const capturedAt = fresh.market?.capturedAt ?? null;
    if (capturedAt) {
      const marketMs = Date.parse(capturedAt);
      if (!Number.isFinite(marketMs)) return { ok: false, reason: "the market price carries no usable capture instant" };
      if (marketMs >= kickoffMs) return { ok: false, reason: `the price was captured at ${capturedAt}, at or after kickoff ${kickoffUtc} — it is not the line a reader was shown` };
    }
    return { ok: true };
  };

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

      let frozen = previous?.frozen ?? null;
      let frozenIdentity = previous?.frozenIdentity ?? null;
      let frozenRefusal = previous?.frozenRefusal ?? null;
      if (!frozen && !previous) {
        const prov = pregameProvenance(fresh);
        if (prov.ok) { frozen = fresh; frozenIdentity = identityOf(fresh); }
        else { frozenRefusal = prov.reason; frozenRefusedNoPregameSnapshot += 1; }
      } else if (previous?.frozen && identityOf(fresh) !== previous.frozenIdentity) {
        frozenRefusedNewerBoard += 1;
      }

      const live = liveFactual({ summary, espnId: id, family, observedAt });
      const prevS = previous?.settlement ?? null;
      const attempt = () => settle({ summary, espnId: id, family, frozenLine: frozen?.market?.line ?? null, projection: frozen?.projection?.median ?? null, participation: frozen?.participation ?? null, settledAt: observedAt });

      let settlement;
      if (prevS?.state === "SETTLED") {
        /* Idempotent: the published result and its instant never change. Only the window closing is
           allowed to advance, because that is a statement about the window and not about the grade. */
        settlement = { ...prevS, finality: finality ?? prevS.finality ?? "PROVISIONAL" };
      } else if (prevS?.state === "NO_MEASUREMENT" && prevS.finality === "CANONICAL") {
        settlement = prevS;                                   // terminal: the window already closed on it
      } else {
        /*
         * ⚠ A PROVISIONAL NO_MEASUREMENT IS RE-ATTEMPTED. This is the whole point of the window: a
         * stat block that had not published when the game first read FINAL gets another look, and a
         * player who was merely late is graded rather than left permanently ungraded on the strength
         * of one response.
         */
        settlement = attempt();
        if (isFinal) settlement.finality = finality;
        /* A re-observed absence keeps the instant we FIRST saw it. Restamping on every read would
           make "when did this become unmeasured" drift forward until the window closed. */
        if (prevS?.state === "NO_MEASUREMENT" && settlement.state === "NO_MEASUREMENT") {
          settlement.settledAt = prevS.settledAt;
          settlement.reObservedAt = observedAt;
        }
        if (prevS?.state === "NO_MEASUREMENT" && settlement.state === "SETTLED") {
          settlement.recoveredFrom = { state: "NO_MEASUREMENT", firstObservedAt: prevS.settledAt, note: "the provider reported no stat for this player when the game first read FINAL, and reported one on a later read inside the reconciliation window" };
          recoveredFromNoMeasurement += 1;
        }
      }

      /*
       * ⚠ IDEMPOTENT, BUT NOT SEALED AGAINST A CORRECTION. Providers do revise a box score. The
       * original settlement is the record of what we published and never changes; a later FINAL
       * observation that DISAGREES is recorded beside it, with its own instant, so the initial
       * result and the reconciled truth stay distinguishable. Overwriting would lose the first;
       * refusing to look would make a real correction invisible.
       */
      let reconciliation = previous?.reconciliation ?? null;
      if (settlement.state === "SETTLED" && phaseOf(summary) === "FINAL") {
        const latest = statFor(summary, id, family);
        if (latest != null && settlement.finalStat != null && latest !== settlement.finalStat) {
          reconciliation = { finalStat: latest, differsFrom: settlement.finalStat, observedAt, source: "espn-nfl-summary", note: "the provider now reports a different final stat; the settlement above is what was published and is unchanged" };
          if (!previous?.reconciliation) reconciled += 1;
        }
      }

      rows.push({
        predictionId, playerId: p.playerId, espnId: id, name: p.name, team: p.team, family,
        /*
         * ⚠ THE FAMILY'S PUBLICATION STATE TRAVELS WITH THE ROW.
         *
         * This producer tracks every family the board carries, including ones that are ESTIMATE
         * rather than PUBLISHED — `player_pass_yds` is ESTIMATE because P318 is STOP. Tracking one
         * internally is research; PUBLISHING its record is a claim about a model that failed its own
         * preregistered bar. Carrying the state here means the publication boundary downstream can
         * read it off the record instead of re-deriving it from a board it may no longer have, and
         * a row whose state is unknown fails closed rather than being assumed publishable.
         */
        familyState: board?.families?.[family]?.state ?? null,
        frozenIdentity, frozen, frozenRefusal,
        live, settlement, reconciliation,
      });
    }
  }
  return { rows, finalFirstObservedAt, finality, frozenRefusedNewerBoard, frozenRefusedNoPregameSnapshot, reconciled, recoveredFromNoMeasurement };
}

/**
 * ⚠ A GAME GOING FINAL IS NOT THE SAME INSTANT AS ITS STAT BLOCKS BEING COMPLETE.
 *
 * ESPN can report a game FINAL before every player block has landed, and it revises box scores
 * afterwards. My first rule said "FINAL and every row SETTLED-or-NO_MEASUREMENT → stop forever",
 * which quietly made a merely-DELAYED player permanently ungraded: the absence became terminal on
 * the strength of one response, and the reconciliation path could never fire because no further
 * observation was ever taken.
 *
 * So the lifecycle has a bounded tail:
 *
 *   LIVE → FINAL_PROVISIONAL → (reconciliation window) → FINAL_CANONICAL → stop
 *
 * An observed measurement still settles IMMEDIATELY — nothing waits. What the window buys is the
 * chance to see a late stat, a late correction, or a block that simply had not published yet. It
 * closes on the clock, so termination is deterministic and a completed game cannot linger.
 */
export const RECONCILIATION_WINDOW_MS = 3 * 3600_000;

/** PROVISIONAL while the post-final window is open; CANONICAL once it has closed. */
export function finalityAt({ finalFirstObservedAt, nowIso, windowMs = RECONCILIATION_WINDOW_MS }) {
  const first = Date.parse(finalFirstObservedAt ?? "");
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(first) || !Number.isFinite(now)) return "PROVISIONAL";
  return now - first >= windowMs ? "CANONICAL" : "PROVISIONAL";
}

/**
 * Should this event still be polled?
 *
 * ⚠ "FULLY SETTLED" IS NOT ENOUGH ON ITS OWN, and neither is NO_MEASUREMENT. A game stops being
 * polled when its reconciliation window has CLOSED — not when the first FINAL response happens to
 * look complete. That is what gives a late stat somewhere to arrive.
 */
export function shouldPollEvent(prior, nowIso, windowMs = RECONCILIATION_WINDOW_MS) {
  if (!prior) return { poll: true, reason: "never observed" };
  if (prior.phase !== "FINAL") return { poll: true, reason: "not final yet" };
  if (!prior.finalFirstObservedAt) return { poll: true, reason: "final, but no first-final instant recorded — this read establishes it" };
  const finality = finalityAt({ finalFirstObservedAt: prior.finalFirstObservedAt, nowIso, windowMs });
  if (finality === "PROVISIONAL") {
    const pending = (prior.rows ?? []).filter((r) => r.settlement?.state === "NO_MEASUREMENT").length;
    return { poll: true, reason: pending ? `reconciliation window open; ${pending} prediction(s) have no measurement yet` : "reconciliation window open — a late correction can still arrive" };
  }
  return { poll: false, reason: "reconciliation window closed — every prediction is canonical" };
}

/** The live window: a game is trackable from kickoff until 8 hours later. */
export const LIVE_WINDOW_MS = 8 * 3600_000;

/** `2026-09-27T17:00Z` and `2026-09-27T17:00:00Z` are one instant; boards write the short form. */
export function kickoffMs(iso) {
  return Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
}

/**
 * Which games are in their live window right now — chosen from the COMMITTED BOARDS.
 *
 * ── WHY NOT FROM THE SCHEDULE ────────────────────────────────────────────────────────────────────
 *
 * `nfl/schedule/latest.json` holds only FUTURE kickoffs. `capture-nfl-schedule.mjs` builds it through
 * `mergeWindowEvents(responses, d0, d1)` with `d0 = new Date(NOW)` — the capture INSTANT, not its
 * date — and `inWindow` keeps `t >= d0`, so a game that has kicked off is dropped the next time the
 * schedule is captured. The producer needs the opposite: `kickoff <= now`. The two filters are
 * mutually exclusive, and the lane found anything at all only while the schedule happened to be stale
 * relative to kickoff. Since scheduled delivery in this repository runs 1h40m to 4h55m late, a
 * schedule capture landing after the first Sunday kickoff would empty the target set for the rest of
 * the slate and a game already under way would never settle — while the log said "nothing to track".
 *
 * The boards persist after kickoff, carry their own `providerEventId` and `kickoffUtc`, and are the
 * artifact this producer already needs for the frozen lines. Identity still comes from a committed
 * canonical artifact, which is what the original refusal protected.
 *
 * The schedule remains a CROSS-CHECK: where it still carries a board's event the two must agree on
 * the kickoff instant, because one of them being wrong is how live state is attached to the wrong
 * fixture. Where it has simply moved past the game, that says nothing and is not an error.
 *
 * @returns {{targets: Array, disagreements: string[]}} — a non-empty `disagreements` must REFUSE.
 */
export function selectLiveTargets({ boards = [], scheduleRows = [], nowMs, windowMs = LIVE_WINDOW_MS, only = null } = {}) {
  const scheduled = new Map();
  for (const r of scheduleRows) {
    const id = r?.providerEventId == null ? null : String(r.providerEventId);
    const k = kickoffMs(r?.dateUtc);
    if (id && Number.isFinite(k)) scheduled.set(id, k);
  }

  const usable = [];
  const disagreements = [];
  for (const b of boards) {
    const id = b?.providerEventId == null ? null : String(b.providerEventId);
    const k = kickoffMs(b?.kickoffUtc);
    if (!id || !Number.isFinite(k)) continue;
    if (scheduled.has(id) && scheduled.get(id) !== k) {
      disagreements.push(`${id}: board ${b.kickoffUtc} vs schedule ${new Date(scheduled.get(id)).toISOString()}`);
      continue;
    }
    usable.push({ providerEventId: id, kickoffMs: k, dateUtc: b.kickoffUtc, shortName: b?.matchup ?? id });
  }

  /*
   * ⚠ ONLY GAMES THAT HAVE STARTED. A pre-kickoff read carries no stat and no score by design, so
   * fetching one buys nothing, and polling a fixture days out would be a request loop with no answer
   * in it. The 8-hour close is also what bounds this to one slate rather than to every board ever
   * committed — 33 of the 49 boards on disk are for games that have already been played.
   */
  const targets = usable
    .filter((t) => (only ? t.providerEventId === only : true))
    .filter((t) => t.kickoffMs <= nowMs && nowMs - t.kickoffMs <= windowMs)
    .sort((a, b) => a.providerEventId.localeCompare(b.providerEventId));   // deterministic across runs

  return { targets, disagreements };
}
