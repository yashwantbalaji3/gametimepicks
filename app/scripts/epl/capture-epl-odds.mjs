/**
 * PREMIER LEAGUE PRICES — one bulk call, under the committed EPL authorization.
 *
 * Authorized by docs/receipts/ODDS_AUTHORIZATION_EPL.md: EPL only, h2h + totals, us region only,
 * bulk endpoint only, 500-credit cumulative ceiling. That receipt is parsed FAIL-CLOSED every run
 * and cannot be substituted by the NFL or UFC ones — the parser refuses a receipt whose scope names
 * a different sport key, in every direction.
 *
 * ── What this is FOR ────────────────────────────────────────────────────────────────────────────
 * The committed EPL model card names this snapshot as its own precondition: "research comparison
 * against three-way no-vig markets ONLY AFTER an authorized snapshot exists", with
 * publicActivation OFF. So the point of buying these prices is to find out whether the model is
 * worth publishing — and three MLB markets and two NFL models have already been rejected at exactly
 * that step. Capturing prices is not activating anything.
 *
 * ── The de-vig is not optional ──────────────────────────────────────────────────────────────────
 * A three-way book price sums to well over 1. Comparing a model probability against a raw implied
 * price scores the model against the bookmaker's margin as well as its opinion, which flatters or
 * punishes it for the wrong reason. The no-vig probabilities are computed here, once, so every
 * downstream comparison uses the same de-vigged numbers.
 *
 * Writes public   public/data/soccer/epl/odds/capture-<date>.json   (+ latest.json)
 *        private  data/internal/research/odds/epl/authorization-ledger.json
 *
 * Default is --dry-run: it plans, prices the worst case and refuses to spend unless --apply.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSportAuthorizationReceipt, emptyLedger, assertCallAllowed, recordRequest,
  assertNoSecretLeak, classifyProviderResult, isDuplicateRequest, LEDGER_RELPATH,
} from "../../src/lib/sports/odds/p171-authorization.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RECEIPT = path.join(REPO, "docs", "receipts", "ODDS_AUTHORIZATION_EPL.md");
const LEDGER = path.join(REPO, LEDGER_RELPATH.epl);
const OUT = path.join(APP, "public", "data", "soccer", "epl", "odds");

const has = (f) => process.argv.includes(f);
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const APPLY = has("--apply");
const NOW = arg("--now", new Date().toISOString());

/* Fixed by the receipt. Constants, not options — a flag must not be able to widen the purchase. */
const SPORT_KEY = "soccer_epl";
const MARKETS = ["h2h", "totals"];
const REGIONS = ["us"];
const WORST_CASE_CREDITS = MARKETS.length * REGIONS.length;   // the provider's own cost formula

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const etDay = (iso) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(iso));

// ── 1 · AUTHORIZATION, BEFORE ANYTHING ELSE ─────────────────────────────────────────────────────
const receipt = (() => { try { return fs.readFileSync(RECEIPT, "utf8"); } catch { return null; } })();
if (!receipt) {
  console.error(`epl odds: no committed receipt at ${path.relative(REPO, RECEIPT)} — authorization is never inferred.`);
  process.exit(1);
}
const auth = parseSportAuthorizationReceipt(receipt, "epl");
if (!auth.ok) {
  console.error("epl odds: the receipt did not parse. Refusing to spend.");
  for (const e of auth.errors) console.error(`  · ${e}`);
  process.exit(1);
}

/** The newest committed season capture. Empty on any failure — see the guard below for why that matters. */
function loadFixtures() {
  const dir = path.join(APP, "public", "data", "soccer", "epl", "fixtures");
  try {
    const f = fs.readdirSync(dir).filter((n) => n.startsWith("capture-") && n.endsWith(".json")).sort().pop();
    return f ? (readJson(path.join(dir, f))?.rows ?? []) : [];
  } catch { return []; }
}

/*
 * ── DO NOT BUY PRICES FOR A SLATE THAT DOES NOT EXIST ──────────────────────────────────────────
 *
 * There was no fixture guard here at all. Every cron slot called the provider whether or not a
 * match was coming, so a week with no Friday and no Monday fixture still bought prices for both.
 * Projected against the real 380-fixture season that cadence spends 892 credits; the receipt's
 * ceiling is 500. The ledger's per-call check would have caught it — in February, as every
 * remaining fixture quietly fell to READY_EXCEPT_ODDS with no explanation on the page.
 *
 * A kickoff must be STRICTLY AHEAD: the capture excludes an event already under way, so a window
 * containing only in-progress matches has nothing purchasable in it.
 *
 * WHY 30 HOURS. It has to reach from the night-before slot to the next day's earliest kickoff — a
 * 21:00 UTC run before an 11:30 Saturday is 14.5h, and before a Monday 19:00 it is 22h — while
 * still refusing a slot whose nearest match is a different weekend. Measured across the committed
 * season: 154 of 446 firings spend, 316 credits total, 184 under the ceiling.
 *
 * AN UNREADABLE FIXTURE LIST DOES NOT SPEND. Zero fixtures means the question "is a match coming?"
 * could not be answered, and buying on an unanswered question is how a broken capture becomes a
 * budget breach. The refusal is loud rather than a silent skip.
 */
const KICKOFF_WINDOW_H = Number(arg("--require-kickoff-within-hours", "30"));
{
  const nowMs = Date.parse(NOW);
  const upcoming = loadFixtures()
    .map((r) => Date.parse(r?.kickoffIso ?? ""))
    .filter((t) => Number.isFinite(t) && t > nowMs && t <= nowMs + KICKOFF_WINDOW_H * 3_600_000);
  if (!upcoming.length) {
    const all = loadFixtures().map((r) => Date.parse(r?.kickoffIso ?? "")).filter(Number.isFinite);
    if (!all.length) {
      console.error("epl odds: REFUSED — no fixture list could be read, so there is no way to know whether a match is coming. Not spending on an unanswered question.");
      process.exit(1);
    }
    const next = all.filter((t) => t > nowMs).sort((a, b) => a - b)[0];
    const away = next ? ((next - nowMs) / 3_600_000).toFixed(1) : null;
    console.log(`epl odds: SKIPPED — no kickoff within ${KICKOFF_WINDOW_H}h${next ? ` (next is ${away}h away, ${new Date(next).toISOString()})` : " (no fixtures remain)"}. Nothing bought.`);
    process.exit(0);
  }
}

let ledger = readJson(LEDGER) ?? emptyLedger(path.relative(REPO, RECEIPT), { sport: "epl", program: "EPL" });
const allowed = assertCallAllowed({ authorization: auth, ledger, worstCaseCredits: WORST_CASE_CREDITS, purpose: "matchweek bulk h2h+totals" });
if (!allowed.ok) { for (const e of allowed.errors) console.error(`epl odds: ${e}`); process.exit(1); }
console.log(`authorization: epl ${MARKETS.join("+")}/${REGIONS.join(",")} · ceiling ${auth.ceiling} · spent ${allowed.cumulative} · worst case ${WORST_CASE_CREDITS} · remaining ${allowed.remaining}`);

if (!APPLY) {
  console.log(`DRY RUN — would call GET /v4/sports/${SPORT_KEY}/odds?regions=${REGIONS.join(",")}&markets=${MARKETS.join(",")} (worst case ${WORST_CASE_CREDITS} credits).`);
  console.log("Nothing was spent. Re-run with --apply to buy.");
  process.exit(0);
}

// ── 2 · THE CALL ────────────────────────────────────────────────────────────────────────────────
const KEY = (process.env.ODDS_API_KEY ?? "").trim();
if (!KEY) { console.error("epl odds: ODDS_API_KEY is not set in this environment."); process.exit(1); }

const fingerprint = `epl|${SPORT_KEY}|${MARKETS.join(",")}|${REGIONS.join(",")}`;
const dup = isDuplicateRequest(ledger, { fingerprint, nowIso: NOW, freshnessMinutes: 60 });
if (dup.duplicate) { console.log(`epl odds: ${dup.reason}`); process.exit(0); }

const url = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds?regions=${REGIONS.join(",")}&markets=${MARKETS.join(",")}&oddsFormat=american`;
let status = 0, body = null, headers = {};
try {
  const res = await fetch(`${url}&apiKey=${KEY}`, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } });
  status = res.status;
  headers = {
    "x-requests-last": res.headers.get("x-requests-last"),
    "x-requests-used": res.headers.get("x-requests-used"),
    "x-requests-remaining": res.headers.get("x-requests-remaining"),
  };
  body = await res.json().catch(() => null);
} catch (e) {
  console.error(`epl odds: request failed before a response (${e.name}). Not retrying.`);
  process.exit(1);
}

const cls = classifyProviderResult({ status, body });
ledger = recordRequest(ledger, {
  at: NOW, purpose: "matchweek bulk h2h+totals", endpoint: `/sports/${SPORT_KEY}/odds`,
  events: Array.isArray(body) ? body.length : null, markets: MARKETS, regions: REGIONS,
  status, headers, charged: status === 200, fingerprint, resultClass: cls.class,
});
fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + "\n");

if (cls.class !== "OK") {
  console.error(`epl odds: ${cls.class} — ${cls.action}`);
  console.error(`  provider status ${status}; cumulative spend now ${ledger.cumulativeCredits}/${auth.ceiling}`);
  process.exit(1);
}

// ── 3 · JOIN TO THE INTERNAL FIXTURE IDS ────────────────────────────────────────────────────────
/*
 * THE PROVIDER'S EVENT ID IS NOT OUR EVENT ID.
 *
 * runEplShadow matches an odds row to a fixture on `fixture.eventId`, which is our own
 * "soccer:epl:arsenal-v-coventry-city:20260821t1900". The provider supplies its own opaque id and
 * club NAMES. Publishing the provider id would make every row fail that match silently — the model
 * would keep reporting "no authorized odds snapshot" with a full price capture sitting on disk,
 * which is precisely the kind of failure this repo keeps finding after the fact.
 *
 * So the join is on folded club names within a kickoff window, and it REFUSES rather than guesses:
 * a provider event that matches no fixture, or more than one, is quarantined with its reason. An
 * ambiguous join is how one club's prices end up on another club's match.
 */
const foldClub = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b(fc|afc|association football club)\b/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/*
 * DELIBERATELY EMPTY UNTIL THERE IS EVIDENCE.
 *
 * An alias is a CLAIM that two names are the same club, and a wrong one silently puts one match's
 * prices on another. The first draft of this table was populated from memory and was backwards: it
 * mapped full official names to abbreviations, while the committed fixture source writes the full
 * forms ("manchester united", "wolverhampton wanderers"). Every one of those aliases would have
 * broken a join that otherwise worked.
 *
 * The provider's own club strings have never been observed here — no EPL capture has succeeded yet.
 * So this stays empty and the quarantine below names any club that fails to join, which turns
 * Thursday's first run into the evidence this table should be built from. Guessing now would mean
 * shipping an alias nobody has checked, in the one place where a wrong guess is invisible.
 */
const CLUB_ALIASES = {};
const clubKey = (s) => { const f = foldClub(s); return CLUB_ALIASES[f] ?? f; };

const fixtures = loadFixtures();

const quarantined = [];
function fixtureFor(ev) {
  const home = clubKey(ev.home_team), away = clubKey(ev.away_team);
  const kick = Date.parse(ev.commence_time ?? "");
  const hits = fixtures.filter((f) => {
    if (clubKey(f.homeClub) !== home || clubKey(f.awayClub) !== away) return false;
    const fk = Date.parse(f.kickoffIso ?? "");
    return !Number.isFinite(kick) || !Number.isFinite(fk) || Math.abs(fk - kick) <= 36 * 3600_000;
  });
  if (hits.length === 1) return hits[0];
  quarantined.push({
    providerEventId: ev.id, home: ev.home_team, away: ev.away_team, commenceUtc: ev.commence_time,
    reason: hits.length === 0
      ? "no fixture matches these clubs within 36h of the provider kickoff — an unrecognised club name is naming drift, never a silent new fixture"
      : `${hits.length} fixtures match these clubs — an ambiguous join is how one match's prices land on another`,
  });
  return null;
}

// ── 4 · CONSENSUS + DE-VIG ──────────────────────────────────────────────────────────────────────
const median = (xs) => { const s = [...xs].sort((a, z) => a - z); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const toDec = (american) => (american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american));
const toAm = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));

const rows = [];
/* Per-bookmaker rows, in the shape runEplShadow consumes. It de-vigs EACH book separately — a
   consensus median cannot be de-vigged as a book, because the median of three books is not a price
   any book posted and its implied sum means nothing. */
const shadowRows = [];
/*
 * NEVER PRICE A MATCH THAT HAS ALREADY KICKED OFF.
 *
 * The receipt forbids it, and until now the only thing enforcing it was the SCHEDULE: every cron had
 * to sit at or before 09:00 UTC so a run could not drift past the earliest 11:30 kickoff. That made
 * safety a property of the clock, with two costs — a drifting runner could still land late, and it
 * forced captures so far ahead of the afternoon and evening fixtures that runEplShadow refused the
 * prices as stale. Nine of matchweek 1's ten fixtures published nothing for exactly that reason.
 *
 * The rule now lives in code, where it can be checked: an event whose kickoff is at or before the
 * capture clock is EXCLUDED and recorded, never quietly dropped. Safety no longer depends on when
 * the runner happens to start, so the cadence is free to sit close to kickoff.
 */
const started = [];
for (const ev of Array.isArray(body) ? body : []) {
  const evKick = Date.parse(ev.commence_time ?? "");
  if (Number.isFinite(evKick) && evKick <= Date.parse(NOW)) {
    started.push({ providerEventId: ev.id, home: ev.home_team, away: ev.away_team, commenceUtc: ev.commence_time,
      reason: "kickoff at/before the capture clock — an in-progress match is never priced" });
    continue;
  }
  const fixture = fixtureFor(ev);
  if (!fixture) continue;                       // quarantined above, with its reason
  /* Consensus = the median across books per outcome. One book's number is that book's opinion. */
  const acc = new Map();  // `${marketKey}|${outcomeName}|${point ?? ""}` -> [decimal, ...]
  for (const bk of ev.bookmakers ?? []) {
    for (const m of bk.markets ?? []) {
      if (!MARKETS.includes(m.key)) continue;     // never record a market we did not buy
      for (const o of m.outcomes ?? []) {
        const k = `${m.key}|${o.name}|${o.point ?? ""}`;
        const d = toDec(Number(o.price));
        if (!Number.isFinite(d) || d <= 1) continue;
        acc.set(k, [...(acc.get(k) ?? []), d]);
      }
    }
  }
  if (!acc.size) continue;

  const h2h = [...acc.entries()].filter(([k]) => k.startsWith("h2h|"));
  const totals = [...acc.entries()].filter(([k]) => k.startsWith("totals|"));

  /*
   * De-vig proportionally across the THREE-way market as a set. Doing it per outcome, or treating
   * a draw as a two-way complement, is what makes a soccer comparison quietly wrong.
   */
  const devig = (entries) => {
    const raw = entries.map(([k, xs]) => ({ key: k, decimal: median(xs), books: xs.length }));
    const sum = raw.reduce((n, r) => n + 1 / r.decimal, 0);
    return raw.map((r) => ({
      outcome: r.key.split("|")[1],
      point: r.key.split("|")[2] === "" ? null : Number(r.key.split("|")[2]),
      american: toAm(r.decimal),
      books: r.books,
      impliedRaw: Number((1 / r.decimal).toFixed(4)),
      noVig: sum > 0 ? Number((1 / r.decimal / sum).toFixed(4)) : null,
    }));
  };

  for (const bk of ev.bookmakers ?? []) {
    for (const m of bk.markets ?? []) {
      if (m.key !== "h2h") continue;            // the shadow's three-way path only
      const price = (name) => (m.outcomes ?? []).find((o) => clubKey(o.name) === clubKey(name) || String(o.name).toLowerCase() === name)?.price ?? null;
      shadowRows.push({
        eventId: fixture.eventId,               // OUR id — this is the whole point of the join
        marketType: "h2h",
        bookmaker: bk.key,
        capturedAt: NOW,
        home: price(ev.home_team), draw: price("draw"), away: price(ev.away_team),
      });
    }
  }

  rows.push({
    eventId: fixture.eventId,
    providerEventId: ev.id,
    kickoffIso: fixture.kickoffIso ?? ev.commence_time,
    home: ev.home_team, away: ev.away_team,
    matchResult: h2h.length ? devig(h2h) : null,
    /* Totals de-vig per LINE, not across every line at once — over 2.5 and over 3.5 are separate
       markets and pooling them would produce a probability set that sums to nothing meaningful. */
    totalGoals: totals.length
      ? Object.values(totals.reduce((by, [k, xs]) => {
          const point = k.split("|")[2];
          (by[point] ??= []).push([k, xs]);
          return by;
        }, {})).map((group) => ({ line: Number(group[0][0].split("|")[2]), outcomes: devig(group) }))
      : null,
  });
}

const snapshot = {
  schemaVersion: 1,
  artifact: "epl-odds-capture",
  competition: "epl",
  dataClass: "ODDS_CAPTURE",
  /*
   * NOT PUBLIC — and it must say so EXPLICITLY, not merely omit the flag.
   *
   * sweepInternalData deletes out/data JSON whose `public` is literally false. This artifact left
   * the field undefined, so the sweep did not match it and the first live capture (2026-08-20) put
   * PAID per-book prices on the public export. Absent is not the same as false anywhere a deletion
   * rule keys on the value.
   */
  public: false,
  generatedAt: NOW,
  sportKey: SPORT_KEY,
  markets: MARKETS,
  regions: REGIONS,
  /* `capturedAt` because that is the field runEplShadow reads for staleness. `generatedAt` above is
     kept for the artifact conventions the rest of the repo uses; they are the same instant. */
  capturedAt: NOW,
  eventCount: rows.length,
  rows,
  /* The per-book three-way rows the shadow consumes, joined to OUR fixture ids. */
  shadowRows,
  /* Provider events that could not be joined, with the reason. Never dropped silently: an unjoined
     event is a fact about our alias table, not about the market. */
  quarantined,
  /* Named, not silently absent — an excluded in-progress match is a fact about the clock. */
  excludedInProgress: started,
  creditCost: ledger.requests.at(-1)?.creditsUsed ?? WORST_CASE_CREDITS,
  creditsRemaining: Number(headers["x-requests-remaining"]) || null,
  authorization: { receipt: "docs/receipts/ODDS_AUTHORIZATION_EPL.md", ceiling: auth.ceiling, cumulative: ledger.cumulativeCredits },
  note: "Consensus prices across posted US books, de-vigged proportionally within each market. No model claim is attached: the EPL model card requires this snapshot BEFORE its comparison can run, and that comparison is the bar it must still pass.",
};

/*
 * A STRING, and the verdict is READ. See the UFC capture for the incident: passing the object
 * crashed after the credit was spent, discarding a real capture inside the safeguard itself.
 */
const payload = JSON.stringify(snapshot, null, 1) + "\n";
const leak = assertNoSecretLeak(payload, [KEY]);
if (!leak.ok) { console.error(`epl odds: REFUSED — ${leak.reason}`); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "latest.json"), payload);
fs.writeFileSync(path.join(OUT, `capture-${etDay(NOW)}.json`), payload);

console.log(`epl odds: ${rows.length} fixtures priced · ${snapshot.creditCost} credit(s) · cumulative ${ledger.cumulativeCredits}/${auth.ceiling}`);
