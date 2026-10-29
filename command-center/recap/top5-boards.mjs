/**
 * TOP 5 SOCIAL BOARDS · OFFICIAL-BOARD READERS AND SCHEDULE MATH — what a Top 5 social post may show, read only from
 * a Top Board GameTimePicks has already PUBLISHED, at one pinned data commit. Pure: no clock, no network, no writes.
 *
 * Trust rule (founder 2026-10-29): a social board reproduces an officially published Top Board for the same sport,
 * date (or NFL week), market and snapshot — its order, its qualifications, its market definition — and records the
 * source file, its sha256 and the commit. Nothing here ranks, sorts or fills a list:
 *   - rows are shown in the PUBLISHED order (a prefix of at most five), never re-sorted;
 *   - a published order that contradicts the board's own ranking key is held for review, never "fixed";
 *   - a shown row whose participation is now excluding (OUT, DOUBTFUL, …) holds the post, never back-filled;
 *   - a market with no official published board is UNAVAILABLE and recorded with the reason — never derived from a
 *     projection file, a lane, private research (data/internal/**), a shadow / ESTIMATE board or history.
 * Ranking methodologies are kept apart (METHODS): highest predicted probability, highest projected median, and the
 * model-vs-line difference (odds-gated, not supported here: such a board is UNAVAILABLE). One image never mixes two.
 *
 * Sources, audited 2026-10-29 at origin/main 047c7f686b:
 *   NFL (weekly)  app/public/data/nfl/weekly-boards/<seasonType>-<WW>.json — the "Weekly top boards" rendered verbatim
 *                 at /nfl/week/<key> (presentWeeklyBoard). PUBLISHED families: anytime_td, player_receptions,
 *                 player_reception_yds; rushing / passing yards are ESTIMATE (failed bars) → unavailable.
 *   daily sports  app/public/data/results/top-boards/<date>.json, boards whose `sport` is the sport (the Results V2
 *                 frozen Top 5, write-once). Today it only ever holds NFL boards: "MLB props are market context (every
 *                 market demoted), EPL and UFC have no player-prop model" (freeze-daily-top-boards.mjs). NBA's Top
 *                 Boards are PRIVATE_RESEARCH (data/internal/research/nba/top-boards) and are never read here.
 */
import { createHash } from "node:crypto";
import { digestOf } from "../lib/util.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
export const TOP5_ROWS = 5;
/** Default lead before the first game (minutes). Configurable per deployment (env), recorded on every package. */
export const DEFAULT_LEAD_MIN = Object.freeze({ daily: 120, weekly: 120 });
export function leadMinutes(env = {}) {
  const pick = (v, d) => (v != null && v !== "" && Number.isInteger(Number(v)) && Number(v) >= 15 && Number(v) <= 24 * 60 ? Number(v) : d);
  return { daily: pick(env.GTP_CC_TOP5_DAILY_LEAD_MIN, DEFAULT_LEAD_MIN.daily), weekly: pick(env.GTP_CC_TOP5_WEEKLY_LEAD_MIN, DEFAULT_LEAD_MIN.weekly) };
}

/** Participation states that take a player off a published list; QUESTIONABLE is shown and needs review. */
export const EXCLUDED = new Set(["OUT", "DOUBTFUL", "INACTIVE", "IR", "SUSPENDED", "PUP", "NOT_ON_ROSTER", "RELEASED"]);
/** Event states that are not an eligible start for the schedule (the game won't be played as listed). */
const NOT_ELIGIBLE_STATUS = /POSTPONED|CANCEL|SUSPENDED|FORFEIT/i;

/** Ranking methodologies — never mixed in one image or one caption line. */
export const METHODS = Object.freeze({
  probability: { id: "HIGHEST_PROBABILITY", label: "Highest predicted chance", supported: true },
  median: { id: "HIGHEST_PROJECTED_MEDIAN", label: "Highest projected median", supported: true },
  edge: { id: "MODEL_VS_LINE", label: "Model vs line difference", supported: false, why: "model-vs-line boards use sportsbook lines: a separate, gated feature" },
});

/** NFL market definitions (the site's own families). priority = deterministic image order. */
export const NFL_MARKETS = Object.freeze({
  anytime_td: { title: "Anytime Touchdown", short: "anytime TD", method: "probability", unit: "TD CHANCE", note: "Ranked by predicted chance to score · if he plays · passing TDs don't count", priority: 1 },
  player_reception_yds: { title: "Receiving Yards", short: "receiving yards", method: "median", unit: "PROJ. YDS", note: "Ranked by projected median for his game", priority: 2 },
  player_receptions: { title: "Receptions", short: "receptions", method: "median", unit: "PROJ. REC", note: "Ranked by projected median for his game", priority: 3 },
  player_rush_yds: { title: "Rushing Yards", short: "rushing yards", method: "median", unit: "PROJ. YDS", note: "Ranked by projected median for his game", priority: 4 },
  player_pass_yds: { title: "Passing Yards", short: "passing yards", method: "median", unit: "PROJ. YDS", note: "Ranked by projected median for his game", priority: 5 },
});

/**
 * Daily sports: the registry key, where an official board would be, and what was checked. A sport with no published
 * board is UNAVAILABLE for the day — the Command Center never builds one.
 */
export const DAILY_SPORTS = Object.freeze({
  NBA: { key: "nba", name: "NBA", publicExtra: (d) => `app/public/data/nba/top-boards/${d}.json`, note: "NBA Top Boards are private research (data/internal/research/nba/top-boards, PRIVATE_RESEARCH, productEligible false): never read" },
  MLB: { key: "mlb", name: "MLB", note: "MLB player props are market context (every market demoted); the 2026 season is over (mlb/season-state.json OFF_SEASON)" },
  UFC: { key: "ufc", name: "UFC", note: "UFC is SCAFFOLD_ONLY: no independent model, no player-prop board" },
  EPL: { key: "epl", name: "Premier League", note: "EPL publishes match forecasts and an anytime-scorer head, but no frozen Top Board" },
  LIGUE1: { key: "ligue-1", name: "Ligue 1", note: "Ligue 1 publishes match forecasts only: no player markets, no Top Board" },
});
export const RESULTS_TOP_BOARDS = (date) => `app/public/data/results/top-boards/${date}.json`;
export const NFL_SCHEDULE = "app/public/data/nfl/schedule/latest.json";
export const NFL_WEEKLY_BOARD = (seasonType, week) => `app/public/data/nfl/weekly-boards/${seasonType}-${String(week).padStart(2, "0")}.json`;

// ── time: event-local wall clocks → instants (DST-safe), ET labels ─────────────────────────────────────────────
const partsIn = (ms, tz) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
const wallOf = (ms, tz) => { const p = partsIn(ms, tz); return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`; };
const offsetMin = (ms, tz) => { const p = partsIn(ms, tz); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 60_000) * 60_000) / 60_000; };
/**
 * The instant at which the wall clock of `tz` reads `hhmm` on `date`. Ambiguous (fall-back) → the earlier instant;
 * skipped (spring-forward) → the instant just after the jump. Works for any IANA zone (London, Paris, Los Angeles …).
 */
export function zonedInstant(date, hhmm, tz) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const want = Date.UTC(y, m - 1, d, h, mi);
  const cands = [...new Set([want - 14 * 3600_000, want, want + 14 * 3600_000].map((probe) => want - offsetMin(probe, tz) * 60_000))].sort((a, b) => a - b);
  const exact = cands.filter((t) => wallOf(t, tz) === `${date} ${hhmm}`);
  return new Date(exact.length ? exact[0] : cands.at(-1)).toISOString();
}
export const etDateOf = (iso) => wallOf(Date.parse(iso), "America/New_York").slice(0, 10);
const ET = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...opts });
export const etShort = (iso) => `${ET({ weekday: "short" }).format(new Date(iso))} ${ET({ hour: "numeric", minute: "2-digit" }).format(new Date(iso))} ET`;
export const etDay = (iso) => ET({ weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** An event's start instant: `startUtc`, or an event-local wall clock { localDate, localTime, tz }. */
export function startOfEvent(e) {
  if (e.startUtc) return new Date(Date.parse(e.startUtc)).toISOString();
  if (e.localDate && e.localTime && e.tz) return zonedInstant(e.localDate, e.localTime, e.tz);
  return null;
}
/** The earliest ELIGIBLE game (not postponed / cancelled; with a start) of a slate, or null. */
export function earliestEligible(events) {
  return events.map((e) => ({ ...e, start: startOfEvent(e) })).filter((e) => e.start && !NOT_ELIGIBLE_STATUS.test(String(e.status ?? "")))
    .sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)))[0] ?? null;
}
/** The publish time: `leadMin` before the first eligible game. */
export const publishAtFor = (firstStartUtc, leadMin) => new Date(Date.parse(firstStartUtc) - leadMin * 60_000).toISOString();

// ── board helpers ────────────────────────────────────────────────────────────────────────────────────────────
const pct = (p) => `${(p * 100).toFixed(1)}%`;
/** What the site shows for a row (presentWeeklyBoardRow: probability ?? value · median ?? value). */
function displayOf(method, row) {
  if (method === "probability") { const p = row.probability ?? row.projection?.probability ?? row.value; return Number.isFinite(p) ? { value: p, display: pct(p) } : null; }
  const v = row.median ?? row.projection?.median ?? row.value;
  return Number.isFinite(v) ? { value: v, display: String(v) } : null;
}
/** The ranking key the producer sorted by (weekly: `value`; frozen daily: the displayed metric). */
const rankKeyOf = (method, row) => (Number.isFinite(row.value) ? row.value : displayOf(method, row)?.value);

/**
 * One published board → one market, exactly as published (a prefix of at most five rows), or a refusal.
 * @returns {{ ok: true, market } | { ok: false, unavailable?: true, hold?: true, reason: string }}
 */
export function marketFromBoard({ sport, board, defs, source }) {
  const family = board.family ?? board.propFamily;
  const def = defs[family];
  if (!def) return { ok: false, unavailable: true, market: family, reason: `${family}: no market definition for social boards (not drawn)` };
  if (board.state && board.state !== "PUBLISHED") return { ok: false, unavailable: true, market: family, reason: `${def.title}: not an official published board (${board.state}${board.reason ? ` — ${board.reason}` : ""})` };
  const method = board.metric;
  if (!METHODS[method]?.supported) return { ok: false, unavailable: true, market: family, reason: `${def.title}: ${METHODS[method]?.why ?? `unknown ranking metric "${method}"`}` };
  if (method !== def.method) return { ok: false, unavailable: true, market: family, reason: `${def.title}: the board ranks by ${method}, the market definition by ${def.method} — never mixed` };
  const published = board.rows ?? [];
  if (!published.length) return { ok: false, unavailable: true, market: family, reason: `${def.title}: the published board has no rows` };
  const shown = published.slice(0, TOP5_ROWS);
  // published ranks, when the board carries them, must be 1..n in order
  if (shown.some((r, i) => r.rank != null && r.rank !== i + 1)) return { ok: false, hold: true, market: family, reason: `${def.title}: the published ranks are not in order — hold for review rather than re-rank` };
  const keys = shown.map((r) => rankKeyOf(method, r));
  if (keys.some((k) => !Number.isFinite(k)) || keys.some((k, i) => i > 0 && k > keys[i - 1] + 1e-9)) return { ok: false, hold: true, market: family, reason: `${def.title}: the published order contradicts its own ranking key — hold for review rather than re-rank` };
  const excluded = shown.filter((r) => EXCLUDED.has(String(r.participation ?? "").toUpperCase()));
  if (excluded.length) return { ok: false, hold: true, market: family, reason: `${def.title}: ${excluded.map((r) => `${r.name} is ${r.participation}`).join(", ")} — a published row is now excluded: hold for review rather than re-rank` };
  const rows = shown.map((r, i) => {
    const d = displayOf(method, r);
    return { rank: i + 1, playerId: r.playerId, name: r.name, team: r.team, opponent: r.opponent ?? null, eventId: String(r.providerEventId ?? ""), kickoffUtc: r.kickoffUtc ?? null, participation: r.participation ?? null, value: d?.value ?? null, display: d?.display ?? "—" };
  });
  if (rows.some((r) => r.value == null)) return { ok: false, hold: true, market: family, reason: `${def.title}: a published row has no value` };
  return {
    ok: true,
    market: {
      sport, market: family, title: def.title, short: def.short, unit: def.unit, note: def.note, priority: def.priority, method, methodId: METHODS[method].id, methodLabel: METHODS[method].label,
      publishedTitle: board.title ?? board.label ?? null, publishedTopN: board.topN ?? published.length, publishedRows: published.length, shownRows: rows.length,
      questionable: rows.filter((r) => String(r.participation).toUpperCase() === "QUESTIONABLE").map((r) => r.name),
      rows, source,
    },
  };
}

/** The content key: exactly what appears (market, rows, values, order) — not the file bytes, not the data commit. */
export const contentKeyOf = (markets, extra = {}) => digestOf({ ...extra, markets: markets.map((m) => ({ market: m.market, method: m.method, rows: m.rows.map((r) => [r.rank, r.playerId, r.display]) })) });

// ── NFL: the week ─────────────────────────────────────────────────────────────────────────────────────────────
/** Every NFL week in the schedule capture: events, first and last kickoff (eligible games only). */
export function nflWeeks(schedule) {
  const by = new Map();
  for (const r of schedule.rows ?? []) {
    const k = `${r.seasonType}-${r.week}`;
    if (!by.has(k)) by.set(k, { seasonType: r.seasonType, week: r.week, events: [] });
    by.get(k).events.push({ id: String(r.providerEventId), name: r.shortName, startUtc: r.dateUtc, status: r.statusRaw });
  }
  return [...by.values()].map((w) => {
    const elig = w.events.filter((e) => e.startUtc && !NOT_ELIGIBLE_STATUS.test(String(e.status ?? ""))).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    return { ...w, eligible: elig, first: earliestEligible(w.events), lastStartUtc: elig.at(-1)?.startUtc ?? null };
  }).filter((w) => w.first).sort((a, b) => a.first.start.localeCompare(b.first.start));
}
/** The NFL season a week belongs to (Jan / Feb games belong to the previous year's season). */
export const nflSeasonOf = (firstStartUtc) => { const [y, m] = etDateOf(firstStartUtc).split("-").map(Number); return m <= 2 ? y - 1 : y; };
export const weekLabelOf = (w) => (w.seasonType === 3 ? `Postseason week ${w.week}` : w.seasonType === 1 ? `Preseason week ${w.week}` : `Week ${w.week}`);
export const weekPeriodOf = (season, w) => `${season}-${w.seasonType === 2 ? "W" : w.seasonType === 3 ? "P" : "PRE"}${String(w.week).padStart(2, "0")}`;

/** The week a queue for `date` covers: the earliest week not yet over whose first game is within the next 7 days. */
export function nflWeekFor(weeks, date) {
  return weeks.find((w) => etDateOf(w.lastStartUtc) >= date && etDateOf(w.first.start) <= addDays(date, 6)) ?? null;
}

/**
 * The NFL week's official Top 5 boards for the week a queue on `date` covers.
 * @returns { ok, scope:"week", sport:"NFL", season, period, weekLabel, firstGame, …, markets[], unavailable[], coverage, evidence[], status, reasons[] }
 */
export function nflWeekTop5({ src, date }) {
  const schedRaw = src.read(NFL_SCHEDULE);
  if (schedRaw == null) return { ok: false, notReady: true, reason: `no NFL schedule capture (${NFL_SCHEDULE}) at the data commit` };
  const week = nflWeekFor(nflWeeks(JSON.parse(schedRaw)), date);
  if (!week) return { ok: false, reason: `no NFL week starts within 7 days of ${date} in the schedule capture` };
  const season = nflSeasonOf(week.first.start);
  const base = { scope: "week", sport: "NFL", sportName: "NFL", season, seasonType: week.seasonType, week: week.week, period: weekPeriodOf(season, week), weekLabel: weekLabelOf(week),
    firstGame: { eventId: week.first.id, name: week.first.name, startUtc: week.first.start }, firstStartUtc: week.first.start, lastStartUtc: week.lastStartUtc,
    events: week.eligible.map((e) => e.id), slateLine: `${etDay(week.first.start)} – ${etDay(week.lastStartUtc)}` };
  const evidence = [{ label: "NFL schedule capture", path: NFL_SCHEDULE, commit: src.commit ?? null, sha256: sha(schedRaw) }];
  const p = NFL_WEEKLY_BOARD(week.seasonType, week.week);
  const raw = src.read(p);
  if (raw == null) return { ok: false, ...base, evidence, notReady: true, reason: `the ${base.weekLabel} official boards (${p}) are not published at the data commit` };
  const j = JSON.parse(raw);
  evidence.push({ label: "official weekly Top Boards", path: p, commit: src.commit ?? null, sha256: sha(raw), generatedAt: j.generatedAt ?? null, model: j.model ?? null });
  if (j.dataClass !== "PUBLIC") return { ok: false, ...base, evidence, notReady: true, reason: `${p} is ${j.dataClass ?? "unclassified"}, not PUBLIC` };
  if (j.period?.seasonType !== week.seasonType || j.period?.week !== week.week) return { ok: false, ...base, evidence, notReady: true, reason: `${p} is for ${JSON.stringify(j.period)}, not ${base.weekLabel}` };
  const source = { path: p, commit: src.commit ?? null, sha256: sha(raw) };
  const markets = [];
  const unavailable = [];
  const holds = [];
  for (const b of j.boards ?? []) {
    const r = marketFromBoard({ sport: "NFL", board: b, defs: NFL_MARKETS, source });
    if (r.ok) markets.push(r.market);
    else if (r.hold) holds.push(r.reason);
    else unavailable.push({ market: r.market, reason: r.reason });
  }
  for (const fam of Object.keys(NFL_MARKETS)) if (!(j.boards ?? []).some((b) => b.family === fam)) unavailable.push({ market: fam, reason: `${NFL_MARKETS[fam].title}: not on the published weekly board` });
  markets.sort((a, b) => a.priority - b.priority);
  // every shown row must belong to this week's games
  const strays = markets.flatMap((m) => m.rows).filter((r) => !base.events.includes(r.eventId));
  if (strays.length) holds.push(`rows from games outside ${base.weekLabel}: ${strays.map((r) => r.name).join(", ")}`);
  // coverage: the board must cover every eligible game of the week (a full-week edition, nothing dropped)
  const covered = j.scope?.eventsIncluded ?? null;
  const complete = j.scope?.kind === "FULL_WEEK" && covered === base.events.length && !(j.scope?.eventsDroppedAfterKickoff > 0);
  const coverage = {
    complete, scopeKind: j.scope?.kind ?? null, eventsInWeek: base.events.length, eventsCovered: covered, eventsDroppedAfterKickoff: j.scope?.eventsDroppedAfterKickoff ?? null,
    marketsPublished: markets.map((m) => m.market), marketsUnavailable: unavailable.map((u) => u.market),
    note: complete ? `full-week edition: all ${base.events.length} games` : `the official board covers ${covered ?? "?"} of ${base.events.length} games (${j.scope?.kind ?? "unknown scope"}) — not a complete week`,
  };
  const reasons = [...holds];
  if (!complete) reasons.push(`coverage limitation: ${coverage.note}; the weekly post never claims the full week — held`);
  if (!markets.length) reasons.push("no market has an official published board this week");
  const questionable = markets.flatMap((m) => m.questionable);
  const status = reasons.length ? "BLOCKED" : questionable.length ? "NEEDS_VERIFICATION" : "READY";
  if (status === "NEEDS_VERIFICATION") reasons.push(`QUESTIONABLE on a shown row (${questionable.join(", ")}): confirm before approving`);
  return { ok: true, ...base, markets, unavailable, coverage, evidence, status, reasons, contentKey: contentKeyOf(markets, { scope: "week", period: base.period, coverage: complete }) };
}

// ── daily sports ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * One sport's official Top 5 boards for one ET date (NBA, MLB, UFC, EPL, Ligue 1). Daily market definitions come from
 * the published board itself (label + metric).
 */
export function dailyTop5({ src, sport, date }) {
  const conf = DAILY_SPORTS[sport];
  if (!conf) return { ok: false, unavailable: true, reason: `${sport} is not a daily Top 5 sport` };
  const p = RESULTS_TOP_BOARDS(date);
  const raw = src.read(p);
  const checked = [p, ...(conf.publicExtra ? [conf.publicExtra(date)] : [])];
  const extraRaw = conf.publicExtra ? src.read(conf.publicExtra(date)) : null;
  const j = raw ? JSON.parse(raw) : null;
  const boards = (j?.boards ?? []).filter((b) => String(b.sport).toLowerCase() === conf.key);
  if (!boards.length) {
    const why = extraRaw != null
      ? `a public ${conf.name} board file exists (${conf.publicExtra(date)}) but it is not a frozen Results Top Board and its eligibility contract is not reviewed`
      : `no official published ${conf.name} Top Board for ${date}`;
    return { ok: false, unavailable: true, sport, date, checked, reason: `${why}. ${conf.note}` };
  }
  if (j.dataClass !== "PUBLIC") return { ok: false, unavailable: true, sport, date, checked, reason: `${p} is not PUBLIC` };
  const source = { path: p, commit: src.commit ?? null, sha256: sha(raw) };
  const defs = Object.fromEntries(boards.map((b, i) => [b.propFamily, { title: b.label ?? b.propFamily, short: String(b.label ?? b.propFamily).toLowerCase(), method: b.metric, unit: b.metric === "probability" ? "CHANCE" : "PROJECTED", note: b.metric === "probability" ? "Ranked by predicted chance" : "Ranked by projected median", priority: i + 1 }]));
  const markets = [];
  const unavailable = (j.ineligible ?? []).filter((x) => String(x.sport).toLowerCase() === conf.key).map((x) => ({ market: x.propFamily, reason: `${x.label ?? x.propFamily}: ${x.state}${x.reason ? ` — ${x.reason}` : ""}` }));
  const holds = [];
  for (const b of boards) {
    const r = marketFromBoard({ sport, board: { ...b, family: b.propFamily, state: "PUBLISHED" }, defs, source });
    if (r.ok) markets.push(r.market); else if (r.hold) holds.push(r.reason); else unavailable.push({ market: r.market, reason: r.reason });
  }
  // the slate's first game: the board's own first kickoff, never later than any shown row's kickoff
  const rowStarts = markets.flatMap((m) => m.rows.map((r) => r.kickoffUtc)).filter(Boolean).sort();
  const first = j.firstKickoffUtc ? new Date(Date.parse(j.firstKickoffUtc)).toISOString() : null;
  if (!first) holds.push("the official board records no first start time: the schedule can't be computed");
  else if (rowStarts.length && Date.parse(rowStarts[0]) < Date.parse(first)) holds.push("a shown row starts before the board's recorded first start");
  const reasons = [...holds];
  if (!markets.length) reasons.push(`no ${conf.name} market has an official published board on ${date}`);
  const questionable = markets.flatMap((m) => m.questionable);
  const status = reasons.length ? "BLOCKED" : questionable.length ? "NEEDS_VERIFICATION" : "READY";
  if (status === "NEEDS_VERIFICATION") reasons.push(`QUESTIONABLE on a shown row (${questionable.join(", ")}): confirm before approving`);
  return {
    ok: true, scope: "day", sport, sportName: conf.name, date, period: date, slateLine: etDay(`${date}T16:00:00Z`), firstStartUtc: first,
    firstGame: first ? { eventId: (j.events ?? [])[0] ?? null, startUtc: first } : null, events: (j.events ?? []).map(String),
    markets, unavailable, coverage: { complete: true, marketsPublished: markets.map((m) => m.market), marketsUnavailable: unavailable.map((u) => u.market), note: `the ${date} frozen board (${(j.events ?? []).length} events)` },
    evidence: [{ label: "frozen Results Top Board", path: p, commit: src.commit ?? null, sha256: sha(raw), publishedAt: j.publishedAt ?? null }], status, reasons,
    contentKey: contentKeyOf(markets, { scope: "day", sport, date }),
  };
}
