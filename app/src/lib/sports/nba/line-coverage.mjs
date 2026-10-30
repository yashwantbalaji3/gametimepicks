/**
 * NBA LINE COVERAGE — the founder's coverage report with TRUE denominators (launch program 2026-10-29). Pure: the caller
 * passes the committed lane, the private capture documents, the comparison instant and (optionally) rendered page HTML;
 * nothing here reads a file, the network or the clock.
 *
 * THE DENOMINATOR is every official prediction: each published player × official family in the lane that carries a
 * median (nbaLineCandidates, the same pairing the board and the page use). A row without a median is not a prediction and
 * is counted apart (`laneRowsWithoutMedian`), never silently folded in.
 *
 * Every prediction lands in exactly ONE status:
 *   COMPARED                     a current qualified quote (buildNbaLineBoard → compareToLine valid)
 *   STALE_OR_AFTER_TIP           a quote exists but is too old, or every quote was captured at/after tip
 *   IDENTITY_OR_MARKET_MISMATCH  UNMATCHED / MARKET_MISMATCH / WRONG_DAY on the board, or the book posted the market for a
 *                                name the adapter refused (PLAYER_UNRESOLVED / PLAYER_AMBIGUOUS)
 *   INVALID_QUOTE                the book posted the market but the quote failed validation (one-sided, bad price, …)
 *   UNSUPPORTED                  the game was captured but no capture requested this family's market
 *   MISSING_QUOTE                nothing posted (sub-reason GAME_NOT_CAPTURED or NOT_POSTED)
 *
 * Refusals in a capture name the player only by the provider's string. They are attributed to a lane player for THIS
 * REPORT ONLY — first through the adapter's own door (resolvePlayer against the event's lane players), then, for refused
 * identities, a surname + first-initial match unique within the event. Attribution never creates a comparison; anything
 * that does not attribute is listed as unattributed (private output).
 *
 * Display eligibility is 0 unless displayAuthorization("nba", "site") is ok. The public summary carries counts and
 * percentages only — no player, line, price or book.
 */
import { buildNbaLineBoard, nbaLineCandidates } from "./line-board.mjs";
import { compareToLine, chooseOffer, DIRECTION, MARKET_KEYS, FAMILY_BY_MARKET } from "./line-comparison.mjs";
import { displayAuthorization } from "../../odds/display-authorization.mjs";
import { resolvePlayer } from "../odds/nba-props/player-identity.mjs";
import { REFUSAL } from "../odds/nba-props/contract.mjs";
import { normalizePlayerName } from "../../nba/identity-contract.ts";

export const LINE_COVERAGE_VERSION = "nba-line-coverage@1";
export const COVERAGE_FAMILIES = Object.freeze(Object.keys(MARKET_KEYS));

export const STATUS = Object.freeze({
  COMPARED: "COMPARED",
  STALE_OR_AFTER_TIP: "STALE_OR_AFTER_TIP",
  IDENTITY_OR_MARKET_MISMATCH: "IDENTITY_OR_MARKET_MISMATCH",
  INVALID_QUOTE: "INVALID_QUOTE",
  UNSUPPORTED: "UNSUPPORTED",
  MISSING_QUOTE: "MISSING_QUOTE",
});
export const WITHHELD_STATUSES = Object.freeze(Object.values(STATUS).filter((s) => s !== STATUS.COMPARED));

const IDENTITY_REFUSALS = new Set([REFUSAL.PLAYER_UNRESOLVED, REFUSAL.PLAYER_AMBIGUOUS]);
const STALE_REFUSALS = new Set([REFUSAL.PRICE_STALE, REFUSAL.PRICE_AFTER_START, REFUSAL.PRICE_FROM_FUTURE, REFUSAL.NO_PROVIDER_TIMESTAMP]);
const INVALID_REFUSALS = new Set([REFUSAL.ONE_SIDED, REFUSAL.NOT_TWO_WAY, REFUSAL.MULTIPLE_MAIN_LINES, REFUSAL.NO_LINE, REFUSAL.PRICE_FORMAT, REFUSAL.PRICE_IMPLAUSIBLE, REFUSAL.DUPLICATE_CONFLICT]);
const EVENT_REFUSALS = new Set([REFUSAL.EVENT_UNMATCHED, REFUSAL.EVENT_AMBIGUOUS, REFUSAL.EVENT_ORIENTATION_SWAPPED, REFUSAL.EVENT_LINEAGE_VIOLATION]);
/** When several books refused one prediction for different reasons, the status closest to a usable quote wins. */
const REFUSAL_STATUS_ORDER = [STATUS.STALE_OR_AFTER_TIP, STATUS.INVALID_QUOTE, STATUS.IDENTITY_OR_MARKET_MISMATCH];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const pct = (count, of) => ({ count, of, pct: of > 0 ? Math.round((1000 * count) / of) / 10 : null });
const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
function surnameInitial(name) {
  const parts = String(normalizePlayerName(name) ?? "").split(/\s+/).filter((w) => w && !SUFFIX.has(w));
  return parts.length >= 2 ? `${parts[0][0]}|${parts[parts.length - 1]}` : null;
}

/** Capture documents for one slate, de-duplicated (a `latest.json` copy of a stamped file is read once). */
export function dedupeCaptures(captures) {
  const seen = new Set();
  const out = [];
  for (const c of captures ?? []) {
    const d = c?.doc ?? {};
    const key = d.capturedFor ? `${d.capturedFor}|${d.version ?? ""}` : null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Count rendered comparison rows in exported HTML. A rendered comparison is a model-versus-line cell
 * (`data-line-cmp="ABOVE|BELOW|EQUAL"`) or a prop-line row in state COMPARED (`data-prop-line="COMPARED"`).
 * @param {Array<{ page: string, html: string|null }>} pages
 */
export function countRenderedComparisons(pages) {
  const perPage = [];
  for (const { page, html } of pages ?? []) {
    if (typeof html !== "string") { perPage.push({ page, present: false, comparisons: 0, lineCells: 0, propLineRowsCompared: 0, projectionOnly: 0 }); continue; }
    const lineCells = (html.match(/data-line-cmp="(?:ABOVE|BELOW|EQUAL)"/g) ?? []).length;
    const propLineRowsCompared = (html.match(/data-prop-line="COMPARED"/g) ?? []).length;
    const projectionOnly = (html.match(/data-line-cmp="projection-only"/g) ?? []).length;
    perPage.push({ page, present: true, comparisons: lineCells + propLineRowsCompared, lineCells, propLineRowsCompared, projectionOnly });
  }
  const sum = (sel) => perPage.filter(sel).reduce((a, p) => a + p.comparisons, 0);
  return {
    measured: true,
    projectionsPage: sum((p) => p.page.startsWith("/nba/projections/")),
    gamePages: sum((p) => p.page.startsWith("/nba/simulation/")),
    total: sum(() => true),
    pagesMissing: perPage.filter((p) => !p.present).map((p) => p.page),
    perPage,
  };
}

/**
 * @param {{ lane: any, captures: Array<{ file: string, doc: any }>, asOf: string, authorization?: any,
 *           rendered?: ReturnType<typeof countRenderedComparisons> | null }} input
 */
export function buildNbaLineCoverage({ lane, captures = [], asOf, authorization, rendered = null }) {
  const slateDate = lane?.date ?? null;
  const games = lane?.games ?? [];
  const laneEvents = new Set(games.map((g) => String(g.providerEventId)));
  const gameById = new Map(games.map((g) => [String(g.providerEventId), g]));
  const docs = dedupeCaptures(captures);

  // Records: every capture's adapter records, de-duplicated by recordId.
  const recById = new Map();
  for (const c of docs) for (const r of c.doc?.records ?? []) recById.set(r.recordId ?? JSON.stringify([r.eventId, r.providerAthleteId, r.family, r.book, r.capturedAt, r.line]), r);
  const records = [...recById.values()];
  const laneRecords = records.filter((r) => laneEvents.has(String(r.eventId)));

  const board = buildNbaLineBoard({ lane, priceRecords: records, asOf });
  const candidates = nbaLineCandidates({ lane, priceRecords: records });
  const key = (e, a, f) => `${e}|${a}|${f}`;
  const recordsByKey = new Map();
  for (const r of laneRecords) {
    const k = key(r.eventId, r.providerAthleteId, r.family);
    recordsByKey.set(k, [...(recordsByKey.get(k) ?? []), r]);
  }

  // Which games each capture covered, and which markets it requested.
  const capturedGames = new Map(); // eventId → Set(marketKey)
  for (const c of docs) {
    const markets = c.doc?.markets ?? c.doc?.plan?.markets ?? [];
    const matched = new Set([...(c.doc?.coverage?.events?.matchedEventIds ?? []), ...(c.doc?.records ?? []).map((r) => r.eventId)].map(String));
    for (const e of matched) {
      if (!laneEvents.has(e)) continue;
      const s = capturedGames.get(e) ?? new Set();
      for (const m of markets) s.add(m);
      capturedGames.set(e, s);
    }
  }

  // Attribute player/outcome refusals to lane predictions (reporting only).
  const lanePlayersByEvent = new Map();
  for (const g of games) {
    const list = [];
    for (const side of ["away", "home"]) for (const p of g.players?.[side] ?? []) list.push({ providerAthleteId: String(p.providerAthleteId), displayName: p.name ?? "", team: g[side]?.abbr ?? null });
    lanePlayersByEvent.set(String(g.providerEventId), list);
  }
  const refusalsByKey = new Map();
  const unattributed = { event: {}, player: [], outcome: [], offSlate: 0, marketNotModelled: {} };
  const seenRefusal = new Set();
  for (const c of docs) {
    for (const rf of c.doc?.refusals ?? []) {
      const sig = JSON.stringify(rf);
      if (seenRefusal.has(sig)) continue;
      seenRefusal.add(sig);
      if (EVENT_REFUSALS.has(rf.reason) || rf.level === "event") { unattributed.event[rf.reason] = (unattributed.event[rf.reason] ?? 0) + 1; continue; }
      if (rf.level === "market") { unattributed.marketNotModelled[rf.reason] = (unattributed.marketNotModelled[rf.reason] ?? 0) + 1; continue; }
      if (rf.level !== "player" && rf.level !== "outcome") continue;
      const eventId = String(rf.eventId ?? "");
      if (!laneEvents.has(eventId)) { unattributed.offSlate += 1; continue; }
      const family = FAMILY_BY_MARKET[rf.marketKey];
      const roster = lanePlayersByEvent.get(eventId) ?? [];
      let athleteId = null, method = null;
      const who = resolvePlayer(rf.providerName, roster);
      if (who.state === "RESOLVED") { athleteId = who.providerAthleteId; method = who.method; }
      else if (IDENTITY_REFUSALS.has(rf.reason)) {
        const si = surnameInitial(rf.providerName);
        const hits = si ? roster.filter((p) => surnameInitial(p.displayName) === si) : [];
        if (hits.length === 1) { athleteId = hits[0].providerAthleteId; method = "REPORTING_SURNAME_INITIAL"; }
      }
      if (!athleteId || !family) {
        unattributed[rf.level].push({ eventId, providerName: rf.providerName ?? null, marketKey: rf.marketKey ?? null, book: rf.book ?? null, reason: rf.reason });
        continue;
      }
      const k = key(eventId, athleteId, family);
      refusalsByKey.set(k, [...(refusalsByKey.get(k) ?? []), { reason: rf.reason, book: rf.book ?? null, method, providerName: rf.providerName ?? null }]);
    }
  }

  const boardByKey = new Map(board.rows.map((r) => [key(r.eventId, r.athleteId, r.family), r]));
  const tipOf = (e) => gameById.get(e)?.tipUtc;
  const predictions = [];
  let laneRowsWithoutMedian = 0;
  for (const c of candidates) {
    if (!isNum(c.median)) { laneRowsWithoutMedian += 1; continue; }
    const k = key(c.eventId, c.athleteId, c.family);
    const b = boardByKey.get(k);
    const recs = recordsByKey.get(k) ?? [];
    const refs = refusalsByKey.get(k) ?? [];
    let status, detail = null;
    if (b.direction !== DIRECTION.UNAVAILABLE) status = STATUS.COMPARED;
    else if (b.reason === "STALE" || b.reason === "CAPTURED_AFTER_TIP") { status = STATUS.STALE_OR_AFTER_TIP; detail = b.reason; }
    else if (b.reason === "UNMATCHED" || b.reason === "MARKET_MISMATCH" || b.reason === "WRONG_DAY") { status = STATUS.IDENTITY_OR_MARKET_MISMATCH; detail = b.reason; }
    else if (b.reason === "INVALID_LINE") { status = STATUS.INVALID_QUOTE; detail = b.reason; }
    else if (recs.length) {
      // NO_LINE although records exist: chooseOffer kept none (all at/after tip, or no numeric line).
      const tip = Date.parse(c.tipUtc);
      const after = recs.some((r) => isNum(r.line) && Date.parse(r.capturedAt) >= tip);
      status = after ? STATUS.STALE_OR_AFTER_TIP : STATUS.INVALID_QUOTE;
      detail = after ? "CAPTURED_AFTER_TIP" : "INVALID_LINE";
    } else if (refs.length) {
      const statusOf = (reason) => (STALE_REFUSALS.has(reason) ? STATUS.STALE_OR_AFTER_TIP : INVALID_REFUSALS.has(reason) ? STATUS.INVALID_QUOTE : IDENTITY_REFUSALS.has(reason) ? STATUS.IDENTITY_OR_MARKET_MISMATCH : null);
      const found = new Set(refs.map((r) => statusOf(r.reason)).filter(Boolean));
      status = REFUSAL_STATUS_ORDER.find((s) => found.has(s)) ?? STATUS.INVALID_QUOTE;
      detail = [...new Set(refs.map((r) => r.reason))].sort().join(",");
    } else if (!capturedGames.has(c.eventId)) { status = STATUS.MISSING_QUOTE; detail = "GAME_NOT_CAPTURED"; }
    else if (!capturedGames.get(c.eventId).has(MARKET_KEYS[c.family])) { status = STATUS.UNSUPPORTED; detail = "MARKET_NOT_REQUESTED"; }
    else { status = STATUS.MISSING_QUOTE; detail = "NOT_POSTED"; }

    // Per-book: this book's latest pre-tip quote, judged by the same rule.
    const books = [...new Set([...recs.map((r) => r.book), ...refs.map((r) => r.book).filter(Boolean)])].sort();
    const qualifiedBooks = [];
    for (const book of new Set(recs.map((r) => r.book))) {
      const pick = chooseOffer(recs.filter((r) => r.book === book), tipOf(c.eventId));
      if (!pick) continue;
      const v = compareToLine({ family: c.family, median: c.median },
        { marketKey: pick.providerMarketKey, line: pick.line, book: pick.book, capturedAt: pick.capturedAt, eventId: c.eventId, athleteId: c.athleteId, slateDate },
        { eventId: c.eventId, athleteId: c.athleteId, slateDate, tipUtc: c.tipUtc, asOf });
      if (v.direction !== DIRECTION.UNAVAILABLE) qualifiedBooks.push(book);
    }
    predictions.push({
      eventId: c.eventId, athleteId: c.athleteId, name: c.name, team: c.team, family: c.family, status, detail,
      compatibleCaptured: recs.length > 0 || refs.length > 0,
      booksPosted: books, booksQualified: qualifiedBooks.sort(), chosenBook: status === STATUS.COMPARED ? b.book ?? null : null,
      quotes: recs.length, refusals: refs.map(({ reason, book, method }) => ({ reason, book, method })),
    });
  }

  const site = displayAuthorization("nba", "site", authorization);
  const tally = (rows) => {
    const n = rows.length;
    const withheld = Object.fromEntries(WITHHELD_STATUSES.map((s) => [s, pct(rows.filter((r) => r.status === s).length, n)]));
    const compared = rows.filter((r) => r.status === STATUS.COMPARED).length;
    return {
      predictions: n,
      compatibleCaptured: pct(rows.filter((r) => r.compatibleCaptured).length, n),
      compared: pct(compared, n),
      withheld,
      withheldTotal: pct(n - compared, n),
      displayEligible: pct(site.ok ? compared : 0, n),
    };
  };
  const detailCounts = (rows) => {
    const o = {};
    for (const r of rows) if (r.status !== STATUS.COMPARED) o[`${r.status}:${r.detail}`] = (o[`${r.status}:${r.detail}`] ?? 0) + 1;
    return o;
  };

  const byMarket = Object.fromEntries(COVERAGE_FAMILIES.map((f) => [f, tally(predictions.filter((p) => p.family === f))]));
  const byGame = games.map((g) => {
    const e = String(g.providerEventId);
    const rows = predictions.filter((p) => p.eventId === e);
    return { eventId: e, matchup: `${g.away?.abbr ?? "?"} @ ${g.home?.abbr ?? "?"}`, tipUtc: g.tipUtc, captured: capturedGames.has(e), booksQuoting: new Set(rows.flatMap((r) => r.booksPosted)).size, ...tally(rows) };
  });
  const allBooks = [...new Set(predictions.flatMap((p) => p.booksPosted))].sort();
  const byBook = allBooks.map((book) => ({
    book,
    quotes: laneRecords.filter((r) => r.book === book).length,
    predictionsQuoted: pct(predictions.filter((p) => p.booksPosted.includes(book)).length, predictions.length),
    predictionsQualified: pct(predictions.filter((p) => p.booksQualified.includes(book)).length, predictions.length),
    chosenForComparison: predictions.filter((p) => p.chosenBook === book).length,
    refusals: predictions.reduce((a, p) => a + p.refusals.filter((r) => r.book === book).length, 0),
  }));

  // Players with the most withheld predictions, with their reasons (private: names allowed).
  const byPlayer = new Map();
  for (const p of predictions) {
    if (p.status === STATUS.COMPARED) continue;
    const k = `${p.eventId}|${p.athleteId}`;
    const o = byPlayer.get(k) ?? { eventId: p.eventId, athleteId: p.athleteId, name: p.name, team: p.team, withheld: 0, reasons: {} };
    o.withheld += 1;
    const rk = `${p.status}:${p.detail}`;
    o.reasons[rk] = (o.reasons[rk] ?? 0) + 1;
    byPlayer.set(k, o);
  }
  const topMissingPlayers = [...byPlayer.values()].sort((a, b) => b.withheld - a.withheld || String(a.name).localeCompare(String(b.name))).slice(0, 40);

  const overall = tally(predictions);
  return {
    version: LINE_COVERAGE_VERSION,
    dataClass: "PRIVATE_RESEARCH",
    productEligible: false,
    slateDate,
    asOf,
    laneGeneratedAt: lane?.generatedAt ?? null,
    denominator: { predictions: predictions.length, games: games.length, players: new Set(predictions.map((p) => `${p.eventId}|${p.athleteId}`)).size, families: COVERAGE_FAMILIES.length, laneRowsWithoutMedian, definition: "published player × official family rows in the committed lane that carry a median" },
    display: { siteAuthorized: site.ok, reasons: site.ok ? [] : site.reasons },
    rendered: rendered ?? { measured: false, note: "not measured (no --export given)" },
    captures: docs.map((c) => ({
      file: c.file, capturedFor: c.doc?.capturedFor ?? null, state: c.doc?.coverage?.state ?? c.doc?.state ?? null,
      stoppedBecause: c.doc?.stoppedBecause ?? null, markets: (c.doc?.markets ?? []).length,
      records: (c.doc?.records ?? []).length, refusals: (c.doc?.refusals ?? []).length,
      laneGamesMatched: (c.doc?.coverage?.events?.matchedEventIds ?? []).filter((e) => laneEvents.has(String(e))).length,
    })),
    records: { total: records.length, onThisSlate: laneRecords.length },
    overall,
    withheldDetail: detailCounts(predictions),
    byMarket,
    byGame,
    byBook,
    unattributedRefusals: {
      event: unattributed.event, marketNotModelled: unattributed.marketNotModelled, offSlate: unattributed.offSlate,
      player: unattributed.player, outcome: unattributed.outcome,
    },
    topMissingPlayers,
    boardCoverage: board.coverage,
    predictions,
  };
}

/** Counts and percentages only — no player, line, price, book, game id or file name. */
export function publicCoverageSummary(report) {
  const strip = (t) => ({
    predictions: t.predictions, compatibleCaptured: t.compatibleCaptured, compared: t.compared,
    withheld: t.withheld, withheldTotal: t.withheldTotal, displayEligible: t.displayEligible,
  });
  return {
    version: LINE_COVERAGE_VERSION,
    kind: "public-aggregate",
    slateDate: report.slateDate,
    asOf: report.asOf,
    denominator: { predictions: report.denominator.predictions, games: report.denominator.games, players: report.denominator.players, families: report.denominator.families, definition: report.denominator.definition },
    displayAuthorized: report.display.siteAuthorized,
    renderedOnWebsite: report.rendered.measured ? { measured: true, projectionsPage: report.rendered.projectionsPage, gamePages: report.rendered.gamePages } : { measured: false },
    captureRuns: report.captures.length,
    booksWithQuotes: report.byBook.length,
    gamesWithAnyComparison: report.byGame.filter((g) => g.compared.count > 0).length,
    overall: strip(report.overall),
    byMarket: Object.fromEntries(Object.entries(report.byMarket).map(([f, t]) => [f, strip(t)])),
  };
}

const fmt = (p) => (p.pct == null ? `${p.count} / ${p.of} (—)` : `${p.count} / ${p.of} (${p.pct}%)`);
const FAMILY_LABEL = { pts: "Points", reb: "Rebounds", ast: "Assists", threePm: "Threes", pra: "Pts+Reb+Ast", ptsReb: "Pts+Reb", ptsAst: "Pts+Ast" };

/** Markdown: aggregates only (no player, line or price). `publicOnly` also drops books and games. */
export function coverageMarkdown(report, { publicOnly = false } = {}) {
  const s = publicCoverageSummary(report);
  const L = [];
  L.push(`# NBA line coverage · ${s.slateDate}${publicOnly ? " (public aggregate)" : " (private)"}`, "");
  L.push(`Comparison instant: ${s.asOf}. Denominator: **${s.denominator.predictions} official predictions** (${s.denominator.players} players × ${s.denominator.families} markets across ${s.denominator.games} games; ${s.denominator.definition}).`, "");
  L.push(`Public display authorized: **${s.displayAuthorized ? "yes" : "no"}**. Rendered on website: ${s.renderedOnWebsite.measured ? `projections page ${s.renderedOnWebsite.projectionsPage}, game pages ${s.renderedOnWebsite.gamePages}` : "not measured"}.`, "");
  const head = "| Market | Predictions | Compatible market captured | Current qualified quote | Stale / after tip | Identity or market mismatch | Invalid quote | Unsupported | Missing quote | Display-eligible |";
  L.push(head, "|---|---|---|---|---|---|---|---|---|---|");
  const row = (label, t) => `| ${label} | ${t.predictions} | ${fmt(t.compatibleCaptured)} | ${fmt(t.compared)} | ${fmt(t.withheld.STALE_OR_AFTER_TIP)} | ${fmt(t.withheld.IDENTITY_OR_MARKET_MISMATCH)} | ${fmt(t.withheld.INVALID_QUOTE)} | ${fmt(t.withheld.UNSUPPORTED)} | ${fmt(t.withheld.MISSING_QUOTE)} | ${fmt(t.displayEligible)} |`;
  for (const f of COVERAGE_FAMILIES) L.push(row(FAMILY_LABEL[f], s.byMarket[f]));
  L.push(row("**All markets**", s.overall), "");
  L.push(`Capture runs read: ${s.captureRuns}. Books with at least one quote: ${s.booksWithQuotes}. Games with at least one comparison: ${s.gamesWithAnyComparison} of ${s.denominator.games}.`, "");
  if (!publicOnly) {
    L.push("## By game", "", "| Game | Tip (UTC) | Captured | Predictions | Compatible | Compared | Withheld |", "|---|---|---|---|---|---|---|");
    for (const g of report.byGame) L.push(`| ${g.matchup} | ${g.tipUtc} | ${g.captured ? "yes" : "no"} | ${g.predictions} | ${fmt(g.compatibleCaptured)} | ${fmt(g.compared)} | ${fmt(g.withheldTotal)} |`);
    L.push("", "## By book (counts only)", "");
    if (!report.byBook.length) L.push("No book quoted any official prediction.");
    else {
      L.push("| Book | Quotes | Predictions quoted | Predictions qualified | Chosen for comparison |", "|---|---|---|---|---|");
      for (const b of report.byBook) L.push(`| ${b.book} | ${b.quotes} | ${fmt(b.predictionsQuoted)} | ${fmt(b.predictionsQualified)} | ${b.chosenForComparison} |`);
    }
    L.push("", "## Withheld detail (status:reason → predictions)", "");
    const d = Object.entries(report.withheldDetail).sort((a, b) => b[1] - a[1]);
    if (!d.length) L.push("None.");
    for (const [k, n] of d) L.push(`- ${k}: ${n}`);
    const ua = report.unattributedRefusals;
    L.push("", `Unattributed refusals: player ${ua.player.length}, outcome ${ua.outcome.length}, event ${Object.values(ua.event).reduce((a, b) => a + b, 0)}, off-slate ${ua.offSlate}. Player names are in the private JSON only.`);
  }
  return `${L.join("\n")}\n`;
}
