/**
 * MODEL TOP 10 — fabrication + discipline guards. Real artifacts in, ranked picks out: no Pass leans,
 * no started/completed games, every pick carries a specific reason + source, ranking is reliability-led
 * (a reliable team market outranks a same-probability prop), and the BB team-market pool is derivable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { buildTop10Board } from "./top10-picks.ts";

const root = path.join(process.cwd(), "public", "data");
// Anchor to the NEWEST BOARD date, not daily-portfolio.date: the morning products stamp the money
// date ~2h before that day's board generates (documented products-precede-morning-board exception,
// P161), and Top10 builds from boards — so the money date can name a board that does not exist yet.
const date = (() => { try { return fs.readdirSync(path.join(root, "mlb", "boards")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-1)[0].slice(0, 10); } catch { return "2026-07-05"; } })();
// Pre-slate clock (before the earliest start on that date) so real pregame picks exist deterministically.
const nowMs = Date.parse(`${date}T09:00:00-04:00`);
const board = buildTop10Board(root, date, nowMs);

test("board builds from real artifacts with picks in every populated category", () => {
  assert.ok(board.overall.length > 0, "overall has picks");
  // The Top 10 "team" tab shows WC knockout team picks while the tournament is live; when the WC board is
  // empty/complete it FALLS BACK to MLB team-market CONTEXT rows (de-vigged market read / watchlist). Either
  // way every team-tab row is kind "team"; if MLB market-context rows are absent too, the tab is cleanly empty.
  if (board.team.length > 0) assert.ok(board.team.every((p) => p.kind === "team"), "team tab holds team markets");
  assert.ok(board.generatedFrom.every((s) => /\.json$/.test(s)), "every pick traces to a source artifact");
  assert.ok(board.overall.length <= 10 && board.safe.length <= 10 && board.props.length <= 10, "caps hold");
});

test("NO Pass leans, NO non-pregame picks, NO fabricated fields", () => {
  for (const p of [...board.overall, ...board.safe, ...board.value, ...board.props, ...board.team]) {
    assert.ok(!/pass/i.test(p.selection), `no Pass lean: ${p.selection}`);
    assert.equal(p.status, "pregame");
    if (p.startsAt) assert.ok(Date.parse(p.startsAt) > nowMs, `starts in the future: ${p.selection}`);
    assert.ok(Number.isFinite(p.odds) && p.odds !== 0, "real odds");
    assert.ok(p.reason.length > 20 && !/no explanation/i.test(p.reason), "specific reason present");
    assert.ok(p.risk.length > 5, "risk stated");
  }
});

test("ranking is reliability-led: top overall pick is never a player prop when a comparable team read exists", () => {
  const top = board.overall[0];
  // Compare only against a team pick that actually competes in the overall pool (WC team markets). MLB
  // team-market CONTEXT rows are a separate watchlist (no model probability), never in overall, so they
  // are scored in their own universe and must not be compared here.
  const bestTeamInOverall = board.overall.find((p) => p.kind === "team");
  if (bestTeamInOverall && top.kind === "prop") {
    assert.ok(top.score > bestTeamInOverall.score, "prop leads only on strictly higher haircut-adjusted score");
  }
  // Diversity: max 2 picks per game in the overall board.
  const perGame = {};
  for (const p of board.overall) { perGame[p.game] = (perGame[p.game] ?? 0) + 1; assert.ok(perGame[p.game] <= 2, `≤2 per game (${p.game})`); }
});

test("team tab fallback: when WC is empty, MLB team-market rows are MARKET CONTEXT — never a model pick/edge", () => {
  // Every team-tab row is a team/game market (never a prop).
  for (const p of board.team) assert.equal(p.kind, "team");
  // The MLB fallback rows (present when the WC knockout board is empty) must be honest market context:
  // no fabricated model probability, and no "edge"/"pick"/"best bet"/"lock" language anywhere in the copy.
  const mlbTeam = board.team.filter((p) => p.sport === "mlb");
  for (const p of mlbTeam) {
    assert.equal(p.modelProbability, null, "market-context row carries NO model probability");
    assert.ok(typeof p.marketProbability === "number", "market-context row shows the de-vigged market read");
    assert.ok(/market context|watchlist/i.test(`${p.confidence} ${p.reason} ${p.risk}`), "framed as market context / watchlist");
    assert.ok(!/\bedge\b|\bpick\b|best bet|\block\b|guaranteed/i.test(`${p.reason} ${p.risk} ${p.market} ${p.selection}`)
      || /no (model )?edge|not a model pick/i.test(`${p.reason} ${p.risk}`),
      `no fabricated edge/pick claim: ${p.reason}`);
    assert.ok(/mlb\/team-markets\//.test(p.source), "traces to the MLB team-markets artifact");
  }
});

test("Bank Builder pool is derivable: team tab is team/game markets only (no props ever)", () => {
  for (const p of board.team) {
    assert.equal(p.kind, "team");
    assert.ok(!/shots|goalscorer|assists|hits|strikeouts|bases/i.test(p.market), `team market only: ${p.market}`);
  }
});

test("board generation never touches canonical money", () => {
  const before = fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"));
  buildTop10Board(root, date, nowMs);
  const after = fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"));
  assert.ok(before.equals(after));
});
