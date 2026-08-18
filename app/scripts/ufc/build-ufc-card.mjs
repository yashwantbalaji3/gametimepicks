#!/usr/bin/env node
/**
 * Build the public UFC card artifact: the next event's bouts, its fighters, and a three-head
 * prediction per bout — WINNER, METHOD OF VICTORY, and ENDING ROUND.
 *
 * EACH HEAD IS GATED SEPARATELY. `fight-model-evaluation.json` carries one verdict per head, and a
 * head that is not PASS is omitted from every bout while the others still publish. A model that has
 * not earned publication cannot reach a page because someone forgot to check.
 *
 * The features here MUST match the shared core's training construction exactly, including the
 * alphabetical corner rule — the provider lists fighters in its own order, and using that order
 * would silently invert every win probability.
 */
import fs from "node:fs";
import path from "node:path";
import { loadCorpus, METHODS, WIN_F, WIN_F_TOTT, CLS_F, fitBinary, predBinary, fitSoftmax, predSoftmax, fitPlatt, applyPlatt, nameKey, tottFeat } from "./lib/fight-model.mjs";


const APP = process.cwd();
const RAW = path.join(APP, "..", "data", "internal", "research", "ufc", "raw", "stats");
const OUT = path.join(APP, "public", "data", "ufc");
const nowArg = process.argv.indexOf("--now");
const NOW = nowArg > -1 ? process.argv[nowArg + 1] : new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/** Plain fetch, matching capture-ufc-events.mjs — the provider rejects a custom user-agent. */
const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

/** ESPN abbreviations vs the stats corpus's labels — mapped explicitly, never fuzzy-matched. */
const WC_MAP = {
  "W Strawweight": "Women's Strawweight", "W Flyweight": "Women's Flyweight",
  "W Bantamweight": "Women's Bantamweight", "W Featherweight": "Women's Featherweight",
};

const etDay = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

// ── The next scheduled card ─────────────────────────────────────────────────────────────────────
const scan = [];
for (let i = 0; i < 21; i++) {
  const d = new Date(new Date(NOW).getTime() + i * 86400000);
  scan.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`);
}

/*
 * THE NEXT CARD THE MODEL CAN ACTUALLY READ.
 *
 * Taking the literal next event put Dana White's Contender Series on the page: five bouts, every
 * fighter making their debut, zero predictions. The engine was refusing correctly, but a hub whose
 * headline card says nothing is not worth the visit — and the real card four days later had
 * thirteen bouts of fighters with years of history.
 *
 * So the scan keeps going until it finds a card with enough fighters in the corpus to say something
 * about, and remembers what it skipped. This is a COVERAGE test, not a name filter: a Fight Night
 * of unknowns would be skipped on the same rule, and a Contender Series where several fighters have
 * returned would qualify on it. Nothing is hidden — `skippedForCoverage` ships in the artifact so
 * the page can say the nearer card exists and why it carries no read.
 */
const MIN_MODELLABLE_BOUTS = 3;

let event = null;
const skippedForCoverage = [];
const candidates = [];
for (const day of scan) {
  const sb = await get(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${day}`).catch(() => null);
  const ev = (sb?.events ?? []).find((e) => (e.competitions ?? []).length > 0);
  if (ev && !candidates.some((c) => c.id === ev.id)) candidates.push(ev);
}

if (candidates.length === 0) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "card-latest.json"), JSON.stringify({
    generatedAt: NOW, state: "NO_UPCOMING_CARD",
    reason: "No UFC event with bouts was found in the next 21 days of the provider scoreboard.",
  }, null, 1) + "\n");
  console.log("ufc card: no upcoming event in the next 21 days");
  process.exit(0);
}

// ── The model, refit on ALL history through the shared core the evaluator validated ───────────
const evaluation = JSON.parse(fs.readFileSync(path.join(OUT, "fight-model-evaluation.json"), "utf8"));
const V = evaluation.verdicts ?? {};

const corpus = loadCorpus(RAW);
if (!corpus) { console.error("ufc card: fight corpus absent — cannot build"); process.exit(1); }
const { rowsOut, rec, recByKey, logByKey, wcRec, baseMethod, fights, tott } = corpus;

/* Now the corpus is loaded, pick the first upcoming card with enough fighters in it to read. */
for (const ev of candidates) {
  const modellable = (ev.competitions ?? []).filter((c) => {
    const a = c.competitors?.[0]?.athlete?.displayName;
    const b = c.competitors?.[1]?.athlete?.displayName;
    return a && b && recByKey.has(nameKey(a)) && recByKey.has(nameKey(b));
  }).length;
  if (modellable >= MIN_MODELLABLE_BOUTS) { event = ev; break; }
  skippedForCoverage.push({
    name: ev.name,
    dateUtc: ev.date,
    bouts: (ev.competitions ?? []).length,
    modellableBouts: modellable,
    reason: `only ${modellable} of ${(ev.competitions ?? []).length} bouts have both fighters in the corpus`,
  });
}
if (!event) {
  event = candidates[0];
  skippedForCoverage.length = 0;   // nothing was skipped in favour of something better
  console.log("no card in the window clears the coverage floor — building the next one as-is");
}
if (skippedForCoverage.length) {
  for (const s of skippedForCoverage) console.log(`  skipped ${s.name} (${s.dateUtc.slice(0, 10)}) — ${s.reason}`);
}

/*
 * THE WINNER HEAD TAKES THE TALE OF THE TAPE, WITH A NESTED CALIBRATION LAYER.
 *
 * Adopted on evidence, after one round-trip. At 95.8% physicals coverage the augmented head is
 * sharply better at separating fights — accuracy 57.6% -> 61.1%, gain 0.0147 -> 0.0311, and
 * significant on the correct paired test (McNemar over 1,001 discordant fights, chi2 = 13.44,
 * z = 3.67, p < 0.01). But it overstated its confidence and FAILED the preregistered calibration
 * bar at maxZ 2.014 against 2.0, so it was reverted rather than shipped by 0.014.
 *
 * Platt scaling fixes that, and it has to be fitted NESTED. Fitting it on the training fold's own
 * in-sample predictions learns the identity — a logistic fit is calibrated in-sample by
 * construction, so there is no error there to correct, and the first attempt duly changed nothing
 * (maxZ 2.014 -> 2.097). The distortion exists only out-of-sample, which is where the calibrator has
 * to see it: an inner model fits the first 80% of the training fold and predicts the held-back 20%,
 * and Platt is fitted on THOSE predictions.
 *
 * Result: accuracy 60.6%, gain 0.0317, maxZ 1.375 — every bar cleared, with 0.5pp of accuracy given
 * back for it. Method and round keep the outcome-history features; reach and stance say nothing
 * about HOW or WHEN a fight ends and made both heads worse.
 *
 * Calibration adds no skill. It is worth doing here only because the skill was measured first.
 */
const winRows = rowsOut.map((r) => ({ feat: r.feat, y: r.f.aWon }));
const winModel = fitBinary(winRows, WIN_F_TOTT);
const winCal = (() => {
  const cut = Math.floor(winRows.length * 0.8);
  const innerTrain = winRows.slice(0, cut);
  const innerHold = rowsOut.slice(cut);
  if (innerTrain.length < 200 || innerHold.length < 100) return null;
  const inner = fitBinary(innerTrain, WIN_F_TOTT);
  return fitPlatt(innerHold.map((r) => ({ p: predBinary(inner, r.feat), y: r.f.aWon })));
})();
const winProb = (feat) => { const p = predBinary(winModel, feat); return winCal ? applyPlatt(winCal, p) : p; };
const methodModel = fitSoftmax(rowsOut.map((r) => ({ feat: r.feat, k: METHODS.indexOf(r.f.method) })), CLS_F, 3);
const roundModel = fitSoftmax(rowsOut.map((r) => ({ feat: r.feat, k: Math.min(r.f.round, 3) - 1 })), CLS_F, 3);

/**
 * Features for a FUTURE bout, from the same replayed state the corpus ended on. Fighter names are
 * matched against the corpus by exact name; a fighter we have never seen carries no history, which
 * is reported rather than hidden behind a confident-looking number.
 */
const blankRec = { n: 0, w: 0, koW: 0, subW: 0, decW: 0, koL: 0, subL: 0, decL: 0, dist: 0 };
const pKO = baseMethod.KO / fights.length, pSUB = baseMethod.SUB / fights.length, pDEC = baseMethod.DEC / fights.length;
const rateOf = (num, den, prior, w = 5) => (num + prior * w) / (den + w);
const lg = (p) => Math.log(Math.max(1e-6, p) / Math.max(1e-6, 1 - p));

function featuresFor(nameA, nameB, weightClass, scheduled, whenMs) {
  const A = recByKey.get(nameKey(nameA)) ?? blankRec, B = recByKey.get(nameKey(nameB)) ?? blankRec;
  const wc = wcRec.get(weightClass) ?? { n: 0, KO: 0, SUB: 0, DEC: 0 };
  return {
    feat: {
      // Physicals through the SHARED constructor — omitting them here is what published "NaN%".
      ...tottFeat(tott.get(nameKey(nameA)), tott.get(nameKey(nameB)), whenMs),
      winDiff: lg(rateOf(A.w, A.n, 0.5)) - lg(rateOf(B.w, B.n, 0.5)),
      finishDiff: lg(rateOf(A.koW + A.subW, A.n, pKO + pSUB)) - lg(rateOf(B.koW + B.subW, B.n, pKO + pSUB)),
      durabilityDiff: lg(rateOf(A.koL + A.subL, A.n, pKO + pSUB)) - lg(rateOf(B.koL + B.subL, B.n, pKO + pSUB)),
      expDiff: Math.log1p(A.n) - Math.log1p(B.n),
      koTend: lg(rateOf(A.koW + B.koW, A.n + B.n, pKO)),
      subTend: lg(rateOf(A.subW + B.subW, A.n + B.n, pSUB)),
      decTend: lg(rateOf(A.decW + B.decW, A.n + B.n, pDEC)),
      finishable: lg(rateOf(A.koL + A.subL + B.koL + B.subL, A.n + B.n, pKO + pSUB)),
      wcKO: lg(rateOf(wc.KO, wc.n, pKO, 25)),
      wcSUB: lg(rateOf(wc.SUB, wc.n, pSUB, 25)),
      five: scheduled === 5 ? 1 : 0,
      experience: Math.log1p(Math.min(A.n, B.n)),
    },
    priorFights: { a: A.n, b: B.n },
  };
}

/**
 * The reader-facing profile for one fighter: recent form, a short read on how they win and how they
 * lose, all derived from the corpus. Nothing here is written by hand — a claim like "dangerous early"
 * has to fall out of that fighter's own finish distribution or it does not appear.
 */
function profileFor(name) {
  const key = nameKey(name);
  const log = logByKey.get(key) ?? [];
  const r = recByKey.get(key);
  if (!r || r.n === 0) return { bouts: 0, last5: [], strengths: [], weaknesses: [], summary: null };

  const last5 = log.slice(-5).reverse().map((b) => ({
    date: b.date, opponent: b.opponent, result: b.won ? "W" : "L",
    method: b.method, round: b.round, weightClass: b.weightClass,
  }));

  const pct = (num, den) => (den > 0 ? num / den : 0);
  const finishRate = pct(r.koW + r.subW, r.w);
  const koShare = pct(r.koW, r.koW + r.subW);
  const finishedRate = pct(r.koL + r.subL, r.n - r.w);
  const distanceRate = pct(r.dist, r.n);
  const winRate = pct(r.w, r.n);

  const strengths = [];
  if (r.w >= 3 && finishRate >= 0.6) strengths.push(koShare >= 0.6 ? "Finishes fights — mostly by knockout" : "Finishes fights — mostly by submission");
  if (r.subW >= 3) strengths.push(`${r.subW} career submission wins in this corpus`);
  if (r.koW >= 3) strengths.push(`${r.koW} career knockouts in this corpus`);
  if (winRate >= 0.7 && r.n >= 5) strengths.push(`${Math.round(winRate * 100)}% win rate across ${r.n} tracked bouts`);
  if (distanceRate >= 0.6 && r.n >= 5) strengths.push("Durable — most of his fights reach the judges");

  const weaknesses = [];
  if (r.n - r.w >= 2 && finishedRate >= 0.6) weaknesses.push("When he loses, he tends to get finished rather than out-pointed");
  if (r.n >= 5 && winRate <= 0.45) weaknesses.push(`${Math.round((1 - winRate) * 100)}% of his tracked bouts are losses`);
  if (r.w >= 3 && finishRate <= 0.2) weaknesses.push("Rarely finishes — needs the judges");
  if (!strengths.length) strengths.push(`${r.n} tracked bouts — too few clear tendencies to call out`);
  if (!weaknesses.length) weaknesses.push("No consistent weakness stands out in the tracked record");

  const recent = last5.filter((b) => b.result === "W").length;
  return {
    bouts: r.n, record: { wins: r.w, losses: r.n - r.w },
    last5, strengths: strengths.slice(0, 3), weaknesses: weaknesses.slice(0, 2),
    summary: `${recent}-${last5.length - recent} in his last ${last5.length}. ${Math.round(finishRate * 100)}% of his wins come by finish; ${Math.round(distanceRate * 100)}% of his fights reach the judges.`,
  };
}

/**
 * WHY this fighter, in one line — assembled from the features that actually moved the prediction,
 * never from a template. If nothing separates them, it says that instead of inventing a reason.
 */
function reasonFor(pickName, otherName, pWin, method, rounds) {
  const A = recByKey.get(nameKey(pickName)), B = recByKey.get(nameKey(otherName));
  if (!A || !B) return null;
  const rate = (num, den, fallback) => (den > 0 ? num / den : fallback);
  const bits = [];
  const winA = rate(A.w, A.n, 0.5), winB = rate(B.w, B.n, 0.5);
  if (winA - winB >= 0.12) bits.push(`wins ${Math.round(winA * 100)}% of his bouts to ${otherName.split(" ").pop()}'s ${Math.round(winB * 100)}%`);
  const finA = rate(A.koW + A.subW, A.w, 0), finishedB = rate(B.koL + B.subL, B.n - B.w, 0);
  if (finA >= 0.55 && finishedB >= 0.5) bits.push(`he finishes ${Math.round(finA * 100)}% of his wins and ${otherName.split(" ").pop()} has been finished in ${Math.round(finishedB * 100)}% of his losses`);
  else if (finA >= 0.6) bits.push(`${Math.round(finA * 100)}% of his wins come by finish`);
  const expEdge = A.n - B.n;
  if (Math.abs(expEdge) >= 8) bits.push(expEdge > 0 ? `${A.n} tracked bouts against ${B.n}` : `the shorter record belongs to him (${A.n} vs ${B.n}), so the read leans on his opponent's history`);
  if (!bits.length) return `The model separates these two by very little — ${Math.round(pWin * 100)}% is close to a coin flip, and nothing in either record breaks the tie cleanly.`;
  const tail = method === "DEC" ? "and the matchup profiles as one that reaches the judges" : `and the finish profile points to a ${method === "KO" ? "knockout" : "submission"}`;
  return `${pickName} ${bits.slice(0, 2).join(", ")} — ${tail}.`;
}

// ── Card ────────────────────────────────────────────────────────────────────────────────────────
const card = [];
for (const c of event.competitions ?? []) {
  const cs = c.competitors ?? [];
  if (cs.length !== 2) continue;
  const side = (x) => ({
    athleteId: String(x.id ?? ""),
    name: x.athlete?.displayName ?? "",
    record: (x.records ?? [])[0]?.summary ?? null,
    // Verified live against every fighter on this card before wiring: all 24 resolve.
    photoUrl: x.id ? `https://a.espncdn.com/i/headshots/mma/players/full/${x.id}.png` : null,
    priorBoutsInCorpus: recByKey.get(nameKey(x.athlete?.displayName ?? ""))?.n ?? 0,
  });
  const red = side(cs[0]), blue = side(cs[1]);
  const wc = c.type?.abbreviation ?? "Unknown";
  const scheduled = c.format?.regulation?.periods ?? 3;

  // Corner canonicalisation must match the training convention EXACTLY — alphabetical, never the
  // order the provider happens to list. Getting this backwards silently inverts every win figure.
  const [nameA, nameB] = [red.name, blue.name].slice().sort((x, y) => x.localeCompare(y));
  const { feat, priorFights } = featuresFor(nameA, nameB, WC_MAP[wc] ?? wc, scheduled, Date.parse(event.date));
  // A UFC DEBUTANT is a real thing, not a data gap: the model still knows the established fighter,
  // and the newcomer is genuinely an unknown quantity. Publishing with that stated is more useful
  // than blanking the bout — the alternative was four fights on this card showing nothing at all.
  const known = Math.max(priorFights.a, priorFights.b);
  const bothKnown = Math.min(priorFights.a, priorFights.b) >= 2;
  const informed = known >= 3;

  let prediction = null;
  if (informed) {
    /*
     * REFUSE TO PUBLISH A NUMBER THAT IS NOT A NUMBER.
     *
     * The card builder once shipped thirteen bouts reading "NaN%": training grew the tale-of-the-tape
     * features and this path did not, so a weight multiplied `undefined`. Nothing threw — NaN is a
     * float, it survives the sigmoid, `toFixed` renders it, JSON writes it as null. The whole gate
     * suite was green over a page of NaN.
     *
     * A missing feature is a code defect, not a data gap, so this ABORTS rather than degrading to a
     * blank bout — a silent blank would look exactly like the honest "no history" state and hide it.
     */
    const missing = [...WIN_F_TOTT, ...CLS_F].filter((k) => !Number.isFinite(feat[k]));
    if (missing.length) {
      console.error(`ufc card: ${nameA} vs ${nameB} — feature(s) ${missing.join(", ")} absent or non-finite.`);
      console.error("The live construction has drifted from the training construction. Not publishing.");
      process.exit(1);
    }

    const pA = winProb(feat);   // calibrated — see the nested-Platt note above
    const pm = predSoftmax(methodModel, feat);
    const pr = predSoftmax(roundModel, feat);
    const winnerName = pA >= 0.5 ? nameA : nameB;
    prediction = {
      winner: V.winner === "PASS" ? {
        name: winnerName,
        probability: Number((pA >= 0.5 ? pA : 1 - pA).toFixed(4)),
        byFighter: { [nameA]: Number(pA.toFixed(4)), [nameB]: Number((1 - pA).toFixed(4)) },
      } : null,
      method: V.method === "PASS" ? {
        most: METHODS[pm.indexOf(Math.max(...pm))],
        probabilities: { ko: Number(pm[0].toFixed(4)), submission: Number(pm[1].toFixed(4)), decision: Number(pm[2].toFixed(4)) },
      } : null,
      rounds: V.round === "PASS" ? {
        // The corpus supports 1 / 2 / 3-or-later; 4th and 5th rounds are 4.4% of all fights, too few
        // to split without inventing precision, so they stay inside the final bucket.
        endsIn: ["1", "2", "3+"][pr.indexOf(Math.max(...pr))],
        probabilities: { round1: Number(pr[0].toFixed(4)), round2: Number(pr[1].toFixed(4)), round3plus: Number(pr[2].toFixed(4)) },
        goesTheDistance: Number((pm[2]).toFixed(4)),
      } : null,
      priorFights,
      basis: bothKnown ? "BOTH_FIGHTERS" : "ONE_FIGHTER_DEBUT",
      basisNote: bothKnown
        ? null
        : "One fighter has no UFC history in our corpus, so this read leans on the established fighter's record and league-average priors for the newcomer. Treat it as weaker than a bout where both sides are known.",
    };
  }

  const redProfile = profileFor(red.name);
  const blueProfile = profileFor(blue.name);
  const reason = prediction?.winner
    ? reasonFor(prediction.winner.name, prediction.winner.name === red.name ? blue.name : red.name,
                prediction.winner.probability, prediction.method?.most ?? "DEC", prediction.rounds?.endsIn ?? "3+")
    : null;

  card.push({
    boutId: String(c.id ?? ""),
    weightClass: wc,
    scheduledRounds: scheduled,
    startUtc: c.date ?? event.date,
    titleFight: scheduled === 5,
    red: { ...red, profile: redProfile },
    blue: { ...blue, profile: blueProfile },
    prediction: prediction ? { ...prediction, reason } : null,
    unmodelledReason: prediction ? null : "Neither fighter has enough UFC history in our corpus to build a read from.",
  });
}
// Main event last in the provider feed — present the card the way it is watched, main event first.
card.reverse();

const artifact = {
  generatedAt: NOW,
  sport: "ufc",
  state: "SCHEDULED_CARD",
  event: {
    providerEventId: String(event.id ?? ""),
    name: event.name ?? "",
    startUtc: event.date ?? "",
    slateDate: etDay(event.date ?? NOW),
    venue: event.competitions?.[0]?.venue?.fullName ?? null,
    boutCount: card.length,
  },
  /*
   * Cards nearer than this one that the model cannot read, so the page can say so instead of
   * looking like it missed them. Empty on a normal week; on a Contender Series week it carries the
   * DWCS card and the count of bouts we have history for — which is what makes the skip auditable
   * rather than a quiet preference for the card we happen to like.
   */
  skippedForCoverage,
  model: {
    id: "ufc-fight-v1",
    publishes: ["winner", "method", "rounds"].filter((h) => V[h === "rounds" ? "round" : h] === "PASS"),
    verdicts: V,
    corpus: {
      fights: evaluation.corpus?.fights ?? null,
      from: evaluation.corpus?.from ?? null,
      to: evaluation.corpus?.to ?? null,
      source: evaluation.corpus?.source ?? null,
    },
    evidence: {
      heldOutFights: evaluation.heads?.winner?.n ?? null,
      winner: evaluation.heads?.winner ?? null,
      method: evaluation.heads?.method ?? null,
      round: evaluation.heads?.round ?? null,
    },
    notModelled: {
      moneyline:
        "No sportsbook price is published or compared. Our authorisation to buy odds covers NFL only, so there is no captured UFC line to show — the win probability here is the model's own, standing alone.",
    },
  },
  bouts: card,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "card-latest.json"), JSON.stringify(artifact, null, 1) + "\n");
console.log(`ufc card: ${artifact.event.name} · ${card.length} bouts · ${artifact.event.slateDate} · heads ${artifact.model.publishes.join("+") || "NONE"}`);
for (const b of card.slice(0, 4)) {
  const p = b.prediction;
  console.log(`  ${b.red.name} vs ${b.blue.name} (${b.weightClass})` +
    (p?.winner ? ` · ${p.winner.name} ${(p.winner.probability * 100).toFixed(0)}%` : " · no history") +
    (p?.method ? ` · ${p.method.most} ${(Math.max(...Object.values(p.method.probabilities)) * 100).toFixed(0)}%` : "") +
    (p?.rounds ? ` · ends R${p.rounds.endsIn}` : ""));
}
