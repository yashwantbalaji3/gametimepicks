/**
 * NFL LINE COVERAGE — true-denominator coverage of the week's official player forecasts against captured sportsbook lines
 * (founder P0 2026-10-29; the NBA report is lib/sports/nba/line-coverage.mjs). Pure: the caller passes the official
 * per-game boards, the private capture documents, the credit ledger and the comparison instant; nothing here reads a
 * file, the network or the clock.
 *
 * PER GAME × MARKET (the five probed markets):
 *   requested            the capture asked the provider for this market for this game (a probed event requests all five)
 *   offered              the provider returned the market for the game (marketsSeen)
 *   playersWithLine      distinct players with a two-sided line (yes/no: a price), any book; perBook = the same per book
 *   official             DENOMINATOR: board players with a PUBLISHED projection for this family (median / probability)
 *   withheldOfficial     board players with a figure in a NOT-published family (week 8: passing / rushing yards) — never
 *                        compared, counted so the gap is visible
 *   qualified            official predictions with a qualified line through the NFL adapter (the page's exact rule):
 *                        over/under → COMPARED; anytime TD → YES_NO (a qualified quote, never a comparison)
 *   states               every official prediction in exactly one adapter state (COMPARED / YES_NO / STALE / …)
 *   staleByKickoff       qualified now, but the quote is > 12 h older than kickoff (needs a recapture before kickoff)
 *   unmatched            lines on eligible books for players WITHOUT an official prediction in this family
 *                        (notOnBoard | familyNotPublished), identity-unresolved provider names, incomplete two-sided
 *                        quotes, and alternate-line ambiguity
 *   lastVerifiedCapture  the latest capture instant that probed this game
 *   credits              credits charged for this game's prop calls (ledger requests whose endpoint names its odds event)
 *   displayEligible      qualified comparisons the site may show: 0 unless displayAuthorization("nfl","site") is ok
 *   remediation          one plain action per gap
 * The public summary carries counts and percentages only — no player, line, price or book name.
 */
import { NFL_FAMILIES, NFL_FAMILY_BY_MARKET, NFL_PROP_LINE_ADAPTER, NFL_LINE_MAX_AGE_HOURS, nflOffersFromCapture, nflPropLineInputs } from "./prop-line-adapter.mjs";
import { buildPropLineView } from "../../odds/prop-line-view.mjs";
import { displayAuthorization, DISPLAY_AUTHORIZATION } from "../../odds/display-authorization.mjs";
import { isEligibleOperator } from "../odds/eligible-operators.mjs";

export const NFL_LINE_COVERAGE_VERSION = "nfl-line-coverage@1";
export const COVERAGE_MARKETS = Object.freeze(Object.values(NFL_FAMILIES).map((d) => d.market));
export const pct = (count, of) => ({ count, of, pct: of > 0 ? Math.round((1000 * count) / of) / 10 : null });

const REMEDIATION = Object.freeze({
  NOT_REQUESTED: "Probe this game's prop markets in the next capture (--probe-props all).",
  NOT_OFFERED: "The books posted no market for this game when captured: recapture closer to kickoff.",
  FAMILY_NOT_PUBLISHED: "Not an official forecast (family withheld): no comparison until the family clears its promotion bars.",
  NO_LINE: "Official projection without a two-sided eligible line: recapture before kickoff; the books may post later.",
  STALE: "Line older than the 12-hour freshness rule at the comparison instant: recapture before kickoff.",
  STALE_BY_KICKOFF: "Fresh now but more than 12 h before kickoff: recapture within 12 h of kickoff or it will not be compared.",
  AFTER_CUTOFF: "Only post-kickoff quotes: none can be used; capture before the next kickoff.",
  INELIGIBLE: "Only off-allowlist books quoted this player: no comparison; wait for an eligible book.",
  AMBIGUOUS_LINE: "A book posted several lines for one player in one capture: never guessed; recapture or wait for one main line.",
  IDENTITY_UNRESOLVED: "Provider names that did not resolve against either roster: fix the roster registry alias, never fuzzy-match.",
  NOT_ON_BOARD: "Lines for players with no official projection in this family (not projected or not on the board): none to compare.",
  INCOMPLETE: "One-sided quotes dropped by the capture (the other side is never inferred).",
  DISPLAY_OFF: "Display authorization for NFL is off: 0 display-eligible until the founder's reviewed decision.",
});

/**
 * @param {{ boards: any[], captures: Array<{ file: string, doc: any }>, ledger?: any, asOf: string, authorization?: any }} input
 */
export function buildNflLineCoverage({ boards, captures, ledger = null, asOf, authorization = DISPLAY_AUTHORIZATION }) {
  const authorized = displayAuthorization("nfl", "site", authorization).ok;
  const offers = captures.flatMap((c) => nflOffersFromCapture(c.doc));
  const probes = captures.flatMap((c) => (c.doc?.propProbe?.events ?? []).map((e) => ({ ...e, capturedAt: c.doc.capturedAt, file: c.file })));
  const quarantinedLines = captures.flatMap((c) => c.doc?.propProbe?.lineProps?.quarantined ?? []);
  const ledgerReqs = ledger?.requests ?? [];
  const games = [];
  for (const board of [...boards].sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)) || String(a.providerEventId).localeCompare(String(b.providerEventId)))) {
    const ev = String(board.providerEventId);
    const cev = `nfl-${ev}`;
    const gameProbes = probes.filter((p) => p.canonicalEventId === cev);
    const oddsIds = new Set(gameProbes.map((p) => p.oddsEventId).filter(Boolean));
    const credits = ledgerReqs.filter((r) => [...oddsIds].some((id) => String(r.endpoint ?? "").includes(`/events/${id}/`))).reduce((s, r) => s + (r.creditsUsed ?? 0), 0);
    const lastVerifiedCapture = gameProbes.map((p) => p.capturedAt).sort().at(-1) ?? null;
    const { inputs } = nflPropLineInputs({ board, offers, asOf, withLineOnly: false });
    const gOffers = offers.filter((o) => o.canonicalEventId === cev);
    const markets = {};
    for (const [family, d] of Object.entries(NFL_FAMILIES)) {
      const requested = gameProbes.length > 0;
      const offered = gameProbes.some((p) => p.marketsSeen?.[d.market]);
      const mOffers = gOffers.filter((o) => o.market === d.market);
      const perBook = {};
      for (const o of mOffers) (perBook[o.book] ??= new Set()).add(o.playerId);
      const playersWithLine = new Set(mOffers.map((o) => o.playerId)).size;
      const famInputs = inputs.filter((i) => i.marketKey === family);
      const officialInputs = famInputs.filter((i) => i.familyState === "PUBLISHED" && typeof i.projection === "number");
      const withheld = famInputs.filter((i) => i.familyState !== "PUBLISHED");
      const states = {};
      let qualified = 0, staleByKickoff = 0;
      for (const i of officialInputs) {
        const v = buildPropLineView(i, NFL_PROP_LINE_ADAPTER);
        const s = v.state === "SUSPENDED" || v.state === "UNAVAILABLE" ? `${v.state}:${v.reason}` : v.state;
        states[s] = (states[s] ?? 0) + 1;
        const ok = d.kind === "YES_NO" ? v.state === "YES_NO" : v.state === "COMPARED";
        if (ok) {
          qualified++;
          if (Date.parse(board.kickoffUtc) - Date.parse(i.offer.capturedAt) > NFL_LINE_MAX_AGE_HOURS * 3600_000) staleByKickoff++;
        }
      }
      const officialIds = new Set(officialInputs.map((i) => String(i.player.id)));
      const boardIds = new Set(famInputs.map((i) => String(i.player.id)));
      const eligibleLinePlayers = new Set(mOffers.filter((o) => isEligibleOperator(o.book)).map((o) => o.playerId));
      const notOnBoard = [...eligibleLinePlayers].filter((p) => !boardIds.has(p)).length;
      const familyNotPublished = [...eligibleLinePlayers].filter((p) => boardIds.has(p) && !officialIds.has(p)).length;
      const identityUnresolved = gameProbes.flatMap((p) => p.unresolvedIdentities ?? []).filter((u) => (u.families ?? []).includes(d.board === "anytime_td" ? "anytime_td" : d.market)).length;
      const incomplete = quarantinedLines.filter((q) => q.canonicalEventId === cev && q.market === d.market).length;
      const ambiguous = Object.entries(states).filter(([k]) => k === "SUSPENDED:AMBIGUOUS_LINE").reduce((s, [, n]) => s + n, 0);
      const official = officialInputs.length;
      const remediation = [];
      if (!requested) remediation.push(REMEDIATION.NOT_REQUESTED);
      else if (!offered) remediation.push(REMEDIATION.NOT_OFFERED);
      if (withheld.length) remediation.push(REMEDIATION.FAMILY_NOT_PUBLISHED);
      if (states["UNAVAILABLE:NO_LINE"]) remediation.push(REMEDIATION.NO_LINE);
      if (states.STALE) remediation.push(REMEDIATION.STALE);
      if (staleByKickoff) remediation.push(REMEDIATION.STALE_BY_KICKOFF);
      if (states.AFTER_CUTOFF) remediation.push(REMEDIATION.AFTER_CUTOFF);
      if (states["SUSPENDED:INELIGIBLE"]) remediation.push(REMEDIATION.INELIGIBLE);
      if (ambiguous) remediation.push(REMEDIATION.AMBIGUOUS_LINE);
      if (identityUnresolved) remediation.push(REMEDIATION.IDENTITY_UNRESOLVED);
      if (notOnBoard) remediation.push(REMEDIATION.NOT_ON_BOARD);
      if (incomplete) remediation.push(REMEDIATION.INCOMPLETE);
      if (!authorized && qualified && d.kind === "OU") remediation.push(REMEDIATION.DISPLAY_OFF);
      markets[d.market] = {
        family, kind: d.kind, familyState: board.families?.[d.board]?.state ?? "ABSENT", requested, offered,
        playersWithLine, perBook: Object.fromEntries(Object.entries(perBook).sort().map(([b, s]) => [b, { players: s.size, eligible: isEligibleOperator(b) }])),
        official, withheldOfficial: withheld.length, qualified: pct(qualified, official), states, staleByKickoff,
        unmatched: { notOnBoard, familyNotPublished, identityUnresolved, incompleteTwoSided: incomplete, ambiguousAlternateLines: ambiguous },
        displayEligible: authorized && d.kind === "OU" ? qualified : 0,
        remediation,
      };
    }
    games.push({ eventId: ev, matchup: board.matchup ?? null, kickoffUtc: board.kickoffUtc, lastVerifiedCapture, credits, markets });
  }
  const sum = (fn) => games.reduce((s, g) => s + fn(g), 0);
  const byMarket = Object.fromEntries(COVERAGE_MARKETS.map((m) => {
    const official = sum((g) => g.markets[m].official), qualified = sum((g) => g.markets[m].qualified.count);
    return [m, {
      family: NFL_FAMILY_BY_MARKET[m], kind: NFL_FAMILIES[NFL_FAMILY_BY_MARKET[m]].kind,
      gamesRequested: games.filter((g) => g.markets[m].requested).length, gamesOffered: games.filter((g) => g.markets[m].offered).length,
      playersWithLine: sum((g) => g.markets[m].playersWithLine), official, withheldOfficial: sum((g) => g.markets[m].withheldOfficial),
      qualified: pct(qualified, official), staleByKickoff: sum((g) => g.markets[m].staleByKickoff),
      unmatched: Object.fromEntries(["notOnBoard", "familyNotPublished", "identityUnresolved", "incompleteTwoSided", "ambiguousAlternateLines"].map((k) => [k, sum((g) => g.markets[m].unmatched[k])])),
      displayEligible: sum((g) => g.markets[m].displayEligible),
    }];
  }));
  const ouOfficial = sum((g) => Object.values(g.markets).filter((x) => x.kind === "OU").reduce((s, x) => s + x.official, 0));
  const ouQualified = sum((g) => Object.values(g.markets).filter((x) => x.kind === "OU").reduce((s, x) => s + x.qualified.count, 0));
  const captureCredits = captures.map((c) => ({ file: c.file, capturedAt: c.doc?.capturedAt ?? null, creditsUsed: c.doc?.creditsUsed ?? null }));
  return {
    version: NFL_LINE_COVERAGE_VERSION, dataClass: "PRIVATE_RESEARCH", asOf, freshnessHours: NFL_LINE_MAX_AGE_HOURS,
    displayAuthorized: authorized,
    games: games.length,
    totals: {
      overUnderOfficial: ouOfficial, overUnderCompared: pct(ouQualified, ouOfficial),
      anytimeTdOfficial: byMarket.player_anytime_td.official, anytimeTdQualifiedQuote: byMarket.player_anytime_td.qualified,
      withheldOfficial: sum((g) => Object.values(g.markets).reduce((s, x) => s + x.withheldOfficial, 0)),
      displayEligible: sum((g) => Object.values(g.markets).reduce((s, x) => s + x.displayEligible, 0)),
      creditsThisWeek: captureCredits.reduce((s, c) => s + (c.creditsUsed ?? 0), 0),
      creditsCumulativeLedger: ledger?.cumulativeCredits ?? null,
      lastVerifiedCapture: captures.map((c) => c.doc?.capturedAt).filter(Boolean).sort().at(-1) ?? null,
    },
    byMarket, captures: captureCredits, perGame: games,
  };
}

/** Counts and percentages only: no player, line, price or book name. */
export function publicNflCoverageSummary(r) {
  return {
    version: r.version, dataClass: "PUBLIC_SUMMARY", asOf: r.asOf, games: r.games, displayAuthorized: r.displayAuthorized,
    totals: { ...r.totals },
    byMarket: Object.fromEntries(Object.entries(r.byMarket).map(([m, x]) => [m, { ...x }])),
    perGame: r.perGame.map((g) => ({
      eventId: g.eventId, matchup: g.matchup, kickoffUtc: g.kickoffUtc, lastVerifiedCapture: g.lastVerifiedCapture, credits: g.credits,
      markets: Object.fromEntries(Object.entries(g.markets).map(([m, x]) => [m, { official: x.official, withheldOfficial: x.withheldOfficial, playersWithLine: x.playersWithLine, booksQuoting: Object.keys(x.perBook).length, qualified: x.qualified.count, staleByKickoff: x.staleByKickoff, displayEligible: x.displayEligible }])),
    })),
  };
}

/** Markdown: aggregates + per-game table; `publicOnly` drops the per-book breakdown (book names). */
export function nflCoverageMarkdown(r, { publicOnly = false } = {}) {
  const L = [];
  const p = (x) => (x.pct == null ? "—" : `${x.pct}%`);
  L.push(`# NFL line coverage — week 8 ${publicOnly ? "(public summary)" : "(PRIVATE)"}`, "");
  L.push(`As of ${r.asOf} · freshness ≤ ${r.freshnessHours} h before the comparison instant, pre-kickoff only · display authorized: ${r.displayAuthorized ? "yes" : "NO (all display-eligible counts are 0)"}`, "");
  const t = r.totals;
  L.push("## Totals", "");
  L.push(`- Games: ${r.games}`);
  L.push(`- Over/under official predictions (published families): ${t.overUnderOfficial}; compared with a qualified line: ${t.overUnderCompared.count} (${p(t.overUnderCompared)})`);
  L.push(`- Anytime TD official probabilities: ${t.anytimeTdOfficial}; with a qualified yes/no quote: ${t.anytimeTdQualifiedQuote.count} (${p(t.anytimeTdQualifiedQuote)}) — never an over/under comparison`);
  L.push(`- Withheld (not official) player figures (passing / rushing yards): ${t.withheldOfficial} — never compared`);
  L.push(`- Display-eligible: ${t.displayEligible}`);
  L.push(`- Credits: this week's captures ${t.creditsThisWeek}; program ledger cumulative ${t.creditsCumulativeLedger ?? "—"}`);
  L.push(`- Last verified capture: ${t.lastVerifiedCapture ?? "—"}`, "");
  L.push("## By market", "", "| market | games requested / offered | players with a line | official | withheld | qualified | stale by kickoff | not on board | family not published | identity unresolved | incomplete | ambiguous |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [m, x] of Object.entries(r.byMarket)) L.push(`| ${m} | ${x.gamesRequested} / ${x.gamesOffered} | ${x.playersWithLine} | ${x.official} | ${x.withheldOfficial} | ${x.qualified.count} (${p(x.qualified)}) | ${x.staleByKickoff} | ${x.unmatched.notOnBoard} | ${x.unmatched.familyNotPublished} | ${x.unmatched.identityUnresolved} | ${x.unmatched.incompleteTwoSided} | ${x.unmatched.ambiguousAlternateLines} |`);
  L.push("", "## By game (official / qualified per market; rec = receptions, ry = receiving yds, atd = anytime TD quote; pass / rush = withheld)", "", "| game | kickoff (UTC) | last capture | credits | rec | ry | atd | pass (withheld) | rush (withheld) |", "|---|---|---|---|---|---|---|---|---|");
  for (const g of r.perGame) {
    const c = (m) => `${g.markets[m].qualified.count}/${g.markets[m].official}`;
    L.push(`| ${g.matchup ?? g.eventId} | ${g.kickoffUtc} | ${g.lastVerifiedCapture ?? "—"} | ${g.credits} | ${c("player_receptions")} | ${c("player_reception_yds")} | ${c("player_anytime_td")} | ${g.markets.player_pass_yds.withheldOfficial} | ${g.markets.player_rush_yds.withheldOfficial} |`);
  }
  if (!publicOnly) {
    L.push("", "## Remediation per game × market (private)", "");
    for (const g of r.perGame) for (const [m, x] of Object.entries(g.markets)) if (x.remediation.length) L.push(`- ${g.matchup} · ${m}: ${x.remediation.join(" ")}`);
    L.push("", "## Players with a two-sided line, per book (private; eligibility per the allowlist)", "");
    for (const [m] of Object.entries(r.byMarket)) {
      const books = {};
      for (const g of r.perGame) for (const [b, v] of Object.entries(g.markets[m].perBook)) { books[b] ??= { players: 0, eligible: v.eligible }; books[b].players += v.players; }
      L.push(`- ${m}: ${Object.entries(books).map(([b, v]) => `${b}${v.eligible ? "" : " (ineligible)"} ${v.players}`).join(" · ") || "none"}`);
    }
  }
  return `${L.join("\n")}\n`;
}
