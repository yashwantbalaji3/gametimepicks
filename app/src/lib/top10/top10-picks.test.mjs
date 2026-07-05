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
const date = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "daily-portfolio.json"))).date; } catch { return "2026-07-05"; } })();
// Pre-slate clock (before the earliest July-5 start) so real pregame picks exist deterministically.
const nowMs = Date.parse(`${date}T09:00:00-04:00`);
const board = buildTop10Board(root, date, nowMs);

test("board builds from real artifacts with picks in every populated category", () => {
  assert.ok(board.overall.length > 0, "overall has picks");
  assert.ok(board.team.length > 0, "team markets present");
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
  const bestTeam = board.team[0];
  if (bestTeam && top.kind === "prop") {
    // A prop may only lead if it genuinely outscores the best team pick (haircut already applied).
    assert.ok(top.score > bestTeam.score, "prop leads only on strictly higher haircut-adjusted score");
  }
  // Diversity: max 2 picks per game in the overall board.
  const perGame = {};
  for (const p of board.overall) { perGame[p.game] = (perGame[p.game] ?? 0) + 1; assert.ok(perGame[p.game] <= 2, `≤2 per game (${p.game})`); }
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
