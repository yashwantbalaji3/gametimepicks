/**
 * EPL PRESENTATION ADAPTER — Program 234 · Release C.
 *
 * Projects one `EplForecastRow` into chapters. The EPL model publishes a DISTRIBUTION and nothing
 * else — no pick, no rating, no comparison against a price — and that is deliberate upstream policy,
 * so this adapter must not invent the missing half. There is no "lean" chapter and no market
 * chapter, because there is no public market side to put in one.
 *
 * WHAT IS NOT HERE, AND WHY. No scorer chapter, no shot chapter, no lineup: the repository has no
 * EPL player model that may be published, and a chapter that reused a previous match's XI would be
 * the exact defect this project has recorded before. Absence is a chapter of its own — the limits
 * chapter says so in words.
 *
 * A NOTE ON THE BINS. EPL's `totals.distribution` is a raw `number[]` indexed by goals, where MLB's
 * is an array of objects. They are read differently on purpose; assuming one shape for both is how
 * the MLB histogram first came out empty.
 */
import type { EplForecastRow } from "@/lib/sports/epl/forecast-view";
import type { ChapterKind, PresentationChapter, PresentationManifest, PresentationResult } from "./types";

const HOLD = { light: 4200, normal: 5200, dense: 6400 } as const;
const pctOf = (n: number) => Math.round(n * 100);

export function buildEplPresentation(
  row: EplForecastRow,
  opts?: {
    displayDate?: string;
    /**
     * The producer's own track-record sentence, carried verbatim. It is a PARAMETER because the
     * first version of this adapter wrote "Nineteen graded matches" into the limits chapter as a
     * literal — and four matches settled the same afternoon, which is precisely the drift the
     * control plane refuses to build through elsewhere in this repository. A count that moves is
     * not a sentence to type.
     */
    trackRecord?: string | null;
  },
): PresentationResult {
  const reportHref = row.slug ? `/epl/match/${row.slug}/` : "/epl/";
  const eventId = row.eventId ?? `epl:${row.slug ?? row.matchup}`;
  const refuse = (reason: string): PresentationResult =>
    ({ schema: 1, sport: "epl", eventId, unavailable: true, reason, reportHref });

  /* Publication is the presence of the numbers, not the state name — the same rule the offered
     window uses. A withheld fixture has a reason of its own; it is carried, not paraphrased. */
  if (!row.probs || !row.totals) {
    return refuse(
      row.unavailableReason ??
        "This fixture's probabilities are withheld — the forecast exists but is not published for it.",
    );
  }

  const home = row.homeClub ?? "Home";
  const away = row.awayClub ?? "Away";
  const cold = row.coldStart?.home || row.coldStart?.away;
  const chapters: PresentationChapter[] = [];

  chapters.push({
    id: "event", kind: "event",
    title: `${home} v ${away}`,
    line: `${home} host ${away}${row.matchweek ? ` in matchweek ${row.matchweek}` : ""}.`,
    stats: [], bars: [], rows: [], holdMs: HOLD.light,
  });

  /* ── the three-way result. Three outcomes, always three — a draw is not a rounding error. ── */
  const p = row.probs;
  const top = Math.max(p.home, p.draw, p.away);
  const leader = p.home === top ? home : p.away === top ? away : "draw";
  /* "A Manchester United win", "A draw" — the outcome, phrased as an outcome. A bare club name
     reads as though the club itself were the result. */
  const leaderPhrase = leader === "draw" ? "A draw" : `A ${leader} win`;
  chapters.push({
    id: "outcome", kind: "outcome",
    title: "The three-way result",
    line: `${leaderPhrase} is the most likely single outcome at ${pctOf(top)}% — which leaves the other ${100 - pctOf(top)}% split between the two results it is not.`,
    stats: [
      { label: `${home} win`, value: p.home, format: "probability" },
      { label: "Draw", value: p.draw, format: "probability" },
      { label: `${away} win`, value: p.away, format: "probability" },
    ],
    bars: [
      { label: home, p: p.home, highlight: leader === home },
      { label: "Draw", p: p.draw, highlight: leader === "draw" },
      { label: away, p: p.away, highlight: leader === away },
    ],
    rows: row.doubleChance
      ? [
          { label: "Double chance", detail: `${home} or draw`, value: `${pctOf(row.doubleChance.homeOrDraw)}%` },
          { label: "Double chance", detail: `draw or ${away}`, value: `${pctOf(row.doubleChance.drawOrAway)}%` },
        ]
      : [],
    holdMs: HOLD.normal,
  });

  /* ── goals. EPL bins are plain numbers indexed by goal count. ── */
  const t = row.totals;
  const bins = Array.isArray(t.distribution) ? t.distribution : [];
  if (bins.length) {
    chapters.push({
      id: "distribution", kind: "distribution",
      title: "How many goals",
      line: `The median match here finishes with ${t.quantiles.p50} goals; the model puts ${pctOf(t.over25)}% above two and a half.`,
      stats: [
        { label: "Expected goals", value: t.expected, format: "decimal2" },
        { label: "Median", value: t.quantiles.p50, format: "count" },
        { label: "10th–90th", value: null, format: "text", text: `${t.quantiles.p10}–${t.quantiles.p90} goals` },
        { label: "Over 2.5", value: t.over25, format: "probability" },
      ],
      bars: bins.map((prob, goals) => ({
        label: String(goals),
        p: typeof prob === "number" && Number.isFinite(prob) ? prob : 0,
        highlight: goals === t.quantiles.p50,
      })),
      rows: [],
      /* Goals, and no run count: this model sums an exact score matrix rather than drawing trials. */
      axisCaption: "Total goals · share of the distribution",
      holdMs: HOLD.dense,
    });
  }

  /* ── scorelines, with the mass they DO NOT cover stated. ── */
  const sl = row.topScorelines ?? [];
  if (sl.length) {
    const shown = sl.slice(0, 8);
    const mass = row.topScorelinesMass;
    chapters.push({
      id: "scores", kind: "scores",
      title: "Most likely scorelines",
      line: mass != null
        ? `These ${shown.length} scorelines account for ${pctOf(mass)}% of the distribution. The rest of it is every other result.`
        : `The most likely single scoreline is ${shown[0].score}, at ${pctOf(shown[0].p)}%.`,
      stats: [], bars: shown.map((s, i) => ({ label: s.score, p: s.p, highlight: i === 0 })),
      rows: [], holdMs: HOLD.dense,
    });
  }

  /* ── both teams to score and clean sheets — supported team outcomes, kept as outcomes. ── */
  if (row.btts || row.cleanSheet) {
    chapters.push({
      id: "margin", kind: "margin",
      title: "Goals at both ends",
      line: row.btts
        /* "of simulated matches" would be a trial-count claim. This model sums a score matrix; the
           mass is a share of the distribution, not a frequency out of N draws. */
        ? `The model puts both teams scoring at ${pctOf(row.btts.yes)}%.`
        : "Clean-sheet probabilities from the same distribution.",
      stats: [
        ...(row.btts ? [{ label: "Both score", value: row.btts.yes, format: "probability" as const }] : []),
        ...(row.margin && Number.isFinite(row.margin.expected)
          ? [{ label: "Expected margin", value: row.margin.expected, format: "decimal2" as const, note: "positive favours the home side" }]
          : []),
      ],
      bars: row.cleanSheet
        ? [
            { label: `${home} clean sheet`, p: row.cleanSheet.home },
            { label: `${away} clean sheet`, p: row.cleanSheet.away },
          ]
        : [],
      rows: [], holdMs: HOLD.normal,
    });
  }

  /* ── what this does not know ── */
  const limits: { label: string; detail: string }[] = [];
  if (cold) {
    limits.push({
      label: "Cold start",
      detail: `${[row.coldStart?.home ? home : null, row.coldStart?.away ? away : null].filter(Boolean).join(" and ")} has too little season history for the model, so a league prior stands in.`,
    });
  }
  limits.push({ label: "No player markets", detail: "There is no publishable Premier League player model here — no scorer, shot or lineup read is offered, because none exists." });
  limits.push({ label: "No price", detail: "This is a distribution, not a comparison against a bookmaker. No market side is published for it." });
  limits.push({
    label: "Validation",
    detail: opts?.trackRecord
      ?? "Not validated out of sample. Far too few matches have been graded under this model to support any accuracy claim, and none is made.",
  });
  chapters.push({
    id: "limits", kind: "limits",
    title: "What this does not know",
    line: "The distribution is the product. These are the things it is not.",
    stats: [], bars: [], rows: limits, holdMs: HOLD.dense,
  });

  chapters.push({
    id: "closing", kind: "closing",
    title: `${home} v ${away}`,
    line: "One exact score matrix produced every number in this presentation, so the totals and the result cannot disagree.",
    stats: [], bars: [],
    rows: row.modelId ? [{ label: "Model", detail: row.modelId }] : [],
    holdMs: HOLD.normal,
  });

  const manifest: PresentationManifest = {
    schema: 1, sport: "epl", eventId,
    slug: row.slug ?? eventId,
    title: `${home} v ${away}`,
    displayDate: opts?.displayDate ?? (row.kickoffUtc ?? "").slice(0, 10),
    startUtc: row.kickoffUtc ?? null,
    venue: null,
    home: { name: home, abbr: home, logo: null },
    away: { name: away, abbr: away, logo: null },
    readiness: cold ? "degraded" : "ready",
    provenance: {
      artifactHash: null, modelVersion: row.modelId ?? null, simulationVersion: null,
      /* NO RUN COUNT. The EPL engine solves an exact score matrix; there are no trials to count,
         and printing one would be a fabricated claim rather than a rounded one. */
      runCount: null,
      generatedAt: null, marketCapturedAt: null, bookmaker: null,
    },
    supportedChapters: chapters.map((c) => c.kind) as ChapterKind[],
    chapters,
    reportHref,
  };
  return manifest;
}
