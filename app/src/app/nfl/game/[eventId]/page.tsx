/**
 * /nfl/game/[eventId] — the NFL per-game simulation report (Program 177 · Release A). PUBLIC.
 *
 * The parity row this closes: /mlb has a per-game deep route and /nfl had none, so a reader could
 * see a projected score on the hub but never open the simulation behind it.
 *
 * NFL-NATIVE, NOT A FORK. This does not duplicate /mlb's JSX or thread NFL through the MLB-shaped
 * game-detail loaders. It reads the SAME canonical artifacts every other NFL surface reads
 * (index.json + forecasts/latest.json), so no percentage on this page is recomputed — a surface
 * that computes its own is the defect the canonical index exists to prevent. Shared primitives
 * (SectionHeader, TeamLogo) are reused rather than reinvented.
 *
 * Statically generated per event from the committed forecast artifact. A started game keeps its
 * page and its immutable pre-kickoff numbers; it simply stops being offered as pregame.
 */
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";

import TeamLogo from "@/components/team-logo";
import CompareCta from "@/components/compare/compare-cta";
import TeamFollowRow from "@/components/follow/team-follow-row";
import { matchupHref } from "@/lib/compare/compare-store";
import { hrefsFor } from "@/lib/research-pages/projection-store";
import { nflTeamRefByAbbr } from "@/lib/follow/entity-registry";
import SectionHeader from "@/components/section-header";
import NflPlayerBoard, { type PlayerBoardArtifact } from "@/components/nfl/player-board";
import LivePanel from "@/components/live/live-panel";
import { participationLabel } from "@/components/prediction/prediction-board";

/*
 * ⚠ THIS PRINTED "available role uncertain" AND THE PHRASE APPEARS NOWHERE IN THE SOURCE.
 *
 * Two separate places on this page took the participation enum and lower-cased it with the
 * underscores swapped for spaces. A repo-wide grep for the banned wording returned nothing while
 * the words were on the scorecard, on most rows — an assembled string is invisible to a copy audit.
 * Both now call the SAME exported rule, hoisted here so neither can drift from the other again.
 *
 * `participationLabel` renders genuine availability — questionable, listed out — and renders
 * NOTHING for the model's own internal role states. The state is still carried on the row, still
 * reaches the research surfaces and still conditions the model; it has simply stopped being
 * repeated to a reader who reads it as an injury report.
 */
const availMark = (p: { participation: string }) => {
  const label = participationLabel(p.participation);
  return label && p.participation !== "ACTIVE_PROJECTED" ? ` · ${label}` : "";
};
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { effectiveLifecycle } from "@/lib/sports/nfl/effective-lifecycle.mjs";
import { unionFrozenForecasts } from "@/lib/sports/nfl/public-forecast-union.mjs";
import SimulationStorySection from "@/components/simulate/simulation-story-section";
import SaveForecastButton from "@/components/saved/save-forecast-button";
import { cardFromNflEvent, type NflEvent } from "@/lib/command-center/featured";
import { saveCardOf } from "@/lib/saved/saved-schema.mjs";
import { reportCardContext } from "@/lib/command-center/report-card";
import { archivedEventFrom, archivedEventIds, archivedForecastFor } from "@/lib/sports/nfl/archived-forecast";
import { buildNflPresentation } from "@/lib/simulate/presentation/nfl";
import { nflSimulateEligibility } from "@/lib/sports/nfl/simulate-eligibility";

type Forecast = {
  /** Written by the P178 significance gate: whether event-specific team evidence was applied. */
  teamSignal?: { state: string; note?: string } | null;
  providerEventId: string;
  matchup: string;
  kickoffUtc: string;
  seasonType: number;
  week: number;
  venue: string | null;
  home: { abbr: string; name: string };
  away: { abbr: string; name: string };
  generatedAt: string;
  model: { id: string; version: number; inputHash: string; simulations: number };
  forecastSummary: {
    projectedScore: { home: number; away: number };
    winProbability: { home: number; away: number; tieMass: number; calibration: string };
    margin: { median: number; p10: number; p90: number };
    total: { median: number; p10: number; p90: number };
    scoreRange: { homeP10: number; homeP90: number; awayP10: number; awayP90: number };
  };
  marketComparison: {
    state: string; capturedAt?: string; books?: number;
    marketHomeWinPct?: number | null; marketSpreadHome?: number | null; marketTotal?: number | null;
    modelVsMarketTotal?: number | null; note: string;
  };
  disclaimer: string;
};

const readPublic = (rel: string) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", rel), "utf8")); } catch { return null; }
};
/* P295: a started game's forecast lives in frozen-latest.json (rebuilt from its pre-kickoff receipt by the
   same run), so its report keeps rendering after kickoff instead of 404ing. */
const forecastArtifact = () => unionFrozenForecasts(readPublic("nfl/forecasts/latest.json"), readPublic("nfl/forecasts/frozen-latest.json"));
/* P277: pregame conditions, shown beside the forecast and never inside it — the model ingests no
   weather term, and the line that renders this says so. */
const weatherArtifact = () => readPublic("nfl/weather/latest.json");
const indexArtifact = () => readPublic("nfl/index.json");

const etTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

/* P320: a played game keeps its page. The live union carries this week; every reconciled game whose frozen
   pre-kickoff revision is committed is added, so a saved forecast's link and a shared link never age out. */
const DATA_ROOT = path.join(process.cwd(), "public", "data");
const archivedFor = (eventId: string) => archivedForecastFor(DATA_ROOT, eventId);
export function generateStaticParams() {
  const live = (forecastArtifact()?.forecasts ?? []).map((f: Forecast) => f.providerEventId as string);
  const ids = new Set<string>([...live, ...archivedEventIds(DATA_ROOT)]);
  return [...ids].map((eventId) => ({ eventId }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  const f = (forecastArtifact()?.forecasts ?? []).find((x: Forecast) => x.providerEventId === params.eventId) ?? (archivedFor(params.eventId)?.forecast as unknown as Forecast | undefined);
  if (!f) return withRouteMetadata(`/nfl/game/${params.eventId}/`, { title: "NFL game · GameTime Picks" });
  return withRouteMetadata(`/nfl/game/${params.eventId}/`, {
    title: `${f.matchup} — experimental simulation · GameTime Picks`,
    description: `A ${Number.isInteger(f.model?.simulations) && f.model.simulations > 0 ? `${f.model.simulations.toLocaleString()}-run ` : ""}simulation of ${f.matchup}: projected score, win chance and total range, beside the sportsbook consensus. Experimental model; educational and paper-only.`,
    alternates: { canonical: `/nfl/game/${f.providerEventId}` },
  });
}

interface KeyNumberAccuracy {
  sampleGames: number; seasons: string;
  byNumber: Record<string, number>; share: number;
}
interface ScoreShapeArtifact {
  engine?: { id?: string; what?: string; centreOwner?: string; fittedOn?: string | null };
  keyNumberAccuracy?: KeyNumberAccuracy | null;
  games?: Array<{
    providerEventId: string; away: string; home: string;
    centre: { marginMedian: number; totalMedian: number; simulatedMarginMedian: number; simulatedTotalMedian: number };
    finalScores: Array<{ away: number; home: number; probability: number }>;
    keyNumbers: { numbers: number[]; share: number; byNumber: Array<{ number: number; probability: number }> };
    scoringRates: { awayTouchdowns: number; homeTouchdowns: number; awayFieldGoals: number; homeFieldGoals: number };
    overtimeProbability: number; tieProbability: number;
  }>;
}
type ScoreShapeGame = NonNullable<ScoreShapeArtifact["games"]>[number] & {
  keyNumberAccuracy?: KeyNumberAccuracy | null;
  engine?: ScoreShapeArtifact["engine"];
};

export default function NflGameReport({ params }: { params: { eventId: string } }) {
  const storyNowIso = new Date().toISOString();
  const artifact = forecastArtifact();
  /* P320: a played game whose week has rolled reads its FROZEN pre-kickoff revision, named by the graded record. */
  const archived = (artifact?.forecasts ?? []).some((x: Forecast) => x.providerEventId === params.eventId) ? null : archivedFor(params.eventId);
  const f: Forecast | undefined = (artifact?.forecasts ?? []).find((x: Forecast) => x.providerEventId === params.eventId) ?? (archived?.forecast as unknown as Forecast | undefined);
  if (!f) notFound();
  const playerBoard = ((): PlayerBoardArtifact | null => {
    try {
      return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/player-board", `${params.eventId}.json`), "utf8"));
    } catch { return null; }
  })();

  /* P251-F6: the lumpy half of the forecast — an event-based score simulation solved onto THIS
     forecast's own median margin and total, so the two cannot disagree about the centre. Absent
     when the solve did not converge for this game, in which case the section simply does not
     render (the artifact records the reason). */
  const shape = ((): ScoreShapeGame | null => {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/score-shape/latest.json"), "utf8")) as ScoreShapeArtifact;
      return { ...(doc.games ?? []).find((g) => g.providerEventId === params.eventId), keyNumberAccuracy: doc.keyNumberAccuracy, engine: doc.engine } as ScoreShapeGame;
    } catch { return null; }
  })();
  const hasShape = !!shape?.finalScores?.length;

  const idx = indexArtifact();
  const idxEvent = (idx?.events ?? []).find((e: { providerEventId: string }) => e.providerEventId === params.eventId);
  /* P252: the EFFECTIVE lifecycle. The stamp is written when the event window runs, so a game
     that kicked off after the last run still reported UPCOMING here and the page framed a played
     game as a forecast. The clock may advance the stamp; it may never rewind it. */
  const lifecycle: string = archived ? "SETTLED" : effectiveLifecycle(
    { lifecycle: idxEvent?.lifecycle, kickoffUtc: (idxEvent as { kickoffUtc?: string } | undefined)?.kickoffUtc ?? f.kickoffUtc },
    new Date().toISOString(),
  );
  const wx = ((weatherArtifact()?.rows ?? []) as Array<{ espnEventId?: string; summary?: string }>)
    .find((r) => String(r.espnEventId) === String(f.providerEventId)) ?? null;
  const started = lifecycle !== "UPCOMING";
  const s = f.forecastSummary;
  const mc = f.marketComparison;
  const card = artifact?.modelCard ?? null;
  const pct = (p: number | null | undefined) => (typeof p === "number" ? `${(p * 100).toFixed(1)}%` : "—");

  // the model/market difference is a DIFFERENCE, never an edge — stated in percentage points
  const gapPp = typeof mc.marketHomeWinPct === "number"
    ? Number(((s.winProbability.home - mc.marketHomeWinPct) * 100).toFixed(1))
    : null;

  const others = ((artifact?.forecasts ?? []) as Forecast[])
    .filter((x) => x.providerEventId !== f.providerEventId)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
      <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>{value}</p>
      {sub ? <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--vault-text-mute)" }}>{sub}</p> : null}
    </div>
  );

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <p style={{ margin: 0, fontSize: 11.5 }}>
        <Link href="/nfl" style={{ color: "var(--vault-gold)" }}>← NFL hub</Link>
      </p>

      <header style={{ marginTop: 12 }}>
        <p style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
          {f.seasonType === 1 ? "Preseason" : "Regular season"} · week {f.week} · {etTime(f.kickoffUtc)}
          {started ? " · started" : ""}
        </p>
        <h1 style={{ margin: "8px 0 0", fontSize: 26, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <TeamLogo team={f.away.abbr} sport="nfl" size="sm" ariaLabel={`${f.away.name} logo`} />
          {f.away.name}
          <span style={{ color: "var(--vault-text-faint)", fontSize: 16 }}>at</span>
          <TeamLogo team={f.home.abbr} sport="nfl" size="sm" ariaLabel={`${f.home.name} logo`} />
          {f.home.name}
          <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-gold)", border: "1px solid var(--vault-border)", borderRadius: 6, padding: "2px 6px" }}>EXPERIMENTAL</span>
        </h1>
        {f.venue ? <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{f.venue}</p> : null}
        {/* v1.1.2: follow either club by its ESPN team id, from the game the reader is already on. */}
        <div style={{ marginTop: 10 }}>
          <TeamFollowRow away={nflTeamRefByAbbr(f.away.abbr)} home={nflTeamRefByAbbr(f.home.abbr)} researchHrefs={hrefsFor([nflTeamRefByAbbr(f.away.abbr)?.id, nflTeamRefByAbbr(f.home.abbr)?.id])} />
        </div>
        {/* v1.4: factual matchup research for this exact event id — shown only when that page exists. */}
        {matchupHref("NFL", params.eventId) ? <div style={{ marginTop: 8 }}><CompareCta href={matchupHref("NFL", params.eventId)!}>Research matchup</CompareCta></div> : null}
        {wx ? (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--vault-text-faint)", maxWidth: 720, lineHeight: 1.55 }}>
            {wx.summary} — <strong>not used by the model</strong>; no weather term enters the numbers below.
          </p>
        ) : null}
        {archived ? (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 720 }}>
            <strong style={{ color: "var(--vault-text)" }}>Archived pregame read · published before kickoff.</strong> Everything below is the forecast revision the graded record names, read from its committed file and not regenerated.
            {archived.reconciliation.final ? <> The final was <span style={{ fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text)" }}>{f.away.abbr} {archived.reconciliation.final.away} – {archived.reconciliation.final.home} {f.home.abbr}</span>, from the {archived.weekLabel} record.</> : null}
          </p>
        ) : started ? (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 720 }}>
            This game has kicked off. Everything below is exactly what was published before kickoff and has not been changed since — that is the point of keeping it.
          </p>
        ) : null}
      </header>

      {/* P319: save exactly this forecast — the card the homepage would feature for this game, same identity and
          settlement key; the control itself refuses once the game has kicked off. */}
      {idxEvent && (idxEvent as NflEvent).winProbability ? (
        <div style={{ marginTop: 14 }}>
          <SaveForecastButton placement="report" compact={false} card={saveCardOf(cardFromNflEvent(idxEvent as NflEvent, { ...reportCardContext("nfl", { dataRoot: path.join(process.cwd(), "public", "data"), repoRoot: path.join(process.cwd(), ".."), nowIso: storyNowIso }), weekLabel: (idx as { counts?: { weekLabel?: string } } | null)?.counts?.weekLabel ?? null }))} />
        </div>
      ) : null}

      {/* P308: the inline simulation story, from the same eligibility verdict the lobby uses; a started game is told
          in the past tense by the adapter, and a refusal states its reason. */}
      <div style={{ marginTop: 22 }}>
        <SimulationStorySection manifest={buildNflPresentation(nflSimulateEligibility(storyNowIso).events.find((e) => e.providerEventId === params.eventId) ?? (archived ? archivedEventFrom(archived) : null), { indexGeneratedAt: nflSimulateEligibility(storyNowIso).indexGeneratedAt, runCount: Number.isInteger(f.model?.simulations) && f.model.simulations > 0 ? f.model.simulations : null, modelVersion: f.model?.id ?? null, nowIso: storyNowIso })} />
      </div>

      <section aria-labelledby="sim-summary" style={{ marginTop: 26 }}>
        {/* P179-A0: the report states its OWN readiness before showing a number. A page that leads
            with "19-18" and mentions the limitation three sections later has already made the
            claim. `teamSignal` is written by the significance gate, so this cannot drift from the
            engine that produced the distribution. */}
        <SectionHeader
          eyebrow={f.teamSignal?.state === "APPLIED" ? "Simulation" : "Simulation · BASELINE ONLY"}
          title={f.teamSignal?.state === "APPLIED" ? "What our model expects" : f.seasonType === 1 ? "What a league-average preseason game looks like" : "What a league-average game looks like"}
          sub={`${f.model.simulations.toLocaleString()} simulated games · model ${f.model.id}`}
        />
        {f.teamSignal && f.teamSignal.state !== "APPLIED" ? (
          <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)", maxWidth: 720, borderLeft: "2px solid var(--vault-gold)", paddingLeft: 12 }}>
            <strong style={{ color: "var(--vault-text)" }}>Read the range, not the score.</strong> {f.teamSignal.note} The numbers below are a
            real, reproducible simulation — they are just not a read on <em>these</em> two teams, so
            treat the projected scoreline as the middle of a wide range rather than a prediction.
          </p>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 12 }}>
          {/* P295 · labels a first-time bettor can read without a glossary: what each number is, which
              team a signed number favours, and what the range means in simulations rather than "p10". */}
          <Stat label="Projected score" value={`${f.away.abbr} ${s.projectedScore.away} — ${s.projectedScore.home} ${f.home.abbr}`} sub="the middle of our simulated outcomes, not a call on the exact final" />
          <Stat label="Win chance" value={`${f.away.abbr} ${pct(s.winProbability.away)} · ${f.home.abbr} ${pct(s.winProbability.home)}`} sub={`how often each side won in ${f.model.simulations.toLocaleString()} simulations · ties ${pct(s.winProbability.tieMass)}`} />
          <Stat label="Total points (both teams)" value={`${s.total.median}`} sub={`8 in 10 simulations landed between ${s.total.p10} and ${s.total.p90}`} />
          <Stat label={`${f.home.abbr} winning margin`} value={`${s.margin.median > 0 ? "+" : ""}${s.margin.median}`} sub={`a minus means ${f.away.abbr} wins by that much · 8 in 10 between ${s.margin.p10} and ${s.margin.p90}`} />
        </div>

        {/*
          * LIVE GAME STATE, BESIDE THE FROZEN GAME FORECAST (Phase G).
          *
          * The panel renders two labelled regions and never interleaves them: the provider's factual
          * score, period and clock on one side, and the numbers above — projected score and pregame
          * win chance — on the other, frozen and stamped.
          *
          * ⚠ NO `playerBoard` IS PASSED, ON PURPOSE. The per-prop live lines are owned by the player
          * board further down this page; handing them to this panel too would put the same
          * (player, family) in two places on one page and give a reader two things to reconcile.
          * This region answers the GAME-level question only.
          *
          * ⚠ AND THE WIN CHANCE DOES NOT MOVE. It is the pregame number, shown as one. A probability
          * that responded to the live score would be a live model, and none here has cleared a bar.
          *
          * Self-gates on `liveReadyFor("nfl")`: with the flag off it renders nothing and fetches
          * nothing.
          */}
        <LivePanel
          sport="nfl"
          eventId={params.eventId}
          nflForecast={{
            away: { abbr: f.away.abbr, projected: s.projectedScore.away, winPct: Math.round(s.winProbability.away * 100) },
            home: { abbr: f.home.abbr, projected: s.projectedScore.home, winPct: Math.round(s.winProbability.home * 100) },
          }}
          forecastGeneratedAt={f.generatedAt ?? null}
          startTime={f.kickoffUtc ?? null}
          showBetaHeading
        />

        {/* P246 (founder): the calibration paragraph left the browsing path — it lives in an
            optional disclosure here and in the artifact itself, not beside every number. */}
        <details style={{ marginTop: 12, maxWidth: 760 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--vault-text-faint)", minHeight: 32 }}>Model details</summary>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
            {s.winProbability.calibration} Generated {f.generatedAt} under model {String((f as { model?: { id?: string } }).model?.id ?? "nfl-regular-season-public-v1")} and frozen pre-kickoff; every forecast is settled against the official result.
          </p>
        </details>
      </section>

      {/* P250-GD — THE PROJECTED SCORECARD. One box-score-shaped unit per game: score line,
          win chance, total, the likely touchdown scorers and receiving leaders per team — and the
          families that carry NO number stated inside the same frame with the exact bar each failed,
          read verbatim from the artifact. Every figure is already on this page; this section only
          composes them into the scorecard shape. It is expected statistical summaries over one
          shared game environment — never one simulated game — and the label says so. */}
      {(() => {
        const fams = playerBoard?.families ?? {};
        const players = playerBoard?.players ?? [];
        const hasTd = fams.anytime_td?.state === "PUBLISHED";
        const hasRec = fams.player_receptions?.state === "PUBLISHED" && fams.player_reception_yds?.state === "PUBLISHED";
        const ct1 = (v: number | undefined) => (v != null && Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : "—");
        const yd0 = (v: number | undefined) => (v != null && Number.isFinite(v) ? String(Math.round(v)) : "—");
        const active = (abbr: string) => players.filter((p) => p.team === abbr && p.participation !== "INACTIVE");
        const tdTop = (abbr: string) => active(abbr)
          .filter((p) => p.markets.anytime_td?.probability != null)
          .sort((a, b) => b.markets.anytime_td!.probability! - a.markets.anytime_td!.probability!)
          .slice(0, 3);
        const recTop = (abbr: string) => active(abbr)
          .filter((p) => p.markets.player_receptions?.median != null)
          .sort((a, b) => (b.markets.player_receptions!.median ?? 0) - (a.markets.player_receptions!.median ?? 0))
          .slice(0, 3);
        const hasPass = fams.player_pass_yds?.state === "ESTIMATE" || fams.player_pass_yds?.state === "PUBLISHED";
        const hasRush = fams.player_rush_yds?.state === "ESTIMATE" || fams.player_rush_yds?.state === "PUBLISHED";
        const passTop = (abbr: string) => active(abbr)
          .filter((p) => p.markets.player_pass_yds?.median != null)
          .sort((a, b) => (b.markets.player_pass_yds!.median ?? 0) - (a.markets.player_pass_yds!.median ?? 0))
          .slice(0, 1);
        const rushTop = (abbr: string) => active(abbr)
          .filter((p) => p.markets.player_rush_yds?.median != null)
          .sort((a, b) => (b.markets.player_rush_yds!.median ?? 0) - (a.markets.player_rush_yds!.median ?? 0))
          .slice(0, 2);
        /* P250-GD5 (founder): the family-state gate still decides WHAT renders; the per-group
           "· estimate" suffix is gone. Evaluation detail lives on /methodology, not on every row. */
        /* P250-GD3: roster movers the stint rule cannot place yet — factual prior-club usage,
           named on the scorecard so a star the reader came for is never silently absent. */
        const arrivalsOf = (abbr: string) => (playerBoard?.newArrivals?.[abbr] ?? []).slice(0, 3);
        const withheld = Object.entries(fams).filter(([, x]) => x.state === "WITHHELD");
        const estimates = Object.entries(fams).filter(([, x]) => x.state === "ESTIMATE");
        /* A raw family key is not a reader-facing label — the artifact's label wins, with a plain
           fallback for any family that ships without one (player_pass_int did). */
        const famLabel = (key: string, x: { label?: string }) =>
          x.label && x.label !== key ? x.label : key.replace(/^player_/, "").replace(/_/g, " ").replace(/\bint\b/, "interceptions");
        const TeamCol = ({ t }: { t: { abbr: string; name: string } }) => (
          <div style={{ minWidth: 0 }}>
            <p className="font-mono" style={{ margin: 0, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
              <TeamLogo team={t.abbr} sport="nfl" size="sm" ariaLabel={`${t.name} logo`} /> {t.abbr}
            </p>
            {hasTd && tdTop(t.abbr).length ? (
              <div style={{ marginTop: 8 }}>
                <p className="font-mono" style={{ margin: 0, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-gold)" }}>Likely TD scorers</p>
                {tdTop(t.abbr).map((p) => (
                  <p key={p.playerId} style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                    <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{p.name}</span>{" "}
                    <span className="font-mono" style={{ color: "var(--gtp-bank-heat)", fontWeight: 700 }}>{(p.markets.anytime_td!.probability! * 100).toFixed(1)}%</span>
                    <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{availMark(p)}</span>
                  </p>
                ))}
              </div>
            ) : null}
            {hasPass && passTop(t.abbr).length ? (
              <div style={{ marginTop: 10 }}>
                <p className="font-mono" style={{ margin: 0, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-gold)" }}>Passing</p>
                {passTop(t.abbr).map((p) => (
                  <p key={p.playerId} style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                    <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{p.name}</span>{" "}
                    <span className="font-mono" style={{ color: "var(--vault-text-mute)" }}>
                      {yd0(p.markets.player_pass_yds?.median)} pass yds ({yd0(p.markets.player_pass_yds?.p10)}–{yd0(p.markets.player_pass_yds?.p90)})
                    </span>
                    <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{availMark(p)}</span>
                  </p>
                ))}
              </div>
            ) : null}
            {hasRush && rushTop(t.abbr).length ? (
              <div style={{ marginTop: 10 }}>
                <p className="font-mono" style={{ margin: 0, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-gold)" }}>Rushing leaders</p>
                {rushTop(t.abbr).map((p) => (
                  <p key={p.playerId} style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                    <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{p.name}</span>{" "}
                    <span className="font-mono" style={{ color: "var(--vault-text-mute)" }}>
                      {yd0(p.markets.player_rush_yds?.median)} rush yds ({yd0(p.markets.player_rush_yds?.p10)}–{yd0(p.markets.player_rush_yds?.p90)})
                    </span>
                    <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{availMark(p)}</span>
                  </p>
                ))}
              </div>
            ) : null}
            {/*
              * ⚠ PRIOR-CLUB HISTORY WAS INTERRUPTING THE FORECAST IT IS NOT PART OF.
              *
              * A warn-coloured "NEW ARRIVALS · NOT IN THESE NUMBERS" heading sat in the primary
              * scorecard, between this game's projections, followed by per-game averages from a
              * DIFFERENT CLUB IN A DIFFERENT SEASON. The facts are real and worth keeping — a
              * reader who came for a star the stint rule cannot place yet should not find silence —
              * but presenting last year's usage at the same altitude as this week's forecast makes
              * a reader compare two numbers that are not comparable, and the disclaimer under it
              * was doing all the work.
              *
              * So it becomes an optional disclosure: closed by default, opened deliberately, and
              * still stating exactly what it is. Nothing is removed and nothing is hidden — the
              * primary forecast simply stops being interrupted by something that is not one.
              */}
            {arrivalsOf(t.abbr).length ? (
              <details style={{ marginTop: 10 }}>
                <summary className="font-mono" style={{ cursor: "pointer", minHeight: 32, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
                  Recent signings ({arrivalsOf(t.abbr).length}) — last season&rsquo;s usage
                </summary>
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>What they did per game at their last team. It is history, and none of it is in this game&rsquo;s projections.</p>
                {arrivalsOf(t.abbr).map((a) => (
                  <p key={a.playerId} style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                    <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{a.name}</span>{" "}
                    <span className="font-mono" style={{ color: "var(--vault-text-mute)" }}>
                      {a.lastSeason.targetsPg > 0 ? `${a.lastSeason.receptionsPg} rec · ${a.lastSeason.recYdsPg} yds` : a.lastSeason.passAttPg >= 1 ? `${a.lastSeason.passYdsPg} pass yds` : `${a.lastSeason.rushYdsPg} rush yds`}/g at {a.lastSeason.club}
                    </span>
                  </p>
                ))}
              </details>
            ) : null}
            {hasRec && recTop(t.abbr).length ? (
              <div style={{ marginTop: 10 }}>
                <p className="font-mono" style={{ margin: 0, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-gold)" }}>Receiving leaders</p>
                {recTop(t.abbr).map((p) => (
                  <p key={p.playerId} style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                    <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{p.name}</span>{" "}
                    <span className="font-mono" style={{ color: "var(--vault-text-mute)" }}>
                      {ct1(p.markets.player_receptions?.median)} rec · {yd0(p.markets.player_reception_yds?.median)} yds
                    </span>
                    <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{availMark(p)}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        );
        return (
          <section aria-labelledby="scorecard-h" style={{ marginTop: 26 }}>
            <div style={{ border: "1px solid var(--vault-border-strong)", borderTop: "2px solid var(--vault-gold)", borderRadius: 14, padding: "18px 18px 14px", background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <h2 id="scorecard-h" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--vault-text)" }}>Projected scorecard</h2>
                <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
                  expected statistical summaries · not one simulated game
                </span>
              </div>
              {/* The score line — the game in one row. */}
              <div className="font-mono" style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: "var(--vault-text)" }}>
                  {f.away.abbr} {s.projectedScore.away} <span style={{ color: "var(--vault-text-faint)" }}>—</span> {s.projectedScore.home} {f.home.abbr}
                </span>
                <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>
                  win chance {f.away.abbr} {pct(s.winProbability.away)} · {f.home.abbr} {pct(s.winProbability.home)}
                </span>
                <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>total {s.total.median} ({s.total.p10}–{s.total.p90})</span>
                <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>margin {s.margin.median > 0 ? "+" : ""}{s.margin.median}</span>
              </div>
              {(hasTd || hasRec) && players.length ? (
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
                  <TeamCol t={f.away} />
                  <TeamCol t={f.home} />
                </div>
              ) : null}
              
              {/* Every family the scorecard does NOT number, in the scorecard's own frame — the
                  artifact's exact failed bar, never a silent gap and never an invented number. */}
              {withheld.length ? (
                <details style={{ marginTop: 14, borderTop: "1px solid var(--vault-rule)", paddingTop: 10 }}>
                  <summary className="font-mono" style={{ cursor: "pointer", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--vault-text-faint)", minHeight: 32 }}>
                    {withheld.map(([key, x]) => famLabel(key, x)).join(" · ")} — withheld, with the exact bar each failed
                  </summary>
                  <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
                    {withheld.map(([key, x]) => (
                      <li key={key} style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)" }}>
                        <strong style={{ color: "var(--vault-text-mute)" }}>{famLabel(key, x)}:</strong> {x.reason ?? "did not clear its evaluation bar"}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          </section>
        );
      })()}

      <section aria-labelledby="score-range" style={{ marginTop: 26 }}>
        <SectionHeader eyebrow="Range" title="How wide the outcomes are" sub="the 10th to 90th percentile of each team's simulated score" />
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr>{["Team", "Low (10th)", "Projected", "High (90th)"].map((h) => (
                <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {[
                { t: f.away, lo: s.scoreRange.awayP10, mid: s.projectedScore.away, hi: s.scoreRange.awayP90 },
                { t: f.home, lo: s.scoreRange.homeP10, mid: s.projectedScore.home, hi: s.scoreRange.homeP90 },
              ].map((r) => (
                <tr key={r.t.abbr}>
                  <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <TeamLogo team={r.t.abbr} sport="nfl" size="sm" ariaLabel={`${r.t.name} logo`} />{r.t.name}
                    </span>
                  </td>
                  <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 }}>{r.lo}</td>
                  <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, fontWeight: 700 }}>{r.mid}</td>
                  <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 }}>{r.hi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/*
        ── THE LUMPY HALF (P251 · F6) ──────────────────────────────────────────────────────────
        The published forecast draws a margin and a total from normals. That answers who wins and
        by roughly how much — and it cannot answer what the score will BE, because a normal has no
        idea that football scores are sums of 7s and 3s. Its own simulator says so in the code:
        "key-number clustering (3/7) NOT modeled".

        These numbers come from the event-based engine, which simulates touchdowns and field goals,
        and which was solved onto the SAME median margin and total printed above — so the shape and
        the centre are one answer, not two.
      */}
      {hasShape ? (
        <section aria-labelledby="score-shape" style={{ marginTop: 26 }}>
          <SectionHeader eyebrow="Exact score" title="The likeliest final scores"
            sub="from an event-based simulation of touchdowns and field goals, solved onto the median margin and total above" />
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
              <thead>
                <tr>{[`Score (${f.away.abbr} – ${f.home.abbr})`, "Chance"].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {shape!.finalScores.slice(0, 6).map((sc) => (
                  <tr key={`${sc.away}-${sc.home}`}>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontFamily: "var(--font-mono, monospace)", fontSize: 13, fontWeight: 600 }}>{sc.away}&ndash;{sc.home}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 }}>{(sc.probability * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 760 }}>
            No single scoreline is likely — these are the most common of hundreds. The projected score above is derived
            from the medians and answers a different question: the middle of the distribution, not its most common point.
          </p>

          <div style={{ marginTop: 18 }}>
            <SectionHeader eyebrow="Key numbers" title="How often it lands on 3, 7, 10 or 14"
              sub="football's margins pile up on those four — this is the one thing a normal-draw model cannot show you" />
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                <thead>
                  <tr>{["Margin", "This game", shape!.keyNumberAccuracy ? "Last 3 regular seasons" : ""].filter(Boolean).map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {shape!.keyNumbers.byNumber.map((k) => (
                    <tr key={k.number}>
                      <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>Decided by exactly {k.number}</td>
                      <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, fontWeight: 700 }}>{(k.probability * 100).toFixed(1)}%</td>
                      {shape!.keyNumberAccuracy ? (
                        <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                          {((shape!.keyNumberAccuracy.byNumber[String(k.number)] ?? 0) * 100).toFixed(1)}%
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13, fontWeight: 600 }}>Any of the four</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, fontWeight: 700 }}>{(shape!.keyNumbers.share * 100).toFixed(1)}%</td>
                    {shape!.keyNumberAccuracy ? (
                      <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                        {(shape!.keyNumberAccuracy.share * 100).toFixed(1)}%
                      </td>
                    ) : null}
                  </tr>
                </tbody>
              </table>
            </div>
            {shape!.keyNumberAccuracy ? (
              /* The receipt sits beside the claim, not in a footnote. The engine reproduces the
                 clustering — 3 is by far the biggest number, as it is in reality — and it is not
                 exact, and a reader is told which way it misses rather than left to assume a
                 calibration nobody measured. */
              <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 760, lineHeight: 1.6 }}>
                The right-hand column is what actually happened across {shape!.keyNumberAccuracy.sampleGames.toLocaleString()} regular-season
                games ({shape!.keyNumberAccuracy.seasons}) — the same finals this engine was fitted to. It gets the shape right,
                with 3 the most common margin by a distance, and it is not calibrated to the number: it puts less weight on 3
                and more on 10 than those seasons did.
              </p>
            ) : null}
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
            {[
              [`${f.away.abbr} touchdowns`, shape!.scoringRates.awayTouchdowns.toFixed(1)],
              [`${f.home.abbr} touchdowns`, shape!.scoringRates.homeTouchdowns.toFixed(1)],
              [`${f.away.abbr} field goals`, shape!.scoringRates.awayFieldGoals.toFixed(1)],
              [`${f.home.abbr} field goals`, shape!.scoringRates.homeFieldGoals.toFixed(1)],
              ["Tied after regulation", `${(shape!.overtimeProbability * 100).toFixed(1)}%`],
            ].map(([l, v]) => (
              <div key={l} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "9px 11px" }}>
                <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{l}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--vault-text)" }}>{v}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="vs-market" style={{ marginTop: 26 }}>
        <SectionHeader eyebrow="Comparison" title="Us versus the sportsbooks" sub="two independent reads, shown side by side" />
        {mc.state === "MARKET_VIEW" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 12 }}>
              <Stat label="Our win chance" value={pct(s.winProbability.home)} sub={`${f.home.abbr} to win`} />
              <Stat label="Sportsbook win chance" value={pct(mc.marketHomeWinPct)} sub={`${f.home.abbr} to win, read from ${mc.books} sportsbooks' odds with their built-in margin removed`} />
              <Stat label="Difference" value={gapPp == null ? "—" : `${gapPp > 0 ? "+" : ""}${gapPp} pp`} sub="ours minus the sportsbooks', in percentage points — not a recommendation" />
              <Stat label="Total points: ours vs sportsbooks" value={`${s.total.median} vs ${mc.marketTotal ?? "—"}`} sub="our projected total against the sportsbooks' over/under line" />
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 760, lineHeight: 1.6 }}>{mc.note}</p>
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>Prices captured {mc.capturedAt} — before kickoff.</p>
          </>
        ) : (
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{mc.note}</p>
        )}
      </section>

      {/* P245 · the promotion-gated player projection board (rush yards + calibrated anytime TD;
          every withheld family named with its failed bar). Renders only when the public artifact
          exists for this event — absence is the honest pre-generation state. */}
      {playerBoard && Object.values(playerBoard.families).some((f) => f.state === "PUBLISHED") ? (
        <section aria-labelledby="player-board-h">
          <SectionHeader
            eyebrow={`Player projections · ${playerBoard.players.length} modelled`}
            title="The player board"
            sub="Every modelled player, with his availability. Players listed out carry no volume projection."
          />
          {/* P250 · A15: the P249 combined receiving table is now the board's own "Combined" tab —
              one filter scope, every eligible player reachable, availability on every row, one
              display-precision policy, no silent cap. The separate server-rendered copy of the same
              numbers is gone. */}
          <NflPlayerBoard board={playerBoard} teams={[f.away.abbr, f.home.abbr]} researchHrefs={hrefsFor((playerBoard.players ?? []).map((p) => p.playerId))} />

          {/* P249 §8 — scoring outlook: the game's TD candidates with their availability states.
              A deliberately-sized shortlist; the FULL list lives in the board's TD-chance tab. */}
          {(() => {
            if (playerBoard.families.anytime_td?.state !== "PUBLISHED") return null;
            const eligible = playerBoard.players
              .filter((p) => p.markets.anytime_td?.probability != null && p.participation !== "INACTIVE")
              .sort((a, b) => b.markets.anytime_td!.probability! - a.markets.anytime_td!.probability!);
            const top = eligible.slice(0, 6);
            if (!top.length) return null;
            return (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 13.5, fontWeight: 700, color: "var(--vault-text)" }}>
                  Scoring outlook
                  <span className="font-mono" style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: "var(--vault-text-faint)" }}>
                    top {top.length} of {eligible.length} by TD chance · full list in the board&rsquo;s TD tab
                  </span>
                </h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                  {top.map((p) => (
                    <li key={`out-${p.playerId}`} className="font-mono" style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>
                      <strong style={{ color: "var(--gtp-bank-heat)" }}>{(p.markets.anytime_td!.probability! * 100).toFixed(1)}%</strong>{" "}
                      <span style={{ color: "var(--vault-text)" }}>{p.name}</span> · {p.team}
                      {/* The SECOND copy of the assembled label, in the scoring outlook. It printed
                          the same banned wording from the same enum, and a grep for the phrase found
                          neither — one exported rule, used everywhere, is the fix for both. */}
                      {availMark(p) ? <span style={{ color: "var(--vault-text-faint)" }}>{availMark(p)}</span> : null}
                    </li>
                  ))}
                </ul>
                <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--vault-text-faint)", maxWidth: 720 }}>
                  Anytime-scorer probability means scoring a touchdown — never throwing one. Void if the player does
                  not play; questionable players carry their state above.
                </p>
              </div>
            );
          })()}
        </section>
      ) : null}

      {/* P250 · A15: the preseason "player simulations" section was removed as dead code — it keyed
          on `providerEventId` in the retired game-simulations artifact (whose games carry `gameId`,
          frozen 2026-08-29), so it could never render against the committed data. The regular-season
          player projections above are the real player surface. */}
      <section aria-labelledby="how-read" style={{ marginTop: 26 }}>
        <SectionHeader eyebrow="Reading key" title="What these numbers mean" />
        <dl style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, fontSize: 12.5 }}>
          {[
            ["Projected score", "The middle outcome across every simulated game — not a prediction of the exact final."],
            ["Win chance", "How often each side won across the simulations, after the calibration described above."],
            ["80% range", "Eight in ten simulated games landed inside this band. Real games land outside it too."],
            ["pp (percentage points)", "The plain difference between two percentages. A gap is a difference, not an advantage."],
            /* P250-W2: a reading key defines the LABEL. Restating the market non-claim here made it
               the third time this page said it — the model's own measured limit says it once, in
               Provenance below. */
            ["Experimental", "Published while its out-of-sample record is still accumulating. Every forecast is frozen before kickoff and graded against the official result."],
          ].map(([t, d]) => (
            <div key={t}>
              <dt style={{ fontWeight: 600 }}>{t}</dt>
              <dd style={{ margin: "2px 0 0", color: "var(--vault-text-mute)", lineHeight: 1.5 }}>{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="receipt" style={{ marginTop: 26 }}>
        <SectionHeader eyebrow="Provenance" title="Where this came from" />
        <dl style={{ marginTop: 12, fontSize: 12, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
          <dt>model</dt><dd style={{ margin: 0 }}>{f.model.id} v{f.model.version}</dd>
          <dt>simulations</dt><dd style={{ margin: 0 }}>{f.model.simulations.toLocaleString()}</dd>
          <dt>input hash</dt><dd style={{ margin: 0 }}>{f.model.inputHash}</dd>
          <dt>generated</dt><dd style={{ margin: 0 }}>{f.generatedAt}</dd>
          <dt>kickoff</dt><dd style={{ margin: 0 }}>{f.kickoffUtc}</dd>
          <dt>state</dt><dd style={{ margin: 0 }}>{lifecycle}</dd>
        </dl>
        {/* P250 · A15: the player board's model provenance — the receipt above names only the team
            forecast model, and nothing else on the page said which evaluation produced each player
            family. Read verbatim from the artifact's per-family basis lines. */}
        {playerBoard ? (
          <details style={{ marginTop: 12, border: "1px solid var(--vault-rule)", borderRadius: 10, padding: "8px 12px" }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--vault-text-mute)", minHeight: 32 }}>
              Player-family model provenance ({Object.values(playerBoard.families).filter((x) => x.state === "PUBLISHED").length} published)
            </summary>
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
              {Object.entries(playerBoard.families)
                .filter(([, x]) => x.state === "PUBLISHED")
                .map(([key, x]) => (
                  <li key={key} style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)" }}>
                    <strong style={{ color: "var(--vault-text-mute)" }}>{x.label}:</strong> {x.basis ?? "evaluation basis not recorded on the artifact"}
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
        {card?.honestLimit ? (
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 760, lineHeight: 1.6 }}>{card.honestLimit}</p>
        ) : null}
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 760 }}>{f.disclaimer}</p>
      </section>

      {others.length ? (
        <section aria-labelledby="other-games" style={{ marginTop: 26 }}>
          <SectionHeader eyebrow="More" title="Other games with a simulation" />
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {others.map((o) => (
              <li key={o.providerEventId}>
                <Link href={`/nfl/game/${o.providerEventId}`} style={{ display: "block", border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px", textDecoration: "none", color: "inherit" }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{o.matchup}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--vault-text-mute)", marginTop: 2 }}>{etTime(o.kickoffUtc)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
