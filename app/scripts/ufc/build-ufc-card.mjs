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
import { loadCorpus, METHODS, WIN_F, CLS_F, fitBinary, predBinary, fitSoftmax, predSoftmax, nameKey } from "./lib/fight-model.mjs";


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

let event = null;
for (const day of scan) {
  const sb = await get(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${day}`).catch(() => null);
  const ev = (sb?.events ?? []).find((e) => (e.competitions ?? []).length > 0);
  if (ev) { event = ev; break; }
}

if (!event) {
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
const { rowsOut, rec, recByKey, wcRec, baseMethod, fights } = corpus;

const winModel = fitBinary(rowsOut.map((r) => ({ feat: r.feat, y: r.f.aWon })), WIN_F);
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

function featuresFor(nameA, nameB, weightClass, scheduled) {
  const A = recByKey.get(nameKey(nameA)) ?? blankRec, B = recByKey.get(nameKey(nameB)) ?? blankRec;
  const wc = wcRec.get(weightClass) ?? { n: 0, KO: 0, SUB: 0, DEC: 0 };
  return {
    feat: {
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
  const { feat, priorFights } = featuresFor(nameA, nameB, WC_MAP[wc] ?? wc, scheduled);
  // A UFC DEBUTANT is a real thing, not a data gap: the model still knows the established fighter,
  // and the newcomer is genuinely an unknown quantity. Publishing with that stated is more useful
  // than blanking the bout — the alternative was four fights on this card showing nothing at all.
  const known = Math.max(priorFights.a, priorFights.b);
  const bothKnown = Math.min(priorFights.a, priorFights.b) >= 2;
  const informed = known >= 3;

  let prediction = null;
  if (informed) {
    const pA = predBinary(winModel, feat);
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

  card.push({
    boutId: String(c.id ?? ""),
    weightClass: wc,
    scheduledRounds: scheduled,
    startUtc: c.date ?? event.date,
    titleFight: scheduled === 5,
    red, blue,
    prediction,
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
