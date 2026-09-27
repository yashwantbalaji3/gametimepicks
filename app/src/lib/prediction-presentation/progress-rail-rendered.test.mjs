/**
 * THE PROGRESS RAIL ON A PUBLIC PREDICTION ROW (§5, §2.2) — rendered, on a real committed board.
 *
 * §2.2 approves wiring the rail for families that are BOTH product-eligible and factually
 * live-trackable. The row already carried every part of §3.2's frozen block — the book, the line,
 * both prices, the capture instant — and the live line already carried the current value, the clock
 * and the score. What no surface had was the thing the founder's reference actually demonstrates: a
 * VISUAL comparison of the two.
 *
 * 🔴 THE RULE THIS FILE EXISTS FOR. A live value that has passed the frozen line gets the LIVE tone,
 * never the win tone. `railStateOf` cannot return a result state outside FINAL_CANONICAL, so there
 * is no input by which a live row can be painted green — and these tests assert it on the rendered
 * markup, because a contract the component ignores is not a guarantee.
 *
 * Run: cd app && npx tsx --test src/lib/prediction-presentation/progress-rail-rendered.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { presentPlayerBoardRow } = await import("./nfl.ts");
const { PredictionBoard } = await import("../../components/prediction/prediction-board.tsx");

const APP = process.cwd();
const BOARDS = path.join(APP, "public/data/nfl/player-board");

/** A real committed row that carries a PURCHASED line, so the target is a market number. */
function fixture() {
  for (const f of fs.readdirSync(BOARDS)) {
    const b = JSON.parse(fs.readFileSync(path.join(BOARDS, f), "utf8"));
    if (b?.families?.player_reception_yds?.state !== "PUBLISHED") continue;
    const player = (b.players ?? []).find((p) => p.markets?.player_reception_yds?.market?.line != null);
    if (player) return { board: b, player, line: player.markets.player_reception_yds.market.line };
  }
  return null;
}
const fx = fixture();

function render(live, settlement) {
  const { board, player } = fx;
  const ctx = {
    providerEventId: board.providerEventId, kickoffUtc: board.kickoffUtc,
    families: board.families, generatedAt: board.generatedAt, teams: ["AAA", "BBB"],
  };
  const idx = live || settlement
    ? new Map([[`${player.playerId}|player_reception_yds`,
        { playerId: player.playerId, family: "player_reception_yds", live, settlement }]])
    : undefined;
  const row = presentPlayerBoardRow(ctx, player, "player_reception_yds", idx);
  assert.ok(row, "the fixture must produce a row");
  const html = renderToStaticMarkup(React.createElement(PredictionBoard, { predictions: [row], gameHref: () => null }));
  const style = (html.match(/class="gtp-pred-progress"[^>]*style="([^"]*)"/) ?? [])[1] ?? null;
  const tone = style && (style.match(/--gtp-rail-tone:\s*([^;"]+)/) ?? [])[1];
  const value = style && (style.match(/--gtp-rail-value:\s*([\d.]+)%/) ?? [])[1];
  return {
    html, hasRail: Boolean(style), tone: tone?.trim() ?? null, value: value ? Number(value) : null,
    hasFill: html.includes("gtp-pred-progress-fill"),
    hasTick: html.includes("gtp-pred-progress-tick"),
  };
}

const LIVE_ABOVE = { phase: "IN_PROGRESS", statValue: 41, clock: "4:12", period: 3, score: { home: 14, away: 10 } };
const LIVE_BELOW = { phase: "IN_PROGRESS", statValue: 2, clock: "4:12", period: 3, score: { home: 14, away: 10 } };
const WIN_TONE = "var(--vault-success)";

test("the fixture is a real committed row with a PURCHASED line", () => {
  assert.ok(fx, "no committed NFL board publishes receiving yards with a frozen line");
  assert.equal(typeof fx.line, "number");
});

test("🔴 §5.2 · a live value far past the frozen line gets the LIVE tone, never the win tone", { skip: !fx }, () => {
  const r = render(LIVE_ABOVE, null);
  assert.equal(r.hasRail, true);
  assert.equal(r.tone, "var(--vault-info)", "a live row was painted with a settlement colour");
  assert.equal(r.html.includes(WIN_TONE), false, "the win colour appears nowhere on a live row");
});

test("§5.2 · an Under that is 'already winning' mid-game is also just a measurement", { skip: !fx }, () => {
  const r = render(LIVE_BELOW, null);
  assert.equal(r.tone, "var(--vault-info)");
  assert.ok(r.value < 50, "below the line must draw short of the target tick");
});

test("🔴 a provider FINAL is not a settlement, and the rail says so in its colour too", { skip: !fx }, () => {
  /* ⚠ The first cut collapsed provider-FINAL into NOT_FINAL and the finished row kept the LIVE
     tone — the same defect the tag beside it had, made again one function away from the fix. */
  const r = render({ ...LIVE_ABOVE, phase: "FINAL", clock: "0:00", period: 4 }, null);
  assert.equal(r.tone, "var(--vault-text-mute)");
  assert.equal(r.html.includes(WIN_TONE), false);
  assert.ok(isNeutral(r.tone), `${r.tone} resolves to ${resolveToken(r.tone)} — not a neutral`);
});

test("only a SETTLED row carries a result colour, and both directions are distinct", { skip: !fx }, () => {
  const hit = render({ phase: "FINAL", statValue: 41, clock: null, period: null, score: null },
    { state: "SETTLED", finalStat: 41, line: fx.line, lineResult: "OVER", forecastResult: "HIT" });
  assert.equal(hit.tone, WIN_TONE);
  const miss = render({ phase: "FINAL", statValue: 2, clock: null, period: null, score: null },
    { state: "SETTLED", finalStat: 2, line: fx.line, lineResult: "UNDER", forecastResult: "MISS" });
  assert.equal(miss.tone, "var(--vault-loss-red)");
});

test("🔴 a PREGAME board is byte-identical — the rail adds nothing before kickoff", { skip: !fx }, () => {
  /*
   * This is what makes the change safe to ship the night before an acceptance: every board is PRE
   * tomorrow morning, the live slot is absent, and no rail renders.
   */
  const r = render(null, null);
  assert.equal(r.hasRail, false, "a pregame row must not gain a bar");
  assert.equal(r.html.includes("gtp-pred-progress"), false);
});

test("§3 · no live value and no target means no bar — a rail from a missing number is a claim", { skip: !fx }, () => {
  assert.equal(render(null, { state: "NO_MEASUREMENT", finalStat: null, line: fx.line, lineResult: null, forecastResult: null }).hasRail, false);
  assert.equal(render({ phase: "IN_PROGRESS", statValue: null, clock: "4:12", period: 3, score: null }, null).hasRail, false);
});

test("§5.2 · a value far beyond the target stays on the rail and never exceeds it", { skip: !fx }, () => {
  const r = render({ ...LIVE_ABOVE, statValue: 4000 }, null);
  assert.ok(r.value <= 100, `value fraction ${r.value}% overflowed the rail`);
  assert.equal(r.tone, "var(--vault-info)", "an absurd overflow is still not a win");
});

test("the bar is decoration — aria-hidden, with the meaning in the words beside it", { skip: !fx }, () => {
  const r = render(LIVE_ABOVE, null);
  assert.match(r.html, /aria-hidden="true"[^>]*class="gtp-pred-progress"|class="gtp-pred-progress"[^>]*aria-hidden="true"/);
  /* The live line still states the value, the clock and the score in text. */
  const text = r.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /41/);
  assert.match(text, /3Q/);
});

test("🔴 the rail carries NO per-row style object beyond its two offsets and a tone", { skip: !fx }, () => {
  /* A per-cell style object took one page of this product to 1,160KB. */
  const style = (render(LIVE_ABOVE, null).html.match(/class="gtp-pred-progress"[^>]*style="([^"]*)"/) ?? [])[1] ?? "";
  const decls = style.split(";").map((d) => d.trim()).filter(Boolean);
  assert.equal(decls.length, 3, `expected 3 custom properties, got: ${decls.join(" | ")}`);
  for (const d of decls) assert.match(d, /^--gtp-rail-/, `${d} is not a rail offset`);
});

test("🔴 the rail actually DRAWS — a fill and a target tick, not an empty track", () => {
  /*
   * ⚠ THE DEFECT THIS PINS, and every earlier assertion in this file passed while it was live. The
   * first cut rendered the container alone while the CSS styled three elements, so all six states
   * drew an empty grey strip with no bar and no marker. The tests were reading the style attribute,
   * not the drawing. A screenshot at 375px found it immediately.
   */
  const r = render(LIVE_ABOVE, null);
  assert.equal(r.hasFill, true, "the bar itself must be rendered, not only styled");
  assert.equal(r.hasTick, true, "the frozen target marker must be rendered");
  /* And the classes must exist in the stylesheet that ships. */
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  for (const cls of ["gtp-pred-progress", "gtp-pred-progress-fill", "gtp-pred-progress-tick"]) {
    assert.match(css, new RegExp(`\\.${cls}\\s*\\{`), `.${cls} is rendered and has no rule`);
  }
});

test("every class the rail renders has a rule, and every rule has a renderer", () => {
  /* Neither half is useful alone: a styled element nobody renders draws nothing, and a rendered
     element nobody styles is invisible. */
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  const component = fs.readFileSync(path.join(APP, "src/components/prediction/prediction-board.tsx"), "utf8");
  const styled = [...css.matchAll(/\.(gtp-pred-progress[a-z-]*)\s*\{/g)].map((m) => m[1]);
  assert.ok(styled.length >= 3, `expected the track, the fill and the tick; found ${styled.join(", ")}`);
  for (const cls of new Set(styled)) {
    assert.ok(component.includes(cls), `.${cls} has a rule and nothing renders it`);
  }
});

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE COLOUR, NOT THE TOKEN NAME
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

/** Resolve a `var(--x)` chain against the declarations in globals.css, to an #rrggbb or rgba(). */
function resolveToken(expr, depth = 0) {
  if (depth > 8) return expr;
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  const name = (String(expr).match(/var\((--[a-z0-9-]+)\)/) ?? [])[1];
  if (!name) return String(expr).trim();
  const decl = [...css.matchAll(new RegExp(`\\${name}\\s*:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());
  if (!decl.length) return expr;
  return resolveToken(decl[0], depth + 1);
}

/** Crude but sufficient: is this colour in the green or the red family? */
function channels(c) {
  const hex = c.match(/#([0-9a-f]{6})/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  const rgb = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}
function isNeutral(expr) {
  const ch = channels(resolveToken(expr));
  if (!ch) return false;
  const [r, g, b] = ch;
  /* A neutral has no channel dominating the others. Green dominance is a win signal and red
     dominance is a loss signal, whatever the token is called. */
  return Math.max(r, g, b) - Math.min(r, g, b) < 40;
}

test("🔴 a non-result state is painted a colour that IS neutral, not one merely NAMED neutral", () => {
  /*
   * ⚠ MEASURED IN A BROWSER, 2026-09-26: `--vault-border-strong` resolves to
   * `rgba(52, 211, 153, 0.58)` — this theme's mint green — so the "result pending" bar was green.
   * The earlier assertion checked the token NAME and passed the whole time. `--vault-border` and
   * `--vault-rule` are the same green; only the text greys are actually grey.
   */
  assert.equal(isNeutral("var(--vault-border-strong)"), false, "the guard must be able to fail");
  assert.equal(isNeutral("var(--vault-success)"), false);
  assert.equal(isNeutral("var(--vault-loss-red)"), false);
  assert.equal(isNeutral("var(--vault-text-mute)"), true);

  /* And every state the rail can render in that is NOT a settled result must be neutral or the
     live/warn hue — never the success or loss hue. */
  const component = fs.readFileSync(path.join(APP, "src/components/prediction/prediction-board.tsx"), "utf8");
  const table = component.slice(component.indexOf("const RAIL_TONE"), component.indexOf("function ProgressRail"));
  for (const [, state, tone] of table.matchAll(/RAIL_STATE\.([A-Z_]+)\]:\s*"([^"]+)"/g)) {
    if (state === "FINAL_WIN" || state === "FINAL_LOSS") continue;
    const resolved = resolveToken(tone);
    assert.notEqual(resolved, resolveToken("var(--vault-success)"), `${state} uses the win colour`);
    assert.notEqual(resolved, resolveToken("var(--vault-loss-red)"), `${state} uses the loss colour`);
    if (state.startsWith("FINAL_")) {
      assert.ok(isNeutral(tone), `${state} is ${tone} → ${resolved}, which is not neutral`);
    }
  }
});
