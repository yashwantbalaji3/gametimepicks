/**
 * Shared UFC fight-model core: corpus loading, corner canonicalisation, walk-forward feature
 * construction, and the fit/predict routines.
 *
 * Both the evaluator (which decides whether a head may publish) and the card builder (which
 * publishes) import from here. When they each had their own copy, the thing being validated and the
 * thing being shipped were free to drift apart — which is the failure this module exists to prevent.
 *
 * The canonical-corner rule is the load-bearing detail: the source lists the winner first in about
 * 64% of rows, so corners are assigned ALPHABETICALLY, independent of the outcome. Anything that
 * feeds fighters in listed order is measuring the bookkeeping convention, not the fight.
 */
import fs from "node:fs";
import path from "node:path";

export const METHODS = ["KO", "SUB", "DEC"];

/**
 * Fold a fighter name to a match key: strip diacritics, lowercase, drop punctuation.
 *
 * The schedule provider writes "Kauê Fernandes" and "Joel Álvarez"; the stats corpus writes "Kaue
 * Fernandes" and "Joel Alvarez". Matching on the raw string silently dropped those fighters into
 * "no history" and blanked their bouts — a data-encoding difference reading as missing knowledge.
 */
export const nameKey = (s) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

export function loadCorpus(RAW) {
  // ── CSV ─────────────────────────────────────────────────────────────────────────────────────────
  function readCsv(file) {
    const text = fs.readFileSync(path.join(RAW, file), "utf8");
    const rows = [];
    let cur = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    if (field || cur.length) { cur.push(field); rows.push(cur); }
    const head = rows.shift().map((h) => h.trim());
    return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  }

  const MONTHS = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
  const parseDate = (s) => {
    const m = /^(\w+)\s+(\d+),\s*(\d{4})$/.exec(String(s ?? "").trim());
    if (!m || !(m[1] in MONTHS)) return null;
    return new Date(Date.UTC(Number(m[3]), MONTHS[m[1]], Number(m[2])));
  };

  const eventDate = new Map();
  for (const e of readCsv("ufc_event_details.csv")) {
    const d = parseDate(e.DATE);
    if (d) eventDate.set(e.EVENT.trim(), d);
  }

  const methodOf = (raw) => {
    const m = String(raw ?? "").trim().toUpperCase();
    if (m.startsWith("DECISION")) return "DEC";
    if (m.includes("SUBMISSION")) return "SUB";
    if (m.includes("KO/TKO") || m.startsWith("KO") || m.startsWith("TKO")) return "KO";
    return null; // DQ, overturned, could-not-continue — excluded, never silently bucketed
  };

  // ── Dataset ─────────────────────────────────────────────────────────────────────────────────────
  const fights = [];
  let excluded = { noDate: 0, noMethod: 0, notDecisive: 0, badNames: 0 };
  for (const r of readCsv("ufc_fight_results.csv")) {
    const date = eventDate.get(String(r.EVENT ?? "").trim());
    if (!date) { excluded.noDate++; continue; }
    const method = methodOf(r.METHOD);
    if (!method) { excluded.noMethod++; continue; }
    const outcome = String(r.OUTCOME ?? "").trim();
    if (outcome !== "W/L" && outcome !== "L/W") { excluded.notDecisive++; continue; }
    const parts = String(r.BOUT ?? "").split(" vs. ").map((s) => s.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) { excluded.badNames++; continue; }

    const listedWinner = outcome === "W/L" ? parts[0] : parts[1];
    // CANONICAL CORNERS — alphabetical, so listing order carries no information about the result.
    const [a, b] = parts.slice().sort((x, y) => x.localeCompare(y));
    const round = Number(String(r.ROUND ?? "").trim());
    const scheduled = /5 Rnd/.test(String(r["TIME FORMAT"] ?? "")) ? 5 : 3;
    if (!Number.isFinite(round) || round < 1 || round > scheduled) continue;

    fights.push({
      date, a, b,
      aWon: listedWinner === a ? 1 : 0,
      method, round, scheduled,
      weightClass: String(r.WEIGHTCLASS ?? "").replace(/\s*Bout\s*$/i, "").trim() || "Unknown",
    });
  }
  fights.sort((x, y) => x.date - y.date);

  const aWinRate = fights.reduce((s, f) => s + f.aWon, 0) / fights.length;

  const baseMethod = { KO: 0, SUB: 0, DEC: 0 };
  for (const f of fights) baseMethod[f.method]++;
  const METHODS = ["KO", "SUB", "DEC"];

  // ── Features, replayed forward ─────────────────────────────────────────────────────────────────
  const rec = new Map(); // fighter -> counters over PRIOR fights only
  const blank = () => ({ n: 0, w: 0, koW: 0, subW: 0, decW: 0, koL: 0, subL: 0, decL: 0, dist: 0 });
  const get = (k) => rec.get(k) ?? blank();
  const wcRec = new Map();

  /** Shrunk rate: a fighter with two fights must not swing an estimate. */
  const rate = (num, den, prior, w = 5) => (num + prior * w) / (den + w);
  const logit = (p) => Math.log(Math.max(1e-6, p) / Math.max(1e-6, 1 - p));

  const rowsOut = [];
  for (const f of fights) {
    const A = get(f.a), B = get(f.b);
    const wc = wcRec.get(f.weightClass) ?? { n: 0, KO: 0, SUB: 0, DEC: 0, dist: 0 };
    const pKO = baseMethod.KO / fights.length, pSUB = baseMethod.SUB / fights.length, pDEC = baseMethod.DEC / fights.length;

    const feat = {
      // WINNER head — differences, so the model sees a matchup rather than two absolute levels.
      winDiff: logit(rate(A.w, A.n, 0.5)) - logit(rate(B.w, B.n, 0.5)),
      finishDiff: logit(rate(A.koW + A.subW, A.n, pKO + pSUB)) - logit(rate(B.koW + B.subW, B.n, pKO + pSUB)),
      durabilityDiff: logit(rate(A.koL + A.subL, A.n, pKO + pSUB)) - logit(rate(B.koL + B.subL, B.n, pKO + pSUB)),
      expDiff: Math.log1p(A.n) - Math.log1p(B.n),
      // METHOD / ROUND heads — combined tendencies of the pair, plus the division and the format.
      koTend: logit(rate(A.koW + B.koW, A.n + B.n, pKO)),
      subTend: logit(rate(A.subW + B.subW, A.n + B.n, pSUB)),
      decTend: logit(rate(A.decW + B.decW, A.n + B.n, pDEC)),
      finishable: logit(rate(A.koL + A.subL + B.koL + B.subL, A.n + B.n, pKO + pSUB)),
      wcKO: logit(rate(wc.KO, wc.n, pKO, 25)),
      wcSUB: logit(rate(wc.SUB, wc.n, pSUB, 25)),
      five: f.scheduled === 5 ? 1 : 0,
      experience: Math.log1p(Math.min(A.n, B.n)),
    };
    rowsOut.push({ date: f.date, f, feat, seen: Math.min(A.n, B.n) });

    // advance state AFTER the row is emitted
    for (const [self, other, won] of [[f.a, f.b, f.aWon], [f.b, f.a, 1 - f.aWon]]) {
      const s = get(self); const c = { ...s };
      c.n++; if (won) c.w++;
      if (won) { if (f.method === "KO") c.koW++; else if (f.method === "SUB") c.subW++; else c.decW++; }
      else { if (f.method === "KO") c.koL++; else if (f.method === "SUB") c.subL++; else c.decL++; }
      if (f.method === "DEC") c.dist++;
      rec.set(self, c);
      void other;
    }
    const c2 = { ...wc }; c2.n++; c2[f.method]++; if (f.method === "DEC") c2.dist++;
    wcRec.set(f.weightClass, c2);
  }


  // A folded-key index alongside the exact-name map, so callers can resolve provider spellings.
  const recByKey = new Map();
  for (const [name, v] of rec) recByKey.set(nameKey(name), v);
  return { fights, excluded, rowsOut, rec, recByKey, wcRec, baseMethod, aWinRate };
}

export const WIN_F = ["winDiff", "finishDiff", "durabilityDiff", "expDiff"];
export const CLS_F = ["koTend", "subTend", "decTend", "finishable", "wcKO", "wcSUB", "five", "experience"];
export const vec = (feat, keys) => keys.map((k) => feat[k]);

export function fitBinary(rows, keys, iters = 500, lr = 0.15) {
  let w = new Array(keys.length).fill(0), b = 0;
  for (let it = 0; it < iters; it++) {
    const g = new Array(keys.length).fill(0); let gb = 0;
    for (const r of rows) {
      const x = vec(r.feat, keys);
      const p = 1 / (1 + Math.exp(-(x.reduce((s, v, i) => s + v * w[i], b))));
      const e = p - r.y;
      for (let i = 0; i < keys.length; i++) g[i] += e * x[i];
      gb += e;
    }
    for (let i = 0; i < keys.length; i++) w[i] -= (lr * g[i]) / rows.length;
    b -= (lr * gb) / rows.length;
  }
  return { w, b, keys };
}
export const predBinary = (m, feat) => 1 / (1 + Math.exp(-(vec(feat, m.keys).reduce((s, v, i) => s + v * m.w[i], m.b))));

export function fitSoftmax(rows, keys, K, iters = 500, lr = 0.15) {
  const W = Array.from({ length: K }, () => new Array(keys.length).fill(0));
  const B = new Array(K).fill(0);
  for (let it = 0; it < iters; it++) {
    const GW = Array.from({ length: K }, () => new Array(keys.length).fill(0));
    const GB = new Array(K).fill(0);
    for (const r of rows) {
      const x = vec(r.feat, keys);
      const z = W.map((wk, k) => x.reduce((s, v, i) => s + v * wk[i], B[k]));
      const mx = Math.max(...z);
      const ex = z.map((v) => Math.exp(v - mx));
      const sum = ex.reduce((a, v) => a + v, 0);
      for (let k = 0; k < K; k++) {
        const e = ex[k] / sum - (r.k === k ? 1 : 0);
        for (let i = 0; i < keys.length; i++) GW[k][i] += e * x[i];
        GB[k] += e;
      }
    }
    for (let k = 0; k < K; k++) {
      for (let i = 0; i < keys.length; i++) W[k][i] -= (lr * GW[k][i]) / rows.length;
      B[k] -= (lr * GB[k]) / rows.length;
    }
  }
  return { W, B, keys };
}
export function predSoftmax(m, feat) {
  const x = vec(feat, m.keys);
  const z = m.W.map((wk, k) => x.reduce((s, v, i) => s + v * wk[i], m.B[k]));
  const mx = Math.max(...z);
  const ex = z.map((v) => Math.exp(v - mx));
  const sum = ex.reduce((a, v) => a + v, 0);
  return ex.map((v) => v / sum);
}

