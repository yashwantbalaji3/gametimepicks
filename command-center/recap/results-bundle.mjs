/**
 * RESULTS RECAP BUNDLES (NBA · EPL) — the reusable pathway beside the NFL per-game card.
 *
 * One bundle = one sport, one Eastern date, up to RESULTS_PER_CARD finished games. It is the complete list of what a
 * results caption or the results card may say, every number traceable to a committed file at the pinned commit:
 *
 *   NBA  final scores from the write-once finals record (app/public/data/nba/results/finals-<season>.json). Results
 *        only: the Forecast Ledger has no NBA rows, so no forecast claim is made (team scores and win chances are
 *        WITHHELD in the public registry anyway).
 *   EPL  final scores from app/public/data/soccer/epl/results/latest.json, plus — where one exists — the published
 *        epl_1x2 Official Forecast row from the Forecast Ledger, admitted only when it was published before kickoff,
 *        never withdrawn, and settled CANONICAL with no corrections (the NFL integrity gate's rules). A row that fails
 *        is reported, and that match is shown as a result only.
 *
 * Wins and misses are stated the same way; a forecast that missed is called a miss.
 */
import { createHash } from "node:crypto";
import { REASON } from "../contracts/index.mjs";
import { FORBIDDEN_TERMS } from "../../app/scripts/build-mlb-social-content.mjs";
import { retiredPhraseIn } from "./public-registry.mjs";
import { etDate } from "./multisport-facts.mjs";

/** Games per card, by what fits 1080×1350 (an EPL row carries a forecast line). */
export const RESULTS_PER_CARD = Object.freeze({ NBA: 6, EPL: 4 });
export const NBA_FINALS = "app/public/data/nba/results/finals-2026-27.json";
export const EPL_RESULTS = "app/public/data/soccer/epl/results/latest.json";
export const EPL_LEDGER = "data/internal/forecast-ledger/v1/epl.jsonl";
const MAX_CAPTION = 280;
const EXTRA_FORBIDDEN = ["odds", "bet now", "sure thing", "can't lose", "parlay", "bet", "betting", "picks"];

const sha = (s) => createHash("sha256").update(s).digest("hex");
const pct = (p) => `${(Math.round(p * 1000) / 10).toFixed(1)}%`;
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
export const dateLabel = (ymd) => DAY.format(new Date(`${ymd}T12:00:00Z`));
const before = (a, b) => Date.parse(a) < Date.parse(b);

function read(src, p) {
  const raw = src.read(p);
  return raw == null ? null : { raw, sha256: sha(raw), path: p };
}

const clubTokens = (name) => new Set(String(name).toLowerCase().replace(/&/g, " ").split(/[^a-z]+/).filter((w) => w && !["afc", "fc", "and"].includes(w)));
/** The same club: one name's words contain all of the other's ("Bournemouth" ⊂ "AFC Bournemouth"); a shared "United"
 *  or "City" alone is not a match. */
const shares = (a, b) => {
  const x = clubTokens(a);
  const y = clubTokens(b);
  const within = (p, q) => p.size > 0 && [...p].every((w) => q.has(w));
  return within(x, y) || within(y, x);
};
/** "Home v Away" in the ledger names the same two clubs as the results row (home and away, in order). */
export function sameClubs(matchup, home, away) {
  const [h, a] = String(matchup).split(" v ");
  return Boolean(h && a) && shares(h, home) && shares(a, away);
}

/** EPL ledger row → admissible forecast, or the reason it isn't. */
export function admitEplForecast(r) {
  const s = r.settlement ?? {};
  if (r.publicationStatus !== "PUBLISHED") return { ok: false, code: REASON.NOT_PUBLISHED, detail: `${r.forecastId} is ${r.publicationStatus}` };
  if (r.withdrawal) return { ok: false, code: REASON.WITHDRAWN, detail: `${r.forecastId} was withdrawn` };
  if (!r.publishedAt || !before(r.publishedAt, r.eventStart)) return { ok: false, code: REASON.POST_START_REVISION, detail: `${r.forecastId} published ${r.publishedAt}, kickoff ${r.eventStart}` };
  if (s.state !== "SETTLED") return { ok: false, code: REASON.NOT_SETTLED, detail: `${r.forecastId} is ${s.state ?? "unsettled"}` };
  if (s.finality !== "CANONICAL") return { ok: false, code: REASON.NOT_CANONICAL, detail: `${r.forecastId} finality ${s.finality}` };
  if ((s.corrections ?? 0) > 0) return { ok: false, code: REASON.CORRECTED_RESULT, detail: `${r.forecastId} has ${s.corrections} correction(s)` };
  if (!r.classProbabilities || !["home", "draw", "away"].includes(r.categoryPrediction)) return { ok: false, code: REASON.MISSING_CLAIM, detail: `${r.forecastId} has no class forecast` };
  return { ok: true };
}

/**
 * @param {{ src: object, sport: "NBA"|"EPL", date: string, label: object }} p  date = one Eastern date (YYYY-MM-DD)
 * @returns {{ bundles: object[], refusals: object[] }}  one bundle per RESULTS_PER_CARD games
 */
export function resultsBundles({ src, sport, date, label }) {
  const refusals = [];
  const games = [];
  const sources = [];
  if (sport === "NBA") {
    const f = read(src, NBA_FINALS);
    if (!f) return { bundles: [], refusals: [{ code: REASON.MISSING_CLAIM, detail: `${NBA_FINALS} missing at ${src.label}` }] };
    sources.push({ path: f.path, sha256: f.sha256, commit: src.commit ?? null });
    for (const r of JSON.parse(f.raw).finals ?? []) {
      if (r.dateEt !== date || r.exhibition || r.statusRaw !== "STATUS_FINAL") continue;
      games.push({
        id: String(r.providerEventId), start: r.dateUtc,
        away: { short: r.away.tricode, name: r.away.name, score: r.ftAway },
        home: { short: r.home.tricode, name: r.home.name, score: r.ftHome },
        winner: r.winnerSide === "home" ? "home" : r.winnerSide === "away" ? "away" : "draw",
        ref: `${NBA_FINALS}#${r.providerEventId}`, forecast: null,
      });
    }
  } else if (sport === "EPL") {
    const f = read(src, EPL_RESULTS);
    if (!f) return { bundles: [], refusals: [{ code: REASON.MISSING_CLAIM, detail: `${EPL_RESULTS} missing at ${src.label}` }] };
    sources.push({ path: f.path, sha256: f.sha256, commit: src.commit ?? null });
    const l = read(src, EPL_LEDGER);
    const rows = l ? l.raw.split("\n").filter(Boolean).map((x) => JSON.parse(x)).filter((x) => x.family === "epl_1x2" && x.subjectType === "GAME") : [];
    if (l) sources.push({ path: l.path, sha256: l.sha256, commit: src.commit ?? null });
    for (const r of JSON.parse(f.raw).rows ?? []) {
      if (!/FULL_TIME|FINAL/.test(r.statusRaw) || etDate(r.dateUtc) !== date) continue;
      const g = {
        id: String(r.providerEventId), start: r.dateUtc,
        away: { short: r.away, name: r.away, score: r.ftAway },
        home: { short: r.home, name: r.home, score: r.ftHome },
        winner: r.ftHome > r.ftAway ? "home" : r.ftAway > r.ftHome ? "away" : "draw",
        ref: `${EPL_RESULTS}#${r.providerEventId}`, forecast: null,
      };
      // Same kickoff instant and both clubs sharing a name token ("AFC Bournemouth" is the ledger's "Bournemouth"); exactly
      // one row, or the match is shown as a result only and listed — never silently dropped.
      const matches = rows.filter((x) => x.eventStart && Date.parse(x.eventStart) === Date.parse(r.dateUtc) && sameClubs(x.matchup, r.home, r.away));
      const row = matches.length === 1 ? matches[0] : null;
      if (matches.length !== 1) refusals.push({ eventId: g.id, code: matches.length ? "AMBIGUOUS_FORECAST" : "NO_FORECAST_MATCHED", detail: `${r.home} v ${r.away}: ${matches.length} published forecast rows matched — shown as a result only` });
      if (row) {
        const ok = admitEplForecast(row);
        if (!ok.ok) refusals.push({ eventId: g.id, ...ok });
        else if (row.settlement.finalCategory !== g.winner) refusals.push({ eventId: g.id, code: "RESULT_MISMATCH", detail: `ledger settled ${row.settlement.finalCategory}, results file says ${g.winner}` });
        else {
          const cls = row.categoryPrediction;
          g.forecast = {
            forecastId: row.forecastId, category: cls,
            pickLabel: cls === "draw" ? "Draw" : `${cls === "home" ? r.home : r.away} win`,
            probability: row.classProbabilities[cls], probabilityDisplay: pct(row.classProbabilities[cls]),
            hit: row.measurement?.topClassHit === true, finalCategory: row.settlement.finalCategory,
            ref: `${EPL_LEDGER}#${row.forecastId}`, publishedAt: row.publishedAt,
          };
        }
      }
      games.push(g);
    }
  } else {
    throw new Error(`no results pathway for ${sport}`);
  }
  games.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  // Even cards (9 games at 6 a card → 5 + 4, never 6 + 3 … or 8 + 1).
  const parts = Math.ceil(games.length / RESULTS_PER_CARD[sport]);
  const size = Math.ceil(games.length / Math.max(parts, 1));
  const bundles = [];
  for (let i = 0; i < games.length; i += size) {
    bundles.push(makeBundle({ sport, date, games: games.slice(i, i + size), part: bundles.length + 1, parts, sources, label }));
  }
  return { bundles, refusals };
}

function makeBundle({ sport, date, games, part, parts, sources, label }) {
  const withFc = games.filter((g) => g.forecast);
  const hits = withFc.filter((g) => g.forecast.hit).length;
  const claims = [
    { key: "date", display: dateLabel(date), evidenceRef: sources[0] },
    { key: "games.count", display: String(games.length), evidenceRef: sources[0] },
  ];
  for (const g of games) {
    claims.push({ key: `${g.id}.away`, display: `${g.away.short} ${g.away.score}`, value: g.away.score, evidenceRef: g.ref });
    claims.push({ key: `${g.id}.home`, display: `${g.home.short} ${g.home.score}`, value: g.home.score, evidenceRef: g.ref });
    if (g.forecast) claims.push({ key: `${g.id}.forecast`, display: `${g.forecast.pickLabel} ${g.forecast.probabilityDisplay}`, value: g.forecast.probability, evidenceRef: g.forecast.ref });
  }
  if (parts > 1) claims.push({ key: "part", display: `${part}/${parts}`, evidenceRef: sources[0] });
  if (withFc.length) {
    claims.push({ key: "forecast.count", display: String(withFc.length), evidenceRef: sources.at(-1) });
    claims.push({ key: "forecast.hits", display: String(hits), evidenceRef: sources.at(-1) });
  }
  return {
    schema: "gtp.cc.results-bundle@1",
    sport, date, dateLabel: dateLabel(date), contentKind: "results-recap", part, parts,
    games, tally: withFc.length ? { count: withFc.length, hits, misses: withFc.length - hits } : null,
    publicLabel: label ? { term: label.term, capability: label.capability, productEligible: label.productEligible, modelPerformanceNote: label.modelPerformanceNote, retiredPhrases: label.retiredPhrases, source: label.source } : null,
    claims, sources,
  };
}

const LEAGUE = { NBA: "NBA", EPL: "Premier League" };
const scoreLine = (g) => `${g.away.short} ${g.away.score}, ${g.home.short} ${g.home.score}`;
const eplLine = (g) => `${g.home.short} ${g.home.score}–${g.away.score} ${g.away.short}`;

/** Two template captions (factual list, forecast-led or headline) built only from claim displays. */
export function resultsCaptions(b) {
  const lg = LEAGUE[b.sport];
  const part = b.parts > 1 ? ` (${b.part}/${b.parts})` : "";
  const fit = (head, items, tail) => {
    let out = "";
    for (let n = items.length; n >= 1; n--) {
      const rest = items.length - n;
      out = `${head}${items.slice(0, n).join("; ")}${rest ? "; the rest are on the card" : ""}.${tail}`;
      if (out.length <= MAX_CAPTION) return out;
    }
    return out;
  };
  const variants = [];
  if (b.sport === "NBA") {
    variants.push({ id: "A", tone: "factual", text: fit(`${lg} finals, ${b.dateLabel}${part}: `, b.games.map(scoreLine), " Results only, from the official finals record.") });
    const closest = [...b.games].sort((x, y) => Math.abs(x.home.score - x.away.score) - Math.abs(y.home.score - y.away.score) || x.id.localeCompare(y.id))[0];
    variants.push({ id: "B", tone: "headline", text: `${b.games.length} ${lg} final${b.games.length === 1 ? "" : "s"} from ${b.dateLabel}${part}. Closest finish: ${scoreLine(closest)}. Every score is on the card.` });
  } else {
    const t = b.tally;
    const lead = t ? `Our ${b.publicLabel.term}'s most likely result came in for ${t.hits} of ${t.count}${t.misses ? `; ${t.misses} missed` : ""}. ` : "";
    variants.push({ id: "A", tone: "factual", text: fit(`${lg}, ${b.dateLabel}${part}: `, b.games.map(eplLine), t ? ` ${lead.trim()} Not betting advice.` : " Results only.") });
    if (t) {
      const items = b.games.filter((g) => g.forecast).map((g) => `${g.home.short} v ${g.away.short}: ${g.forecast.pickLabel} ${g.forecast.probabilityDisplay} ${g.forecast.hit ? "✓" : "✗ missed"}`);
      variants.push({ id: "B", tone: "forecast-led", text: fit(`${b.publicLabel.term} vs final, ${lg} ${b.dateLabel}${part}: `, items, " Graded in public.") });
    }
  }
  return variants;
}

const numbersIn = (s) => String(s ?? "").replace(/\b(49ers|76ers)\b/gi, "").match(/\d+(?:\.\d+)?/g) ?? [];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The NFL caption validator's rules, over a results bundle's claims. */
export function validateResultsCaption(text, b) {
  const problems = [];
  const plain = String(text).replace(/\bnot betting advice\b/gi, ""); // the disclaimer itself is not betting talk
  const allowed = new Set(b.claims.flatMap((c) => numbersIn(c.display)));
  for (const n of numbersIn(text)) if (!allowed.has(n)) problems.push({ code: REASON.UNTRACEABLE_NUMBER, detail: `"${n}" is not in the results bundle` });
  for (const term of [...FORBIDDEN_TERMS, ...EXTRA_FORBIDDEN]) if (new RegExp(`\\b${escapeRe(term)}\\b`, "i").test(plain)) problems.push({ code: REASON.FORBIDDEN_TERM, detail: `"${term}"` });
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co)\b/i.test(text)) problems.push({ code: REASON.URL_IN_CAPTION, detail: "captions carry no links" });
  if (b.tally?.misses && /\bforecast/i.test(text) && !/\bmiss(ed)?\b/i.test(text)) problems.push({ code: REASON.MISS_NOT_DISCLOSED, detail: "a forecast in this bundle missed; a caption that talks about forecasts must say so" });
  if (!b.tally && /\bforecast/i.test(text)) problems.push({ code: REASON.UNTRACEABLE_NUMBER, detail: "this bundle has no forecast claims: a results-only caption may not talk about forecasts" });
  const retired = retiredPhraseIn(text, b.publicLabel?.retiredPhrases ?? []);
  if (retired) problems.push({ code: REASON.RETIRED_PHRASE, detail: `"${retired}"` });
  if (text.length > MAX_CAPTION) problems.push({ code: REASON.TOO_LONG, detail: `${text.length} > ${MAX_CAPTION} characters` });
  return { ok: problems.length === 0, problems };
}
