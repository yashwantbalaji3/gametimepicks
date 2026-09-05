/**
 * MLB PRESENTATION ADAPTER — Program 234 · Release B.
 *
 * Projects one `PublicGameDetail` into the chapter list the bounded player narrates. Every figure
 * here is CARRIED from `fullGameSim` / `prediction`; nothing is recomputed, re-de-vigged or rounded
 * into a new quantity. Where a report has no value, the chapter that would have shown it is left
 * out of `supportedChapters` — an absent chapter is honest, an empty one is not.
 *
 * THE RUN-COUNT RULE. "10,000 simulated games" is claimable only when the artifact says so
 * (`allowsRunCountClaim`). The player never counts an array and calls the length a run count, and
 * it never describes the playback itself as running simulations — the trials happened at build
 * time and the sequence is a reveal of their result.
 *
 * THE REVISION RULE. `fullGameSim` and `prediction` are separate artifacts joined by gamePk. Both
 * stamp `artifactHash`. If they disagree this refuses to build rather than narrating half of each.
 */
import type { PublicGameDetail } from "@/lib/game-detail";
import type {
  ChapterKind,
  PresentationChapter,
  PresentationManifest,
  PresentationResult,
  PresentationStat,
} from "./types";

/** Auto-play cadence. Dense chapters hold longer; nothing holds long enough to feel like waiting. */
const HOLD = { light: 4200, normal: 5200, dense: 6400 } as const;

const abbrOf = (s: string | null | undefined, fallback: string) => (s && s.trim()) || fallback;

/**
 * Absolute ET stamp, baked at build time. Deliberately NOT "4 minutes ago": this is a static export,
 * so a relative label computed while building freezes into the page and is wrong for every reader
 * after the first minute. `hourCycle: "h23"` because the default has handed this codebase an hour
 * "24" three separate times.
 */
function etStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(ms)) + " ET";
}

/**
 * Build the MLB presentation. Returns a typed refusal rather than null so every caller has a reason
 * to print.
 */
export function buildMlbPresentation(detail: PublicGameDetail): PresentationResult {
  const reportHref = `/games/mlb/${detail.slug}`;
  const eventId = `mlb:${detail.matchId ?? detail.slug}`;
  const refuse = (reason: string): PresentationResult =>
    ({ schema: 1, sport: "mlb", eventId, unavailable: true, reason, reportHref });

  const fg = detail.fullGameSim;
  const pred = detail.prediction;
  const meta = detail.fullGameSimMeta;
  const sim = detail.gameLabSimulation;

  if (detail.reconciled && detail.reconciled.ok === false) {
    return refuse(`The artifacts joined to this game disagree about which game it is (${detail.reconciled.reason}), so nothing may be presented for it.`);
  }
  if (!fg) return refuse("The 10,000-run full-game simulation has not been generated for this game yet. Market reads are available on the full report.");
  if (fg.status !== "ready" && fg.status !== "degraded") {
    return refuse(`The full-game simulation for this game is ${String(fg.status)} — the full report states why.`);
  }
  if (!pred) return refuse("This game has a simulation but no decision record, so there is no narrative to present.");
  if (fg.artifactHash && pred.artifactHash && fg.artifactHash !== pred.artifactHash) {
    return refuse("The simulation and the decision record are from different artifact revisions. Refusing to narrate two revisions as one game.");
  }

  const homeAbbr = abbrOf(pred.homeTeam, detail.homeTeam ?? "HOME");
  const awayAbbr = abbrOf(pred.awayTeam, detail.awayTeam ?? "AWAY");
  const homeName = fg.homeTeamName ?? detail.homeTeam ?? homeAbbr;
  const awayName = fg.awayTeamName ?? detail.awayTeam ?? awayAbbr;

  /* The run count is a CLAIM, and it is the artifact's to make. */
  const runCount = sim?.allowsRunCountClaim && typeof fg.runCount === "number" && fg.runCount > 0 ? fg.runCount : null;
  const runsPhrase = runCount ? `${runCount.toLocaleString()} simulated games` : "the simulation";

  const chapters: PresentationChapter[] = [];

  /* ── 1 · the event ─────────────────────────────────────────────────────────────────────────── */
  chapters.push({
    id: "event",
    kind: "event",
    title: `${awayAbbr} at ${homeAbbr}`,
    line: `${awayName} visit ${homeName}${fg.venue ? ` at ${fg.venue}` : ""}.`,
    stats: [],
    bars: [],
    rows: [],
    holdMs: HOLD.light,
  });

  /* ── 2 · who wins ──────────────────────────────────────────────────────────────────────────── */
  const wp = fg.winProbability;
  if (wp && Number.isFinite(wp.home) && Number.isFinite(wp.away)) {
    const winner = pred.predictedWinner;
    const score = pred.projectedScore;
    const stats: PresentationStat[] = [
      { label: `${awayAbbr} win`, value: wp.away, format: "probability" },
      { label: `${homeAbbr} win`, value: wp.home, format: "probability" },
    ];
    if (score && Number.isFinite(score.away) && Number.isFinite(score.home)) {
      stats.push({
        label: "Median final",
        value: null,
        format: "text",
        text: `${awayAbbr} ${score.away} — ${homeAbbr} ${score.home}`,
        note: score.label ?? undefined,
      });
    }
    chapters.push({
      id: "outcome",
      kind: "outcome",
      title: "Who the simulation favours",
      line: winner?.team
        ? `Across ${runsPhrase}, ${winner.team} came out ahead more often than not.`
        : `Across ${runsPhrase}, neither side separated.`,
      stats,
      bars: [
        { label: awayAbbr, p: wp.away },
        { label: homeAbbr, p: wp.home, highlight: winner?.side === "home" },
      ],
      rows: [],
      holdMs: HOLD.normal,
    });
  }

  /* ── 3 · how many runs ─────────────────────────────────────────────────────────────────────── */
  const tr = fg.totalRuns;
  if (tr && Number.isFinite(tr.median)) {
    const stats: PresentationStat[] = [
      { label: "Median total", value: tr.median, format: "count" },
      { label: "Mean total", value: tr.mean, format: "decimal2" },
      { label: "10th–90th", value: null, format: "text", text: `${tr.p10}–${tr.p90} runs` },
    ];
    const t = pred.total;
    if (t && Number.isFinite(t.line)) {
      stats.push({
        label: `Book total ${t.line}`,
        value: null,
        format: "text",
        text: t.pick ?? "—",
        note: t.pick === "OVER" && Number.isFinite(t.overProbability)
          ? `${Math.round((t.overProbability as number) * 100)}% of games went over`
          : t.pick === "UNDER" && Number.isFinite(t.underProbability)
            ? `${Math.round((t.underProbability as number) * 100)}% of games went under`
            : undefined,
      });
    }
    /*
     * The artifact's bins are OBJECTS — `{ value, label, count, probability }` — carrying their own
     * labels, including the closed ends ("21+", "≤-13"). Read as a number[] they silently produce a
     * row of zeroes and the histogram disappears, which is exactly what happened first: the chapter
     * rendered its four statistics above an empty space, and the test that was supposed to catch it
     * looped over the empty array and passed.
     *
     * Every bin is drawn. Nothing is filtered or truncated, so the shape on screen is the shape in
     * the artifact; only the axis LABELS thin out, and the median always keeps its own.
     */
    const bins = Array.isArray(tr.distribution) ? tr.distribution : [];
    const bars = bins
      .filter((b) => b && typeof b.probability === "number" && Number.isFinite(b.probability))
      .map((b) => ({ label: String(b.label ?? b.value), p: b.probability, highlight: b.value === tr.median }));
    chapters.push({
      id: "distribution",
      kind: "distribution",
      title: "How many runs",
      line: `The middle of the distribution sits at ${tr.median} runs; four games in five landed between ${tr.p10} and ${tr.p90}.`,
      stats,
      bars,
      rows: [],
      holdMs: HOLD.dense,
    });
  }

  /* ── 4 · the margin ────────────────────────────────────────────────────────────────────────── */
  const rl = pred.runLine;
  if (rl && rl.pick && Number.isFinite(rl.coverProbability)) {
    chapters.push({
      id: "margin",
      kind: "margin",
      title: "The margin",
      line: `${rl.pick} covered in ${Math.round((rl.coverProbability as number) * 100)}% of simulated games.`,
      stats: [
        { label: rl.pick, value: rl.coverProbability, format: "probability" },
        ...(Number.isFinite(rl.pushProbability) && (rl.pushProbability as number) > 0
          ? [{ label: "Push", value: rl.pushProbability, format: "probability" } as PresentationStat]
          : []),
      ],
      bars: [
        { label: rl.pick, p: rl.coverProbability as number, highlight: true },
        { label: "Other side", p: Number.isFinite(rl.opposingCoverProbability) ? (rl.opposingCoverProbability as number) : 1 - (rl.coverProbability as number) },
      ],
      rows: [],
      holdMs: HOLD.normal,
    });
  }

  /* ── 5 · most likely finals ────────────────────────────────────────────────────────────────── */
  const finals = Array.isArray(fg.finalScores) ? fg.finalScores.filter((s) => Number.isFinite(s?.probability)) : [];
  if (finals.length) {
    const top = finals.slice(0, 6);
    chapters.push({
      id: "scores",
      kind: "scores",
      title: "Most likely finals",
      line: `No single scoreline is likely — the most common one appeared in ${Math.round(top[0].probability * 100)}% of games.`,
      stats: Number.isFinite(fg.extraInningsProbability)
        ? [{ label: "Extra innings", value: fg.extraInningsProbability as number, format: "probability" }]
        : [],
      bars: top.map((s, i) => ({ label: `${awayAbbr} ${s.away}–${s.home} ${homeAbbr}`, p: s.probability, highlight: i === 0 })),
      rows: [],
      holdMs: HOLD.dense,
    });
  }

  /* ── 6 · the players ───────────────────────────────────────────────────────────────────────── */
  const players = Array.isArray(pred.topPlayerPredictions) ? pred.topPlayerPredictions : [];
  if (players.length) {
    const top = players.slice(0, 5);
    chapters.push({
      id: "players",
      kind: "players",
      title: "Player markets",
      line: "The player markets the simulation separated furthest from the posted line.",
      stats: [],
      bars: [],
      rows: top.map((p) => ({
        label: p.player,
        detail: `${p.team} · ${p.marketLabel} ${p.pick} ${p.line}`,
        value: Number.isFinite(p.simulationProbability) ? `${Math.round(p.simulationProbability * 100)}%` : "—",
      })),
      holdMs: HOLD.dense,
    });
  }

  /* ── 7 · what this does not know ───────────────────────────────────────────────────────────── */
  const limitRows: { label: string; detail: string }[] = [];
  for (const note of fg.completeness?.notes ?? []) limitRows.push({ label: "Input", detail: String(note) });
  const missing = fg.completeness?.missingFamilies ?? [];
  if (missing.length) {
    limitRows.push({ label: "Not modelled", detail: missing.map((m) => String(m).replaceAll("_", " ")).join(", ") });
  }
  if (fg.status === "degraded") {
    limitRows.push({ label: "Status", detail: "The report calls this run degraded — some inputs it prefers were unavailable." });
  }
  const bk = pred.market?.bookmaker;
  if (bk && pred.market?.capturedAt) {
    const at = etStamp(pred.market.capturedAt);
    limitRows.push({ label: "Book line", detail: at ? `${bk}, captured ${at}` : String(bk) });
  }
  limitRows.push({ label: "Validation", detail: "Educational and paper-only. This model is not validated out of sample, and no accuracy claim is made from it." });
  chapters.push({
    id: "limits",
    kind: "limits",
    title: "What this does not know",
    line: "Every simulation is only as good as what it was given. This one was given the following, and not the rest.",
    stats: [],
    bars: [],
    rows: limitRows.slice(0, 5).map((r) => ({ ...r })),
    holdMs: HOLD.dense,
  });

  /* ── 8 · the close ─────────────────────────────────────────────────────────────────────────── */
  /*
   * The close is COMPOSED from carried facts rather than reusing the artifact's own headline. That
   * headline describes the prop engine ("42 player-prop markets simulated over 10000 iterations
   * each") and would arrive directly after chapters about the full game — true, and about a
   * different thing. It is still shown, labelled as what it is.
   */
  const generatedLabel = etStamp(meta?.generatedAt);
  chapters.push({
    id: "closing",
    kind: "closing",
    title: `${awayAbbr} at ${homeAbbr}`,
    line: `${runCount ? `${runCount.toLocaleString()} simulated games` : "This simulation"}, one artifact revision. The full report carries every market, distribution and definition behind it.`,
    stats: [],
    bars: [],
    rows: [
      ...(sim?.simulationSummary?.headline
        ? [{ label: "Player-prop engine", detail: String(sim.simulationSummary.headline) }]
        : []),
      ...(generatedLabel ? [{ label: "Generated", detail: generatedLabel }] : []),
      ...(meta?.modelVersion ? [{ label: "Model", detail: String(meta.modelVersion) }] : []),
    ],
    holdMs: HOLD.normal,
  });

  const supportedChapters = chapters.map((c) => c.kind) as ChapterKind[];

  const manifest: PresentationManifest = {
    schema: 1,
    sport: "mlb",
    eventId,
    slug: detail.slug,
    title: detail.title,
    displayDate: detail.date,
    startUtc: fg.firstPitch ?? null,
    venue: fg.venue ?? null,
    home: { name: homeName, abbr: homeAbbr, logo: detail.homeLogo ?? null },
    away: { name: awayName, abbr: awayAbbr, logo: detail.awayLogo ?? null },
    readiness: fg.status === "degraded" ? "degraded" : "ready",
    provenance: {
      artifactHash: fg.artifactHash ?? null,
      modelVersion: meta?.modelVersion ?? null,
      simulationVersion: meta?.simulationVersion ?? null,
      runCount,
      generatedAt: meta?.generatedAt ?? null,
      marketCapturedAt: pred.market?.capturedAt ?? null,
      bookmaker: bk ?? null,
    },
    supportedChapters,
    chapters,
    reportHref,
  };
  return manifest;
}
