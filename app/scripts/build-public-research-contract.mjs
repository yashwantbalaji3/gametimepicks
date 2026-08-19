/**
 * SPRINT 050 — the public research contract.
 *
 * WHY THIS EXISTS
 * Sprints 043–049 built event identity, provenance, settlement lineage, a versioned calibrator,
 * publishing eligibility, a market registry, and a daily autopsy. Every one of them is consumed by
 * nothing a user can see. The gap between "the platform measures itself honestly" and "a person can
 * see that" is entirely presentation.
 *
 * Rather than have each surface re-derive those facts — which is how `/board` and `/about` ended up
 * with a hardcoded 51.7% that drifted from the ledger for weeks — every surface reads ONE artifact
 * built here. A number that appears on two pages comes from one place or it will eventually disagree
 * with itself.
 *
 * WHAT IT WILL NOT DO
 *   · invent a probability where provenance is missing;
 *   · present raw output as calibrated;
 *   · hide a weak market to improve an aggregate;
 *   · describe a quarantined slate as merely absent.
 *
 * Read-only over canonical artifacts. Emits public JSON only. Never touches money.
 *
 * Usage:
 *   npx tsx scripts/build-public-research-contract.mjs [--write] [--self-test]
 */
import fs from "node:fs";
import path from "node:path";

import { loadRows, marketRegistry } from "./model-learning-audit.mjs";
import { autopsy } from "./build-learning-report.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const OUT_DIR = path.join(APP, "public/data/research");
const INTERNAL = path.join(REPO, "data/internal/mlb/model-learning");

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

/** Slates refused by the settlement-lineage gate. Represented explicitly, never as a silent absence. */
function quarantines() {
  const proof = readJson(path.join(REPO, "data/internal/mlb/integrity/settlement-lineage-live-proof.json"));
  if (!proof?.quarantine) return [];
  const q = proof.quarantine;
  return [{
    date: q.date,
    status: "QUARANTINED",
    refusedRows: q.refusedRows ?? null,
    // Internal detail keeps the exact violation; the public line stays understandable and non-alarming.
    internalReason: (q.violations ?? [])[0] ?? q.rationale ?? null,
    publicExplanation:
      "This slate's board was built before a data-integrity guard was in place, and two halves of a " +
      "doubleheader could not be told apart. Rather than grade predictions against the wrong game, we " +
      "left the date unsettled. It has no win/loss record and is excluded from every rate on this site.",
  }];
}

/**
 * System status, per stage, with independent states.
 *
 * One aggregate "healthy" badge is what let a failed settlement sit behind a green workflow for a day.
 * Each stage reports for itself, and the overall signal is the worst of them rather than an average.
 */
function systemStatus({ freshness, registry, brief, manifest, quarantined }) {
  const stages = [];
  const add = (stage, state, detail) => stages.push({ stage, state, detail });

  add("predictionHistory",
    freshness == null ? "UNAVAILABLE" : freshness.healthy ? "READY" : "STALE",
    freshness == null
      ? "no freshness artifact has been produced"
      : freshness.healthy
        ? `complete through ${freshness.asOfSettledDate} (${freshness.stats?.corpusRows ?? "?"} rows, ${freshness.stats?.lagDays ?? "?"}-day lag)`
        : (freshness.problems ?? []).join("; "));

  add("calibrationArtifact",
    manifest == null ? "UNAVAILABLE" : "READY",
    manifest == null
      ? "no calibrator manifest"
      : `${manifest.calibratorVersion}, fitted through ${manifest.fitWindow?.to}, held out on ${manifest.heldOutWindow?.rows?.toLocaleString?.() ?? "?"} rows`);

  add("marketRegistry",
    registry == null ? "UNAVAILABLE" : "READY",
    registry == null ? "no registry artifact" : `as of ${registry.asOfSettledDate}, ${registry.totalDecisiveRows?.toLocaleString?.()} decisive rows`);

  add("dailyResearchBrief",
    brief == null ? "UNAVAILABLE" : "READY",
    brief == null ? "no brief artifact" : `newest settled date ${brief.date}`);

  /*
   * P185 — CURRENT quarantine reddens; a HISTORICAL one does not, and the difference is the point.
   *
   * This stage used to go QUARANTINED whenever `quarantined.length > 0` — any refused slate
   * anywhere in history. 2026-07-28 is permanently quarantined (its board predates the doubleheader
   * integrity guard, so two halves could not be told apart), which pinned this stage, and therefore
   * the WORST-OF overall signal, at "Withheld" forever. Four stages reported OK and settlement was
   * current through the newest slate, and the headline could never go green again.
   *
   * A headline that can never be green stops carrying information: a reader cannot separate "one
   * historical date is permanently withheld, everything current is fine" from "settlement is broken
   * right now", which is the exact confusion this page exists to prevent.
   *
   * The reframe that resolves it without weakening anything: a permanently withheld historical date
   * is the integrity gate SUCCEEDING. Reporting it as a standing failure inverts the meaning of the
   * thing it is reporting. What must still redden is a quarantine that is BLOCKING — one at or
   * after the newest settled date, meaning settlement has not moved past it.
   *
   * Fail-closed is preserved in both directions: a current quarantine still reports QUARANTINED and
   * still dominates worst-of, and the historical dates stay fully disclosed — named in this stage's
   * detail line and listed in full in the contract's `quarantines` block, which the page renders as
   * its own "Withheld slates" section.
   */
  const settledThrough = freshness?.asOfSettledDate ?? null;
  const isBlocking = (q) => settledThrough == null || String(q.date) >= String(settledThrough);
  const blocking = quarantined.filter(isBlocking);
  const historical = quarantined.filter((q) => !isBlocking(q));

  add("latestSettlement",
    blocking.length > 0 ? "QUARANTINED" : freshness?.healthy ? "READY" : "UNAVAILABLE",
    blocking.length > 0
      ? `${blocking.map((q) => q.date).join(", ")} refused by the settlement integrity gate — settlement has not moved past it`
      : historical.length > 0
        ? `settled through ${settledThrough ?? "unknown"}; ${historical.length} earlier date${historical.length === 1 ? "" : "s"} permanently withheld by the integrity gate (${historical.map((q) => q.date).join(", ")}) and excluded from every rate`
        : `settled through ${settledThrough ?? "unknown"}`);

  // Worst-of, deliberately. An average would let one failure hide behind four successes.
  const RANK = { UNAVAILABLE: 4, FAILED: 4, STALE: 3, QUARANTINED: 2, DELAYED_WITHIN_GRACE: 1, DUE: 1, READY: 0 };
  const worst = stages.reduce((a, s) => (RANK[s.state] > RANK[a.state] ? s : a), stages[0]);
  return {
    overall: worst.state === "READY" ? "READY" : worst.state,
    overallReason: worst.state === "READY" ? "every stage reported ready" : `${worst.stage} is ${worst.state}`,
    stages,
  };
}

/**
 * The public-safe daily brief.
 *
 * Internal diagnostics and hypotheses stay internal. What ships is population accounting, measured
 * rates with denominators, and an explicit statement of what must NOT be concluded — because a brief
 * that only says what was learned reads as a claim.
 */
function publicBrief(report, rows) {
  if (!report || report.status !== "OK") return null;
  const day = rows.filter((r) => r.date === report.date);
  const brier = (pick) => (day.length ? day.reduce((a, r) => a + (pick(r) - r.y) ** 2, 0) / day.length : null);

  return {
    date: report.date,
    decisiveRows: report.decisiveRows,
    wins: report.wins,
    decisiveHitRate: report.observedRate,
    meanStatedProbability: report.meanPredicted,
    meanMarketProbability: report.meanMarketPredicted,
    calibrationErrorPp: report.calibrationErrorPp,
    scoring: { modelBrier: brier((r) => r.p), marketBrier: brier((r) => r.q), rowsScored: day.length },
    byMarketFamily: report.byMarket.map((m) => ({
      market: m.market, n: m.n, hitRate: m.hitRate,
      calibrationErrorPp: m.calibrationErrorPp, sufficientSample: m.sufficientSample,
    })),
    observations: report.observations,
    whatShouldNotBeConcluded: [
      "One settled date is not evidence of a change in model quality — day-to-day swings in this corpus are larger than most effects worth chasing.",
      "A market family with fewer than 100 rows on a date cannot be read at all.",
      "None of these figures relate to the separate paper-money record, which covers different dates entirely.",
    ],
    caveat: report.caveat,
  };
}

export function build() {
  const rows = loadRows();
  const freshness = readJson(path.join(INTERNAL, "learning-freshness.json"));
  const manifest = readJson(path.join(INTERNAL, "calibrator-manifest.json"));
  const registryArtifact = readJson(path.join(INTERNAL, "registry.json"));
  const quarantined = quarantines();

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const newest = dates[dates.length - 1] ?? null;
  const report = newest ? autopsy(rows, newest) : null;
  const brief = publicBrief(report, rows);

  const registry = registryArtifact?.markets ?? marketRegistry(rows);
  const counts = { APPROVED: 0, MONITOR: 0, RECALIBRATE: 0, DISABLED: 0 };
  for (const v of Object.values(registry)) counts[v.status] = (counts[v.status] ?? 0) + 1;

  const wins = rows.reduce((a, r) => a + r.y, 0);
  const status = systemStatus({ freshness, registry: registryArtifact, brief, manifest, quarantined });

  const summary = {
    kind: "public-research-terminal-summary",
    schemaVersion: 1,
    asOfSettledDate: newest,
    positioning: {
      product: "sports research terminal",
      posture: "paper-only, educational, public beta",
      whatWeCompare: [
        "what the sportsbook market says",
        "what the simulation says",
        "how historical calibration changes the interpretation",
        "what actually happened afterward",
      ],
    },
    modelUniverse: {
      // Deliberately labelled. This is the research population — NOT the paper-money record, which
      // covers entirely different dates and must never be placed beside it for comparison.
      label: "model research universe",
      decisiveRows: rows.length,
      wins,
      hitRate: rows.length ? wins / rows.length : null,
      dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : null,
      meanStatedProbability: rows.length ? rows.reduce((a, r) => a + r.p, 0) / rows.length : null,
      overconfidencePp: rows.length ? 100 * (rows.reduce((a, r) => a + r.p, 0) / rows.length - wins / rows.length) : null,
      separateFromPaperRecord:
        "The paper-money record is a different product, over different dates, with a different denominator. The two are never combined.",
    },
    calibration: manifest
      ? {
          version: manifest.calibratorVersion,
          fitWindow: manifest.fitWindow,
          heldOutWindow: manifest.heldOutWindow,
          evaluation: manifest.heldOutEvaluation,
          plainLanguage: [
            "The raw simulation is systematically overconfident — it has stated about 59% and won about 50%.",
            "Calibration maps those stated probabilities onto what actually happened, so the number you see is closer to true.",
            "Calibration does not create new predictive information. It corrects how confident we sound, not what we know.",
            "On the same held-out results, the sportsbook's own no-vig price still scored more accurately than ours.",
          ],
        }
      : null,
    registry: {
      counts,
      noneApproved: counts.APPROVED === 0,
      // The empty-APPROVED state needs an explanation, not an apology. Silence here reads as a bug.
      statusNote:
        "Status reflects measured historical evidence, not preference. No MLB market currently meets the APPROVED bar; a market is only DISABLED when a large sample sits entirely below break-even.",
      markets: Object.fromEntries(Object.entries(registry).map(([m, v]) => [m, {
        status: v.status, n: v.n, hitRate: v.hitRate, hitRate95: v.hitRate95,
        overconfidencePp: v.overconfidencePp, rationale: v.rationale,
        recentTrend: v.recentTrend ?? null,
      }])),
    },
    quarantines: quarantined,
    systemStatus: status,
    dailyBrief: brief,
  };

  return { summary, status, brief };
}

// ── self-test ──────────────────────────────────────────────────────────────────

export function selfTest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  const { summary, status } = build();

  ok(summary.modelUniverse.decisiveRows > 1000, "the model universe must be populated");
  ok(summary.modelUniverse.separateFromPaperRecord.length > 40, "the paper-record separation must be stated");
  ok(summary.registry.counts.APPROVED === 0, "no market is currently APPROVED — if this changes it needs its own evidence");
  ok(summary.registry.statusNote.length > 60, "an empty APPROVED set needs an explanation, not silence");

  // The DISABLED market must remain visible with its record.
  const disabled = Object.entries(summary.registry.markets).filter(([, v]) => v.status === "DISABLED");
  ok(disabled.length > 0, "batter_total_bases should be DISABLED in the current corpus");
  for (const [m, v] of disabled) {
    ok(v.n > 0 && v.hitRate != null, `${m} must keep its measured record while disabled`);
  }

  // Quarantine must be explicit.
  ok(summary.quarantines.length > 0, "2026-07-28 must appear as quarantined");
  for (const q of summary.quarantines) {
    ok(q.status === "QUARANTINED", "a refused slate must be labelled QUARANTINED");
    ok(q.publicExplanation.length > 80, "a quarantine needs a user-readable explanation");
    ok(!("hitRate" in q), "a quarantined date must never carry a hit rate");
  }

  // System status must be worst-of, not an average.
  ok(status.stages.length >= 5, "every stage must report independently");
  const worstRank = { UNAVAILABLE: 4, FAILED: 4, STALE: 3, QUARANTINED: 2, READY: 0 };
  const anyBad = status.stages.some((s) => (worstRank[s.state] ?? 0) > 0);
  ok(!anyBad || status.overall !== "READY", "one bad stage must not be hidden behind an overall READY");

  /*
   * P185 — the quarantine split, proven in both directions on synthetic inputs.
   *
   * The risk in letting a historical quarantine stop reddening the headline is obvious: it is one
   * edit away from letting a CURRENT one stop reddening it too. So both directions are exercised
   * here rather than trusted, against the same function the real contract uses.
   */
  {
    const fresh = { healthy: true, asOfSettledDate: "2026-08-17", stats: {} };
    const base = { freshness: fresh, registry: { asOfSettledDate: "x", totalDecisiveRows: 1 },
                   brief: { date: "2026-08-17" }, manifest: { calibratorVersion: "v", fitWindow: {}, heldOutWindow: { rows: 1 } } };

    // HISTORICAL: settlement has moved past it → the gate worked, the headline is not pinned.
    const hist = systemStatus({ ...base, quarantined: [{ date: "2026-07-28" }] });
    const histStage = hist.stages.find((x) => x.stage === "latestSettlement");
    ok(histStage.state === "READY", "a quarantine older than the newest settled date must not pin the stage");
    ok(hist.overall === "READY", "a historical quarantine must not redden the headline forever");
    ok(/permanently withheld/.test(histStage.detail), "a historical quarantine must still be NAMED in the detail line");
    ok(/2026-07-28/.test(histStage.detail), "the withheld date itself must still be disclosed");

    // BLOCKING: at or after the newest settled date → settlement has NOT moved past it.
    for (const d of ["2026-08-17", "2026-08-18"]) {
      const cur = systemStatus({ ...base, quarantined: [{ date: d }] });
      const curStage = cur.stages.find((x) => x.stage === "latestSettlement");
      ok(curStage.state === "QUARANTINED", `a quarantine at/after the settled date (${d}) must report QUARANTINED`);
      ok(cur.overall !== "READY", `a blocking quarantine (${d}) must still redden the headline`);
    }

    // Mixed: one blocking beside one historical still reddens.
    const mixed = systemStatus({ ...base, quarantined: [{ date: "2026-07-28" }, { date: "2026-08-18" }] });
    ok(mixed.overall !== "READY", "a blocking quarantine must redden even when a historical one is present");

    // No settled date known → cannot prove a quarantine is historical, so it must be treated as blocking.
    const unknown = systemStatus({ ...base, freshness: { healthy: true, asOfSettledDate: null, stats: {} },
                                  quarantined: [{ date: "2026-07-28" }] });
    ok(unknown.overall !== "READY", "with no settled date, a quarantine must be assumed blocking (fail closed)");
  }
  for (const s of status.stages) ok(s.detail && s.detail.length > 5, `${s.stage} needs a detail line`);

  // Calibration copy must state the limitation.
  if (summary.calibration) {
    const joined = summary.calibration.plainLanguage.join(" ");
    ok(/does not create new predictive information/i.test(joined), "calibration copy must state what it does NOT do");
    ok(/scored more accurately than ours/i.test(joined), "and that the market still scored better");
    ok(!/\bedge\b|\block\b|\bguarantee|\bbeat the market\b/i.test(joined), "no prohibited language");
  }

  // The public brief must carry its denominators and its do-not-conclude list.
  if (summary.dailyBrief) {
    ok(summary.dailyBrief.decisiveRows > 0, "the brief needs a denominator");
    ok(summary.dailyBrief.whatShouldNotBeConcluded.length >= 3, "the brief must say what NOT to conclude");
  }

  return fails;
}

// ── main ───────────────────────────────────────────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) {
    const fails = selfTest();
    if (fails.length) {
      console.error(`SELF-TEST FAILED — ${fails.length}:`);
      for (const f of fails) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log("self-test ok — quarantine is explicit, the disabled market keeps its record, and one bad stage cannot hide behind an overall READY");
    return;
  }

  const { summary, status, brief } = build();

  if (process.argv.includes("--write")) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "terminal-summary.json"), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "system-status.json"), JSON.stringify(status, null, 2));
    if (brief) fs.writeFileSync(path.join(OUT_DIR, "daily-brief.json"), JSON.stringify(brief, null, 2));
    console.log(`wrote ${path.relative(REPO, OUT_DIR)}/{terminal-summary,system-status,daily-brief}.json`);
    return;
  }

  console.log(`=== public research terminal · as of ${summary.asOfSettledDate} ===`);
  console.log(`  model universe: ${summary.modelUniverse.decisiveRows.toLocaleString()} decisive rows, ` +
    `${(summary.modelUniverse.hitRate * 100).toFixed(2)}% (${summary.modelUniverse.overconfidencePp.toFixed(2)}pp overconfident)`);
  console.log(`  registry: ${JSON.stringify(summary.registry.counts)}`);
  console.log(`  quarantined: ${summary.quarantines.map((q) => q.date).join(", ") || "none"}`);
  console.log(`  system status: ${status.overall} — ${status.overallReason}`);
  for (const s of status.stages) console.log(`     ${s.stage.padEnd(22)} ${s.state.padEnd(12)} ${s.detail}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
