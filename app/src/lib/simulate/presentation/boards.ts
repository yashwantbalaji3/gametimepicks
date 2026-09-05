/**
 * BOARD PRESENTATIONS — Program 234 · Release D.
 *
 * Three content types that are not one event: today's Top 10, a published parlay, and a results
 * recap. They reuse the player, the machine and the frame unchanged — what differs is only what the
 * chapters carry.
 *
 * THE RULE THAT SHAPES ALL THREE. Each of these is the kind of thing that gets recorded and shared,
 * which makes each of them the easiest place in the product to overstate. So:
 *
 *   · a Top 10 with six eligible entries has SIX rows and a sentence explaining the other four.
 *     Padding it back to ten with weaker picks would be inventing coverage;
 *   · a parlay presentation shows the frozen legs, the risk label and the slip's state. It creates
 *     nothing, publishes nothing, and prints the tier's record WITH its denominator beside the
 *     price — an 18% hit rate is the context a combined price needs;
 *   · a recap carries the period, the population, the record AND the denominator. A clip reel of
 *     wins is not a recap, and zero decisive outcomes reads "unavailable", never 0%.
 */
import type { ChapterKind, PresentationChapter, PresentationManifest, PresentationResult } from "./types";

const HOLD = { light: 4200, normal: 5200, dense: 6400 } as const;
const pctOf = (n: number) => Math.round(n * 100);
const american = (n: number) => (n > 0 ? `+${n}` : String(n));

function manifestOf(
  parts: {
    eventId: string; title: string; displayDate: string; reportHref: string;
    chapters: PresentationChapter[]; readiness?: "ready" | "degraded";
    modelVersion?: string | null; generatedAt?: string | null;
  },
): PresentationManifest {
  return {
    schema: 1, sport: "board",
    eventId: parts.eventId,
    slug: parts.eventId,
    title: parts.title,
    displayDate: parts.displayDate,
    startUtc: null,
    venue: null,
    home: { name: "", abbr: "", logo: null },
    away: { name: "", abbr: "", logo: null },
    readiness: parts.readiness ?? "ready",
    provenance: {
      artifactHash: null, modelVersion: parts.modelVersion ?? null, simulationVersion: null,
      /* None of these three is a trial-based simulation. No run count is claimed for any of them. */
      runCount: null,
      generatedAt: parts.generatedAt ?? null, marketCapturedAt: null, bookmaker: null,
    },
    supportedChapters: parts.chapters.map((c) => c.kind) as ChapterKind[],
    chapters: parts.chapters,
    reportHref: parts.reportHref,
  };
}

/* ── 1 · today's Top 10 ────────────────────────────────────────────────────────────────────────── */

export interface Top10Like {
  date: string;
  overall: Array<{
    game: string; market: string; selection: string; odds: number;
    modelProbability: number | null; sport: string; risk: string; reason: string;
  }>;
  refusedWrongDay?: Array<{ reason: string }>;
  generatedFrom?: string[];
}

export function buildTop10Presentation(board: Top10Like | null | undefined): PresentationResult {
  const reportHref = "/today/";
  const eventId = `board:top10:${board?.date ?? "unknown"}`;
  if (!board || !Array.isArray(board.overall) || board.overall.length === 0) {
    return {
      schema: 1, sport: "board", eventId, unavailable: true,
      reason: "No pick qualified for today's board. A short board is a result; a padded one would not be.",
      reportHref,
    };
  }

  const picks = board.overall;
  const refused = board.refusedWrongDay?.length ?? 0;
  const chapters: PresentationChapter[] = [];

  chapters.push({
    id: "event", kind: "event",
    title: `Today's top ${picks.length}`,
    /* The COUNT is the count. "Top 10" with six rows would be the headline disagreeing with the page. */
    line: picks.length === 10
      ? `Ten model picks for ${board.date}, ranked.`
      : `${picks.length} model pick${picks.length === 1 ? "" : "s"} qualified for ${board.date} — fewer than ten, and the last chapter says why.`,
    stats: [], bars: [], rows: [], holdMs: HOLD.light,
  });

  /* Five to a chapter, so no row is ever squeezed to fit — the charter's instruction is to split
     dense content into more chapters, not to shrink it. */
  for (let i = 0; i < picks.length; i += 5) {
    const slice = picks.slice(i, i + 5);
    chapters.push({
      id: `picks-${i / 5 + 1}`, kind: "players",
      title: picks.length > 5 ? `Ranked ${i + 1}–${i + slice.length}` : "The board",
      line: i === 0
        ? "Ranked by the model's own read against the posted price. Educational and paper-only."
        : "The rest of the board, same ranking.",
      stats: [], bars: [],
      rows: slice.map((p, j) => ({
        label: `${i + j + 1}. ${p.selection}`,
        detail: `${p.game} · ${p.market} · ${american(p.odds)}`,
        value: p.modelProbability != null ? `${pctOf(p.modelProbability)}%` : "—",
      })),
      holdMs: HOLD.dense,
    });
  }

  const limits: { label: string; detail: string }[] = [];
  if (refused) {
    limits.push({
      label: "Not on this date",
      detail: `${refused} candidate${refused === 1 ? "" : "s"} were dropped because the event does not fall on ${board.date}. A short board is explainable, not merely short.`,
    });
  }
  if (picks.length < 10) {
    limits.push({ label: "Fewer than ten", detail: "Only the picks that qualified are shown. The board is never padded to a round number." });
  }
  limits.push({ label: "No claim", detail: "These are model reads beside a posted price, not advice and not a record. Paper-only and educational." });
  chapters.push({
    id: "limits", kind: "limits",
    title: "What this board is not",
    line: "A ranking is an ordering, not a promise about any one of them.",
    stats: [], bars: [], rows: limits, holdMs: HOLD.normal,
  });

  chapters.push({
    id: "closing", kind: "closing",
    title: `Today's top ${picks.length}`,
    line: "Every pick above links to its own game report, where the distribution behind it lives.",
    stats: [], bars: [],
    rows: (board.generatedFrom ?? []).slice(0, 2).map((s) => ({ label: "Source", detail: s })),
    holdMs: HOLD.light,
  });

  return manifestOf({ eventId, title: `Today's top ${picks.length}`, displayDate: board.date, reportHref, chapters });
}

/* ── 2 · a published parlay ───────────────────────────────────────────────────────────────────── */

export interface ParlayCardLike {
  tier: string;
  tierLabel?: string;
  slipId: string;
  combinedAmerican?: number;
  combinedDecimal?: number;
  status?: string;
  /* readonly, because the ladder's own cards are — this adapter reads a published slip and must not
     be typed as though it could rewrite one. */
  legs?: ReadonlyArray<{
    readonly player?: string | null; readonly team?: string | null; readonly opponent?: string | null;
    readonly marketLabel?: string | null; readonly side?: string | null; readonly line?: number | null;
    readonly odds?: number | null; readonly result?: string | null;
  }>;
  /* A tier with nothing settled carries nulls, not absences — and a null hit rate must reach the
     "no card has settled yet" branch rather than being coerced to a zero on the way in. */
  tierRecord?: { wins?: number | null; losses?: number | null; hitRate?: number | null; roi?: number | null } | null;
}

export function buildParlayPresentation(card: ParlayCardLike | null | undefined, opts?: { date?: string }): PresentationResult {
  const reportHref = "/parlays/";
  const eventId = `board:parlay:${card?.slipId ?? "unknown"}`;
  if (!card?.legs?.length) {
    return {
      schema: 1, sport: "board", eventId, unavailable: true,
      reason: "No published card for this tier. A card is only shown when one was actually published — none is created here.",
      reportHref,
    };
  }

  const legs = card.legs;
  const rec = card.tierRecord ?? {};
  const decided = (rec.wins ?? 0) + (rec.losses ?? 0);
  const hitRate = typeof rec.hitRate === "number" && Number.isFinite(rec.hitRate) ? rec.hitRate : null;
  const roi = typeof rec.roi === "number" && Number.isFinite(rec.roi) ? rec.roi : null;
  const chapters: PresentationChapter[] = [];

  chapters.push({
    id: "event", kind: "event",
    title: card.tierLabel ?? `${card.tier} risk`,
    line: `${legs.length} leg${legs.length === 1 ? "" : "s"}${card.combinedAmerican != null ? ` at a combined ${american(card.combinedAmerican)}` : ""}. Frozen when it was published — this frame shows it, it does not build it.`,
    stats: [], bars: [], rows: [], holdMs: HOLD.normal,
  });

  chapters.push({
    id: "legs", kind: "players",
    title: "The legs, as published",
    line: legs.some((l) => l.result) ? "Each leg with the price it was published at, and how it settled." : "Each leg with the price it was published at. None has settled yet.",
    stats: [], bars: [],
    rows: legs.slice(0, 5).map((l) => ({
      /* Every field is optional AND nullable in the published shape — a leg with no team is a
         real state, and "null v null" on a recorded card would be worse than a dash. */
      label: l.player || "—",
      detail: `${l.team || "?"} v ${l.opponent || "?"} · ${l.marketLabel || ""} ${l.side || ""} ${l.line ?? ""}`.replace(/\s+/g, " ").trim(),
      value: l.odds != null ? american(l.odds) : "—",
    })),
    holdMs: HOLD.dense,
  });

  /* THE RECORD SITS BESIDE THE PRICE. A combined +186 without the tier's 18% hit rate is the half
     of the story that sells. */
  const limits: { label: string; detail: string }[] = [];
  limits.push({
    label: "State",
    detail: card.status === "pending"
      ? "This card is pending — no leg has been graded, and nothing here is a result."
      : `This card is ${card.status ?? "of unknown state"}.`,
  });
  if (decided > 0) {
    limits.push({
      label: "This tier's record",
      detail: `${rec.wins}-${rec.losses} across ${decided} settled cards${hitRate != null ? `, hit rate ${pctOf(hitRate)}%` : ""}${roi != null ? ` and ${(roi * 100).toFixed(1)}% paper return` : ""}. That is the context this price sits in.`,
    });
  } else {
    limits.push({ label: "This tier's record", detail: "No card in this tier has settled yet, so there is no hit rate to quote — which is not the same as a zero." });
  }
  if (legs.length > 5) {
    limits.push({ label: "Legs shown", detail: `${legs.length} legs in total; the first five are listed. The full slip is on the parlay page.` });
  }
  limits.push({ label: "Correlation", detail: "Legs in one card are not independent events. A combined price is not a validated joint probability." });
  limits.push({ label: "No stake", detail: "Paper-only and educational. Nothing here is placed, and this frame publishes nothing." });
  chapters.push({
    id: "limits", kind: "limits",
    title: "What this card is not",
    line: "A published slip, shown as it was frozen — with the things a price does not tell you.",
    stats: [], bars: [], rows: limits.slice(0, 5), holdMs: HOLD.dense,
  });

  chapters.push({
    id: "closing", kind: "closing",
    title: card.tierLabel ?? `${card.tier} risk`,
    line: "The slip, its legs and its settlement all live on the parlay page — this frame only reads them.",
    stats: [], bars: [], rows: [{ label: "Slip", detail: card.slipId }],
    holdMs: HOLD.light,
  });

  return manifestOf({
    eventId, title: card.tierLabel ?? `${card.tier} risk card`,
    displayDate: opts?.date ?? "", reportHref, chapters,
    readiness: card.status === "pending" ? "ready" : "ready",
  });
}

/* ── 3 · a results recap ──────────────────────────────────────────────────────────────────────── */

export interface RecapRowLike {
  recordType: string; sport: string | null; tier: string | null;
  wins: number; losses: number; pushes?: number; voids?: number; pending?: number;
}

export function buildResultsRecapPresentation(
  rows: RecapRowLike[] | null | undefined,
  filters: { period: string; population: string; href?: string },
): PresentationResult {
  const reportHref = filters.href ?? "/results/";
  const eventId = `board:recap:${filters.population}:${filters.period}`;
  const list = (rows ?? []).filter((r) => r);

  /*
   * A TOTAL AND ITS OWN PARTS MAY NOT BE POOLED.
   *
   * The read model emits, for each stream, one whole-stream row (`tier: null`) AND one row per risk
   * tier. Summing everything handed in therefore counts every card twice — the first live recap read
   * "14-70 across 84 decided" beside a page showing "7-35 · 42 decisive", exactly double, and the
   * doubling was invisible because both numbers looked plausible.
   *
   * Rather than silently picking a level, this refuses. A caller that wants the whole stream passes
   * the `tier: null` rows; a caller that wants tiers passes those. Choosing for them here would be
   * the same class of guess that produced the wrong number in the first place.
   */
  const byGranularity = new Map();
  for (const r of list) {
    const key = `${r.recordType}::${r.sport ?? "-"}`;
    const seen = byGranularity.get(key) ?? { total: false, tiers: false };
    if (r.tier == null) seen.total = true; else seen.tiers = true;
    byGranularity.set(key, seen);
  }
  const doubled = [...byGranularity.entries()].filter(([, v]) => v.total && v.tiers).map(([k]) => k);
  if (doubled.length) {
    return {
      schema: 1, sport: "board", eventId, unavailable: true,
      reason: `This recap was handed both whole-stream totals and their own per-tier rows for ${doubled.join(", ")}, which would count every settled card twice. Pass one level, not both.`,
      reportHref,
    };
  }

  if (!list.length) {
    return {
      schema: 1, sport: "board", eventId, unavailable: true,
      reason: `Nothing settled in this population over ${filters.period}. That is an empty period, which is not the same as a losing one.`,
      reportHref,
    };
  }

  /* POOLED FROM SUMMED COUNTS. Averaging per-row rates would be a different number and a wrong one. */
  const wins = list.reduce((a, r) => a + (r.wins ?? 0), 0);
  const losses = list.reduce((a, r) => a + (r.losses ?? 0), 0);
  const pushes = list.reduce((a, r) => a + (r.pushes ?? 0), 0);
  const voids = list.reduce((a, r) => a + (r.voids ?? 0), 0);
  const pending = list.reduce((a, r) => a + (r.pending ?? 0), 0);
  const decisive = wins + losses;

  const chapters: PresentationChapter[] = [];
  chapters.push({
    id: "event", kind: "event",
    title: `${filters.population} · ${filters.period}`,
    line: `The settled record for ${filters.population} over ${filters.period}. One population, not a blend of several.`,
    stats: [], bars: [], rows: [], holdMs: HOLD.normal,
  });

  chapters.push({
    id: "outcome", kind: "outcome",
    title: "The record",
    /* ZERO DECISIVE IS UNAVAILABLE, NEVER 0%. */
    line: decisive === 0
      ? `Nothing in this population reached a decisive result over ${filters.period}. There is no hit rate to report — that is unavailable, not zero.`
      : `${wins}-${losses} across ${decisive} decided outcomes.`,
    stats: decisive === 0
      ? [{ label: "Decided", value: 0, format: "count" }, { label: "Hit rate", value: null, format: "text", text: "unavailable", note: "no decisive outcomes" }]
      : [
          { label: "Record", value: null, format: "text", text: `${wins}-${losses}` },
          { label: "Hit rate", value: wins / decisive, format: "probability", note: `on ${decisive} decided` },
        ],
    bars: decisive === 0 ? [] : [
      { label: "Won", p: wins / decisive, highlight: true },
      { label: "Lost", p: losses / decisive },
    ],
    rows: [], holdMs: HOLD.normal,
  });

  const limits: { label: string; detail: string }[] = [];
  limits.push({ label: "Denominator", detail: `${decisive} decided outcome${decisive === 1 ? "" : "s"} — every rate above is over this number and no other.` });
  if (pending > 0) limits.push({ label: "Still open", detail: `${pending} outcome${pending === 1 ? "" : "s"} have not settled and are in no denominator here.` });
  if (pushes + voids > 0) limits.push({ label: "Pushes and voids", detail: `${pushes} push(es) and ${voids} void(s) are counted as neither a win nor a loss.` });
  limits.push({ label: "One population", detail: `Only ${filters.population} is counted. Different record types are never pooled — a winning leg is not a winning card.` });
  limits.push({ label: "Sample", detail: "A short period is a short sample. Nothing here is evidence that the model has improved." });
  chapters.push({
    id: "limits", kind: "limits",
    title: "What this recap counts",
    line: "A recap is the whole period, not the parts of it that went well.",
    stats: [], bars: [], rows: limits.slice(0, 5), holdMs: HOLD.dense,
  });

  chapters.push({
    id: "closing", kind: "closing",
    title: `${filters.population} · ${filters.period}`,
    line: "Every row behind this record is on the results page, under the same filters.",
    stats: [], bars: [], rows: [], holdMs: HOLD.light,
  });

  return manifestOf({
    eventId, title: `${filters.population} · ${filters.period}`,
    displayDate: filters.period, reportHref, chapters,
  });
}
