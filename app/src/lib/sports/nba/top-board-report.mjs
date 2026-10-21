/**
 * NBA TOP BOARD DAILY PERFORMANCE REPORT — PURE, no I/O. PRIVATE (dataClass PRIVATE_RESEARCH).
 *
 * Fifteen sections, each computed only from what was frozen and what the box scores say. Rules the report keeps:
 *   - W/L/P are 0 because no line is recorded; the report says so instead of printing a hit rate.
 *   - VOID rows are excluded from every denominator; PENDING is never counted as a miss.
 *   - Calibration (p10–p90 coverage, share at-or-above p50) is printed with its n and the preregistered minimum n
 *     (grader-metrics.mjs PREREG, transcribed from docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md §6). Below that
 *     minimum it is DESCRIPTIVE ONLY and carries a warning; it is never a claim. Board rows are also a SELECTED
 *     subset (the top of the p50 ranking), not the preregistered population of every ≥ 20-minute player, so even a
 *     full-sample board coverage is not the §7 bar.
 */
import { PREREG } from "./grader-metrics.mjs";
import { NBA_BOARD_ROLE, NBA_BOARD_ROLES } from "../../consistency/nba-board-roles.mjs";
import { CATEGORIES } from "./top-boards.mjs";
import { SETTLEMENT, PROJECTION_STATUS, boardRows } from "./top-board-grading.mjs";

/** Every ranked category the report covers: schema @2's (a superset of @1's), so an @1 day file reports its four. */
const REPORT_CATEGORIES = CATEGORIES; // ⊇ CATEGORIES_V1 (same keys first), pinned by top-boards.test.mjs

export const REPORT_ARTIFACT = "nba-top-board-daily-report";
const r3 = (x) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(3)) : null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const PREREG_STAT = { pts: "pts", reb: "reb", ast: "ast", threePm: "threePm" };
const BIG_MINUTES = 20;

function calibrationBlock(entries, stat) {
  const graded = entries.filter((e) => e.projectionStatus === PROJECTION_STATUS.GRADED && e.accuracy);
  const n = graded.length;
  const bar = PREREG.player[PREREG_STAT[stat]];
  if (!bar) {
    // PRA / P+R / P+A: the preregistration §6 sets no minimum n and no coverage band for a combination board.
    return {
      n, preregMinN: null, nominalBand: null,
      coverage80: n ? r3(mean(graded.map((e) => e.accuracy.inside80))) : null,
      shareAtOrAboveP50: n ? r3(mean(graded.map((e) => e.accuracy.atOrAboveP50))) : null,
      state: "NO_PREREGISTERED_BAR",
      warning: `no preregistered sample size or coverage band for ${stat} (preregistration §6 covers pts, reb, ast, threePm only) — descriptive only, never a claim`,
    };
  }
  const coverage = n ? r3(mean(graded.map((e) => e.accuracy.inside80))) : null;
  const atOrAbove = n ? r3(mean(graded.map((e) => e.accuracy.atOrAboveP50))) : null;
  const belowMin = n < bar.minN;
  return {
    n, preregMinN: bar.minN, nominalBand: bar.coverage,
    coverage80: coverage, shareAtOrAboveP50: atOrAbove,
    state: belowMin ? "DESCRIPTIVE_ONLY" : "SAMPLE_MET_SELECTED_SUBSET",
    warning: belowMin
      ? `n = ${n} is below the preregistered minimum ${bar.minN} — descriptive only, no calibration or hit-rate claim`
      : "board rows are a selected subset (top of the p50 ranking), not the preregistered population — not the §7 bar",
  };
}

function accuracyBlock(entries) {
  const g = entries.filter((e) => e.projectionStatus === PROJECTION_STATUS.GRADED && e.accuracy);
  const mins = g.map((e) => e.accuracy.minutesError).filter((x) => typeof x === "number");
  return {
    graded: g.length,
    maeP50: r3(mean(g.map((e) => e.accuracy.absErrorP50))),
    biasP50: r3(mean(g.map((e) => e.accuracy.errorP50))),
    maeMean: r3(mean(g.map((e) => e.accuracy.absErrorMean))),
    biasMean: r3(mean(g.map((e) => e.accuracy.errorMean))),
    minutesMae: r3(mean(mins.map(Math.abs))),
    minutesBias: r3(mean(mins)),
  };
}

/**
 * @param {{ date: string, family: string, generatedAt: string, boardDoc: object|null, ledger: object,
 *           forecastArtifact?: object|null, boxscoreOf?: (eventId: string) => object|null }} o
 */
export function buildDailyReport({ date, family, generatedAt, boardDoc, ledger, forecastArtifact = null, boxscoreOf = () => null }) {
  const latest = new Map();
  for (const e of ledger?.entries ?? []) latest.set(e.rowId, e);
  const rows = boardDoc ? boardRows(boardDoc) : [];
  const rowById = new Map(rows.map((r) => [r.rowId, r]));
  const dayEntries = rows.map((r) => latest.get(r.rowId)).filter(Boolean);
  const notYetGraded = rows.filter((r) => !latest.has(r.rowId)).map((r) => r.rowId);
  const allEntries = [...latest.values()];
  const editions = boardDoc?.editions ?? [];
  const games = editions.flatMap((e) => e.games.map((g) => ({ ...g, edition: e.edition })));
  const onBoardGames = games.filter((g) => g.state === "ON_BOARD");
  const offBoard = games.filter((g) => g.state !== "ON_BOARD" && g.state !== "ON_EARLIER_EDITION");
  const countBy = (xs, k) => xs.reduce((m, x) => ((m[k(x)] = (m[k(x)] ?? 0) + 1), m), {});

  // 2 · games processed
  const boxState = onBoardGames.map((g) => { const b = boxscoreOf(g.eventId); return { eventId: g.eventId, final: !!(b?.boxscoreAvailable && /FINAL/.test(String(b.status ?? ""))) }; });

  // 5–7 · settlement
  const settlementCounts = Object.fromEntries(Object.values(SETTLEMENT).map((s) => [s, 0]));
  for (const e of dayEntries) settlementCounts[e.settlement.status] += 1;
  settlementCounts.PENDING += notYetGraded.length;
  const ungradableReasons = countBy(dayEntries.filter((e) => e.settlement.status === SETTLEMENT.UNGRADABLE), (e) => e.settlement.reason);

  // 8 · accuracy per category (day + cumulative)
  const perCategory = {};
  for (const c of REPORT_CATEGORIES) {
    const day = dayEntries.filter((e) => e.category === c.key);
    const cum = allEntries.filter((e) => e.category === c.key);
    perCategory[c.key] = { label: c.label, day: accuracyBlock(day), cumulative: accuracyBlock(cum) };
  }

  // 9–10 · largest misses / positive deviations
  const graded = dayEntries.filter((e) => e.projectionStatus === PROJECTION_STATUS.GRADED && e.accuracy);
  const describe = (e) => { const r = rowById.get(e.rowId); return { rowId: e.rowId, player: r?.player?.name ?? null, team: r?.team?.abbr ?? null, category: e.category, rank: r?.rank ?? null, p50: e.accuracy.p50, p10: e.accuracy.p10, p90: e.accuracy.p90, actual: e.accuracy.actual, errorP50: e.accuracy.errorP50, expectedMinutes: r?.expectedMinutes ?? null, actualMinutes: e.accuracy.actualMinutes, flags: r?.flags ?? [] }; };
  const largestMisses = graded.filter((e) => e.accuracy.errorP50 > 0).sort((a, b) => b.accuracy.errorP50 - a.accuracy.errorP50).slice(0, 5).map(describe);
  const largestPositive = graded.filter((e) => e.accuracy.errorP50 < 0).sort((a, b) => a.accuracy.errorP50 - b.accuracy.errorP50).slice(0, 5).map(describe);

  // 11 · availability surprises
  const predictedButVoid = dayEntries.filter((e) => e.settlement.status === SETTLEMENT.VOID).map((e) => { const r = rowById.get(e.rowId); return { rowId: e.rowId, player: r?.player?.name ?? null, team: r?.team?.abbr ?? null, category: e.category, reason: e.settlement.reason, detail: e.settlement.detail ?? null, expectedMinutes: r?.expectedMinutes ?? null }; });
  const playedButUnpredicted = [];
  const withheldButPlayedBig = [];
  for (const g of onBoardGames) {
    const b = boxscoreOf(g.eventId);
    if (!b?.boxscoreAvailable) continue;
    const fg = (forecastArtifact?.games ?? []).find((x) => String(x.providerEventId) === g.eventId);
    const simulated = new Set(["home", "away"].flatMap((s) => (fg?.forecast?.players?.[s] ?? []).map((p) => String(p.providerAthleteId))));
    const ed = editions.find((e) => e.edition === g.edition);
    const withheld = new Map((ed?.boards?.points?.withheld?.players ?? []).filter((w) => w.eventId === g.eventId).map((w) => [String(w.providerAthleteId), w]));
    for (const p of b.players ?? []) {
      if (p.didNotPlay || !Number.isInteger(p.minutes) || p.minutes < BIG_MINUTES) continue;
      const id = String(p.providerAthleteId);
      if (fg && !simulated.has(id)) playedButUnpredicted.push({ eventId: g.eventId, player: p.name, minutes: p.minutes, pts: p.pts, reb: p.reb, ast: p.ast, threePm: p.threePm, withheldAs: withheld.get(id)?.primaryReason ?? null });
      else if (withheld.has(id)) withheldButPlayedBig.push({ eventId: g.eventId, player: p.name, minutes: p.minutes, withheldAs: withheld.get(id).primaryReason, reasons: withheld.get(id).reasons });
    }
  }

  // 12 · withheld summary
  const withheldSummary = {};
  for (const c of REPORT_CATEGORIES) {
    const per = {};
    for (const e of editions) { const b = e.boards?.[c.key]; if (!b) continue; for (const [k, v] of Object.entries(b.withheld.byPrimaryReason)) per[k] = (per[k] ?? 0) + v; }
    withheldSummary[c.key] = { shown: editions.reduce((s, e) => s + (e.boards?.[c.key]?.shownCount ?? 0), 0), eligible: editions.reduce((s, e) => s + (e.boards?.[c.key]?.eligibleCount ?? 0), 0), withheldByPrimaryReason: per, emptyReasons: editions.map((e) => e.boards?.[c.key]?.emptyReason).filter(Boolean) };
  }

  // 13 · data quality
  const dataQuality = [];
  if (!boardDoc) dataQuality.push({ issue: "NO_BOARD_FROZEN", detail: `no ${family} board file for ${date} — the day was not frozen (never back-filled)` });
  for (const g of offBoard) dataQuality.push({ issue: `GAME_OFF_BOARD_${g.state}`, detail: `${g.eventId} ${g.away?.abbr ?? "?"}@${g.home?.abbr ?? "?"} tip ${g.tipoffUtc}` });
  for (const g of onBoardGames) if ((g.flags ?? []).includes("LEGACY_NO_RECEIPT")) dataQuality.push({ issue: "LEGACY_NO_RECEIPT", detail: `${g.eventId}: forecast written before receipts existed — instant taken from the artifact` });
  for (const b of boxState) if (!b.final) dataQuality.push({ issue: "NO_FINAL_BOXSCORE", detail: `${b.eventId}: rows stay PENDING until a final box score is committed` });
  for (const e of dayEntries.filter((x) => x.settlement.reason === "NULL_ACTUAL")) dataQuality.push({ issue: "NULL_ACTUAL", detail: `${e.rowId}: ${e.settlement.detail}` });
  const traded = rows.filter((r) => (r.flags ?? []).includes("TRADED_HISTORY_OTHER_TEAM"));
  if (traded.length) dataQuality.push({ issue: "TRADED_HISTORY_ROWS", detail: `${traded.length} board row(s) carry history from a previous team (included with flag)` });

  // 14 · calibration
  const calibration = {};
  for (const c of REPORT_CATEGORIES) {
    calibration[c.key] = {
      day: calibrationBlock(dayEntries.filter((e) => e.category === c.key), c.stat),
      cumulative: calibrationBlock(allEntries.filter((e) => e.category === c.key), c.stat),
    };
  }

  // 15 · recommended investigations (rule-generated, never a verdict)
  const investigations = [];
  const voidByPlayer = new Map();
  for (const v of predictedButVoid) {
    const k = `${v.player}|${v.team}`;
    if (!voidByPlayer.has(k)) voidByPlayer.set(k, { ...v, categories: [] });
    voidByPlayer.get(k).categories.push(v.category);
  }
  for (const v of voidByPlayer.values()) investigations.push(`Availability: ${v.player} (${v.team}) was on the ${v.categories.join(", ")} board(s) and was ${v.reason}${v.detail ? ` (${v.detail})` : ""} — check the injury snapshot and freeze timing against the actual status.`);
  for (const w of withheldButPlayedBig.slice(0, 5)) investigations.push(`Eligibility: ${w.player} played ${w.minutes} min but was withheld as ${w.withheldAs} — review whether that rule is too strict for this case.`);
  for (const p of playedButUnpredicted.slice(0, 5)) investigations.push(`Pool: ${p.player} played ${p.minutes} min but was not in the simulated pool — roster/history gap.`);
  for (const c of REPORT_CATEGORIES) {
    const d = perCategory[c.key].day;
    if (d.graded >= 5 && Math.abs(d.biasP50 ?? 0) >= 2) investigations.push(`${c.label}: day bias ${d.biasP50} on ${d.graded} rows — look for a shared minutes or pace cause before reading anything into it (small n).`);
    const cal = calibration[c.key].cumulative;
    if (cal.n >= 30 && cal.coverage80 != null && cal.nominalBand && (cal.coverage80 < cal.nominalBand[0] - 0.1 || cal.coverage80 > cal.nominalBand[1] + 0.1)) investigations.push(`${c.label}: cumulative p10–p90 coverage ${cal.coverage80} on n=${cal.n} is far from ${cal.nominalBand.join("–")} — dispersion check (descriptive; ${cal.warning}).`);
  }
  if (traded.length) {
    const tg = graded.filter((e) => (rowById.get(e.rowId)?.flags ?? []).includes("TRADED_HISTORY_OTHER_TEAM"));
    const ng = graded.filter((e) => !(rowById.get(e.rowId)?.flags ?? []).includes("TRADED_HISTORY_OTHER_TEAM"));
    if (tg.length) investigations.push(`Traded-history flag: MAE(p50) ${r3(mean(tg.map((e) => e.accuracy.absErrorP50)))} on ${tg.length} flagged rows vs ${r3(mean(ng.map((e) => e.accuracy.absErrorP50)))} on ${ng.length} others — keep watching before changing the include-with-flag policy.`);
  }
  if (!investigations.length) investigations.push("None generated by the rules for this date.");

  const wlp = settlementCounts.WIN + settlementCounts.LOSS + settlementCounts.PUSH;
  return {
    schemaVersion: 1, artifact: REPORT_ARTIFACT, dataClass: "PRIVATE_RESEARCH", productEligible: false,
    date, family, generatedAt,
    s01_scope: { date, family, modelVersion: boardDoc?.modelVersion ?? null, editions: editions.map((e) => ({ edition: e.edition, frozenAt: e.frozenAt, sourceSha256: e.source?.sha256 ?? null, gamesOnBoard: e.gamesOnBoard })) },
    s02_games: { inForecast: games.filter((g) => g.state !== "ON_EARLIER_EDITION").length, onBoard: onBoardGames.length, offBoardByReason: countBy(offBoard, (g) => g.state), withFinalBoxscore: boxState.filter((b) => b.final).length, awaitingBoxscore: boxState.filter((b) => !b.final).length },
    s03_rowsPublishedPrivate: { total: rows.length, byCategory: countBy(rows, (r) => r.category), uniquePlayers: new Set(rows.map((r) => r.player?.providerAthleteId)).size, note: "PRIVATE artifact rows — nothing was published publicly" },
    s04_graded: { projectionGraded: graded.length, byCategory: countBy(graded, (e) => e.category) },
    s05_settlement: { counts: settlementCounts, note: wlp === 0 ? "W/L/P are 0 by construction: no line is recorded for any NBA row (NO_AUTHORIZED_PRICE), so no row can win, lose or push. Projection accuracy is graded separately below." : "line-settled rows present" },
    s06_pending: { count: settlementCounts.PENDING, notYetGraded: notYetGraded.length, rows: dayEntries.filter((e) => e.settlement.status === SETTLEMENT.PENDING).map((e) => ({ rowId: e.rowId, reason: e.settlement.reason })) },
    s07_ungradable: { count: settlementCounts.UNGRADABLE, byReason: ungradableReasons },
    s08_accuracy: perCategory,
    s09_largestMisses: largestMisses,
    s10_largestPositiveDeviations: largestPositive,
    s11_availabilitySurprises: { predictedButVoid, playedButUnpredicted, withheldButPlayedBig, thresholdMinutes: BIG_MINUTES },
    s12_withheld: withheldSummary,
    s13_dataQuality: dataQuality,
    s14_calibration: calibration,
    s15_investigations: investigations,
  };
}

const fmt = (x) => (x == null ? "—" : String(x));

/** Markdown rendering of the report JSON. */
export function reportMarkdown(r) {
  const L = [];
  const role = NBA_BOARD_ROLES[r.family];
  L.push(role && role.role !== NBA_BOARD_ROLE.OFFICIAL
    ? `# ${role.label} — Top Boards daily report · ${r.date} · family ${r.family}`
    : `# NBA Top Boards — daily performance report · ${r.date} · family ${r.family}`);
  if (!role || role.role !== NBA_BOARD_ROLE.OFFICIAL) L.push("", `**${role?.label ?? `Unregistered family ${r.family}`}.** Never official, never a Top Pick, never a product source.`);
  L.push("");
  L.push(`PRIVATE research (dataClass ${r.dataClass}, productEligible false). Shadow model, not validated, not published. Generated ${r.generatedAt}.`);
  L.push("");
  L.push("## 1. Scope");
  L.push(`Model ${fmt(r.s01_scope.modelVersion)} · editions: ${r.s01_scope.editions.map((e) => `#${e.edition} frozen ${e.frozenAt} (${e.gamesOnBoard} games, source sha256 ${String(e.sourceSha256).slice(0, 12)}…)`).join("; ") || "none"}`);
  L.push("## 2. Games processed");
  L.push(`In forecast ${r.s02_games.inForecast} · on board ${r.s02_games.onBoard} · off board ${JSON.stringify(r.s02_games.offBoardByReason)} · final box score ${r.s02_games.withFinalBoxscore} · awaiting ${r.s02_games.awaitingBoxscore}`);
  L.push("## 3. Rows frozen (private)");
  L.push(`${r.s03_rowsPublishedPrivate.total} rows · ${JSON.stringify(r.s03_rowsPublishedPrivate.byCategory)} · ${r.s03_rowsPublishedPrivate.uniquePlayers} players. ${r.s03_rowsPublishedPrivate.note}.`);
  L.push("## 4. Graded (projection accuracy)");
  L.push(`${r.s04_graded.projectionGraded} rows · ${JSON.stringify(r.s04_graded.byCategory)}`);
  L.push("## 5. Settlement W / L / P / V");
  L.push(Object.entries(r.s05_settlement.counts).map(([k, v]) => `${k} ${v}`).join(" · "));
  L.push("");
  L.push(r.s05_settlement.note);
  L.push("## 6. Pending");
  L.push(`${r.s06_pending.count} (never counted as a loss)`);
  L.push("## 7. Ungradable");
  L.push(`${r.s07_ungradable.count} · ${JSON.stringify(r.s07_ungradable.byReason)}`);
  L.push("## 8. Accuracy by category (error = p50 − actual; positive = projected too high)");
  L.push("| Category | Day n | Day MAE | Day bias | Cum n | Cum MAE | Cum bias | Day minutes MAE |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const [, c] of Object.entries(r.s08_accuracy)) L.push(`| ${c.label} | ${c.day.graded} | ${fmt(c.day.maeP50)} | ${fmt(c.day.biasP50)} | ${c.cumulative.graded} | ${fmt(c.cumulative.maeP50)} | ${fmt(c.cumulative.biasP50)} | ${fmt(c.day.minutesMae)} |`);
  const missTable = (xs) => { if (!xs.length) return ["None."]; return ["| Player | Team | Category | Rank | p50 (p10–p90) | Actual | Error | Min (exp → act) |", "|---|---|---|---|---|---|---|---|", ...xs.map((x) => `| ${x.player} | ${x.team} | ${x.category} | ${x.rank} | ${x.p50} (${x.p10}–${x.p90}) | ${x.actual} | ${x.errorP50} | ${x.expectedMinutes} → ${x.actualMinutes} |`)]; };
  L.push("## 9. Largest misses (projected too high)");
  L.push(...missTable(r.s09_largestMisses));
  L.push("## 10. Largest positive deviations (actual above projection)");
  L.push(...missTable(r.s10_largestPositiveDeviations));
  L.push("## 11. Availability surprises");
  L.push(`On a board but did not play (VOID): ${r.s11_availabilitySurprises.predictedButVoid.map((v) => `${v.player} (${v.team}, ${v.category}, ${v.reason}${v.detail ? `: ${v.detail}` : ""})`).join("; ") || "none"}`);
  L.push("");
  L.push(`Played ≥ ${r.s11_availabilitySurprises.thresholdMinutes} min but not in the simulated pool: ${r.s11_availabilitySurprises.playedButUnpredicted.map((p) => `${p.player} ${p.minutes} min`).join("; ") || "none"}`);
  L.push("");
  L.push(`Played ≥ ${r.s11_availabilitySurprises.thresholdMinutes} min but withheld: ${r.s11_availabilitySurprises.withheldButPlayedBig.map((p) => `${p.player} ${p.minutes} min (${p.withheldAs})`).join("; ") || "none"}`);
  L.push("## 12. Withheld (primary reason)");
  for (const [k, w] of Object.entries(r.s12_withheld)) L.push(`- ${k}: shown ${w.shown} of ${w.eligible} eligible · withheld ${JSON.stringify(w.withheldByPrimaryReason)}${w.emptyReasons.length ? ` · empty: ${w.emptyReasons.join("; ")}` : ""}`);
  L.push("## 13. Data quality");
  L.push(...(r.s13_dataQuality.length ? r.s13_dataQuality.map((d) => `- ${d.issue}: ${d.detail}`) : ["- none"]));
  L.push("## 14. Calibration (descriptive)");
  L.push("| Category | Day n | Day p10–p90 coverage | Cum n / prereg min | Cum coverage | Cum ≥ p50 share | State |");
  L.push("|---|---|---|---|---|---|---|");
  for (const [k, c] of Object.entries(r.s14_calibration)) L.push(`| ${k} | ${c.day.n} | ${fmt(c.day.coverage80)} | ${c.cumulative.n} / ${c.cumulative.preregMinN ?? "no bar"} | ${fmt(c.cumulative.coverage80)} | ${fmt(c.cumulative.shareAtOrAboveP50)} | ${c.cumulative.state} |`);
  L.push("");
  for (const [k, c] of Object.entries(r.s14_calibration)) L.push(`- ${k}: ${c.cumulative.warning}`);
  L.push("## 15. Recommended investigations");
  L.push(...r.s15_investigations.map((x) => `- ${x}`));
  L.push("");
  return L.join("\n");
}
