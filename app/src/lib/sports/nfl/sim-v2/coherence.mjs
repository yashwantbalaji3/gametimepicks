/**
 * NFL SIMULATION V2 — PER-RUN COHERENCE CONTRACT (Session 13 · C4 / E1). Pure.
 *
 * The engine accumulates team and player numbers along separate paths; this module re-derives every invariant from
 * the run's buffers and lists what fails. The receipt reports the count over ALL runs; the target is 0.
 *
 *   SCORE      points = 6·TD (pass + rush + defensive) + XP + 2·two-point + 3·FG + 2·safety, = Σ quarters, = the run's score
 *   OT         overtime only from a regulation tie; no OT points without OT; a tie only after OT
 *   PASSING    completions ≤ attempts; interceptions ≤ incompletions; Σ targets = attempts; Σ receptions = completions;
 *              Σ receiving yards = passing yards = Σ passer yards; Σ receiving TDs = passing TDs = Σ passer TDs
 *              (one touchdown, credited to passer and receiver — never two team scores)
 *   RUSHING    Σ player carries = team carries; Σ rushing yards; Σ rushing TDs
 *   PLAYER     receptions ≤ targets; receiving TDs ≤ receptions; no negative counts
 *   FIRST TD   present iff any offensive TD happened; the named scorer has a TD of that type in this run
 */
import { N_PSTAT, PSTAT, TEAM_STAT } from "./engine.mjs";

const COUNT_FIELDS = ["drives", "plays", "passAtt", "cmp", "sacks", "scrambles", "rushAtt", "passTd", "rushTd", "int", "fumLost", "fgAtt", "fgMade", "xpAtt", "xpMade", "twoAtt", "twoMade", "defTd", "safetiesFor", "kneels"];

export function checkRun({ team, period, players = null, slots = null, run }) {
  const fail = [];
  for (const side of [0, 1]) {
    const T = team[side];
    const t = (k) => T[TEAM_STAT[k]];
    const pts = 6 * (t("passTd") + t("rushTd") + t("defTd")) + t("xpMade") + 2 * t("twoMade") + 3 * t("fgMade") + 2 * t("safetiesFor");
    if (pts !== t("pts")) fail.push(`S${side}:POINTS_NE_SCORING_EVENTS`);
    let ps = 0;
    for (let i = 0; i < period[side].length; i++) ps += period[side][i];
    if (ps !== t("pts")) fail.push(`S${side}:PERIODS_NE_FINAL`);
    if (t("pts") !== run.score[side]) fail.push(`S${side}:TEAM_PTS_NE_RUN_SCORE`);
    if (t("cmp") > t("passAtt")) fail.push(`S${side}:CMP_GT_ATT`);
    if (t("int") > t("passAtt") - t("cmp")) fail.push(`S${side}:INT_GT_INCOMPLETIONS`);
    if (t("xpMade") > t("xpAtt") || t("twoMade") > t("twoAtt") || t("fgMade") > t("fgAtt")) fail.push(`S${side}:MADE_GT_ATT`);
    for (const k of COUNT_FIELDS) if (t(k) < 0) fail.push(`S${side}:NEGATIVE_${k}`);

    if (players && slots) {
      const PL = players[side];
      const n = slots[side] + 1; // + OTHER
      const sum = (s) => { let a = 0; for (let i = 0; i < n; i++) a += PL[i * N_PSTAT + s]; return a; };
      if (sum(PSTAT.targets) !== t("passAtt")) fail.push(`S${side}:TARGETS_NE_ATT`);
      if (sum(PSTAT.rec) !== t("cmp")) fail.push(`S${side}:REC_NE_CMP`);
      if (sum(PSTAT.recYds) !== t("passYds")) fail.push(`S${side}:RECYDS_NE_PASSYDS`);
      if (sum(PSTAT.passYds) !== t("passYds")) fail.push(`S${side}:PASSERYDS_NE_PASSYDS`);
      if (sum(PSTAT.recTd) !== t("passTd")) fail.push(`S${side}:RECTD_NE_PASSTD`);
      if (sum(PSTAT.passTd) !== t("passTd")) fail.push(`S${side}:PASSERTD_NE_PASSTD`);
      if (sum(PSTAT.passAtt) !== t("passAtt")) fail.push(`S${side}:PASSERATT_NE_ATT`);
      if (sum(PSTAT.cmp) !== t("cmp")) fail.push(`S${side}:PASSERCMP_NE_CMP`);
      if (sum(PSTAT.int) !== t("int")) fail.push(`S${side}:PASSERINT_NE_INT`);
      if (sum(PSTAT.rushAtt) !== t("rushAtt")) fail.push(`S${side}:CARRIES_NE_RUSHATT`);
      if (sum(PSTAT.rushYds) !== t("rushYds")) fail.push(`S${side}:RUSHYDS_NE`);
      if (sum(PSTAT.rushTd) !== t("rushTd")) fail.push(`S${side}:RUSHTD_NE`);
      for (let i = 0; i < n; i++) {
        const v = (s) => PL[i * N_PSTAT + s];
        if (v(PSTAT.rec) > v(PSTAT.targets)) { fail.push(`S${side}:P${i}:REC_GT_TARGETS`); break; }
        if (v(PSTAT.recTd) > v(PSTAT.rec)) { fail.push(`S${side}:P${i}:RECTD_GT_REC`); break; }
        for (const s of [PSTAT.passAtt, PSTAT.cmp, PSTAT.passTd, PSTAT.int, PSTAT.rushAtt, PSTAT.rushTd, PSTAT.targets, PSTAT.rec, PSTAT.recTd]) {
          if (v(s) < 0) { fail.push(`S${side}:P${i}:NEGATIVE`); break; }
        }
      }
    }
  }
  const reg = (side) => period[side][0] + period[side][1] + period[side][2] + period[side][3];
  if (run.ot && reg(0) !== reg(1)) fail.push("OT_WITHOUT_REGULATION_TIE");
  if (!run.ot && (period[0][4] !== 0 || period[1][4] !== 0)) fail.push("OT_POINTS_WITHOUT_OT");
  if (!run.ot && run.score[0] === run.score[1]) fail.push("TIE_WITHOUT_OT");
  if (run.tie !== (run.score[0] === run.score[1])) fail.push("TIE_FLAG");
  const offTd = team[0][TEAM_STAT.passTd] + team[0][TEAM_STAT.rushTd] + team[1][TEAM_STAT.passTd] + team[1][TEAM_STAT.rushTd];
  if ((offTd > 0) !== (run.firstTd != null)) fail.push("FIRST_TD_PRESENCE");
  if (run.firstTd && players && slots && run.firstTd.slot >= 0) {
    const PL = players[run.firstTd.side];
    const s = run.firstTd.type === "PASS" ? PSTAT.recTd : PSTAT.rushTd;
    if (!(PL[run.firstTd.slot * N_PSTAT + s] >= 1)) fail.push("FIRST_TD_SCORER_HAS_NO_TD");
  }
  return fail;
}
