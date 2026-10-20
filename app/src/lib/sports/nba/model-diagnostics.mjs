/**
 * NBA DAILY MODEL DIAGNOSTICS — PURE, no I/O. PRIVATE research. TEXT-ONLY PROPOSALS: nothing here changes a model,
 * a parameter, a forecast, a ledger or the registry. A proposed candidate is a sentence for a human to read; building
 * one means a NEW version string with its own forward shadow (prereg §1, §10) and the champion stays as it is.
 *
 * For one family and one settled slate it lists, each with n and an interval:
 *   - systematic error: bias (forecast − actual) of margin, total, minutes and each player stat, with a game-clustered
 *     bootstrap 95% interval. "SYSTEMATIC" only when the interval excludes 0; otherwise "no bias claimed".
 *   - interval calibration: p10–p90 coverage vs nominal 0.80 (clustered interval); flagged only when it excludes 0.80.
 *   - minutes errors: the largest |expected − actual| rows, and bias by expected-minutes band and starter/bench.
 *   - rotation / injury surprises: predicted-but-DNP (with the prediction's injury status), predicted-but-absent,
 *     played-but-unpredicted (≥ 10 minutes).
 *   - data checks: finals under review, box-score points that disagree with the recorded final, unmeasured OT.
 * Season-to-date findings (regular season, the §3 population) drive the text proposals; one slate never does.
 */
import { clusterBootstrap, PROPOSED_CHALLENGERS } from "./champion-challenger.mjs";
import { MINUTES_BANDS } from "./grader-metrics.mjs";
import { LABELS } from "./experimental-forecast.mjs";

export const DIAGNOSTICS_VERSION = "nba-model-diagnostics-1";
const STATS = ["pts", "reb", "ast", "threePm"];
const SURPRISE_MINUTES = 10; // prereg §13: the lane's listing floor — the rows a reader would actually see
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));

const finding = (key, ci, { what, unit = "", nominal = 0 }) => {
  const excl = ci.lo != null && ci.hi != null && (ci.hi < nominal || ci.lo > nominal);
  return {
    key, what, n: ci.n, clusters: ci.clusters, estimate: ci.mean, ci95: [ci.lo, ci.hi], nominal,
    status: ci.n === 0 ? "NO_DATA" : ci.lo == null ? "NO_INTERVAL" : excl ? "SYSTEMATIC" : "NO_CLAIM",
    text: ci.n === 0 ? `${what}: no rows`
      : ci.lo == null ? `${what}: ${ci.mean}${unit} (n ${ci.n}; one game — no interval, no claim)`
      : excl ? `${what}: ${ci.mean}${unit} (95% CI ${ci.lo} to ${ci.hi}, n ${ci.n} over ${ci.clusters} games) — interval excludes ${nominal}`
      : `${what}: ${ci.mean}${unit} (95% CI ${ci.lo} to ${ci.hi}, n ${ci.n} over ${ci.clusters} games) — interval includes ${nominal}, no systematic error claimed`,
  };
};

/**
 * Wilson 95% interval for a rate with an EFFECTIVE n (the number of games, not rows — rows within a game are
 * correlated, so this is the conservative count).
 */
export function wilson(rate, n, z = 1.959964) {
  if (!n || rate == null) return [null, null];
  const d = 1 + (z * z) / n, c = rate + (z * z) / (2 * n), h = z * Math.sqrt((rate * (1 - rate)) / n + (z * z) / (4 * n * n));
  return [Number(((c - h) / d).toFixed(4)), Number(((c + h) / d).toFixed(4))];
}
/**
 * Interval for a 0/1 coverage indicator: the UNION of the game-clustered bootstrap and a Wilson interval on the number
 * of games. A percentile bootstrap degenerates when every row agrees (12 of 12 inside → "1 to 1"); Wilson does not.
 */
export function coverageInterval(clusters, opts) {
  const boot = clusterBootstrap(clusters, opts);
  if (!boot.n) return boot;
  const [wl, wh] = wilson(boot.mean, boot.clusters);
  const lo = boot.lo == null ? wl : Math.min(boot.lo, wl), hi = boot.hi == null ? wh : Math.max(boot.hi, wh);
  return { ...boot, lo, hi, method: "union of game-clustered bootstrap and Wilson(n = games)" };
}

/** Every systematic-error finding over a set of graded games. */
export function systematicFindings(games, opts = {}) {
  const per = (f) => games.map((g) => [f(g)].filter(Number.isFinite));
  const rows = (g) => g.players?.rows ?? [];
  const out = [
    finding("marginBias", clusterBootstrap(per((g) => g.score?.marginErr), opts), { what: "margin bias (sim mean − actual, home − away)", unit: " pts" }),
    finding("totalBias", clusterBootstrap(per((g) => g.score?.totalErr), opts), { what: "total bias (sim mean − actual)", unit: " pts" }),
    finding("minutesBias", clusterBootstrap(games.map((g) => rows(g).map((r) => r.minutesErr)), opts), { what: "minutes bias (expected − actual), all matched rows", unit: " min" }),
  ];
  for (const b of MINUTES_BANDS) {
    out.push(finding(`minutesBias[${b.key}]`, clusterBootstrap(games.map((g) => rows(g).filter((r) => r.expectedMinutes >= b.lo && r.expectedMinutes < b.hi).map((r) => r.minutesErr)), opts), { what: `minutes bias, expected ${b.key}`, unit: " min" }));
  }
  for (const [k, started] of [["starters", true], ["bench", false]]) {
    out.push(finding(`minutesBias[${k}]`, clusterBootstrap(games.map((g) => rows(g).filter((r) => r.starterActual === started).map((r) => r.minutesErr)), opts), { what: `minutes bias, ${k} (actual role)`, unit: " min" }));
  }
  for (const k of STATS) {
    out.push(finding(`${k}Bias`, clusterBootstrap(games.map((g) => rows(g).map((r) => r.signed?.[k])), opts), { what: `${k} bias (sim mean − actual), all matched rows` }));
    out.push(finding(`${k}Coverage80`, coverageInterval(games.map((g) => rows(g).map((r) => r.inside80?.[k]).filter((x) => x === 0 || x === 1)), opts), { what: `${k} p10–p90 coverage (nominal 0.80)`, nominal: 0.8 }));
  }
  out.push(finding("marginCoverage80", coverageInterval(per((g) => g.intervals?.margin?.inside80), opts), { what: "margin p10–p90 coverage (nominal 0.80)", nominal: 0.8 }));
  out.push(finding("totalCoverage80", coverageInterval(per((g) => g.intervals?.total?.inside80), opts), { what: "total p10–p90 coverage (nominal 0.80)", nominal: 0.8 }));
  return out;
}

/** Rotation / injury surprises and data checks for one slate's games. */
export function slateSurprises(games, { top = 10 } = {}) {
  const minutesMisses = games.flatMap((g) => (g.players?.rows ?? []).map((r) => ({ providerEventId: g.providerEventId, side: r.side, name: r.name, expectedMinutes: r2(r.expectedMinutes), actualMinutes: r.actualMinutes, error: r2(r.minutesErr), injuryStatus: r.injuryStatus ?? null })))
    .filter((r) => Number.isFinite(r.error)).sort((a, b) => Math.abs(b.error) - Math.abs(a.error)).slice(0, top);
  const list = (k, keep) => games.flatMap((g) => (g.players?.[k] ?? []).filter(keep).map((p) => ({ providerEventId: g.providerEventId, ...p })));
  return {
    largestMinutesErrors: minutesMisses,
    predictedButDnp: list("predictedButDnp", () => true),
    predictedButAbsent: list("predictedButAbsent", (p) => (p.expectedMinutes ?? 0) >= SURPRISE_MINUTES),
    playedButUnpredicted: list("playedButUnpredicted", (p) => (p.minutes ?? 0) >= SURPRISE_MINUTES),
    dataChecks: {
      finalsUnderReview: games.filter((g) => g.context?.finalState === "FINAL_UNDER_REVIEW").map((g) => g.providerEventId),
      boxscorePointsDisagree: games.filter((g) => g.context?.boxscorePoints?.agrees === false).map((g) => ({ providerEventId: g.providerEventId, final: g.final, boxscore: { home: g.context.boxscorePoints.home, away: g.context.boxscorePoints.away } })),
      overtimeNotMeasured: games.filter((g) => typeof g.overtime?.actual !== "boolean").map((g) => g.providerEventId),
      withoutBoxscore: games.filter((g) => !g.players).map((g) => g.providerEventId),
    },
    surpriseFloorMinutes: SURPRISE_MINUTES,
  };
}

/** Text-only candidate proposals from SEASON-TO-DATE systematic findings. Never applied. */
export function proposeCandidates(findings, { family, population }) {
  const out = [];
  for (const f of findings.filter((x) => x.status === "SYSTEMATIC")) {
    const base = `[${family} · ${population}] ${f.text}.`;
    if (f.key === "totalBias") out.push(`${base} Calibration candidate (text only): a total-level location correction, built as a new version string with its own forward shadow; the total bar is |bias| ≤ 2.0 (§7).`);
    else if (f.key === "marginBias") out.push(`${base} Candidate (text only): review home-court / Elo-to-sim margin mapping in a new version; the margin bar is |bias| ≤ 1.0 (§7).`);
    else if (f.key.startsWith("minutesBias")) out.push(`${base} Minutes candidate (text only): the rotation/minutes model for this slice (minutes are graded first, §7 rationale); compare against the champion only on identical rows.`);
    else if (f.key.endsWith("Coverage80")) out.push(`${base} Interval calibration candidate (text only): ${f.estimate > f.nominal ? "intervals too wide (over-dispersed)" : "intervals too narrow (under-dispersed)"}; the coverage band is in §7.`);
    else if (f.key.endsWith("Bias")) out.push(`${base} Rate candidate (text only): per-minute ${f.key.replace("Bias", "")} rate shrinkage/location for a new version.`);
  }
  if (!out.length) out.push(`[${family} · ${population}] no season-to-date finding has an interval excluding its nominal value — no candidate proposed.`);
  return out;
}

/**
 * The daily diagnostics report for one family.
 * @param entries  current-view gradeEntries (status GRADED) — each { date, grade }
 */
export function buildDiagnostics({ family, date, generatedAt, entries, bootstrap = {} }) {
  const graded = entries.filter((e) => e.status === "GRADED");
  const slate = graded.filter((e) => e.date === date).map((e) => e.grade);
  const populations = {};
  for (const label of Object.values(LABELS)) {
    const season = graded.filter((e) => e.grade.label === label && e.date <= date).map((e) => e.grade);
    if (!season.length) continue;
    const seasonFindings = systematicFindings(season, bootstrap);
    populations[label] = {
      seasonToDate: { games: season.length, findings: seasonFindings },
      proposals: proposeCandidates(seasonFindings, { family, population: label }),
      proposalsAreTextOnly: true,
      ...(label === LABELS[1] ? { note: "§3: preseason findings may motivate a candidate; they never promote one" } : {}),
    };
  }
  return {
    artifact: "nba-model-diagnostics", diagnosticsVersion: DIAGNOSTICS_VERSION, family, date, generatedAt,
    dataClass: "PRIVATE_RESEARCH", productEligible: false, changesNothing: true,
    standingProposals: PROPOSED_CHALLENGERS.map((c) => ({ id: c.id, text: c.text, motivation: c.motivation, textOnly: true })),
    slate: { games: slate.length, findings: systematicFindings(slate, bootstrap), surprises: slateSurprises(slate), note: "one slate never drives a proposal — see seasonToDate" },
    populations,
  };
}

const names = (xs, f, max = 12) => (xs.length > max ? `${xs.slice(0, max).map(f).join("; ")}; … +${xs.length - max} more in the JSON` : xs.map(f).join("; "));

/** Markdown rendering (private). */
export function diagnosticsMarkdown(r) {
  const L = [`# NBA model diagnostics — ${r.family} — ${r.date}`, "", `PRIVATE research · generated ${r.generatedAt} · ${r.diagnosticsVersion} · changes nothing; proposals are text only.`, ""];
  L.push(`## Slate (${r.slate.games} graded games)`, "");
  for (const f of r.slate.findings.filter((x) => x.n > 0)) L.push(`- ${f.status === "SYSTEMATIC" ? "**SYSTEMATIC** " : ""}${f.text}`);
  const s = r.slate.surprises;
  L.push("", "### Minutes / rotation / injury surprises", "");
  for (const m of s.largestMinutesErrors.slice(0, 5)) L.push(`- ${m.name} (${m.providerEventId}, ${m.side}): expected ${m.expectedMinutes}, played ${m.actualMinutes} (error ${m.error})${m.injuryStatus ? ` · listed ${m.injuryStatus}` : ""}`);
  L.push(`- predicted but DNP: ${s.predictedButDnp.length}${s.predictedButDnp.length ? ` (${names(s.predictedButDnp, (p) => `${p.name}${p.injuryStatus ? ` [${p.injuryStatus}]` : ""}${p.dnpReason ? ` — ${p.dnpReason}` : ""}`)})` : ""}`);
  L.push(`- predicted (≥ ${s.surpriseFloorMinutes} min) but absent from the box score: ${s.predictedButAbsent.length}${s.predictedButAbsent.length ? ` (${names(s.predictedButAbsent, (p) => p.name)})` : ""}`);
  L.push(`- played ≥ ${s.surpriseFloorMinutes} min but not predicted: ${s.playedButUnpredicted.length}${s.playedButUnpredicted.length ? ` (${names(s.playedButUnpredicted, (p) => `${p.name} ${p.minutes} min`)})` : ""}`);
  const d = s.dataChecks;
  L.push("", "### Data checks", "", `- finals under review: ${d.finalsUnderReview.length ? d.finalsUnderReview.join(", ") : "none"}`, `- box-score points disagree with the recorded final: ${d.boxscorePointsDisagree.length ? d.boxscorePointsDisagree.map((x) => x.providerEventId).join(", ") : "none"}`, `- overtime not measured: ${d.overtimeNotMeasured.length}`, `- graded without a box score: ${d.withoutBoxscore.length}`);
  for (const [label, p] of Object.entries(r.populations)) {
    L.push("", `## Season to date — ${label} (${p.seasonToDate.games} games)`, "");
    for (const f of p.seasonToDate.findings.filter((x) => x.status === "SYSTEMATIC")) L.push(`- **SYSTEMATIC** ${f.text}`);
    if (!p.seasonToDate.findings.some((x) => x.status === "SYSTEMATIC")) L.push("- no finding with an interval excluding its nominal value");
    if (p.note) L.push("", `_${p.note}_`);
    L.push("", "### Proposals (text only — nothing is applied)", "", ...p.proposals.map((x) => `- ${x}`));
  }
  L.push("", "## Standing proposed challengers (text only — nothing is built or armed)", "", ...r.standingProposals.map((c) => `- ${c.text} _Motivation: ${c.motivation}_`));
  return L.join("\n") + "\n";
}
