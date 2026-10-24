#!/usr/bin/env node
/**
 * NBA SLATE READINESS — one row per game, ten checks, from the committed artifacts (and, with --production, the bytes
 * Production serves). READ-ONLY: writes nothing, dispatches nothing, fetches only public pages (GET, ops user-agent).
 * Founder mandate 2026-10-24 (release owner): NBA publicly usable end-to-end before the first tip.
 *
 *   npx tsx scripts/nba/slate-readiness.mjs --date 2026-10-24 [--production] [--json <file outside the repo>] [--now ISO]
 *
 * Reconciles the slate's game count across the schedule captures, the official v0.1 receipts and the public lane FIRST,
 * then per game:
 *   1 identity      same providerEventId and away/home codes in schedule, receipt, lane and Theater artifact
 *   2 inputs        injuries sourceAsOf, rosters asOf and schedule capture all at or before the receipt instant
 *   3 freeze        receipt integrity OK (payload hash) and generatedAt strictly before tip (preTip)
 *   4 elo           lane side = receipt publishedSide; when the lane carries elo.winProbability: receipt-exact pHome/pAway
 *                   and provenance (frozenAt + receipt payload sha)
 *   5 players       lane rows re-derive from the receipt (snapshotMatchesSource) and both sides have rows; Top Boards
 *                   day file holds the game
 *   6 theater       stored run validates; the PUBLIC replay gate (embedded panel) and side constraint pass. The internal
 *                   @1 consistency check is reported separately (known @1 drift → PR 1224, @2 from 2026-10-25)
 *   7 public data   the game is in the dated lane file and latest.json is the newest dated slate
 *   8 on time       the lane day file's first commit is before the slate's first tip
 *   9 production    (--production) /nba/, the Theater page and both boards serve the game (and its Elo row when the lane
 *                   carries one, with the same receipt value); a Vercel bot challenge is UNKNOWN, never a pass
 *  10 finals       the final is recorded / graded, or the game is still ahead (graded by the next sport-schedules run)
 * States: OK · WARN (honest, known, non-blocking) · FAIL · PENDING (not yet possible) · UNKNOWN (could not tell).
 * Exit 1 on any FAIL; 0 otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { receiptIntegrity } from "../../src/lib/sports/nba/forecast-receipt.mjs";
import { snapshotMatchesSource } from "../../src/lib/sports/nba/experimental-public-lane.mjs";
import { eloWinProbabilityOf } from "../../src/lib/sports/nba/elo-win-probability.mjs";
import { readPossessionArtifact, validatedGame, replayGateProblems, sideConstraintProblem } from "../../src/lib/simulation-theater/nba/possession/stored-run.mjs";
import { NBA_THEATER_REPLAY_ENGINE } from "../../src/lib/consistency/theater-replay-engine.mjs";
import { nbaOfficialSnapshot } from "../../src/lib/consistency/official-snapshot.mjs";
import { isBotChallenge } from "../../src/lib/deployment-verification.mjs";
import { loadRosterIndex } from "../../src/lib/sports/nba/roster-index.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const ORIGIN = "https://gametimepicks.yashwantbalaji.com";
const UA = "gametimepicks-ops-slate-readiness (bot@users.noreply.github.com)";
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etDate = (iso) => ET.format(new Date(iso));
const readJson = (abs) => { try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch { return null; } };
const t = (iso) => Date.parse(iso ?? "");
const S = { OK: "OK", WARN: "WARN", FAIL: "FAIL", PENDING: "PENDING", UNKNOWN: "UNKNOWN" };
const cell = (state, note = "") => ({ state, note });

/** Every schedule capture's rows for `date` (union), so a game a later capture dropped is still reconciled. Pure-ish. */
export function scheduleRowsFor(date, captures) {
  const by = new Map();
  for (const c of captures) for (const r of c?.rows ?? []) if (r?.seasonType === 2 && r.dateUtc && etDate(r.dateUtc) === date) by.set(String(r.providerEventId), r);
  return [...by.values()].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
}

/** Count reconciliation across schedule, receipts and lane. Pure. */
export function reconcile({ scheduleIds, receiptIds, laneIds, laneExcludedIds = [] }) {
  const all = [...new Set([...scheduleIds, ...receiptIds, ...laneIds])].sort();
  const missing = (have) => all.filter((id) => !have.includes(id));
  return { schedule: scheduleIds.length, receipts: receiptIds.length, lane: laneIds.length, laneExcluded: laneExcludedIds.length,
    noReceipt: missing(receiptIds), notInLane: missing(laneIds).filter((id) => !laneExcludedIds.includes(id)), notScheduled: missing(scheduleIds) };
}

/** Checks 1–8 and 10 for one game from committed artifacts. Pure given its inputs. */
export function gameChecks({ id, sched, rec, laneGame, laneDoc, theaterRead, offSrc, supSrc, boards, final, ledgerEntry, nowMs, rosters = null }) {
  const c = {};
  const r = rec?.receipt ?? null, f = rec?.forecast ?? null;
  const codes = (x) => [x?.away?.abbr ?? x?.away?.tricode ?? null, x?.home?.abbr ?? x?.home?.tricode ?? null].join("@");
  // 1 identity
  const tg = theaterRead?.doc?.games?.find((g) => String(g.providerEventId) === id) ?? null;
  const ids = [sched && codes(sched), rec && codes(rec), laneGame && codes(laneGame), tg && codes(tg)].filter(Boolean);
  c.identity = !sched ? cell(S.FAIL, "not on any schedule capture") : !rec ? cell(S.FAIL, "no official receipt") : new Set(ids).size === 1 ? cell(S.OK, ids[0]) : cell(S.FAIL, `codes differ: ${[...new Set(ids)].join(" vs ")}`);
  if (!rec) { for (const k of ["inputs", "freeze", "elo", "players", "theater", "publicData", "onTime"]) c[k] = cell(S.FAIL, "no receipt"); }
  else {
    // 2 inputs at or before the freeze
    const at = t(r.generatedAt), i = r.inputs ?? {};
    const late = [["injuries", i.injuries?.sourceAsOf ?? i.injuries?.generatedAt], ["rosters", i.rosters?.asOf], ["schedule", i.schedule?.generatedAt]].filter(([, v]) => !(t(v) <= at));
    const rosterAgeH = Number.isFinite(t(i.rosters?.asOf)) ? Math.round((at - t(i.rosters.asOf)) / 36e5) : null;
    c.inputs = late.length ? cell(S.FAIL, `after the freeze or missing: ${late.map(([k, v]) => `${k} ${v ?? "—"}`).join(", ")}`)
      : cell(i.injuries?.state === "CURRENT" ? S.OK : S.WARN, `injuries ${i.injuries?.state ?? "?"} · rosters ${rosterAgeH}h old · schedule ${i.schedule?.generatedAt ?? "?"}`);
    // 3 freeze
    const integ = receiptIntegrity(rec);
    c.freeze = integ.state !== "OK" ? cell(S.FAIL, `receipt ${integ.state}`) : r.preTip === true && at < t(rec.dateUtc) ? cell(S.OK, `${r.generatedAt} < tip ${rec.dateUtc}`) : cell(S.FAIL, `not pre-tip (${r.generatedAt} vs ${rec.dateUtc})`);
    // 4 elo
    const side = f?.publishedSide === "HOME" ? rec.home?.abbr : f?.publishedSide === "AWAY" ? rec.away?.abbr : null;
    if (!laneGame) c.elo = cell(S.PENDING, "not in the lane yet");
    else if ((laneGame.elo?.favoured ?? null) !== side) c.elo = cell(S.FAIL, `lane side ${laneGame.elo?.favoured} ≠ receipt ${side}`);
    else if (!laneGame.elo?.winProbability) c.elo = cell(S.OK, `side ${side ?? "TOO_CLOSE"} (no Elo estimate field in this lane)`);
    else {
      const w = laneGame.elo.winProbability, v = eloWinProbabilityOf(laneGame, { enabled: true });
      const exact = Object.is(w.home, f.elo.pHome) && Object.is(w.away, f.elo.pAway) && w.provenance?.frozenAt === r.generatedAt && w.provenance?.receiptPayloadSha256 === r.payloadSha256;
      c.elo = exact && v ? cell(S.OK, `side ${side} · pHome ${w.home} · ${v.awayAbbr} ${v.awayPct}% · ${v.homeAbbr} ${v.homePct}%`) : cell(S.FAIL, `estimate not receipt-exact or refused by the accessor (pHome ${w.home} vs ${f.elo.pHome})`);
    }
    // 5 players + boards
    const rows = laneGame ? [laneGame.players?.away?.length ?? 0, laneGame.players?.home?.length ?? 0] : [0, 0];
    const onBoard = (boards?.rows ?? boards?.boards ?? boards?.entries ?? []).length === 0 ? null : JSON.stringify(boards).includes(id);
    c.players = !laneGame ? cell(S.PENDING, "not in the lane yet") : !snapshotMatchesSource(laneGame, rec, { rosters }) ? cell(S.FAIL, "lane rows do not re-derive from the receipt")
      : rows[0] && rows[1] ? cell(onBoard === false ? S.WARN : S.OK, `${rows[0]}+${rows[1]} player rows${onBoard == null ? " · Top Boards file absent" : onBoard ? " · on Top Boards" : " · not on Top Boards"}`) : cell(S.FAIL, `a side has no player rows (${rows.join("+")})`);
    // 6 theater (public replay gate) + internal @1 consistency (reported, known drift)
    if (!tg) c.theater = cell(laneGame ? S.FAIL : S.PENDING, "no stored possession run");
    else {
      const v = validatedGame(theaterRead, id);
      const panel = tg.official?.panel ?? null;
      const gate = v.ok ? replayGateProblems(theaterRead, id, { snapshotId: panel?.snapshotId, frozenAt: panel?.frozenAt }, { approvedEngineId: NBA_THEATER_REPLAY_ENGINE.id }) : [{ code: v.code }];
      const sideP = v.ok ? sideConstraintProblem(v.game, panel?.favouredSide ?? null) : null;
      let internal = "—";
      try { internal = nbaOfficialSnapshot(id, { official: offSrc, supporting: supSrc }).snapshotId === tg.official?.snapshotId ? "@1 consistent" : "@1 drift (known; PR 1224)"; } catch (e) { internal = `refused ${e.code ?? e.message}`; }
      c.theater = gate.length || sideP ? cell(S.FAIL, `replay gate ${gate.map((x) => x.code).join(",") || "ok"}${sideP ? ` · side ${sideP}` : ""}`) : cell(S.OK, `replay gate open · ${tg.inputs?.basis ?? "?"} · internal ${internal}`);
    }
    // 7 public data
    c.publicData = !laneDoc ? cell(S.PENDING, "no dated lane file yet") : laneGame ? cell(S.OK, `in lane ${laneDoc.date}`) : (laneDoc.excluded ?? []).some((x) => String(x.providerEventId) === id)
      ? cell(S.WARN, `EXCLUDED: ${(laneDoc.excluded.find((x) => String(x.providerEventId) === id) ?? {}).reason}`) : cell(S.FAIL, "not in the published lane");
  }
  // 10 finals / grading
  const tip = t(rec?.dateUtc ?? sched?.dateUtc);
  c.finals = final ? cell(ledgerEntry?.status === "GRADED" ? S.OK : S.PENDING, `final ${final.ftAway}-${final.ftHome} recorded · ledger ${ledgerEntry?.status ?? "no entry yet"}`)
    : nowMs < tip ? cell(S.PENDING, "game ahead — graded by the next sport-schedules run after its final") : cell(S.PENDING, `tipped; final not recorded yet · ledger ${ledgerEntry?.status ?? "no entry"}`);
  return c;
}

async function get(p) {
  try {
    const r = await fetch(`${ORIGIN}${p}`, { headers: { "User-Agent": UA, "cache-control": "no-cache" }, signal: AbortSignal.timeout(20000) });
    if (isBotChallenge({ status: r.status, headers: Object.fromEntries(r.headers.entries()) })) return { challenged: true };
    return { status: r.status, text: r.ok ? await r.text() : "" };
  } catch (e) { return { error: e.message }; }
}

/** Check 9 from served HTML. Pure given the pages. */
export function productionCheck({ id, date, pages, laneGame }) {
  const v = laneGame ? eloWinProbabilityOf(laneGame, { enabled: true }) : null;
  const attr = v ? `data-nba-elo-wp="${id}:${v.home}"` : null;
  const need = [["/nba/", `nba-exp-${id}`], ["/nba/projections/", null], [`/nba/projections/${date}/`, null], [`/nba/simulation/${id}/`, null]];
  const bad = [], unknown = [];
  for (const [p, marker] of need) {
    const r = pages[p];
    if (!r || r.challenged || r.error) { unknown.push(p); continue; }
    if (r.status !== 200) { bad.push(`${p} HTTP ${r.status}`); continue; }
    if (marker && !r.text.includes(marker)) bad.push(`${p} lacks the game card`);
    if (attr && !r.text.includes(attr)) bad.push(`${p} lacks the Elo row ${id}:${v.home}`);
  }
  return bad.length ? cell(S.FAIL, bad.join("; ")) : unknown.length ? cell(S.UNKNOWN, `could not read ${unknown.join(", ")}`) : cell(S.OK, attr ? `4 pages serve the game and the same Elo value` : "4 pages serve the game");
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
  const DATE = opt("--date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }
  const nowMs = t(opt("--now") ?? new Date().toISOString());
  const NBA = path.join(REPO, "data/internal/research/nba");
  const schedDir = path.join(APP, "public/data/nba/schedule");
  const captures = fs.readdirSync(schedDir).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(schedDir, f)));
  const sched = scheduleRowsFor(DATE, captures);
  const offPath = path.join(NBA, "experimental-v0.1/forecasts", `${DATE}.json`), supPath = path.join(NBA, "experimental-v1/forecasts", `${DATE}.json`);
  const offBytes = fs.existsSync(offPath) ? fs.readFileSync(offPath) : null, supBytes = fs.existsSync(supPath) ? fs.readFileSync(supPath) : null;
  const sha = (b) => (b ? crypto.createHash("sha256").update(b).digest("hex") : null);
  const off = offBytes ? JSON.parse(offBytes) : null;
  const offSrc = off ? { doc: off, path: path.relative(REPO, offPath), sha256: sha(offBytes) } : null;
  const supSrc = supBytes ? { doc: JSON.parse(supBytes), path: path.relative(REPO, supPath), sha256: sha(supBytes) } : null;
  const laneDir = path.join(APP, "public/data/nba/experimental-public");
  const laneDoc = readJson(path.join(laneDir, `${DATE}.json`));
  const latest = readJson(path.join(laneDir, "latest.json"));
  const theaterRead = readPossessionArtifact(REPO, DATE);
  const boards = readJson(path.join(NBA, "top-boards/v0.1", `${DATE}.json`));
  const finals = readJson(path.join(APP, "public/data/nba/results/finals-2026-27.json"));
  const ledger = readJson(path.join(NBA, "experimental-v0.1/ledger.json"));
  // a lane carrying positions / the unavailable list re-derives only against the receipt's own roster capture (by sha)
  const ROSTERS = loadRosterIndex(REPO);
  const recon = reconcile({ scheduleIds: sched.map((r) => String(r.providerEventId)), receiptIds: (off?.games ?? []).map((g) => String(g.providerEventId)), laneIds: (laneDoc?.games ?? []).map((g) => g.providerEventId), laneExcludedIds: (laneDoc?.excluded ?? []).map((x) => String(x.providerEventId)) });
  const firstTip = sched.length ? sched[0].dateUtc : null;
  let laneCommit = null;
  try { laneCommit = execFileSync("git", ["log", "--diff-filter=A", "--format=%H %cI", "--", `app/public/data/nba/experimental-public/${DATE}.json`], { cwd: REPO, encoding: "utf8" }).trim().split("\n").filter(Boolean).at(-1) ?? null; } catch { /* no git */ }
  const laneAt = laneCommit ? laneCommit.split(" ")[1] : null;
  const ids = [...new Set([...sched.map((r) => String(r.providerEventId)), ...(off?.games ?? []).map((g) => String(g.providerEventId))])];
  const rows = [];
  const pageCache = {};
  for (const id of ids) {
    const s = sched.find((r) => String(r.providerEventId) === id) ?? null;
    const rec = off?.games?.find((g) => String(g.providerEventId) === id) ?? null;
    const laneGame = laneDoc?.games?.find((g) => g.providerEventId === id) ?? null;
    const final = (finals?.finals ?? []).find((x) => String(x.providerEventId) === id) ?? null;
    const ledgerEntry = (ledger?.gradeEntries ?? []).filter((e) => String(e.providerEventId) === id).at(-1) ?? null;
    const c = gameChecks({ id, sched: s, rec, laneGame, laneDoc, theaterRead, offSrc, supSrc, boards, final, ledgerEntry, nowMs, rosters: ROSTERS });
    c.onTime = !laneAt ? cell(S.PENDING, "lane not committed yet") : t(laneAt) < t(firstTip) ? cell(S.OK, `lane first committed ${laneAt} < first tip ${firstTip}`) : cell(S.FAIL, `lane first committed ${laneAt} ≥ first tip ${firstTip}`);
    if (c.publicData.state === S.OK && latest?.date && latest.date < DATE) c.publicData = cell(S.FAIL, `latest.json still ${latest.date}`);
    if (argv.includes("--production")) {
      for (const p of ["/nba/", "/nba/projections/", `/nba/projections/${DATE}/`, `/nba/simulation/${id}/`]) pageCache[p] ??= await get(p);
      c.production = productionCheck({ id, date: DATE, pages: pageCache, laneGame });
    } else c.production = cell(S.PENDING, "run with --production after the Production build");
    rows.push({ id, matchup: s ? `${s.away?.abbr}@${s.home?.abbr}` : rec ? `${rec.away?.abbr}@${rec.home?.abbr}` : "?", tip: s?.dateUtc ?? rec?.dateUtc ?? null, checks: c });
  }
  const ORDER = ["identity", "inputs", "freeze", "elo", "players", "theater", "publicData", "onTime", "production", "finals"];
  const out = { date: DATE, firstTip, reconciliation: recon, laneFirstCommit: laneCommit, rows: rows.map((r) => ({ ...r, checks: Object.fromEntries(ORDER.map((k) => [k, r.checks[k]])) })) };
  const j = opt("--json");
  if (j) { if (path.resolve(j).startsWith(REPO)) { console.error("REFUSED: --json must be outside the repository"); process.exit(1); } fs.writeFileSync(j, JSON.stringify(out, null, 1)); }
  console.log(`NBA slate readiness · ${DATE} · first tip ${firstTip ?? "—"}`);
  console.log(`reconciliation: schedule ${recon.schedule} · receipts ${recon.receipts} · lane ${recon.lane} (+${recon.laneExcluded} excluded)${recon.noReceipt.length ? ` · NO RECEIPT ${recon.noReceipt.join(",")}` : ""}${recon.notInLane.length ? ` · NOT IN LANE ${recon.notInLane.join(",")}` : ""}${recon.notScheduled.length ? ` · NOT ON SCHEDULE ${recon.notScheduled.join(",")}` : ""}`);
  const short = { OK: "ok", WARN: "warn", FAIL: "FAIL", PENDING: "pend", UNKNOWN: "unk" };
  console.log(["event", "matchup", ...ORDER.map((k, i) => `${i + 1}`)].join("\t"));
  for (const r of out.rows) console.log([r.id, r.matchup, ...ORDER.map((k) => short[r.checks[k].state])].join("\t"));
  for (const r of out.rows) for (const k of ORDER) if (r.checks[k].state !== S.OK) console.log(`  ${r.id} ${k}: ${r.checks[k].state} — ${r.checks[k].note}`);
  if (out.rows.some((r) => ORDER.some((k) => r.checks[k].state === S.FAIL))) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
