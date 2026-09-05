/**
 * NFL PRESENTATION ADAPTER — Program 234 · Release C.
 *
 * Projects one `NflEligibleEvent` into chapters. The whole adapter turns on a distinction this
 * project built a program around: BASELINE_ONLY is a real, reproducible artifact whose team read is
 * a SHARED PRIOR, not a measured separation between these two teams. On 2026-08-14 ten NFL games
 * rendered inside a 1.7-point win spread while every card claimed to be simulation-ready.
 *
 * A presentation is a persuasive form, which makes it exactly the wrong place to lose that. So the
 * readiness is carried into the manifest, the opening chapter says which kind of read this is in its
 * own sentence, and the limits chapter repeats the event's own reason verbatim. An animation cannot
 * promote a baseline into a simulation.
 *
 * NO PLAYER CHAPTERS. `playerCandidates` counts published rows; passing, rushing, receiving and
 * touchdown chapters would each need a market this event does not carry. A book listing a prop is
 * not the same as this model publishing one, and passing touchdowns are not anytime touchdowns.
 */
import type { NflEligibleEvent } from "@/lib/sports/nfl/simulate-eligibility";
import type { ChapterKind, PresentationChapter, PresentationManifest, PresentationResult } from "./types";

const HOLD = { light: 4200, normal: 5200, dense: 6400 } as const;
const pctOf = (n: number) => Math.round(n * 100);

export function buildNflPresentation(
  e: NflEligibleEvent | null | undefined,
  opts?: {
    indexGeneratedAt?: string | null;
    /** The forecast artifact's own trial count. Carried only when the artifact states one. */
    runCount?: number | null;
    modelVersion?: string | null;
  },
): PresentationResult {
  const reportHref = e?.reportHref ?? "/nfl/";
  const eventId = `nfl:${e?.providerEventId ?? "unknown"}`;
  const refuse = (reason: string): PresentationResult =>
    ({ schema: 1, sport: "nfl", eventId, unavailable: true, reason, reportHref });

  if (!e) return refuse("No NFL event with a published simulation for this date.");
  if (!e.winProbability || !Number.isFinite(e.winProbability.home)) {
    return refuse(e.readinessReason || "This event carries no distribution to present.");
  }

  /*
   * A STARTED OR SETTLED GAME IS PRESENTED, NOT REFUSED — and presented in the past tense. No new
   * forecast may be generated once a game kicks off, which is a different statement from "the
   * forecast we published beforehand may not be shown". The frozen pre-event numbers are exactly
   * what a reader auditing the record needs to see, so they are shown under their TRUE event date
   * with `archived` readiness, and every chapter says which one it is.
   */
  const archived = e.lifecycle === "STARTED" || e.locked;
  const baseline = e.readiness === "BASELINE_ONLY";
  const chapters: PresentationChapter[] = [];

  chapters.push({
    id: "event", kind: "event",
    title: e.matchup,
    line: archived
      ? `${e.away.name} at ${e.home.name}, ${(e.kickoffUtc ?? "").slice(0, 10)}. This game has been played — what follows is the forecast as it was frozen BEFORE kickoff, not a current read.`
      : baseline
        ? `${e.away.name} at ${e.home.name}. This is a BASELINE read: a real, reproducible run whose team numbers come from a shared prior rather than from anything specific to these two teams.`
        : `${e.away.name} at ${e.home.name}${e.venue ? ` at ${e.venue}` : ""}.`,
    stats: [], bars: [], rows: [], holdMs: HOLD.normal,
  });

  const wp = e.winProbability;
  const favourite = wp.home >= wp.away ? e.home.abbr : e.away.abbr;
  chapters.push({
    id: "outcome", kind: "outcome",
    title: archived ? "What was forecast" : baseline ? "The baseline read" : "Who the simulation favours",
    line: archived
      ? `Before kickoff the model had ${favourite} at ${pctOf(Math.max(wp.home, wp.away))}%. The result is on the report; this frame shows only what was said in advance.`
      : baseline
        ? `${favourite} at ${pctOf(Math.max(wp.home, wp.away))}% — and because this is a shared prior, that number says more about the model's default than about this matchup.`
        : `${favourite} at ${pctOf(Math.max(wp.home, wp.away))}%.`,
    stats: [
      { label: `${e.away.abbr} win`, value: wp.away, format: "probability" },
      { label: `${e.home.abbr} win`, value: wp.home, format: "probability" },
      ...(e.projectedScore && Number.isFinite(e.projectedScore.home)
        ? [{
            label: "Projected score", value: null, format: "text" as const,
            text: `${e.away.abbr} ${e.projectedScore.away} — ${e.home.abbr} ${e.projectedScore.home}`,
            note: baseline ? "from the shared prior" : undefined,
          }]
        : []),
    ],
    bars: [
      { label: e.away.abbr, p: wp.away, highlight: favourite === e.away.abbr },
      { label: e.home.abbr, p: wp.home, highlight: favourite === e.home.abbr },
    ],
    rows: [], holdMs: HOLD.normal,
  });

  if (e.total && Number.isFinite(e.total.median)) {
    chapters.push({
      id: "distribution", kind: "distribution",
      title: "How many points",
      line: `The median simulated total is ${e.total.median}; four games in five land between ${e.total.p10} and ${e.total.p90}.`,
      stats: [
        { label: "Median total", value: e.total.median, format: "count" },
        { label: "10th–90th", value: null, format: "text", text: `${e.total.p10}–${e.total.p90} points` },
      ],
      /* NO HISTOGRAM. The index publishes three quantiles, not bins — drawing a curve through three
         points would be an invented distribution, which is a worse lie than an absent chart. */
      bars: [], rows: [], holdMs: HOLD.normal,
    });
  }

  const limits: { label: string; detail: string }[] = [];
  if (archived) {
    limits.push({
      label: "Archived",
      detail: `This is the frozen pre-event forecast for a game played on ${(e.kickoffUtc ?? "").slice(0, 10)}. It is shown after the fact and was not regenerated; no forecast may be made for a game that has started.`,
    });
  }
  limits.push({ label: e.readiness === "BASELINE_ONLY" ? "Baseline only" : "Readiness", detail: e.readinessReason });
  if (!e.hasMarket) {
    limits.push({ label: "No market", detail: "No sportsbook price is attached to this event, so there is nothing to compare the model against." });
  }
  limits.push({
    label: "No player markets",
    detail: e.playerCandidates > 0
      ? `${e.playerCandidates} player rows exist for this event, and none is presented here: a passing, rushing or receiving chapter needs a published model for that market, which this event does not carry.`
      : "No player market is published for this event. A book listing a prop is not this model publishing one.",
  });
  limits.push({ label: "Validation", detail: "Educational and paper-only. Preseason and regular-season evidence are kept separate, and no accuracy claim is made from either." });
  chapters.push({
    id: "limits", kind: "limits",
    title: "What this does not know",
    line: baseline
      ? "This read is honest about being a default. Here is the rest of what it is missing."
      : "Every simulation is only as good as what it was given.",
    stats: [], bars: [], rows: limits.slice(0, 5), holdMs: HOLD.dense,
  });

  chapters.push({
    id: "closing", kind: "closing",
    title: e.matchup,
    line: archived
      ? "A frozen forecast is the only honest thing to show for a game already played. The result, and how this read fared against it, live on the report."
      : baseline
        ? "A baseline read stays a baseline read. It is listed and labelled, never counted or featured as a game-specific simulation."
        : "The full report carries the distribution, the market state and the definitions behind this.",
    stats: [], bars: [],
    rows: opts?.indexGeneratedAt ? [{ label: "Index", detail: opts.indexGeneratedAt }] : [],
    holdMs: HOLD.normal,
  });

  const manifest: PresentationManifest = {
    schema: 1, sport: "nfl", eventId,
    slug: e.providerEventId,
    title: e.matchup,
    displayDate: (e.kickoffUtc ?? "").slice(0, 10),
    startUtc: e.kickoffUtc ?? null,
    venue: e.venue ?? null,
    home: { name: e.home.name, abbr: e.home.abbr, logo: null },
    away: { name: e.away.name, abbr: e.away.abbr, logo: null },
    /* BASELINE_ONLY is degraded by construction — the frame prints "degraded run" in its header. */
    readiness: archived ? "archived" : baseline ? "degraded" : "ready",
    provenance: {
      artifactHash: null, modelVersion: opts?.modelVersion ?? e.state ?? null, simulationVersion: null,
      /* NFL's forecast artifact DOES state a trial count, where the lobby index does not. It is
         carried when the caller has it and left null when nobody stated one — never counted off an
         array length. */
      runCount: typeof opts?.runCount === "number" && opts.runCount > 0 ? opts.runCount : null,
      generatedAt: opts?.indexGeneratedAt ?? null, marketCapturedAt: null, bookmaker: null,
    },
    supportedChapters: chapters.map((c) => c.kind) as ChapterKind[],
    chapters,
    reportHref,
  };
  return manifest;
}
