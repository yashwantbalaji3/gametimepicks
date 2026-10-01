/**
 * THE ANSWER DISPLAY (Session 3) — a typed, deterministic projection of the SAME tool envelopes the evidence is built
 * from, so the browser can show one card per game instead of one paragraph per answer.
 *
 * WHY IT EXISTS. A verified answer was correct and hard to read: three games became one run of prose inside one
 * bordered box, with the matchup restated in every bullet. Asking the writer for "prettier markdown" is not
 * deterministic; projecting the owner's own fields is.
 *
 * THE FIREWALL. This module moves STRUCTURE, never truth:
 *   • every value is copied from the envelope the evidence sentence was written from — a probability is printed with
 *     the evidence's own rounding (`askPercent`), a pick is the owner's pick string, a grade is the owner's grade;
 *   • nothing is computed: no percentage fills an empty slot, no pick is read off a probability, no day is totalled,
 *     no winner is named in a comparison;
 *   • an absent value stays absent (`null`), never 0 and never "—" decided here — the renderer says "not recorded";
 *   • a PAUSED market carries its label and the owner's reason, and NO pick, line or probability (the forecast tool
 *     already strips them; this never re-reads the raw row);
 *   • a link is shown only when the evidence itself issued its href.
 *
 * Anything this cannot classify returns `null`, and the browser falls back to the generic renderer. A typed card is
 * progressive enhancement — never an availability gate, and never a reason to drop a verified answer.
 */
import { ASK_STATUS } from "./contract.mjs";
import { askPercent } from "./evidence.mjs";

export const ASK_DISPLAY_KINDS = Object.freeze(["forecasts", "live", "resultsDay", "teamCompare"]);

/* Tools that only set up a turn (the clock, an identity) never decide its shape. */
const SETUP_TOOLS = new Set(["getGameTimeNow", "resolveEntity"]);
const MAX_CARDS = 12;

const BUILDERS = {
  getPublishedForecasts: forecastsDisplay,
  getLiveSlate: liveDisplay,
  getResultsDay: resultsDayDisplay,
  getTeamComparison: teamCompareDisplay,
};

/**
 * @param {Array<object>} envelopes  the executor's envelopes for this turn
 * @param {Array<{href:string}>} evidenceLinks  the links the evidence issued (buildEvidence().links)
 * @returns {object|null}
 */
export function buildAnswerDisplay(envelopes, evidenceLinks = []) {
  const primary = (envelopes ?? []).filter((e) => e && !SETUP_TOOLS.has(e.tool));
  /* One answer, one shape. Two primary tools (a forecast AND a results day) is a mixed answer → generic. */
  if (primary.length !== 1) return null;
  const env = primary[0];
  if (env.status !== ASK_STATUS.OK) return null;
  const build = BUILDERS[env.tool];
  if (!build) return null;
  const issued = new Set((evidenceLinks ?? []).map((l) => l?.href).filter(Boolean));
  const linkOf = (l) => (l && typeof l.href === "string" && l.href.startsWith("/") && issued.has(l.href) ? l.href : null);
  try {
    /* ⚠ The executor lifts `links` OUT of `data` onto the envelope — a builder reads env.links, never data.links
       (Session 3 preview: every live / results-day / compare card lost its action to exactly that). */
    const display = build(env.data ?? {}, linkOf, env.links ?? []);
    return display && ASK_DISPLAY_KINDS.includes(display.kind) ? display : null;
  } catch {
    // A shape this projection does not understand is the generic renderer's job, never a failed turn.
    return null;
  }
}

/* ─────────────────────────────  forecasts  ───────────────────────────── */

function forecastsDisplay(d, linkOf) {
  const rows = Array.isArray(d.forecasts) ? d.forecasts : null;
  if (!rows || !rows.length) return null;
  const games = rows.slice(0, MAX_CARDS).map((f) => {
    if (!text(f.matchup) && !(text(f.away) && text(f.home))) throw new Error("forecast without a matchup");
    const report = (f.links ?? []).map(linkOf).find(Boolean) ?? null;
    return {
      sport: text(f.sport),
      matchup: text(f.matchup) ?? `${f.away} @ ${f.home}`,
      away: text(f.away),
      home: text(f.home),
      awayName: text(f.awayName),
      homeName: text(f.homeName),
      date: text(f.date),
      startUtc: text(f.startUtc),
      experimental: Boolean(f.experimental),
      winProbability: winProbability(f),
      projectedScore: f.projectedScore?.home != null && f.projectedScore?.away != null
        ? { away: text(f.away), awayScore: f.projectedScore.away, home: text(f.home), homeScore: f.projectedScore.home }
        : null,
      expectedGoals: num(f.expectedGoals),
      over25: pctOrNull(f.over25),
      markets: (f.markets ?? []).map((m) => ({
        label: text(m.label) ?? text(m.market),
        pick: text(m.pick),
        /* The line is shown only where the pick does not already carry it ("CHC +1.5", not "CHC +1.5 at 1.5"). */
        line: m.line != null && !pickCarriesLine(m.pick, m.line) ? m.line : null,
        modelProbability: pctOrNull(m.modelProbability),
        marketImpliedProbability: pctOrNull(m.marketImpliedProbability),
        confidence: text(m.confidence),
      })),
      paused: (f.pausedMarkets ?? []).map((p) => ({ label: text(p.label) ?? text(p.market), reason: text(p.reason) })),
      notes: (f.why ?? []).map(text).filter(Boolean),
      players: (f.players ?? []).flatMap((pl) => (pl.markets ?? []).map((m) => ({
        name: text(pl.name), team: text(pl.team), label: text(m.label), median: num(m.median), p10: num(m.p10), p90: num(m.p90),
      }))).filter((p) => p.name && p.label && p.median != null),
      href: report,
    };
  });
  return { kind: "forecasts", dateApplied: text(d.dateApplied), totalMatched: num(d.totalMatched), returned: games.length, games };
}

/** The owner's win probabilities in the evidence's own order: home/draw/away for soccer, away/home/tie otherwise. */
function winProbability(f) {
  const pr = f.probabilities;
  if (!pr) return null;
  const side = (label, p) => (p == null ? null : { label, value: pctOrNull(p), share: Number(p) });
  const rows = pr.draw != null
    ? [side(text(f.home) ?? "Home", pr.home), side("Draw", pr.draw), side(text(f.away) ?? "Away", pr.away)]
    : pr.home != null && pr.away != null
      ? [side(text(f.away) ?? "Away", pr.away), side(text(f.home) ?? "Home", pr.home), side("Tie", pr.tie)]
      : [];
  const out = rows.filter(Boolean);
  return out.length >= 2 ? out : null;
}

/* ─────────────────────────────  live  ───────────────────────────── */

function liveDisplay(d, linkOf, envLinks) {
  if (!Array.isArray(d.events)) return null;
  return {
    kind: "live",
    sport: text(d.sport),
    total: num(d.total),
    liveCount: num(d.liveCount),
    preCount: num(d.preCount),
    finalCount: num(d.finalCount),
    fetchedAt: text(d.fetchedAt),
    games: d.events.slice(0, MAX_CARDS).map((e) => ({
      away: text(e.away),
      home: text(e.home),
      /* A PRE game carries NO score, even if a feed zero-filled one (StatsAPI zeroes scores at Pre-Game). */
      awayScore: e.state === "PRE" ? null : num(e.awayScore),
      homeScore: e.state === "PRE" ? null : num(e.homeScore),
      period: text(e.period),
      state: text(e.state),
      stateDetail: text(e.stateDetail),
    })),
    more: Math.max(0, d.events.length - MAX_CARDS),
    note: "A final score here is the provider's; GameTime's own grading of a game can land later.",
    href: envLinks.map(linkOf).find(Boolean) ?? null,
  };
}

/* ─────────────────────────────  results day  ───────────────────────────── */

const PRODUCT_NAME = { "bank-builder": "Bank Builder", moonshot: "Moonshot" };
/* The owner's grade vocabulary, verbatim. Anything else — including no grade — is PENDING, never a loss. */
const GRADES = new Set(["WIN", "LOSS", "PUSH", "VOID"]);
const LANE_RESULTS = new Set(["won", "lost", "void", "push", "pending", "active"]);

function resultsDayDisplay(d, linkOf, envLinks) {
  if (!text(d.date)) return null;
  const sports = Object.entries(d.events ?? {})
    .filter(([, evs]) => Array.isArray(evs) && evs.length)
    .map(([sport, evs]) => ({
      sport: sport.toUpperCase(),
      games: evs.slice(0, MAX_CARDS).map((e) => ({
        title: text(e.title),
        final: text(e.final),
        calls: (e.calls ?? []).map((c) => ({
          market: text(c.market),
          // the same "(home)" trim the evidence sentence applies — the pick is the owner's string otherwise
          pick: text(String(c.pick ?? "").replace(/\s+\((?:home|away)\)$/, "")),
          grade: GRADES.has(c.outcome) ? c.outcome : "PENDING",
        })),
      })),
      more: Math.max(0, evs.length - MAX_CARDS),
      propsGraded: evs.reduce((n, e) => n + (Number(e.propsNotShown) || 0), 0),
    }));
  const lanes = (d.lanes ?? []).map((l) => ({
    product: PRODUCT_NAME[l.product] ?? text(l.product),
    lane: text(l.lane),
    result: LANE_RESULTS.has(l.result) ? l.result : "pending",
    legs: (l.legs ?? []).map((g) => ({
      selection: text(g.selection),
      matchup: text(g.matchup),
      official: text(g.official),
      result: LANE_RESULTS.has(g.result) ? g.result : "pending",
    })),
  }));
  return {
    kind: "resultsDay",
    date: d.date,
    isYesterday: Boolean(d.isYesterday),
    sports,
    lanes,
    sportsWithout: (d.sportsWithout ?? []).map((s) => String(s).toUpperCase()),
    note: "Each item keeps its own grade. GameTimePicks publishes no combined day record or percentage.",
    href: envLinks.map(linkOf).find(Boolean) ?? null,
  };
}

/* ─────────────────────────────  team comparison  ───────────────────────────── */

function teamCompareDisplay(d, linkOf, envLinks) {
  if (!text(d.a?.label) || !text(d.b?.label)) return null;
  const rows = [];
  const h = d.headToHead?.allTime?.record;
  if (h && num(h.meetings) != null) {
    rows.push({ label: "Head-to-head wins", a: num(h.aWins), b: num(h.bWins), note: `${h.meetings} recorded meetings${h.ties ? `, ${h.ties} tied` : ""}` });
  }
  const seasonId = text(d.season?.id);
  const side = (s) => ({ w: num(s?.w ?? s?.wins), l: num(s?.l ?? s?.losses), t: num(s?.t ?? s?.ties), finals: num(s?.finals ?? s?.games) });
  const sa = side(d.season?.a);
  const sb = side(d.season?.b);
  /* A W–L is printed only when the owner holds BOTH numbers for that side; otherwise that cell is "not recorded". */
  const record = (s) => (s.w != null && s.l != null ? `${s.w}–${s.l}${s.t ? `–${s.t}` : ""}` : null);
  if (seasonId && (record(sa) || record(sb))) rows.push({ label: `${seasonId} record`, a: record(sa), b: record(sb), note: null });
  if (seasonId && (sa.finals != null || sb.finals != null)) rows.push({ label: "Recorded finals", a: sa.finals, b: sb.finals, note: null });
  if (!rows.length) return null;
  return {
    kind: "teamCompare",
    sport: text(d.sport),
    a: text(d.a.label),
    b: text(d.b.label),
    rows,
    note: "Recorded fact only — GameTime Compare names no winner and carries no forecast.",
    href: envLinks.map(linkOf).find(Boolean) ?? null,
  };
}

/* ─────────────────────────────  helpers  ───────────────────────────── */

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/* By number, not substring: "OVER 7.5" does not carry a line of 7. */
const pickCarriesLine = (pick, line) => (String(pick ?? "").match(/\d+(?:\.\d+)?/g) ?? []).map(Number).includes(Math.abs(Number(line)));
const pctOrNull = (p) => (typeof p === "number" && Number.isFinite(p) ? askPercent(p) : null);
