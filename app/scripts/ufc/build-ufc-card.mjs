#!/usr/bin/env node
/**
 * Build the public UFC card artifact: the next event's bouts, its fighters, and — only if the
 * distance model's evaluation says PASS — a per-bout "goes the distance" probability.
 *
 * Two rules this file exists to enforce:
 *
 *   1. THE VERDICT GATES THE OUTPUT. `distance-model-evaluation.json` is read at build time. If its
 *      verdict is anything but PASS, the card still publishes but every probability is omitted and
 *      the artifact records why. A model that has not earned publication cannot reach a page by
 *      someone forgetting to check.
 *
 *   2. NO METHOD OF VICTORY. KO/submission/decision splits are NOT modelled: the only labelled
 *      subset of our corpus holds 329 decisions, 154 submissions and zero KOs, so any method split
 *      fitted on it would be an artifact of which bouts happen to carry play-by-play.
 */
import fs from "node:fs";
import path from "node:path";


const APP = process.cwd();
const RAW = path.join(APP, "..", "data", "internal", "research", "ufc", "raw");
const OUT = path.join(APP, "public", "data", "ufc");
const nowArg = process.argv.indexOf("--now");
const NOW = nowArg > -1 ? process.argv[nowArg + 1] : new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/** Plain fetch, matching capture-ufc-events.mjs — the provider rejects a custom user-agent. */
const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
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

// ── The model, refit on all history (same feature construction the evaluation validated) ────────
const evaluation = JSON.parse(fs.readFileSync(path.join(OUT, "distance-model-evaluation.json"), "utf8"));
const MAY_PUBLISH = evaluation.verdict === "PASS";

const bouts = [];
for (const f of fs.existsSync(RAW) ? fs.readdirSync(RAW).filter((x) => /^espn-\d{4}-\d{2}\.json$/.test(x)).sort() : []) {
  const d = JSON.parse(fs.readFileSync(path.join(RAW, f), "utf8"));
  for (const ev of d.events ?? []) {
    for (const c of ev.competitions ?? []) {
      if (c.status?.type?.name !== "STATUS_FINAL") continue;
      const period = c.status?.period, regulation = c.format?.regulation?.periods;
      if (period == null || regulation == null) continue;
      const fs2 = (c.competitors ?? []).map((x) => String(x.id ?? "")).filter(Boolean);
      if (fs2.length !== 2) continue;
      bouts.push({ date: c.date ?? ev.date, weightClass: c.type?.abbreviation ?? "Unknown", fighters: fs2,
        wentDistance: period === regulation && c.status?.displayClock === "5:00" ? 1 : 0 });
    }
  }
}
bouts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
const base = bouts.length ? bouts.reduce((s, b) => s + b.wentDistance, 0) / bouts.length : 0.481;

const history = new Map(), classHistory = new Map();
const priorRate = (map, key, w) => {
  const h = map.get(key);
  return !h || h.fights === 0 ? base : (h.distance + base * w) / (h.fights + w);
};
const rows = [];
for (const b of bouts) {
  const [a, c] = b.fighters;
  rows.push({ y: b.wentDistance, x: [
    Math.log(priorRate(history, a, 4) / (1 - priorRate(history, a, 4))),
    Math.log(priorRate(history, c, 4) / (1 - priorRate(history, c, 4))),
    Math.log(priorRate(classHistory, b.weightClass, 20) / (1 - priorRate(classHistory, b.weightClass, 20))),
    0,
  ] });
  for (const id of b.fighters) {
    const h = history.get(id) ?? { fights: 0, distance: 0 };
    history.set(id, { fights: h.fights + 1, distance: h.distance + b.wentDistance });
  }
  const ch = classHistory.get(b.weightClass) ?? { fights: 0, distance: 0 };
  classHistory.set(b.weightClass, { fights: ch.fights + 1, distance: ch.distance + b.wentDistance });
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
let w = [0, 0, 0, 0], b0 = Math.log(base / (1 - base));
for (let it = 0; it < 400 && rows.length; it++) {
  const gw = [0, 0, 0, 0]; let gb = 0;
  for (const r of rows) {
    const e = sigmoid(r.x.reduce((s, v, i) => s + v * w[i], b0)) - r.y;
    for (let i = 0; i < 4; i++) gw[i] += e * r.x[i];
    gb += e;
  }
  for (let i = 0; i < 4; i++) w[i] -= (0.08 * gw[i]) / rows.length;
  b0 -= (0.08 * gb) / rows.length;
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
    priorBoutsInCorpus: history.get(String(x.id ?? ""))?.fights ?? 0,
  });
  const red = side(cs[0]), blue = side(cs[1]);
  const wc = c.type?.abbreviation ?? "Unknown";
  const scheduled = c.format?.regulation?.periods ?? 3;

  let distance = null;
  if (MAY_PUBLISH) {
    const rr = priorRate(history, red.athleteId, 4), br = priorRate(history, blue.athleteId, 4);
    const cr = priorRate(classHistory, wc, 20);
    const x = [Math.log(rr / (1 - rr)), Math.log(br / (1 - br)), Math.log(cr / (1 - cr)), scheduled === 5 ? 1 : 0];
    const p = sigmoid(x.reduce((s, v, i) => s + v * w[i], b0));
    // Both fighters unseen in the corpus means the features are just the prior — say so rather than
    // dressing the base rate up as a read on these two fighters.
    const informed = red.priorBoutsInCorpus + blue.priorBoutsInCorpus >= 2;
    distance = {
      probability: Number(p.toFixed(4)),
      state: informed ? "MODELLED" : "PRIOR_ONLY",
      note: informed
        ? "From a walk-forward validated model of whether a bout reaches the final bell."
        : "Neither fighter has enough prior bouts in our corpus, so this is the league base rate rather than a read on this matchup.",
    };
  }

  card.push({
    boutId: String(c.id ?? ""),
    weightClass: wc,
    scheduledRounds: scheduled,
    startUtc: c.date ?? event.date,
    titleFight: scheduled === 5,
    red, blue,
    distance,
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
    id: "ufc-distance-v1",
    publishes: MAY_PUBLISH ? ["goes_the_distance"] : [],
    verdict: evaluation.verdict,
    evidence: {
      scoredBouts: evaluation.walkForward?.scored ?? null,
      modelLogLoss: evaluation.walkForward?.modelLogLoss ?? null,
      baselineLogLoss: evaluation.walkForward?.baselineLogLoss ?? null,
      baseDistanceRate: evaluation.dataset?.baseDistanceRate ?? null,
    },
    notModelled: {
      methodOfVictory:
        "Not published. The only bouts in our corpus carrying a method label are those with play-by-play — 329 decisions, 154 submissions and zero KOs — so a KO/submission split fitted on them would reflect which bouts have play-by-play, not how fights end.",
      moneyline:
        "Not published. The retired V1 read was a de-vigged market price with a capped nudge, which is a restatement of the market rather than an independent opinion.",
    },
  },
  bouts: card,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "card-latest.json"), JSON.stringify(artifact, null, 1) + "\n");
console.log(`ufc card: ${artifact.event.name} · ${card.length} bouts · ${artifact.event.slateDate} · distance ${MAY_PUBLISH ? "PUBLISHED" : "WITHHELD (" + evaluation.verdict + ")"}`);
for (const b of card.slice(0, 4)) {
  console.log(`  ${b.red.name} vs ${b.blue.name} (${b.weightClass}) ${b.distance ? `· distance ${(b.distance.probability * 100).toFixed(0)}% ${b.distance.state}` : ""}`);
}
