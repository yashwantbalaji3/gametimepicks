/**
 * SIMULATION THEATER · NFL PLAYER BOX SCORE OF ONE RUN (`nfl-run-player-box@1`). Pure, deterministic, fail closed.
 *
 * `nflRunBoxScore(run)` folds ONE simulated run's own event record — the drive path (`nfl-drive-run@1` drives) and the
 * engine's per-play log (`nfl-play-log@1`, sim-v2/engine.mjs `simulateGame({ plays })`) — into both teams' player box
 * scores. Nothing is sampled, estimated or read from another run, another engine or a batch distribution: every number
 * is a count or a sum over this run's plays. Every reconciliation below must hold exactly or it throws
 * RunBoxScoreError; callers show "player box score unavailable for this run", never a partial table.
 *
 * ACCOUNTING RULES (the engine's, stated; ACCOUNTING_RULES below is the same list for the page):
 *   passing   An attempt is a PASS play (complete, incomplete or intercepted). Passing yards are GROSS: the sum of the
 *             passer's completions' yards. Team net passing = gross − sack yards. A pass TD is credited to the passer
 *             and to the receiver (receiving TD); an interception to the passer.
 *   sacks     A sack is not a pass attempt and its yards go to no player: the engine draws no passer on a sack, so
 *             sacks and sack yards are TEAM numbers only (shown as "Sacked" on the team line, never on a QB's line).
 *   scrambles A scramble is a carry credited to the scrambling QB (the team's main passer, the engine's QB1 rule) or to
 *             OTHER when no passer is named; its yards are rushing yards.
 *   rushing   Every RUSH and SCRAMBLE play is a carry; kneel-downs are plays, never carries, and carry no yards.
 *   receiving A target is credited on every attempt (incl. an interception); a reception on every completion.
 *   yards     Each gaining play's yards are its share of the drive's recorded net yards (the engine's integer split), so
 *             Σ gaining-play yards − sack yards = the drive's net yards, except on a drive with no gaining play, whose
 *             residual the engine records nowhere (penalty-like yardage): it is not credited to any player or team line.
 *   turnovers An interception is the passer's; a lost fumble is the ball carrier's on the drive's giveaway play.
 *   laterals  Not modelled by the engine: every play has one ball carrier / one receiver.
 *   2-pt      Two-point tries are TEAM numbers: the engine draws no passer, rusher or receiver for a try, so a converted
 *             try adds 2 points and no player stat; it is not a touchdown.
 *   def / ST  A defensive (interception or fumble return) touchdown is credited to the defending TEAM as "Defense /
 *             special teams TD": the engine names no returner. Kick and punt return TDs are not modelled.
 *   kicking   Field goals and extra points are TEAM numbers (the kicker is not a player in this engine).
 *   anytime TD  Players with ≥ 1 rushing or receiving TD in this run (passing TDs do not count), plus the team
 *             "Defense / special teams" line when the defense scored.
 *   OTHER     Opportunities the role shares do not assign to a named player land on the explicit "Other / unallocated"
 *             line, never on a named player. A player who has no event in this run gets no line (a backup QB appears
 *             only when the run actually gave him a play); a player the availability owner blocks has no slot at all.
 *
 * RECONCILIATIONS (all exact): per team, Σ player completions = Σ receptions = team completions; Σ passer yards =
 * Σ receiving yards = gross passing yards; Σ player carries / rushing yards / rushing TDs = team; Σ passer TDs =
 * Σ receiving TDs = pass TDs; TD plays = the drive path's TD drives; FGs made = FG drives; defensive TDs = the other
 * side's OPP_TD drives; safeties = the other side's SAFETY drives; tries = TD drives + defensive TDs; points =
 * 6·TD + XP + 2·(2-pt) + 3·FG + 2·safety = the run's final score = the drive path's last score; turnovers = INT + fumbles
 * lost = TURNOVER + OPP_TD drives; when the engine's own accumulators are supplied (`run.engine`), every team and player
 * number equals them too.
 */

export const RUN_BOX_VERSION = "nfl-run-player-box@1";
export const RUN_BOX_TITLE = "Box score · Simulated scenario (hypothetical)";
export const RUN_BOX_UNAVAILABLE = "Player box score unavailable for this run";
export const OTHER_NAME = "Other / unallocated";
export const DEF_ST_NAME = "Defense / special teams";

export const ACCOUNTING_RULES = Object.freeze([
  "Passing yards are gross (completions only); team net passing = gross − sack yards.",
  "Sacks are team numbers: the engine names no passer on a sack, so no quarterback line carries them.",
  "A scramble is a carry for the team's main passer (or Other when none is named); its yards are rushing yards.",
  "Kneel-downs are plays, not carries.",
  "Two-point tries, field goals and extra points are team numbers: the engine names no player for them.",
  "A defensive touchdown is credited to the team's defense / special teams; the engine names no returner. Return touchdowns on kicks and laterals are not modelled.",
  "A lost fumble is the ball carrier's on the giveaway play; an interception is the passer's.",
  "Other / unallocated holds opportunities no named player is assigned; a player with no play in this run has no line.",
]);

const SIDES = Object.freeze(["away", "home"]);
const SIDE_INDEX = Object.freeze({ home: 0, away: 1 });
const PLAY_KINDS = new Set(["PASS", "SACK", "SCRAMBLE", "RUSH", "KNEEL", "TRY", "FG"]);
/** Player stat columns, in display order (also the compact pack's order). */
export const PLAYER_FIELDS = Object.freeze(["passAtt", "cmp", "passYds", "passTd", "int", "rushAtt", "rushYds", "rushTd", "fumLost", "targets", "rec", "recYds", "recTd"]);
/** Team line fields, in display order (also the compact pack's order). */
export const TEAM_FIELDS = Object.freeze([
  "points", "passAtt", "cmp", "passYds", "sacks", "sackYds", "netPassYds", "rushAtt", "rushYds", "scrambles", "kneels", "passTd", "rushTd",
  "int", "fumLost", "turnovers", "fgAtt", "fgMade", "xpAtt", "xpMade", "twoAtt", "twoMade", "defTd", "safeties",
]);
/** Engine TEAM_STAT name for a team line field, where the engine keeps the same number (cross-check). */
const ENGINE_TEAM = Object.freeze({
  points: "pts", passAtt: "passAtt", cmp: "cmp", passYds: "passYds", sacks: "sacks", sackYds: "sackYds", rushAtt: "rushAtt", rushYds: "rushYds",
  scrambles: "scrambles", kneels: "kneels", passTd: "passTd", rushTd: "rushTd", int: "int", fumLost: "fumLost", fgAtt: "fgAtt", fgMade: "fgMade",
  xpAtt: "xpAtt", xpMade: "xpMade", twoAtt: "twoAtt", twoMade: "twoMade", defTd: "defTd", safeties: "safetiesFor",
});
/** Engine PSTAT name for a player field (fumLost has no engine player column: checked against the team total). */
const ENGINE_PLAYER = Object.freeze({ passAtt: "passAtt", cmp: "cmp", passYds: "passYds", passTd: "passTd", int: "int", rushAtt: "rushAtt", rushYds: "rushYds", rushTd: "rushTd", targets: "targets", rec: "rec", recYds: "recYds", recTd: "recTd" });

export class RunBoxScoreError extends Error {
  constructor(code, detail) {
    super(`run box score ${code}: ${detail}`);
    this.name = "RunBoxScoreError";
    this.code = code;
    this.detail = detail;
  }
}
const need = (cond, code, detail) => { if (!cond) throw new RunBoxScoreError(code, detail); };
const isInt = (v) => Number.isInteger(v);

/**
 * @param {object} run
 *   teams   { home: { abbr }, away: { abbr } }
 *   slots   [homeSlots, awaySlots] — each [{ playerId, name, position }] (engine slot order; slot n = OTHER)
 *   drives  the run's drive path (engine events: { offense: 0|1, result, score: [home, away] })
 *   plays   the run's play log (nfl-play-log@1)
 *   final   { home, away, overtime }
 *   runIndex (optional) · engine (optional) { team: [homeStats, awayStats] by TEAM_STAT name,
 *           players: [homeRows, awayRows] by slot then PSTAT name } — the engine's own accumulators, cross-checked
 * @returns {object} plain JSON box score; throws RunBoxScoreError when any reconciliation fails
 */
export function nflRunBoxScore(run) {
  need(run && run.teams?.home?.abbr && run.teams?.away?.abbr, "TEAMS", "teams with abbreviations required");
  need(Array.isArray(run.slots) && run.slots.length === 2 && run.slots.every(Array.isArray), "SLOTS", "slots for both sides required");
  need(Array.isArray(run.drives) && run.drives.length > 0, "DRIVES", "the run's drive path is required");
  need(Array.isArray(run.plays), "PLAYS", "the run's play log is required (the stored run record carries drives only)");
  const fin = run.final;
  need(fin && isInt(fin.home) && isInt(fin.away), "FINAL", "final score required");

  // ── fold the play log ────────────────────────────────────────────────────────────────────────────────────────
  const lines = [0, 1].map((s) => new Map()); // slot → stats
  const team = [0, 1].map(() => Object.fromEntries(TEAM_FIELDS.map((f) => [f, 0])));
  const tdPlays = [0, 0];
  const tries = [0, 0];
  const line = (side, slot) => {
    const n = run.slots[side].length;
    need(isInt(slot) && slot >= 0 && slot <= n, "SLOT", `side ${side}: slot ${slot} outside 0..${n}`);
    let l = lines[side].get(slot);
    if (!l) { l = Object.fromEntries(PLAYER_FIELDS.map((f) => [f, 0])); lines[side].set(slot, l); }
    return l;
  };
  let prevDrive = -1;
  for (const [i, p] of run.plays.entries()) {
    need(p && PLAY_KINDS.has(p.k), "PLAY_KIND", `play ${i}: kind ${p?.k}`);
    need(p.o === 0 || p.o === 1, "PLAY_SIDE", `play ${i}: side ${p.o}`);
    need(isInt(p.d) && p.d >= prevDrive && p.d < run.drives.length, "PLAY_DRIVE", `play ${i}: drive ${p.d} out of order`);
    prevDrive = p.d;
    const dr = run.drives[p.d];
    const T = team[p.o];
    const y = p.y ?? 0;
    need(isInt(y), "YARDS", `play ${i}: yards ${y}`);
    if (p.k !== "TRY") need(p.o === dr.offense, "PLAY_OFFENSE", `play ${i}: side ${p.o} is not drive ${p.d}'s offense`);
    switch (p.k) {
      case "PASS": {
        const pl = line(p.o, p.p);
        const tg = line(p.o, p.t);
        T.passAtt += 1; pl.passAtt += 1; tg.targets += 1;
        if (p.i) { need(!p.c && !p.td && y === 0, "INT", `play ${i}`); T.int += 1; pl.int += 1; break; }
        if (!p.c) { need(!p.td && y === 0, "INCOMPLETE", `play ${i}`); break; }
        T.cmp += 1; pl.cmp += 1; tg.rec += 1;
        T.passYds += y; pl.passYds += y; tg.recYds += y;
        if (p.td) { T.passTd += 1; pl.passTd += 1; tg.recTd += 1; tdPlays[p.o] += 1; }
        break;
      }
      case "SACK": need(y <= 0, "SACK", `play ${i}: sack yards ${y}`); T.sacks += 1; T.sackYds += -y; break;
      case "SCRAMBLE": { const r = line(p.o, p.r); T.rushAtt += 1; T.scrambles += 1; r.rushAtt += 1; T.rushYds += y; r.rushYds += y; break; }
      case "RUSH": {
        const r = line(p.o, p.r);
        T.rushAtt += 1; r.rushAtt += 1; T.rushYds += y; r.rushYds += y;
        if (p.td) { T.rushTd += 1; r.rushTd += 1; tdPlays[p.o] += 1; }
        if (p.f) { T.fumLost += 1; r.fumLost += 1; }
        break;
      }
      case "KNEEL": need(isInt(p.n) && p.n > 0, "KNEEL", `play ${i}`); T.kneels += p.n; break;
      case "TRY": tries[p.o] += 1; if (p.two) { T.twoAtt += 1; if (p.m) T.twoMade += 1; } else { T.xpAtt += 1; if (p.m) T.xpMade += 1; } break;
      case "FG": T.fgAtt += 1; if (p.m) T.fgMade += 1; break;
    }
  }

  // ── reconcile against the drive path ─────────────────────────────────────────────────────────────────────────
  const count = (result, offense) => run.drives.filter((d) => d.result === result && d.offense === offense).length;
  let prev = [0, 0];
  for (const [i, d] of run.drives.entries()) {
    need(d.offense === 0 || d.offense === 1, "DRIVE_SIDE", `drive ${i}`);
    need(Array.isArray(d.score) && d.score[0] >= prev[0] && d.score[1] >= prev[1], "SCORE_CHAIN", `drive ${i}`);
    prev = d.score;
  }
  const last = run.drives[run.drives.length - 1].score;
  need(last[0] === fin.home && last[1] === fin.away, "FINAL_CHAIN", `last drive ${last[1]}–${last[0]} ≠ final ${fin.away}–${fin.home}`);
  for (const s of [0, 1]) {
    const T = team[s];
    const o = 1 - s;
    T.defTd = count("OPP_TD", o);
    T.safeties = count("SAFETY", o);
    T.netPassYds = T.passYds - T.sackYds;
    T.turnovers = T.int + T.fumLost;
    need(tdPlays[s] === count("TD", s), "TD_DRIVES", `side ${s}: ${tdPlays[s]} TD plays ≠ TD drives`);
    need(T.fgAtt === count("FG", s) + count("FG_MISS", s) && T.fgMade === count("FG", s), "FG_DRIVES", `side ${s}`);
    need(tries[s] === tdPlays[s] + T.defTd, "TRIES", `side ${s}: ${tries[s]} tries ≠ TDs ${tdPlays[s] + T.defTd}`);
    need(T.turnovers === count("TURNOVER", s) + count("OPP_TD", s), "TURNOVERS", `side ${s}: ${T.turnovers} ≠ giveaway drives`);
    T.points = 6 * (T.passTd + T.rushTd + T.defTd) + T.xpMade + 2 * T.twoMade + 3 * T.fgMade + 2 * T.safeties;
    need(T.points === (s === 0 ? fin.home : fin.away), "POINTS", `side ${s}: composition ${T.points} ≠ final ${s === 0 ? fin.home : fin.away}`);
    // Σ players = team
    const sum = (f) => [...lines[s].values()].reduce((a, l) => a + l[f], 0);
    need(sum("cmp") === T.cmp && sum("rec") === T.cmp, "CMP", `side ${s}: Σ completions / receptions ≠ team ${T.cmp}`);
    need(sum("passYds") === T.passYds && sum("recYds") === T.passYds, "PASS_YDS", `side ${s}: Σ passer / receiving yards ≠ gross ${T.passYds}`);
    need(sum("passTd") === T.passTd && sum("recTd") === T.passTd, "PASS_TD", `side ${s}`);
    need(sum("passAtt") === T.passAtt && sum("targets") === T.passAtt, "ATT", `side ${s}: Σ attempts / targets ≠ ${T.passAtt}`);
    need(sum("rushAtt") === T.rushAtt && sum("rushYds") === T.rushYds && sum("rushTd") === T.rushTd, "RUSH", `side ${s}`);
    need(sum("int") === T.int && sum("fumLost") === T.fumLost, "TO", `side ${s}`);
  }
  // ── cross-check against the engine's own accumulators (optional; build time and tests) ────────────────────────
  if (run.engine) {
    for (const s of [0, 1]) {
      for (const [f, e] of Object.entries(ENGINE_TEAM)) need(team[s][f] === run.engine.team[s][e], "ENGINE_TEAM", `side ${s} ${f}: ${team[s][f]} ≠ engine ${run.engine.team[s][e]}`);
      const rows = run.engine.players[s];
      for (let slot = 0; slot < rows.length; slot++) {
        const l = lines[s].get(slot);
        for (const [f, e] of Object.entries(ENGINE_PLAYER)) need((l?.[f] ?? 0) === rows[slot][e], "ENGINE_PLAYER", `side ${s} slot ${slot} ${f}: ${l?.[f] ?? 0} ≠ engine ${rows[slot][e]}`);
      }
    }
  }

  // ── shape ────────────────────────────────────────────────────────────────────────────────────────────────────
  const sideBox = (s) => {
    const slots = run.slots[s];
    const meta = (slot) => (slot < slots.length
      ? { id: String(slots[slot].playerId), name: slots[slot].name ?? String(slots[slot].playerId), position: slots[slot].position ?? null }
      : { id: "OTHER", name: OTHER_NAME, position: null });
    const rows = [...lines[s].entries()].map(([slot, l]) => ({ slot, ...meta(slot), ...l }));
    const order = (a, b, ...keys) => { for (const k of keys) if (b[k] !== a[k]) return b[k] - a[k]; return (a.id === "OTHER") - (b.id === "OTHER") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); };
    const pick = (r, fs) => ({ id: r.id, name: r.name, position: r.position, ...Object.fromEntries(fs.map((f) => [f, r[f]])) });
    const T = team[s];
    const td = rows.filter((r) => r.rushTd + r.recTd > 0).map((r) => ({ id: r.id, name: r.name, position: r.position, tds: r.rushTd + r.recTd, rushTd: r.rushTd, recTd: r.recTd }))
      .sort((a, b) => b.tds - a.tds || (a.id === "OTHER") - (b.id === "OTHER") || (a.id < b.id ? -1 : 1));
    if (T.defTd > 0) td.push({ id: "DEF_ST", name: DEF_ST_NAME, position: null, tds: T.defTd, rushTd: 0, recTd: 0 });
    return {
      abbr: run.teams[s === 0 ? "home" : "away"].abbr,
      passing: rows.filter((r) => r.passAtt > 0).sort((a, b) => order(a, b, "passAtt", "passYds")).map((r) => pick(r, ["passAtt", "cmp", "passYds", "passTd", "int"])),
      rushing: rows.filter((r) => r.rushAtt > 0).sort((a, b) => order(a, b, "rushAtt", "rushYds")).map((r) => pick(r, ["rushAtt", "rushYds", "rushTd", "fumLost"])),
      receiving: rows.filter((r) => r.targets > 0).sort((a, b) => order(a, b, "rec", "recYds", "targets")).map((r) => pick(r, ["targets", "rec", "recYds", "recTd"])),
      tdScorers: td,
      turnovers: rows.filter((r) => r.int + r.fumLost > 0).sort((a, b) => order(a, b, "int", "fumLost")).map((r) => pick(r, ["int", "fumLost"])),
      team: { ...T },
    };
  };
  const box = {
    version: RUN_BOX_VERSION,
    title: RUN_BOX_TITLE,
    runIndex: isInt(run.runIndex) ? run.runIndex : null,
    final: { home: fin.home, away: fin.away, overtime: Boolean(fin.overtime) },
    away: sideBox(SIDE_INDEX.away),
    home: sideBox(SIDE_INDEX.home),
  };
  reconcileRunBox(box, run); // the same checks a reader applies to a STORED box (nfl-stored-run-box.mjs)
  return box;
}

/**
 * The reconciliations that hold on a finished box alone, against the run's drive path and final score: what a reader
 * re-checks on a box stored in a receipt (no play log at read time). nflRunBoxScore runs this on every box it returns,
 * so a stored box passes it iff the producer's box did. Throws RunBoxScoreError; returns the box.
 *   chain     drive scores never decrease; the last drive's score = the final = the box's final
 *   per side  defTd = the other side's OPP_TD drives; safeties = the other side's SAFETY drives; pass+rush TDs = TD
 *             drives; FG attempts / makes = FG + FG_MISS / FG drives; tries (XP + 2-pt attempts) = TDs + defensive TDs;
 *             turnovers = INT + fumbles lost = TURNOVER + OPP_TD drives; net passing = gross − sack yards;
 *             points = 6·TD + XP + 2·(2-pt) + 3·FG + 2·safety = the final score
 *   Σ players passing / receiving / rushing / turnover rows sum exactly to the team line; TD scorers = rushing and
 *             receiving TDs (+ one Defense / special teams row carrying defTd when the defense scored)
 */
export function reconcileRunBox(box, run) {
  need(box && box.version === RUN_BOX_VERSION, "BOX_VERSION", `box version ${box?.version}`);
  need(Array.isArray(run?.drives) && run.drives.length > 0, "DRIVES", "the run's drive path is required");
  const fin = run.final;
  need(fin && isInt(fin.home) && isInt(fin.away), "FINAL", "final score required");
  need(box.final?.home === fin.home && box.final?.away === fin.away && box.final?.overtime === Boolean(fin.overtime), "BOX_FINAL", "the box's final is not the run's final");
  let prev = [0, 0];
  for (const [i, d] of run.drives.entries()) {
    need(d && (d.offense === 0 || d.offense === 1), "DRIVE_SIDE", `drive ${i}`);
    need(Array.isArray(d.score) && isInt(d.score[0]) && isInt(d.score[1]) && d.score[0] >= prev[0] && d.score[1] >= prev[1], "SCORE_CHAIN", `drive ${i}`);
    prev = d.score;
  }
  need(prev[0] === fin.home && prev[1] === fin.away, "FINAL_CHAIN", `last drive ${prev[1]}–${prev[0]} ≠ final ${fin.away}–${fin.home}`);
  const count = (result, offense) => run.drives.filter((d) => d.result === result && d.offense === offense).length;
  for (const s of [0, 1]) {
    const side = s === 0 ? "home" : "away";
    const b = box[side];
    need(b && b.team && Object.values(SECTIONS_OF).every((k) => Array.isArray(b[k])), "BOX_SHAPE", `${side}: sections missing`);
    const T = b.team;
    need(TEAM_FIELDS.every((f) => isInt(T[f])), "TEAM_FIELDS", `${side}: team line not integral`);
    const o = 1 - s;
    const tds = T.passTd + T.rushTd;
    need(T.defTd === count("OPP_TD", o), "DEF_TD", `${side}: defTd ${T.defTd} ≠ opponent OPP_TD drives`);
    need(T.safeties === count("SAFETY", o), "SAFETY", `${side}: safeties ≠ opponent SAFETY drives`);
    need(tds === count("TD", s), "TD_DRIVES", `${side}: ${tds} TDs ≠ TD drives`);
    need(T.fgAtt === count("FG", s) + count("FG_MISS", s) && T.fgMade === count("FG", s), "FG_DRIVES", side);
    need(T.xpAtt + T.twoAtt === tds + T.defTd && T.xpMade <= T.xpAtt && T.twoMade <= T.twoAtt, "TRIES", `${side}: tries ≠ TDs ${tds + T.defTd}`);
    need(T.turnovers === T.int + T.fumLost && T.turnovers === count("TURNOVER", s) + count("OPP_TD", s), "TURNOVERS", `${side}: ${T.turnovers} ≠ giveaway drives`);
    need(T.netPassYds === T.passYds - T.sackYds, "NET_PASS", side);
    const pts = 6 * (tds + T.defTd) + T.xpMade + 2 * T.twoMade + 3 * T.fgMade + 2 * T.safeties;
    need(pts === T.points && T.points === fin[side], "POINTS", `${side}: composition ${pts} / line ${T.points} ≠ final ${fin[side]}`);
    const sum = (rows, f) => rows.reduce((a, r) => { need(isInt(r[f]), "ROW_FIELD", `${side}: ${r.id} ${f}`); return a + r[f]; }, 0);
    need(sum(b.passing, "cmp") === T.cmp && sum(b.receiving, "rec") === T.cmp, "CMP", `${side}: Σ completions / receptions ≠ team ${T.cmp}`);
    need(sum(b.passing, "passYds") === T.passYds && sum(b.receiving, "recYds") === T.passYds, "PASS_YDS", `${side}: Σ passer / receiving yards ≠ gross ${T.passYds}`);
    need(sum(b.passing, "passTd") === T.passTd && sum(b.receiving, "recTd") === T.passTd, "PASS_TD", side);
    need(sum(b.passing, "passAtt") === T.passAtt && sum(b.receiving, "targets") === T.passAtt, "ATT", `${side}: Σ attempts / targets ≠ ${T.passAtt}`);
    need(sum(b.rushing, "rushAtt") === T.rushAtt && sum(b.rushing, "rushYds") === T.rushYds && sum(b.rushing, "rushTd") === T.rushTd, "RUSH", side);
    need(sum(b.passing, "int") === T.int && sum(b.rushing, "fumLost") === T.fumLost, "TO", side);
    need(sum(b.turnovers, "int") === T.int && sum(b.turnovers, "fumLost") === T.fumLost, "TO_ROWS", side);
    const players = b.tdScorers.filter((r) => r.id !== "DEF_ST");
    const def = b.tdScorers.filter((r) => r.id === "DEF_ST");
    need(players.every((r) => r.tds === r.rushTd + r.recTd && r.tds > 0), "TD_SCORERS", side);
    need(sum(players, "rushTd") === T.rushTd && sum(players, "recTd") === T.passTd, "TD_SCORERS", `${side}: Σ scorer TDs ≠ team`);
    need(T.defTd > 0 ? def.length === 1 && def[0].tds === T.defTd : def.length === 0, "TD_SCORERS", `${side}: defense / special teams row ≠ defTd`);
  }
  return box;
}
const SECTIONS_OF = Object.freeze(["passing", "rushing", "receiving", "tdScorers", "turnovers"]);

/** Never throws: { ok, box, error }. */
export function safeNflRunBoxScore(run) {
  try {
    return { ok: true, box: nflRunBoxScore(run), error: null };
  } catch (e) {
    if (e instanceof RunBoxScoreError) return { ok: false, box: null, error: { code: e.code, reason: e.detail } };
    return { ok: false, box: null, error: { code: "RUN_BOX_ERROR", reason: String(e?.message ?? e) } };
  }
}

// ── compact transport for the client island (`run-box-pack@1`): lossless, tested round trip ──────────────────────
export const RUN_BOX_PACK_VERSION = "run-box-pack@1";
const SECTIONS = Object.freeze({ passing: ["passAtt", "cmp", "passYds", "passTd", "int"], rushing: ["rushAtt", "rushYds", "rushTd", "fumLost"], receiving: ["targets", "rec", "recYds", "recTd"], tdScorers: ["tds", "rushTd", "recTd"], turnovers: ["int", "fumLost"] });

/** Pack several boxes (keyed by run index) with one shared player table: [id, name, position] rows. */
export function packRunBoxes(boxes) {
  const people = [];
  const at = new Map();
  const ref = (r) => {
    const k = `${r.id}\u0000${r.name}\u0000${r.position ?? ""}`;
    if (!at.has(k)) { at.set(k, people.length); people.push([r.id, r.name, r.position]); }
    return at.get(k);
  };
  const runs = Object.entries(boxes).map(([runIndex, b]) => [Number(runIndex), b.final.home, b.final.away, b.final.overtime ? 1 : 0,
    ...SIDES.map((s) => [
      b[s].abbr,
      TEAM_FIELDS.map((f) => b[s].team[f]),
      ...Object.entries(SECTIONS).map(([sec, fs]) => b[s][sec].map((r) => [ref(r), ...fs.map((f) => r[f])])),
    ])]);
  return { v: RUN_BOX_PACK_VERSION, p: people, r: runs };
}

/** Inverse of packRunBoxes → { [runIndex]: box } (byte-identical to the input under JSON.stringify). */
export function unpackRunBoxes(pack) {
  if (!pack || pack.v !== RUN_BOX_PACK_VERSION) return {};
  const out = {};
  for (const [runIndex, home, away, ot, ...sides] of pack.r) {
    const box = { version: RUN_BOX_VERSION, title: RUN_BOX_TITLE, runIndex, final: { home, away, overtime: ot === 1 } };
    SIDES.forEach((s, i) => {
      const [abbr, teamVals, ...secs] = sides[i];
      const side = { abbr };
      Object.entries(SECTIONS).forEach(([sec, fs], j) => {
        side[sec] = secs[j].map(([pi, ...vals]) => {
          const [id, name, position] = pack.p[pi];
          return { id, name, position, ...Object.fromEntries(fs.map((f, k) => [f, vals[k]])) };
        });
      });
      side.team = Object.fromEntries(TEAM_FIELDS.map((f, k) => [f, teamVals[k]]));
      box[s] = { abbr: side.abbr, passing: side.passing, rushing: side.rushing, receiving: side.receiving, tdScorers: side.tdScorers, turnovers: side.turnovers, team: side.team };
    });
    out[runIndex] = box;
  }
  return out;
}
