/**
 * THE ADOPTED WIN + MARGIN HEADS ARE THE ONES THAT WERE SCORED (P298).
 *
 * The P297 replay scored both heads once, on 4,292 held-out games, with a research script outside the app.
 * Production folds through win-margin-heads.mjs. This runs the production fold over the committed games
 * table and requires it to reproduce the receipt: the win head's log loss season by season, and the margin
 * head's MAE and 80% coverage era by era.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  winMarginGate, rowsFromTable, foldWinMarginHeads, replayWinMarginHeads, adoptedHeadsFor, winMarginCoverage,
  WIN_MARGIN_RECEIPT, WIN_MARGIN_PREREG, GAMES_HISTORY_V2, NFL_WIN_HEAD_ID, NFL_MARGIN_HEAD_ID,
} from "./win-margin-heads.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const receipt = read(WIN_MARGIN_RECEIPT);
const prereg = read(WIN_MARGIN_PREREG);
const games = rowsFromTable(read(GAMES_HISTORY_V2));

test("THE PARITY PROOF: the production fold reproduces the receipt's held-out figures", () => {
  const gate = winMarginGate(receipt, prereg);
  assert.equal(gate.win.state, "READY", gate.win.reason);
  assert.equal(gate.margin.state, "READY", gate.margin.reason);
  const F = prereg.frozen;
  const [first, last] = F.seasons.heldOut;
  const clamp = (p) => Math.min(1 - F.probabilityClamp, Math.max(F.probabilityClamp, p));
  const win = new Map();
  const margin = new Map();
  let n = 0;
  replayWinMarginHeads({
    games, gate,
    onGame: (g, pre) => {
      if (g.season < first || g.season > last) return;
      n += 1;
      if (g.homeScore !== g.awayScore) {
        const y = g.homeScore > g.awayScore ? 1 : 0;
        const o = win.get(g.season) ?? { n: 0, ll: 0 };
        o.n += 1;
        o.ll += -(y ? Math.log(clamp(pre.pHome)) : Math.log(1 - clamp(pre.pHome)));
        win.set(g.season, o);
      }
      const era = F.eras.find(([a, b]) => g.season >= a && g.season <= b);
      const key = `${era[0]}-${era[1]}`;
      const e = Math.abs((g.homeScore - g.awayScore) - pre.marginMean);
      const m = margin.get(key) ?? { n: 0, ae: 0, cov: 0 };
      m.n += 1;
      m.ae += e;
      m.cov += e <= F.z80 * gate.margin.sigma ? 1 : 0;
      margin.set(key, m);
    },
  });
  assert.equal(n, receipt.population.heldOutGames, "every held-out game was replayed");
  for (let s = first; s <= last; s += 1) {
    const got = win.get(s);
    const want = receipt.results.eloMov.win.seasons[s];
    assert.equal(got.n, want.decisive, `${s}: decisive games`);
    assert.ok(Math.abs(got.ll / got.n - want.logLoss) < 1e-4, `${s}: win log loss ${got.ll / got.n} vs receipt ${want.logLoss}`);
  }
  for (const [a, b] of F.eras) {
    const key = `${a}-${b}`;
    const got = margin.get(key);
    const want = receipt.results.eloHfaRefit.margin.eras[key];
    assert.ok(Math.abs(got.ae / got.n - want.mae) < 1e-4, `${key}: margin MAE ${got.ae / got.n} vs receipt ${want.mae}`);
    assert.ok(Math.abs(got.cov / got.n - want.coverage80) < 1e-4, `${key}: margin coverage ${got.cov / got.n} vs receipt ${want.coverage80}`);
  }
});

test("each head is gated on its OWN verdict — a rejected head never rides along", () => {
  const ok = winMarginGate(receipt, prereg);
  assert.equal(ok.win.state, "READY");
  assert.equal(ok.margin.state, "READY");
  /* The receipt's own verdicts: eloMov's MARGIN head and eloHfaRefit's WIN head were rejected. */
  assert.equal(receipt.verdicts.eloMov.margin, "REJECTED");
  assert.equal(receipt.verdicts.eloHfaRefit.win, "REJECTED");
  const noWin = winMarginGate({ ...receipt, verdicts: { ...receipt.verdicts, eloMov: { ...receipt.verdicts.eloMov, win: "REJECTED" } } }, prereg);
  assert.equal(noWin.win.state, "REFUSED");
  assert.equal(noWin.margin.state, "READY", "refusing one head leaves the other's verdict standing");
  assert.equal(winMarginGate(null, prereg).win.state, "REFUSED");
  assert.equal(winMarginGate(receipt, null).margin.state, "REFUSED");
});

test("strictly pre-game, neutral sites carry no home advantage, and a Week-1 game gets the season regression", () => {
  const gate = winMarginGate(receipt, prereg);
  const recent = games.filter((g) => g.season >= 2023);
  const target = recent.find((g) => g.season === 2025 && g.date > "2025-10-01" && recent.filter((x) => x.date === g.date).length >= 3);
  const tampered = recent.map((g) => (g.date === target.date ? { ...g, homeScore: g.homeScore + 30 } : g));
  const a = foldWinMarginHeads({ games: recent, gate, beforeDate: target.date });
  const b = foldWinMarginHeads({ games: tampered, gate, beforeDate: target.date });
  assert.equal(a.win.pHome(target.home, target.away, false), b.win.pHome(target.home, target.away, false), "a same-day result never moves the prediction");
  assert.equal(a.margin.mean(target.home, target.away, false), b.margin.mean(target.home, target.away, false));

  assert.ok(a.win.pHome("KC", "BUF", false) > a.win.pHome("KC", "BUF", true), "home advantage is removed at a neutral site");
  assert.equal(a.margin.mean("KC", "BUF", true), -a.margin.mean("BUF", "KC", true), "at a neutral site the margin is symmetric");

  const through2025 = foldWinMarginHeads({ games, gate });
  const week1 = foldWinMarginHeads({ games, gate, targetSeason: 2026 });
  const spread = (st) => Math.abs(st.win.pHome("KC", "CAR", true) - 0.5);
  assert.ok(spread(week1) < spread(through2025), "the one-third regression pulls a Week-1 game toward even");
  assert.equal(week1.win.head, NFL_WIN_HEAD_ID);
  assert.equal(week1.margin.head, NFL_MARGIN_HEAD_ID);
});

test("ONE COHERENT PAIR: heads that favour different sides never publish together", () => {
  const fold = (pHome, marginMean, rated = true) => ({
    win: { hasTeam: () => rated, pHome: () => pHome },
    margin: { hasTeam: () => rated, mean: () => marginMean, sigma: 13 },
  });
  const ok = adoptedHeadsFor({ fold: fold(0.6, 3), home: "KC", away: "BUF", neutral: false });
  assert.deepEqual(ok, { state: "READY", pHome: 0.6, marginMean: 3, sigmaMargin: 13 });
  const split = adoptedHeadsFor({ fold: fold(0.48, 2.4), home: "KC", away: "BUF", neutral: false });
  assert.equal(split.state, "FALLBACK", "win head favours the away side, margin head the home side");
  assert.match(split.reason, /favour different sides/);
  assert.equal(adoptedHeadsFor({ fold: fold(0.4, -2), home: "KC", away: "BUF", neutral: false }).state, "READY", "agreement on the away side publishes");
  assert.match(adoptedHeadsFor({ fold: fold(0.6, 3, false), home: "KC", away: "BUF", neutral: false }).reason, /no rating history/);
  assert.equal(adoptedHeadsFor({ fold: { win: null, margin: fold(0.6, 3).margin }, home: "KC", away: "BUF", neutral: false }).state, "FALLBACK");

  /* ESPN spellings reach the nflverse ratings. */
  const seen = [];
  adoptedHeadsFor({ fold: { win: { hasTeam: (t) => { seen.push(t); return true; }, pHome: () => 0.6 }, margin: { hasTeam: () => true, mean: () => 2, sigma: 13 } }, home: "WSH", away: "LAR", neutral: false });
  assert.deepEqual(seen.slice(0, 2), ["WAS", "LA"]);
});

test("coverage names every official final the fold is missing", () => {
  const g = [{ gameId: "x", espnId: "1", season: 2026, date: "2026-09-10" }];
  const finals = [{ providerEventId: "1", dateUtc: "2026-09-11T00:20Z" }, { providerEventId: "2", dateUtc: "2026-09-13T17:00Z" }];
  assert.equal(winMarginCoverage({ games: g, officialFinals: finals, beforeDate: "2026-09-13" }).complete, true);
  const later = winMarginCoverage({ games: g, officialFinals: finals, beforeDate: "2026-09-14" });
  assert.deepEqual(later.missingGames, ["2"]);
  assert.equal(later.complete, false);
});
