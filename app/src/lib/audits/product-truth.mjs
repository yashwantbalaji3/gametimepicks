/**
 * Cross-surface product-truth audit — pure reconciliation over authoritative artifacts
 * (Program 160 · Release A).
 *
 * ONE OWNER PER FACT. The protected portfolio artifact owns the money truth (record, bankroll,
 * crown, exposure); daily-portfolio, boards, and capture artifacts are CONSUMERS whose copies
 * must agree byte-for-byte or the audit fails closed naming the exact mismatch. Presentation
 * surfaces read these same artifacts verbatim, so agreement here is agreement everywhere the
 * figures appear — the audit never recomputes product truth, it only compares copies.
 *
 * KNOWN EXCEPTIONS carry stable ids, rationale, evidence, and a review condition — and they can
 * only ever excuse their OWN named mismatch class, never a new one.
 *
 * PURE: explicit now + artifact inputs (injectable for corruption tests), stable ordering,
 * same inputs → same bytes, no network, no clocks, no product mutation.
 */
import fs from "node:fs";
import path from "node:path";

export const PRODUCT_TRUTH_VERSION = 1;

/** Intentional, documented divergences. An exception excuses exactly its `matches` class. */
export const KNOWN_EXCEPTIONS = Object.freeze([
  {
    id: "products-precede-morning-board",
    matches: "money-ahead-of-board",
    rationale: "the daily-products morning skeleton stamps TODAY (~09:39 ET) before today's board generates (~11:51 ET) — the money date may lead the newest board by at most one day inside that window (observed live in receipt-#2 aftermath, Program 161)",
    evidence: "daily-products run 13:39 UTC vs board generation ~15:51 UTC on 2026-08-11; admin-status guard carries the same bound",
    review: "re-examine if the lead ever exceeds one day or persists past board generation",
    maxLeadDays: 1,
  },
  {
    id: "money-lags-newest-board",
    matches: "slate-date-lag",
    rationale: "the money state settles overnight while the board generates in the morning — daily-portfolio.date may trail the newest board by one day during the settle window (Program 124/151 lesson)",
    evidence: "gtp-july24-slate-recovery memory; nightly-settle then morning generation ordering",
    review: "re-examine if the lag ever exceeds one calendar day",
    maxLagDays: 1,
  },
]);

const readJson = (root, rel) => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { return null; } };

export function buildProductTruthAudit({ now, appRoot, artifacts = null }) {
  if (!now || !Number.isFinite(Date.parse(now))) throw new Error("buildProductTruthAudit: now required");
  const a = artifacts ?? {
    portfolio: readJson(appRoot, "public/data/mr-dub/portfolio.json"),
    dailyPortfolio: readJson(appRoot, "public/data/mr-dub/daily-portfolio.json"),
    ledger: readJson(appRoot, "public/data/mr-dub/ledger.json"),
    newestBoardDate: (() => { try { return fs.readdirSync(path.join(appRoot, "public/data/mlb/boards")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-1)[0]?.slice(0, 10) ?? null; } catch { return null; } })(),
    captures: {
      nfl: readJson(appRoot, "public/data/nfl/schedule/latest.json"),
      nba: readJson(appRoot, "public/data/nba/schedule/latest.json"),
      ufc: readJson(appRoot, "public/data/ufc/schedule/latest.json"),
      eplResults: readJson(appRoot, "public/data/soccer/epl/results/latest.json"),
      nflResults: readJson(appRoot, "public/data/nfl/results/latest.json"),
    },
  };

  const facts = [];
  const contradictions = [];
  const exceptionsApplied = [];
  const fail = (id, summary) => { if (!contradictions.some((c) => c.id === id)) contradictions.push({ id, summary, severity: "P0" }); };
  const fact = (name, owner, value, consumers) => facts.push({ name, owner, value, consumers });

  if (!a.portfolio) fail("missing-portfolio", "the authoritative money artifact is missing — nothing downstream can be trusted");
  else {
    const p = a.portfolio;
    const record = `${p.record?.wins}-${p.record?.losses}`;
    fact("paper-record", "portfolio.json", record, ["header strip", "homepage", "mr-dub"]);
    fact("bankroll", "portfolio.json", p.currentBankroll, ["header strip", "mr-dub", "daily-portfolio"]);
    fact("crown-peak", "portfolio.json", p.crownBankroll, ["header strip", "bank-builder", "daily-portfolio"]);
    fact("open-exposure", "portfolio.json", p.openExposure, ["mr-dub", "daily-portfolio"]);
    // Internal coherence of the authority itself.
    if ((p.record?.pending ?? 0) === 0 && p.openExposure !== 0) fail("exposure-without-pending", `openExposure ${p.openExposure} with zero pending legs — exposure must be zero when nothing is pending`);
    if ((p.record?.pending ?? 0) > 0 && p.openExposure === 0) fail("pending-without-exposure", `${p.record.pending} pending legs with zero exposure — a pending leg stakes money`);

    if (a.dailyPortfolio) {
      const d = a.dailyPortfolio;
      if (d.activeBankroll !== p.currentBankroll) fail("bankroll-mismatch", `daily-portfolio.activeBankroll ${d.activeBankroll} ≠ portfolio.currentBankroll ${p.currentBankroll}`);
      if (d.crownBankroll !== p.crownBankroll) fail("crown-mismatch", `daily-portfolio.crownBankroll ${d.crownBankroll} ≠ portfolio.crownBankroll ${p.crownBankroll}`);
      if (d.openExposure !== p.openExposure) fail("exposure-mismatch", `daily-portfolio.openExposure ${d.openExposure} ≠ portfolio.openExposure ${p.openExposure}`);
      // Slate-date coherence with the ONE documented exception.
      if (a.newestBoardDate && d.date && d.date < a.newestBoardDate) {
        const lagDays = Math.round((Date.parse(a.newestBoardDate) - Date.parse(d.date)) / 86400000);
        const ex = KNOWN_EXCEPTIONS.find((x) => x.matches === "slate-date-lag");
        if (ex && lagDays <= ex.maxLagDays) exceptionsApplied.push({ id: ex.id, detail: `daily-portfolio ${d.date} trails newest board ${a.newestBoardDate} by ${lagDays}d — inside the documented settle-window lag` });
        else fail("slate-date-lag-exceeded", `daily-portfolio ${d.date} trails newest board ${a.newestBoardDate} by ${lagDays}d — beyond the documented 1-day settle lag`);
      }
      if (a.newestBoardDate && d.date && d.date > a.newestBoardDate) {
        const leadDays = Math.round((Date.parse(d.date) - Date.parse(a.newestBoardDate)) / 86400000);
        const exF = KNOWN_EXCEPTIONS.find((x) => x.matches === "money-ahead-of-board");
        if (exF && leadDays <= exF.maxLeadDays) exceptionsApplied.push({ id: exF.id, detail: `daily-portfolio ${d.date} leads newest board ${a.newestBoardDate} by ${leadDays}d — inside the documented morning window` });
        else fail("money-ahead-of-board", `daily-portfolio ${d.date} is AHEAD of the newest board ${a.newestBoardDate} by ${leadDays}d — beyond the morning window, a future money state is fabrication`);
      }
    } else fail("missing-daily-portfolio", "daily-portfolio artifact missing while the portfolio exists");
  }

  // Capture freshness facts (windows the products themselves state).
  const hours = (iso) => (Date.parse(now) - Date.parse(iso ?? "")) / 3_600_000;
  for (const [sport, cap, window] of [["nfl", a.captures?.nfl, 7 * 24], ["nba", a.captures?.nba, 7 * 24], ["ufc", a.captures?.ufc, 7 * 24]]) {
    if (!cap) { fail(`missing-capture-${sport}`, `${sport} schedule capture missing while /sports renders it`); continue; }
    const age = hours(cap.generatedAt);
    fact(`${sport}-capture-age-hours`, `${sport}/schedule/latest.json`, Number(age.toFixed(1)), ["/sports"]);
    if (!Number.isFinite(age) || age < 0) fail(`capture-future-${sport}`, `${sport} capture is stamped in the future`);
    else if (age > window) contradictions.push({ id: `capture-stale-${sport}`, summary: `${sport} capture is ${age.toFixed(0)}h old (window ${window}h) — /sports will say stale; the cadence should have refreshed it`, severity: "P1" });
  }
  if (a.captures?.eplResults) {
    const st = a.captures.eplResults.state;
    fact("epl-results-state", "soccer/epl/results/latest.json", st, ["/sports", "settlement readiness"]);
    if (st === "RESULTS" && (a.captures.eplResults.rows ?? []).length === 0) fail("epl-results-empty-claim", "EPL results state RESULTS with zero rows — a claim without content");
  }
  if (a.captures?.nflResults) {
    const st = a.captures.nflResults.state;
    fact("nfl-results-state", "nfl/results/latest.json", st, ["settlement readiness"]);
    if (st === "RESULTS" && (a.captures.nflResults.rows ?? []).length === 0) fail("nfl-results-empty-claim", "NFL results state RESULTS with zero rows — a claim without content");
  }

  contradictions.sort((x, y) => (x.severity === y.severity ? x.id.localeCompare(y.id) : x.severity === "P0" ? -1 : 1));
  return {
    schemaVersion: PRODUCT_TRUTH_VERSION,
    artifact: "product-truth-audit",
    dataClass: "PRIVATE_AUDIT",
    generatedAt: now,
    facts,
    contradictions,
    exceptionsApplied,
    totals: { facts: facts.length, contradictions: contradictions.length, p0: contradictions.filter((c) => c.severity === "P0").length, exceptions: exceptionsApplied.length },
  };
}
