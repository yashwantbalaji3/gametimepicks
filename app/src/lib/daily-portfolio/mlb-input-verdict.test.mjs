/**
 * Session 5 · Phase B — an MLB no-game / missing-input day fails MLB closed without failing daily-products.
 * 2026-09-28: pool gate INPUT_MISSING → exit 20 → no receipts, no eligible legs (any sport), no projection or Ask
 * refresh. Fixed clocks and fixtures; one LIVE check on the committed 09-28 / 10-02 inputs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

import { GATE } from "./pool-gate.mjs";
import { classifyMlbInput, MLB_INPUT as M } from "./mlb-input-verdict.mjs";

const missing = { verdict: GATE.INPUT_MISSING, detail: "mlb/team-markets/2026-09-28.json has not been written" };
const sched = (capturedAt, gameCount = 0, date = "2026-09-28") => ({ date, capturedAt, gameCount });
const NOW = "2026-09-28T16:00:00Z";

test("a usable slate, or the producer's valid empty slate, is READY — the existing path, unchanged", () => {
  assert.equal(classifyMlbInput({ gate: { verdict: GATE.OK, detail: "4 games" }, schedule: null, date: "2026-09-28", nowIso: NOW }).verdict, M.READY);
  assert.equal(classifyMlbInput({ gate: { verdict: GATE.INPUT_EMPTY, detail: "valid empty" }, schedule: null, date: "2026-09-28", nowIso: NOW }).verdict, M.READY);
});

test("NO_EVENTS only when a StatsAPI schedule captured ON the ET day says 0 games", () => {
  const r = classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T11:38:00Z"), date: "2026-09-28", nowIso: NOW });
  assert.equal(r.verdict, M.NO_EVENTS);
  assert.match(r.reason, /captured 2026-09-28T11:38:00Z lists 0 games/);
});

test("uncertain is INPUT_UNAVAILABLE — never a no-game day inferred from an old capture", () => {
  // The committed 09-28 file was captured 09-22; 10-02's on 09-26, before the postseason schedule existed.
  const old = classifyMlbInput({ gate: missing, schedule: sched("2026-09-22T09:58:04Z"), date: "2026-09-28", nowIso: NOW });
  assert.equal(old.verdict, M.INPUT_UNAVAILABLE);
  assert.match(old.reason, /not from 2026-09-28 itself/);
  // 2026-09-28T03:30Z is 23:30 on 09-27 in New York — the previous ET day.
  assert.equal(classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T03:30:00Z"), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE, "the ET day decides, not the UTC date");
  assert.equal(classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T11:38:00Z", 2), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE, "games scheduled and the priced slate missing is a producer gap");
  assert.equal(classifyMlbInput({ gate: missing, schedule: null, date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE);
  assert.equal(classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T11:38:00Z", 0, "2026-09-29"), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE);
  assert.equal(classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T17:00:00Z"), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE, "a capture from the future is not evidence");
  for (const v of [GATE.INPUT_STALE, GATE.INPUT_MALFORMED, GATE.INPUT_WRONG_DATE]) {
    assert.equal(classifyMlbInput({ gate: { verdict: v, detail: v }, schedule: sched("2026-09-28T11:38:00Z"), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE, `${v} is never a no-game day`);
  }
});

test("LIVE: the committed 2026-09-28 inputs classify INPUT_UNAVAILABLE (the capture saying 0 is from 09-22)", () => {
  const out = execFileSync("npx", ["tsx", "scripts/products/classify-mlb-input.mjs", "--date", "2026-09-28", "--now", "2026-09-28T18:45:00Z"], { encoding: "utf8" });
  assert.match(out, /mlb-input 2026-09-28: INPUT_UNAVAILABLE \(gate INPUT_MISSING\)/);
});

test("the receipt records INPUTS_MISSING with the classifier's reason and evaluates nothing", () => {
  const r = spawnSync("npx", ["tsx", "scripts/products/build-daily-product-receipts.mjs", "--now", "2026-09-28T18:45:00Z", "--date", "2026-09-28", "--dry-run", "--mlb-unavailable", "the priced slate is missing; no-game status cannot be established"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const line = r.stdout.split("\n").find((l) => l.startsWith("product receipt 2026-09-28:")) ?? "";
  for (const id of ["bank-builder", "moonshot"]) {
    assert.match(line, new RegExp(`\\b${id}=INPUTS_MISSING\\b`), `${id} must read INPUTS_MISSING:\n${r.stdout.slice(0, 800)}`);
  }
  assert.doesNotMatch(line, /\b(bank-builder|moonshot)=NO_PLAY\b/, "an unevaluated product is never a no-play");
});

test("CONTRACT: only MLB money steps depend on the verdict; the rest runs; the refusal is reported after the commit", () => {
  const wf = fs.readFileSync("../.github/workflows/daily-products.yml", "utf8");
  const step = (name) => { const i = wf.indexOf(`- name: ${name}`); assert.ok(i !== -1, `missing step: ${name}`); const j = wf.indexOf("\n      - name:", i + 10); return { i, body: wf.slice(i, j === -1 ? undefined : j) }; };
  const mlb = step("Generate MLB money products");
  assert.match(mlb.body, /verdict != 'INPUT_UNAVAILABLE' && steps\.mlb\.outputs\.verdict != 'OFF_SEASON'/, "D3: out of season, no MLB money product is generated");
  assert.match(mlb.body, /activate-daily-portfolio\.mjs --date "\$DATE" --apply/);
  const neutral = step("Generate sport-neutral products");
  assert.doesNotMatch(neutral.body, /steps\.mlb/, "sport-neutral products must not wait on MLB");
  for (const s of ["build-risk-ladder.mjs", "build-product-eligible-legs.mjs", "build-selector-shadow.mjs"]) assert.match(neutral.body, new RegExp(s.replace(".", "\\.")));
  assert.doesNotMatch(mlb.body, /build-product-eligible-legs|build-risk-ladder/, "the cross-sport universe and the ladder left the MLB block");
  for (const name of ["Write the daily product receipt", "Write the forward-coverage artifact", "Refresh the canonical projection chain", "Commit if anything changed"]) {
    assert.doesNotMatch(step(name).body.split("\n").slice(0, 3).join("\n"), /if:.*steps\.mlb/, `${name} must run whatever MLB's verdict`);
  }
  const receipt = step("Write the daily product receipt").body;
  assert.match(receipt, /MLB_REASON: \$\{\{ steps\.mlb\.outputs\.reason \}\}/, "the reason travels through env, never interpolated into shell text");
  assert.match(receipt, /ARGS\+=\(--mlb-unavailable "\$MLB_REASON"\)/);
  const last = step("MLB money products were not generated");
  assert.ok(last.i > step("Commit if anything changed").i, "the MLB failure is reported AFTER the other products are committed");
  assert.match(last.body, /verdict == 'INPUT_UNAVAILABLE'/);
  assert.match(last.body, /exit 1/);
  assert.doesNotMatch(wf.replace(/^\s*#.*$/gm, ""), /check-pool-ready\.mjs/, "the job no longer exits on the raw gate");
  /* Session 5 · B1b (found by the first dry run): the ladder-freshness assert also blocked the commit. */
  const assertStep = step("Assert this run produced its artifacts");
  assert.ok(assertStep.i > step("Commit if anything changed").i, "the ladder assert runs AFTER the commit — it must not block other products");
  assert.match(assertStep.body, /if: github\.event\.inputs\.dry_run != 'true'/);
  assert.ok(step("Refresh the canonical projection chain").i < step("Commit if anything changed").i);
});

/* ── SESSION 5 · FOUNDER DECISION D3 — MLB season state ─────────────────────────────────────────────────────────── */
import { deriveMlbSeasonState, seasonStateFor, remainingGames, MLB_SEASON as S } from "../mlb/season-state.mjs";

const SEASONS = { seasons: [{ seasonId: "2026", regularSeasonStartDate: "2026-03-25", regularSeasonEndDate: "2026-09-27", postSeasonStartDate: "2026-09-28", postSeasonEndDate: "2026-10-31" }] };
const g = (gameType, state, detailed = state === "Final" ? "Final" : "Scheduled", gamePk = Math.floor(Math.random() * 1e6)) => ({ gamePk, gameType, status: { abstractGameState: state, detailedState: detailed } });
const POST = { dates: [
  { date: "2026-10-01", games: [g("F", "Final")] },
  { date: "2026-10-03", games: [g("D", "Preview"), g("D", "Preview")] },
  { date: "2026-10-31", games: [g("W", "Preview")] },
] };
const OVER = { dates: [{ date: "2026-10-30", games: [g("W", "Final")] }, { date: "2026-10-31", games: [g("W", "Preview", "Cancelled")] }] };

test("D3 · season state comes from games remaining, not from a calendar date passing", () => {
  assert.equal(deriveMlbSeasonState({ seasons: SEASONS, schedule: null, date: "2026-09-20" }).state, S.REGULAR_SEASON);
  const off = deriveMlbSeasonState({ seasons: SEASONS, schedule: POST, date: "2026-10-02" });
  assert.equal(off.state, S.POSTSEASON, "the postseason keeps MLB active");
  assert.equal(off.gamesToday, 0, "an off day between rounds");
  assert.equal(off.nextGameDate, "2026-10-03");
  assert.equal(deriveMlbSeasonState({ seasons: SEASONS, schedule: POST, date: "2026-10-03" }).gamesToday, 2);
  assert.equal(deriveMlbSeasonState({ seasons: SEASONS, schedule: OVER, date: "2026-10-31" }).state, S.OFF_SEASON, "a cancelled 'if necessary' game is not a game left to play");
  assert.equal(deriveMlbSeasonState({ seasons: SEASONS, schedule: POST, date: "2026-11-02" }).state, S.OFF_SEASON, "no game on or after the date");
  assert.equal(deriveMlbSeasonState({ seasons: SEASONS, schedule: { dates: [{ date: "2026-11-02", games: [g("W", "Preview")] }] }, date: "2026-11-02" }).state, S.POSTSEASON, "a World Series pushed past the planned end date is still the season");
  assert.equal(deriveMlbSeasonState({ seasons: SEASONS, schedule: null, date: "2026-03-01" }).state, S.OFF_SEASON, "before the regular season");
  assert.equal(deriveMlbSeasonState({ seasons: SEASONS, schedule: null, date: "2026-10-02" }).state, S.UNKNOWN, "after the regular season with no schedule capture: unknown, never off-season");
  assert.equal(deriveMlbSeasonState({ seasons: null, schedule: POST, date: "2026-10-02" }).state, S.UNKNOWN);
  assert.equal(remainingGames({ dates: [{ date: "2026-10-05", games: [g("S", "Preview"), g("E", "Preview")] }] }, "2026-10-01").length, 0, "spring/exhibition games are not the season");
});

test("D3 · season-state evidence counts only when derived for the date AND captured on that ET day", () => {
  const doc = { date: "2026-11-02", generatedAt: "2026-11-02T15:00:00Z", state: "OFF_SEASON", reason: "over" };
  assert.equal(seasonStateFor(doc, "2026-11-02", "2026-11-02T16:00:00Z").state, S.OFF_SEASON);
  assert.equal(seasonStateFor(doc, "2026-11-03", "2026-11-03T16:00:00Z").state, S.UNKNOWN, "yesterday's capture is not today's evidence");
  assert.equal(seasonStateFor({ ...doc, generatedAt: "2026-11-02T03:00:00Z" }, "2026-11-02", "2026-11-02T16:00:00Z").state, S.UNKNOWN, "03:00Z is the previous ET day");
  assert.equal(seasonStateFor({ ...doc, generatedAt: "2026-11-02T17:00:00Z" }, "2026-11-02", "2026-11-02T16:00:00Z").state, S.UNKNOWN, "a capture from the future");
  assert.equal(seasonStateFor(null, "2026-11-02", "2026-11-02T16:00:00Z").state, S.UNKNOWN);
});

test("D3 · the classifier: off-season leaves the universe; a postseason off day is NO_EVENTS; a real slate always wins", () => {
  const offSeason = { state: "OFF_SEASON", reason: "the 2026 season is over" };
  const r = classifyMlbInput({ gate: missing, schedule: null, date: "2026-11-02", nowIso: "2026-11-02T16:00:00Z", season: offSeason });
  assert.equal(r.verdict, M.OFF_SEASON);
  assert.match(r.reason, /out of season: the 2026 season is over/);
  assert.equal(classifyMlbInput({ gate: { verdict: GATE.INPUT_EMPTY, detail: "empty" }, schedule: null, date: "2026-11-02", nowIso: "2026-11-02T16:00:00Z", season: offSeason }).verdict, M.OFF_SEASON);
  assert.equal(classifyMlbInput({ gate: { verdict: GATE.OK, detail: "3 games" }, schedule: null, date: "2026-11-02", nowIso: "2026-11-02T16:00:00Z", season: offSeason }).verdict, M.READY, "games on the board outrank any calendar reading");
  const postOff = classifyMlbInput({ gate: missing, schedule: sched("2026-09-26T10:00:00Z", 0, "2026-10-02"), date: "2026-10-02", nowIso: "2026-10-02T16:00:00Z", season: { state: "POSTSEASON", gamesToday: 0, reason: "postseason — 41 game(s) still to be played from 2026-10-02, none today" } });
  assert.equal(postOff.verdict, M.NO_EVENTS, "the season state captured today establishes the off day the stale schedule could not");
  for (const season of [null, { state: "UNKNOWN", reason: "x" }, { state: "POSTSEASON", gamesToday: 2, reason: "x" }, { state: "POSTSEASON", gamesToday: null, reason: "x" }]) {
    assert.equal(classifyMlbInput({ gate: missing, schedule: null, date: "2026-10-03", nowIso: "2026-10-03T16:00:00Z", season }).verdict, M.INPUT_UNAVAILABLE, `fail closed: ${JSON.stringify(season)}`);
  }
});

test("D3 · the receipt records OFF_SEASON — not an operational gap, not a no-play", () => {
  const r = spawnSync("npx", ["tsx", "scripts/products/build-daily-product-receipts.mjs", "--now", "2026-09-28T18:45:00Z", "--date", "2026-09-28", "--dry-run", "--mlb-off-season", "the 2026 season is over"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const line = r.stdout.split("\n").find((l) => l.startsWith("product receipt 2026-09-28:")) ?? "";
  for (const id of ["bank-builder", "moonshot", "mlb-cards"]) assert.match(line, new RegExp(`\\b${id}=OFF_SEASON\\b`), `${id}:\n${r.stdout.slice(0, 600)}`);
});

test("D3 · CONTRACT: the day's evidence is captured free before classification; off-season is not a job failure", () => {
  const wf = fs.readFileSync("../.github/workflows/daily-products.yml", "utf8");
  const cap = wf.indexOf("- name: Capture today's MLB schedule and season state (free StatsAPI)");
  const cls = wf.indexOf("- name: Classify today's MLB input");
  assert.ok(cap !== -1 && cap < cls, "captured before the classifier reads it");
  const body = wf.slice(cap, cls);
  assert.match(body, /working-directory: app/);
  assert.match(body, /capture-mlb-schedule\.mjs --date "\$DATE" --write/);
  assert.match(body, /capture-mlb-season-state\.mjs --date "\$DATE" --now "\$NOW" --write/);
  assert.doesNotMatch(body, /odds|ODDS_API|credits?\s*=/i, "no paid provider in the capture step");
  assert.match(wf, /if \[ "\$\{MLB_VERDICT:-\}" = "OFF_SEASON" \]; then ARGS\+=\(--mlb-off-season "\$MLB_REASON"\); fi/);
  assert.match(wf, /git add app\/public\/data\/mlb\/season-state\.json 2>\/dev\/null \|\| true/, "the season state a page reads is committed");
  const fail = wf.slice(wf.indexOf("- name: MLB money products were not generated"));
  assert.match(fail, /if: steps\.mlb\.outputs\.verdict == 'INPUT_UNAVAILABLE'/, "only an unavailable input fails the job — OFF_SEASON does not");
  const writer = fs.readFileSync("scripts/mlb/capture-mlb-season-state.mjs", "utf8");
  assert.match(writer, /generatedAt: NOW/, "the capture stamp is generatedAt, so a same-day re-capture is stamp-only and not re-committed");
});

test("D3 · no stale offseason cards: /build and /mlb read the ladder through the season gate", async () => {
  for (const f of ["src/app/build/page.tsx", "src/app/mlb/page.tsx"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /inSeasonLadder\(loadRiskLadder\(/, `${f}: the ladder is read through inSeasonLadder`);
  }
  const src = fs.readFileSync("src/lib/parlays/risk-ladder.ts", "utf8");
  assert.match(src, /season\?\.state === "OFF_SEASON" && typeof season\.date === "string" && \(cardDate == null \|\| cardDate <= season\.date\)/);
});

test("D3 · inSeasonLadder hides last season's ladder only on established OFF_SEASON", async () => {
  const { inSeasonLadder } = await import("../parlays/risk-ladder.ts");
  const ladder = { date: "2026-10-31", cards: [{ tier: "low" }], skipped: [] };
  const over = { date: "2026-11-02", state: "OFF_SEASON", reason: "the 2026 season is over" };
  const hidden = inSeasonLadder(ladder, over);
  assert.equal(hidden.ladder, null);
  assert.match(hidden.offSeasonReason, /The MLB season is over — the 2026 season is over\. Cards return when games do\./);
  assert.equal(inSeasonLadder({ ...ladder, date: "2027-03-26" }, over).ladder?.date, "2027-03-26", "a ladder after the capture (games returned) is shown");
  for (const season of [null, { ...over, state: "POSTSEASON" }, { ...over, state: "UNKNOWN" }]) assert.equal(inSeasonLadder(ladder, season).ladder, ladder, `unchanged for ${season?.state ?? "no evidence"}`);
});
