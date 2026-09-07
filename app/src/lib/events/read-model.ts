/**
 * THE SHARED EVENT + PERIOD READ MODEL (P243 · B-1).
 *
 * One normalized, read-only view of every sport's events, adapted from the AUTHORITATIVE
 * producers — never a second mutable copy of sporting or financial truth. Each sport keeps its
 * natural period (charter §5):
 *
 *   MLB → ET day · NFL → season/phase/week · EPL → season/matchweek · UFC → event card
 *
 * WHY DIMENSIONS, NOT ONE STATE. The site's repeated defect class is one surface collapsing
 * "an artifact exists" into "this event is simulated" (2026-09-07: six missed games counted as
 * simulated; "COMPLETE" in the offered-window artifact read as full forecast coverage). So this
 * model keeps the axes the charter names SEPARATE and fail-closed:
 *
 *   schedule    — the event is in a committed schedule capture
 *   model       — a pre-event model artifact for THIS event is published / missed / unsupported
 *   prices      — a CURRENT authorized price capture covers this event (archived ≠ current)
 *   settlement  — an official result has been graded for this event
 *
 * An existing artifact is not a differentiated simulation; a classified event is not a published
 * forecast; a green board is not report coverage. Consumers combine axes explicitly.
 *
 * Identity: provider IDs with explicit alias lineage (never primarily team-names+kickoff).
 * Times: `scheduledUtc` is the instant; `eventEtDate` is the event's America/New_York date —
 * the ONLY date "today" boards may filter on.
 */
import fs from "node:fs";
import path from "node:path";

export type EventSport = "mlb" | "nfl" | "epl" | "ufc";
export type PeriodKind = "day" | "week" | "matchweek" | "card";

export interface EventPeriod {
  kind: PeriodKind;
  /** Stable selector key: MLB "2026-09-07" · NFL "2026-regular-w1" · EPL "2026-27-mw4" · UFC providerEventId. */
  key: string;
  label: string;
}

export type ScheduleDim = "CAPTURED" | "NOT_CAPTURED";
export type ModelDim = "PUBLISHED" | "NOT_PUBLISHED" | "MISSED_PREEVENT" | "UNSUPPORTED";
export type PriceDim = "PRICED" | "ARCHIVED" | "NOT_CAPTURED" | "UNAUTHORIZED";
export type SettleDim = "SETTLED" | "PENDING" | "NOT_APPLICABLE";

export type EventStatus = "SCHEDULED" | "IN_PROGRESS" | "FINAL" | "POSTPONED" | "UNKNOWN";

export interface CanonicalEvent {
  /** Stable id in the provider's own namespace, prefixed by sport. */
  eventId: string;
  /** Every provider alias we can cite, with its provider — the join lineage, never guessed. */
  providerAliases: Array<{ provider: string; id: string }>;
  sport: EventSport;
  competition: string;
  season: string | null;
  /** NFL preseason/regular/postseason; null where the sport has no phase axis. */
  phase: "preseason" | "regular" | "postseason" | null;
  period: EventPeriod;
  scheduledUtc: string | null;
  /** The event's date in America/New_York — the only "today" a board may filter on. */
  eventEtDate: string | null;
  participants: { home: string | null; away: string | null };
  status: EventStatus;
  dimensions: {
    schedule: ScheduleDim;
    model: ModelDim;
    prices: PriceDim;
    settlement: SettleDim;
  };
  /** Canonical public report route when one exists for this event. */
  reportHref: string | null;
}

const DATA = () => path.join(process.cwd(), "public", "data");

const readJson = (...rel: string[]): unknown => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA(), ...rel), "utf8"));
  } catch {
    return null;
  }
};

/** ET calendar date of a UTC instant — UTC-noon-free, real zone math (DST-correct). */
export function etDateOf(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  // en-CA gives YYYY-MM-DD directly.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

const startedBy = (iso: string | null, nowMs: number): boolean => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && t <= nowMs;
};

// ── NFL ─────────────────────────────────────────────────────────────────────────────────────────

const NFL_PHASE: Record<number, "preseason" | "regular" | "postseason"> = { 1: "preseason", 2: "regular", 3: "postseason" };

export function loadNflEvents(nowIso: string): CanonicalEvent[] {
  const sched = readJson("nfl", "schedule", "latest.json") as { rows?: Array<Record<string, unknown>> } | null;
  const forecasts = readJson("nfl", "forecasts", "latest.json") as { forecasts?: Array<{ providerEventId: string }> } | null;
  const graded = readJson("nfl", "graded-picks.json") as { rows?: Array<{ providerEventId?: string }> } | null;
  const markets = readJson("nfl", "markets", "latest.json") as { rows?: Array<{ providerEventId?: string; kickoffUtc?: string }>; capturedAt?: string } | null;
  const nowMs = Date.parse(nowIso);
  const forecastIds = new Set((forecasts?.forecasts ?? []).map((f) => String(f.providerEventId)));
  const settledIds = new Set((graded?.rows ?? []).map((r) => String(r.providerEventId ?? "")));
  const pricedNow = new Set(
    (markets?.rows ?? [])
      .filter((r) => r.kickoffUtc && Date.parse(String(r.kickoffUtc)) > nowMs && String(markets?.capturedAt ?? "") < String(r.kickoffUtc))
      .map((r) => String(r.providerEventId ?? "")),
  );
  const pricedArchived = new Set(
    (markets?.rows ?? [])
      .filter((r) => r.kickoffUtc && Date.parse(String(r.kickoffUtc)) <= nowMs)
      .map((r) => String(r.providerEventId ?? "")),
  );

  return (sched?.rows ?? []).map((r) => {
    const id = String(r.providerEventId ?? "");
    const dateUtc = typeof r.dateUtc === "string" ? r.dateUtc : null;
    const week = typeof r.week === "number" ? r.week : null;
    const phase = NFL_PHASE[Number(r.seasonType)] ?? null;
    const season = dateUtc ? String(new Date(Date.parse(dateUtc)).getUTCFullYear()) : null;
    const started = startedBy(dateUtc, nowMs);
    const raw = String(r.statusRaw ?? "");
    const status: EventStatus =
      raw === "STATUS_SCHEDULED" ? (started ? "IN_PROGRESS" : "SCHEDULED")
        : /FINAL/i.test(raw) ? "FINAL"
          : /POSTPONED|CANCEL/i.test(raw) ? "POSTPONED"
            : "UNKNOWN";
    const model: ModelDim = forecastIds.has(id)
      ? "PUBLISHED"
      : started ? "MISSED_PREEVENT" : "NOT_PUBLISHED";
    return {
      eventId: `nfl:${id}`,
      providerAliases: [{ provider: "espn_scoreboard", id }],
      sport: "nfl",
      competition: "NFL",
      season,
      phase,
      period: {
        kind: "week",
        key: `${season ?? "?"}-${phase ?? "?"}-w${week ?? "?"}`,
        label: phase === "regular" ? `Week ${week}` : phase === "preseason" ? `Preseason Week ${week}` : `Week ${week}`,
      },
      scheduledUtc: dateUtc,
      eventEtDate: etDateOf(dateUtc),
      participants: {
        home: typeof r.homeTeam === "string" ? r.homeTeam : String(r.shortName ?? "").split(/ @ | VS /i)[1] ?? null,
        away: typeof r.awayTeam === "string" ? r.awayTeam : String(r.shortName ?? "").split(/ @ | VS /i)[0] ?? null,
      },
      status,
      dimensions: {
        schedule: "CAPTURED",
        model,
        prices: pricedNow.has(id) ? "PRICED" : pricedArchived.has(id) ? "ARCHIVED" : "NOT_CAPTURED",
        settlement: settledIds.has(id) ? "SETTLED" : status === "FINAL" ? "PENDING" : "NOT_APPLICABLE",
      },
      reportHref: forecastIds.has(id) || settledIds.has(id) ? `/nfl/game/${id}/` : null,
    };
  });
}

// ── EPL ─────────────────────────────────────────────────────────────────────────────────────────

export function loadEplEvents(nowIso: string): CanonicalEvent[] {
  // The fixtures lane commits dated capture-*.json files (no latest pointer): newest capture wins.
  const fixturesDir = path.join(DATA(), "soccer", "epl", "fixtures");
  const newestCapture = (() => {
    try {
      return fs.readdirSync(fixturesDir).filter((f) => f.startsWith("capture-") && f.endsWith(".json")).sort().pop() ?? null;
    } catch { return null; }
  })();
  const fixtures = (newestCapture ? readJson("soccer", "epl", "fixtures", newestCapture) : null) as
    | { season?: string; fixtures?: Array<Record<string, unknown>>; rows?: Array<Record<string, unknown>> }
    | null;
  const forecasts = readJson("soccer", "epl", "forecasts", "latest.json") as { rows?: Array<{ eventId?: string; state?: string }> } | null;
  const graded = readJson("epl", "graded-picks.json") as { rows?: Array<{ eventId?: string }> } | null;
  const nowMs = Date.parse(nowIso);
  const season = fixtures?.season ? String(fixtures.season) : null;
  const published = new Set(
    (forecasts?.rows ?? []).filter((f) => f.state === "FORECAST" || f.state === "PUBLISHED" || (!f.state && f.eventId)).map((f) => String(f.eventId)),
  );
  const settled = new Set((graded?.rows ?? []).map((g) => String(g.eventId ?? "")));

  const rows = fixtures?.fixtures ?? fixtures?.rows ?? [];
  return rows.map((r) => {
    const id = String(r.eventId ?? "");
    const kick = typeof r.kickoffIso === "string" ? r.kickoffIso : typeof r.kickoffUtc === "string" ? r.kickoffUtc : null;
    const mw = typeof r.matchweek === "number" ? r.matchweek : null;
    const started = startedBy(kick, nowMs);
    const lifecycle = String(r.lifecycle ?? "");
    const status: EventStatus =
      /FINAL|FT|PLAYED/i.test(lifecycle) ? "FINAL"
        : /POSTPON/i.test(lifecycle) ? "POSTPONED"
          : started ? "IN_PROGRESS" : "SCHEDULED";
    const model: ModelDim = published.has(id) ? "PUBLISHED" : started ? "MISSED_PREEVENT" : "NOT_PUBLISHED";
    const aliases: Array<{ provider: string; id: string }> = [{ provider: "committed-fixture-capture", id }];
    for (const ref of (r.providerRefs as Array<{ provider?: string; id?: string }> | undefined) ?? []) {
      if (ref?.provider && ref?.id) aliases.push({ provider: String(ref.provider), id: String(ref.id) });
    }
    return {
      eventId: `epl:${id}`,
      providerAliases: aliases,
      sport: "epl" as const,
      competition: "Premier League",
      season,
      phase: null,
      period: { kind: "matchweek" as const, key: `${season ?? "?"}-mw${mw ?? "?"}`, label: `Matchweek ${mw ?? "?"}` },
      scheduledUtc: kick,
      eventEtDate: etDateOf(kick),
      participants: { home: String(r.homeClub ?? "") || null, away: String(r.awayClub ?? "") || null },
      status,
      dimensions: {
        schedule: "CAPTURED" as const,
        model,
        // EPL price captures are event-window scoped (30h). Whether a CURRENT capture covers this
        // fixture is decided by the odds artifact's own coverage — absent here, fail closed.
        prices: "NOT_CAPTURED" as const,
        settlement: settled.has(id) ? ("SETTLED" as const) : status === "FINAL" ? ("PENDING" as const) : ("NOT_APPLICABLE" as const),
      },
      reportHref: (() => {
        const slug = id.split(":")[2];
        return slug ? `/epl/match/${slug}-${String(kick ?? "").slice(0, 10)}/` : null;
      })(),
    };
  });
}

// ── UFC ─────────────────────────────────────────────────────────────────────────────────────────

export function loadUfcEvents(nowIso: string): CanonicalEvent[] {
  const card = readJson("ufc", "card-latest.json") as
    | {
        event?: { providerEventId?: string; name?: string; startUtc?: string; slateDate?: string };
        bouts?: Array<Record<string, unknown>>;
      }
    | null;
  const odds = readJson("ufc", "odds-latest.json") as { event?: { providerEventId?: string } ; bouts?: Array<Record<string, unknown>> } | null;
  const nowMs = Date.parse(nowIso);
  const ev = card?.event;
  if (!ev?.providerEventId) return [];
  // Prices join ONLY when both artifacts describe the same provider event (P240's identity rule).
  const oddsMatchesCard = String(odds?.event?.providerEventId ?? "") === String(ev.providerEventId);

  return (card?.bouts ?? []).map((b, i) => {
    const red = (b.red as { name?: string } | undefined)?.name ?? null;
    const blue = (b.blue as { name?: string } | undefined)?.name ?? null;
    const boutId = String(b.boutId ?? `bout-${i}`);
    const start = typeof b.startUtc === "string" ? b.startUtc : ev.startUtc ?? null;
    const started = startedBy(start ?? null, nowMs);
    const modelled = b.prediction != null;
    return {
      eventId: `ufc:${ev.providerEventId}:${boutId}`,
      providerAliases: [{ provider: "odds_api", id: String(ev.providerEventId) }],
      sport: "ufc" as const,
      competition: "UFC",
      season: null,
      phase: null,
      period: { kind: "card" as const, key: String(ev.providerEventId), label: String(ev.name ?? "UFC card") },
      scheduledUtc: start ?? null,
      eventEtDate: etDateOf(start ?? null) ?? (typeof ev.slateDate === "string" ? ev.slateDate : null),
      participants: { home: red, away: blue },
      status: started ? ("IN_PROGRESS" as const) : ("SCHEDULED" as const),
      dimensions: {
        schedule: "CAPTURED" as const,
        model: modelled ? ("PUBLISHED" as const) : ("UNSUPPORTED" as const),
        prices: oddsMatchesCard ? ("PRICED" as const) : ("NOT_CAPTURED" as const),
        settlement: "NOT_APPLICABLE" as const,
      },
      reportHref: `/ufc/#bout-${boutId}`,
    };
  });
}

// ── MLB ─────────────────────────────────────────────────────────────────────────────────────────

export function loadMlbEvents(nowIso: string, date?: string): CanonicalEvent[] {
  const day = date ?? etDateOf(nowIso)!;
  const fg = readJson("mlb", "full-game-simulations", `${day}.json`) as
    | { games?: Array<Record<string, unknown>> }
    | null;
  const nowMs = Date.parse(nowIso);
  return (fg?.games ?? []).map((g) => {
    const pk = String(g.gamePk ?? g.gameId ?? "");
    const start = typeof g.firstPitch === "string" ? g.firstPitch : null;
    const started = startedBy(start, nowMs);
    const st = String(g.status ?? "");
    const model: ModelDim =
      st === "ready" || st === "degraded" ? "PUBLISHED" : started ? "MISSED_PREEVENT" : "NOT_PUBLISHED";
    return {
      eventId: `mlb:${pk}`,
      providerAliases: [{ provider: "mlb_statsapi", id: pk }],
      sport: "mlb" as const,
      competition: "MLB",
      season: day.slice(0, 4),
      phase: null,
      period: { kind: "day" as const, key: day, label: day },
      scheduledUtc: start,
      eventEtDate: etDateOf(start) ?? day,
      participants: {
        home: (g.teams as { home?: string } | undefined)?.home ?? null,
        away: (g.teams as { away?: string } | undefined)?.away ?? null,
      },
      status: started ? ("IN_PROGRESS" as const) : ("SCHEDULED" as const),
      dimensions: {
        schedule: "CAPTURED" as const,
        model,
        prices: "NOT_CAPTURED" as const, // board join is owned by the availability contract
        settlement: "NOT_APPLICABLE" as const,
      },
      reportHref: typeof g.slug === "string" ? `/games/mlb/${g.slug}/` : null,
    };
  });
}

// ── Cross-sport selectors ───────────────────────────────────────────────────────────────────────

export function loadSportEvents(sport: EventSport, nowIso: string): CanonicalEvent[] {
  switch (sport) {
    case "mlb": return loadMlbEvents(nowIso);
    case "nfl": return loadNflEvents(nowIso);
    case "epl": return loadEplEvents(nowIso);
    case "ufc": return loadUfcEvents(nowIso);
  }
}

/** Distinct periods present in a set of events, in schedule order. */
export function periodsOf(events: readonly CanonicalEvent[]): EventPeriod[] {
  const seen = new Map<string, { p: EventPeriod; first: string }>();
  for (const e of events) {
    const cur = seen.get(e.period.key);
    const t = e.scheduledUtc ?? "9999";
    if (!cur || t < cur.first) seen.set(e.period.key, { p: e.period, first: t });
  }
  return [...seen.values()].sort((a, b) => a.first.localeCompare(b.first)).map((x) => x.p);
}

/**
 * The sport's CURRENT natural period: the one holding the next not-yet-finished event, else the
 * most recent. Rescheduled fixtures stay in their period; only the schedule decides membership.
 */
export function currentPeriodKey(events: readonly CanonicalEvent[], nowIso: string): string | null {
  const nowMs = Date.parse(nowIso);
  const upcoming = events
    .filter((e) => e.scheduledUtc != null && Date.parse(e.scheduledUtc) > nowMs && e.status !== "FINAL")
    .sort((a, b) => a.scheduledUtc!.localeCompare(b.scheduledUtc!));
  if (upcoming.length) return upcoming[0].period.key;
  const past = events
    .filter((e) => e.scheduledUtc != null)
    .sort((a, b) => b.scheduledUtc!.localeCompare(a.scheduledUtc!));
  return past[0]?.period.key ?? null;
}

export function eventsInPeriod(events: readonly CanonicalEvent[], periodKey: string): CanonicalEvent[] {
  return events.filter((e) => e.period.key === periodKey);
}

/**
 * Same-scope counts for one period — the numbers every consuming page must agree on. Missed
 * pre-event coverage is preserved as its own count, never folded into "published".
 */
export function periodCounts(events: readonly CanonicalEvent[]): {
  scheduled: number; modelPublished: number; missedPreEvent: number; unsupported: number;
  pricedNow: number; settled: number;
} {
  let modelPublished = 0, missedPreEvent = 0, unsupported = 0, pricedNow = 0, settled = 0;
  for (const e of events) {
    if (e.dimensions.model === "PUBLISHED") modelPublished += 1;
    if (e.dimensions.model === "MISSED_PREEVENT") missedPreEvent += 1;
    if (e.dimensions.model === "UNSUPPORTED") unsupported += 1;
    if (e.dimensions.prices === "PRICED") pricedNow += 1;
    if (e.dimensions.settlement === "SETTLED") settled += 1;
  }
  return { scheduled: events.length, modelPublished, missedPreEvent, unsupported, pricedNow, settled };
}
