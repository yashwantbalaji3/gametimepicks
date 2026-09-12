/**
 * /nfl — NFL hub (Program 169 · Release J; market layer Program 171 · Release F;
 * slate-day rebuild + shared-UI adoption Program 177 · Release A). PUBLIC.
 *
 * The honest first-class NFL surface: the REAL slate and results from committed captures, the
 * experimental preseason simulation for each game on the next slate, and — when an authorized
 * capture exists — the current market prices as FACTS with provenance (per-event de-vigged
 * consensus, book counts, absolute capture stamps), plus a coverage table that states each
 * product layer's exact typed state and reason.
 *
 * Program 177 · Release A changes three things:
 *   1. The page is organised around ONE SLATE DAY instead of two disconnected lists. Previously a
 *      reader saw an "upcoming games" grid and, somewhere below it, a separate "simulations" grid,
 *      with no way to tell that a game in the first list was the same game in the second. Now each
 *      slate game is one card that carries its own simulation and opens its own full report.
 *   2. The slate day is DERIVED FROM THE CANONICAL INDEX (`nextKickoffUtc`), never from a pinned
 *      date and never recomputed here. The index's own rule is that a surface computing its own
 *      state is a defect, so lifecycle, counts and lean text are read from it verbatim.
 *   3. It adopts the shared hub furniture `/mlb` already had and `/nfl` did not: SportOverviewHero,
 *      FreshnessBadge, SectionHeader, EventCard, QuickActionRail. Five parity-ledger rows, closed
 *      by using the existing owners rather than forking new ones.
 *
 * Data: build-time reads of COMMITTED PUBLIC artifacts only (no network, no private research).
 */
import type { Metadata } from "next";
import HubHeader, { HubTitle } from "@/components/sport-hub/hub-header";
import { nflHub } from "@/lib/sport-hub/adapters";
import Explain from "@/components/ui/explain";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import SportHubNav from "@/components/sports/sport-hub-nav";

import EventCard from "@/components/event-card";
import PlayerAvatar from "@/components/player-avatar";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import SportOverviewHero from "@/components/sport-overview-hero";
import TeamLogo from "@/components/team-logo";
import FreshnessBadge from "@/components/ui/freshness-badge";
import { currentEtDate } from "@/lib/freshness";
import { getSportIdentity } from "@/lib/sport-identity";
import { deriveSlateAnchor } from "@/lib/sports/nfl/slate-anchor.mjs";
import { loadNflEvents, currentPeriodKey, eventsInPeriod, periodCounts } from "@/lib/events/read-model";
import { seasonContextFor } from "@/lib/sports/nfl/season-context.mjs";
import GradedPicksSection from "@/components/sports/graded-picks-section";
import IntervalCalibrationPanel, { loadIntervalCalibration } from "@/components/nfl/interval-calibration-panel";
import { loadGradedPicks } from "@/lib/sports/graded-picks-loader";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import NflWeeklyBoards from "@/components/nfl/weekly-boards";
import { hasStarted } from "@/lib/sports/nfl/effective-lifecycle.mjs";

export const metadata: Metadata = withRouteMetadata("/nfl/", {
  title: "NFL Hub — Slate, Experimental Simulations & Coverage Status · GameTime Picks",
  description:
    "Every game on the next NFL slate with its experimental simulation, the sportsbook prices captured before kickoff, and an honest market-by-market coverage table. Educational and paper-only.",
});

const read = (rel: string) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", rel), "utf8")); } catch { return null; }
};

const etKickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

/** ISO calendar day in ET — the unit a slate is actually organised by. */
const etDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * ESPN athlete id out of the Vault's canonical player key ("nfl-athlete-4430807" -> 4430807).
 * Returns null for anything that is not that shape, so a schema change degrades to the initials
 * disc rather than requesting a nonsense URL.
 */
const espnAthleteId = (playerId: string): number | null => {
  const m = /^nfl-athlete-(\d+)$/.exec(playerId ?? "");
  return m ? Number(m[1]) : null;
};

const etDayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));

type MarketRow = {
  providerEventId: string;
  kickoffUtc: string;
  home: { abbr: string; name: string };
  away: { abbr: string; name: string };
  books: Array<{ book: string }>;
  consensus: { homeWinProbNoVig: number | null; awayWinProbNoVig: number | null; spreadHome: number | null; total: number | null };
};

type ScheduleRow = {
  providerEventId: string; shortName: string; dateUtc: string; statusRaw: string;
  seasonType: number; week: number; venue: string;
  home: { abbr: string; name: string }; away: { abbr: string; name: string };
};

/** One event as the canonical index publishes it. Consumed verbatim — never recomputed here. */
type IndexEvent = {
  providerEventId: string; canonicalEventId: string; matchup: string; kickoffUtc: string;
  lifecycle: "UPCOMING" | "STARTED" | "SETTLED"; locked: boolean; state: string; stateMeaning: string;
  home: { abbr: string; name: string }; away: { abbr: string; name: string };
  lean?: { gapPp: number; leansTo: string; notAnEdge: string } | null;
  projectedScore?: { home: number; away: number } | null;
  winProbability?: { home: number; away: number } | null;
  total?: { median: number; p10: number; p90: number } | null;
  hasMarket: boolean;
};

/**
 * The ET calendar day a kickoff belongs to. NEVER `.slice(0, 10)` on the UTC instant: an 8:00 PM ET
 * Saturday game is 00:00 UTC Sunday, which builds a slug for a day no artifact was written for — a
 * dead link that looks correct in source. The route-integrity guard caught exactly that here.
 */
function etDaySlug(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * When a capture happened, said so a reader cannot misread it.
 *
 * A bare "17:45Z" is the right length for a dashboard and the wrong thing to print: it carries no
 * day, so a price taken the afternoon before a Sunday slate wears Sunday's clock. The date is
 * ALWAYS shown — "only when it isn't today" fails on a static export, where "today" is frozen at
 * build time and a page built on Saturday is still being read on Sunday.
 */
function capturedLabel(capturedAt: string): string {
  const iso = String(capturedAt ?? "");
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7);
  return `captured ${month} ${Number(iso.slice(8, 10))} · ${iso.slice(11, 16)}Z`;
}

/** The zero state names what is observable — the age of the last capture — and claims nothing else. */
function lastCaptureLabel(capturedAt?: string | null): string {
  const day = String(capturedAt ?? "").slice(0, 10);
  return day ? `none current — last capture ${day}` : "none current — no capture on file";
}

export default function NflHubPage() {
  const schedule = read("nfl/schedule/latest.json");
  const results = read("nfl/results/latest.json");
  const markets = read("nfl/markets/latest.json");
  /* P277 · pregame conditions as CONTEXT. The model does not ingest weather — the input registry
     says so and the totals head carries no weather term — so this renders beside the forecast and
     never inside it, with the source attribution and that sentence both on the page. */
  const weather = read("nfl/weather/latest.json");
  const index = read("nfl/index.json");
  // P180-A: how the last slate's frozen forecasts actually did. Published because a model that only
  // shows its predictions and never its grades is asking to be taken on trust.
  // P182-A: the playing-time answer. Published because every player row on this page is only as
  // good as the participation assumption behind it, and ours is "we do not know, here is how much".
  // P183-B: all four player families were tested and rejected. Published because a site that shows
  // only the models that worked is not showing its work.
  const participation = read("nfl/participation-summary.json") as
    | { headline: string; whyNotKnown: string; whatWeDoInstead: string; whyItMatters: string;
        eventsCovered: number; unreachableWithoutSource: string[] }
    | null;
  const pregameAudit = read("nfl/pregame-audit-latest.json") as
    | { etDate: string; headline: string; whatThisIs: string; n: number; decisiveGames: number; ties: number;
        winnersCorrect: number; teamScoreAverageError: number; marginAverageError: number; totalAverageError: number;
        rangeHitRate: { margin: number; total: number; target: number }; versusSportsbooks: string; honestLimit: string;
        games: Array<{ matchup: string; predicted: string; actual: string; marginError: number; totalError: number; inRange: boolean; tie: boolean }> }
    | null;
  // P178-C: what this model can and cannot tell apart, from the differentiation audit. Published
  // because the alternative — a reader inferring a game-specific view from similar-looking numbers
  // — is exactly the misreading the audit was written to prevent.
  const differentiation = read("nfl/model-differentiation.json") as
    | { headline: string; heads: Array<{ head: string; state: string; plainEnglish: string }>;
        whyGamesLookAlike: string; whatWeFoundAndFixed?: string; whatWouldChangeIt: string;
        weTriedToFixIt?: { what: string; bars: string; result: string; decision: string; alsoLearned: string } }
    | null;
  // P177-C: the daily paper-product evaluation. A reader who asks "why is there no NFL in Bank
  // Builder?" gets a dated answer from an evaluation that actually ran, not an inference from an
  // empty space. Renders only when the evaluation exists.
  // P183-E: the RUN receipt. "Nothing qualified" is a conclusion; this is the working behind it —
  // every lane's counted rejection doors, so a reader can tell a product that ran from one that did not.
  const productReceipts = read("nfl/product-receipts.json") as
    | { runId: string; generatedAt: string; nextRunUtc: string; plainEnglish: string;
        overDetermined: { note: string; gates: string[] };
        lanes: Array<{ product: string; label: string; state: string; candidatesConsidered: number;
                       rejections: Array<{ reason: string; label: string; count: number }> }> }
    | null;
  const productEligibility = read("nfl/product-eligibility.json") as
    | { generatedAt: string; plainEnglish: string; consideredEvents: number;
        products: Array<{ product: string; label: string; state: string; eligible: boolean; reason: string; whatWouldQualify: string[] }> }
    | null;
  const finals = (results?.rows ?? []).filter((r: { statusRaw: string }) => /^STATUS_FINAL/.test(r.statusRaw));
  const nflGraded = loadGradedPicks("nfl");
  const nflCalibration = loadIntervalCalibration();

  // market rows are pre-kickoff facts by construction: keep only rows whose capture precedes
  // their own kickoff (a static truth that cannot rot), sorted by kickoff.
  const marketRows: MarketRow[] = ((markets?.rows ?? []) as MarketRow[])
    /* Per ROW: a carried-forward price was captured earlier than the document says, and a game
       priced before its kickoff stays priced even once a later capture no longer covers it. */
    .filter((r) => { const at = (r as { capturedAt?: string }).capturedAt ?? markets?.capturedAt; return at && r.kickoffUtc && at < r.kickoffUtc; })
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const pct = (p: number | null) => (typeof p === "number" ? `${(p * 100).toFixed(1)}%` : "—");

  const indexEvents: IndexEvent[] = (index?.events ?? []) as IndexEvent[];
  const eventById = new Map(indexEvents.map((e) => [e.providerEventId, e]));

  // ── THE SLATE DAY ───────────────────────────────────────────────────────────
  // Derived from the canonical index's next kickoff, so the page follows reality instead of a
  // pinned date. A date-pinned slate reads correctly for exactly one day and then lies; five
  // guards in this repository broke that way at a UTC rollover, which is why nothing here is
  // hard-coded. Fallback order: index → the earliest scheduled game in the capture.
  const allScheduled: ScheduleRow[] = ((schedule?.rows ?? []) as ScheduleRow[])
    .filter((r) => r.statusRaw === "STATUS_SCHEDULED")
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
  // The anchor rule lives in ONE place — see lib/sports/nfl/slate-anchor.mjs for why the guard must
  // call the same function rather than keeping its own copy of the expression.
  const { anchorUtc, slateDay } = deriveSlateAnchor(index, allScheduled);
  /*
   * P243 · C-NFL: the lead section is the NATURAL PERIOD — the whole selected week from the
   * shared read model — never one ET day. Day-anchored, Week 1 rendered as a one-game
   * "slate" (the Wednesday opener) with fifteen games demoted to a schedule footnote; a
   * reader looking for Sunday's games found a schedule, not the week. The period membership
   * comes from the read model (one owner); the rendering rows stay the schedule capture's own.
   */
  /* P252: ONE instant for the page, so two rows in the same table cannot be judged against two
     different clocks — the same rule the ranked reads set follows. */
  const nowIso = new Date().toISOString();
  const nflEvents = loadNflEvents(nowIso);
  const weekKey = currentPeriodKey(nflEvents, nowIso);
  const weekEvents = weekKey ? eventsInPeriod(nflEvents, weekKey) : [];
  const weekCounts = periodCounts(weekEvents);
  const weekIds = new Set(weekEvents.map((e) => e.providerAliases[0]?.id));
  const weekLabel = weekEvents[0] ? `${weekEvents[0].period.label}${weekEvents[0].phase ? ` · ${weekEvents[0].phase} season` : ""}` : null;
  const weatherByEvent = new Map(
    ((weather?.rows ?? []) as Array<{ espnEventId?: string | null; summary?: string; indoors?: boolean; notableWind?: boolean }>)
      .filter((r) => r.espnEventId)
      .map((r) => [String(r.espnEventId), r]),
  );
  const slateGames = weekIds.size
    ? allScheduled.filter((r) => weekIds.has(String(r.providerEventId)))
    : slateDay ? allScheduled.filter((r) => etDay(r.dateUtc) === slateDay) : [];
  // Games in FUTURE periods beyond the selected week (none while the capture window holds one week).
  const laterGames = allScheduled.filter((r) => !weekIds.has(String(r.providerEventId)) && (!slateDay || etDay(r.dateUtc) > slateDay)).slice(0, 16);
  // The section title states the phase of the games it introduces, derived from their own rows —
  // it was the literal "Later this preseason", which became a false label the day the regular
  // season arrived. One phase+week across every row earns the specific title; a mixed list stays
  // generic rather than guessing.
  const laterContexts = laterGames.map((g) => seasonContextFor(g));
  const laterTitle = (() => {
    if (!laterGames.length) return "Coming up";
    const first = laterContexts[0];
    const uniform = laterContexts.every((c) => c.state === first.state && c.week === first.week);
    if (!uniform) return "Coming up";
    if (first.state === "REGULAR_SEASON" && first.week != null) return `The rest of Week ${first.week}`;
    if (first.state === "PRESEASON") return "Later this preseason";
    if (first.state === "POSTSEASON") return "Postseason schedule";
    return "Coming up";
  })();
  const simulatedOnSlate = slateGames.filter((g) => eventById.get(g.providerEventId)?.projectedScore).length;
  /* P246 §6: "Sportsbook prices for this slate" must mean THIS slate. When this was written the
     newest authorized capture was an August one taken under a since-expired receipt, so its rows
     were archived preseason games and rendering them under a Week-N heading called yesterday's data
     today's. The receipt was renewed 2026-09-10 and current captures exist again — the filter is
     what makes that safe rather than lucky, because the next gap between captures will look exactly
     like the old one. The section renders only rows belonging to the selected week. */
  const slateMarketRows = marketRows.filter((r) => weekIds.has(String(r.providerEventId)));

  const forecastArtifact = read("nfl/forecasts/latest.json");
  const forecastCard = forecastArtifact?.modelCard ?? null;
  /* P246 §5: the weekly top boards render VERBATIM from the one canonical ranking owner
     (scripts/nfl/build-nfl-weekly-boards.mjs). The hub never ranks players itself. */
  type WeeklyBoardRow = { playerId: string; name: string; team: string; opponent: string; providerEventId: string; kickoffUtc: string; participation: string; value: number; p10?: number; median?: number; p90?: number; probability?: number };
  const weeklyBoards = read("nfl/weekly-boards/latest.json") as
    | { period: { seasonType: number; week: number }; scope: { kind: string; eventsIncluded: number; eventsDroppedAfterKickoff: number };
        boards: Array<{ id: string; title: string; state: string; basis?: string; reason?: string; caveat?: string; rows?: WeeklyBoardRow[] }> }
    | null;
  // per-event calibration sentence, keyed the same way the index keys events


  // P174-E: Endzone Vault. Renders only when the evaluator produced candidates; a NO_VAULT or
  // INCIDENT window shows nothing here rather than an empty table pretending to be a product.
  type VaultRow = { playerId: string; name: string; position: string | null; team: string; event: string; tdProbability: number; roleState: string };
  const vault = read("nfl/end-zone-vault/latest.json") as
    | { state: string; reason: string; disclaimer: string; selections: VaultRow[]; watchlist: VaultRow[] }
    | null;
  const propAbsence = markets?.propMarkets?.state === "PROBED" && (markets.propMarkets.offeredMarkets ?? []).length === 0;

  // Every model/market state below is DERIVED from committed evaluation receipts by
  // scripts/nfl/build-nfl-public-status.mjs. Nothing here is hand-typed prose: if a receipt
  // says the model failed its bar, this table says so in plain language, and a layer with no
  // receipt reads UNKNOWN rather than green.
  type StatusLayer = { state: string; headline: string; detail: string; nextGate?: string | null; modelStanding?: string };
  const modelStatus = read("nfl/model-status.json");
  const layerRow = (layer: string, s: StatusLayer | null | undefined, fallback: string) =>
    s ? { layer, state: s.state, detail: `${s.detail}${s.modelStanding ? ` ${s.modelStanding}` : ""}${s.nextGate ? ` Next: ${s.nextGate}` : ""}` }
      : { layer, state: "UNKNOWN", detail: fallback };

  const coverage = [
    { layer: "Schedule & identities", state: "LIVE", detail: `daily capture · ${schedule ? `${schedule.rows.length} events in window, captured ${schedule.generatedAt}` : "capture unavailable — shown as missing, never guessed"}` },
    { layer: "Results", state: "LIVE", detail: `official finals join by durable event id; results without pre-event schedule lineage are quarantined and say so` },
    layerRow("Team game simulation", modelStatus?.teamSimulation, "no model evaluation is readable — no claim is made"),
    layerRow("Moneyline / spread / total prices", modelStatus?.market, "no price capture is readable"),
    ...((modelStatus?.playerFamilies ?? []) as Array<StatusLayer & { label: string }>).map((f) => layerRow(f.label, f, "no evaluation on file")),
    layerRow("Anytime touchdown · Endzone Vault", modelStatus?.anytimeTd, "no calibration receipt on file"),
    { layer: "Settlement", state: "DEPLOYED", detail: "team and scorer results are graded automatically from official finals; each pre-kickoff forecast settles exactly once when its result exists" },
    ...(productEligibility
      ? productEligibility.products.map((p) => ({
          layer: `Paper products · ${p.label}`,
          state: p.state,
          detail: p.reason,
        }))
      : []),
  ];

  const identity = getSportIdentity("nfl");
  const slateLabel = slateDay ? etDayLabel(`${slateDay}T18:00:00Z`) : "the next slate";
  const experimentalChip = (
    <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--sport-nfl)", border: "1px solid var(--vault-border)", borderRadius: 6, padding: "2px 6px", verticalAlign: "middle" }}>
      EXPERIMENTAL
    </span>
  );

  /* Program 237. The games come first here too. This adapter deliberately does NOT label the board
     "this week": every NFL artifact on disk runs 2026-08-14 to 2026-08-29 with no prediction, no
     simulation and no market snapshot, so it is a preseason archive and says so. */
  const __hubModel = nflHub(nowIso);

  return (
    // P176: adopt the SHARED application shell /mlb uses (vault-page-shell, 1440px) instead of
    // a 900px document. Same class, same padding scale, same overflow guard — the largest single
    // parity gap in the ledger, closed by using the existing owner rather than a fork.
    // A DIV, not a <main>: the app layout already provides the single main landmark, which is
    // exactly why /mlb wraps in a div too. Using <main> here produced two landmarks.
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden flex flex-col gap-10">
      {/* P208 · Release C — shared section nav; conditional sections pass through only when they
          rendered, so no strip item is dead. */}
      <HubTitle model={__hubModel} />
      <SportHubNav
        sport="nfl"
        anchors={[
          "nfl-games",
          "nfl-slate",
          ...(weeklyBoards?.boards?.length ? ["nfl-boards"] : []),
          ...(vault && (vault.watchlist?.length || vault.selections?.length) ? ["nfl-vault"] : []),
          ...(slateMarketRows.length ? ["nfl-markets"] : []),
          "nfl-results", "nfl-coverage",
        ]}
      />
      {/* P250-W1: the canonical weekly table (projected scores + totals, permalinked, guard-tested)
          renders a few sections below — the hub's generic list was a second 16-row copy of the same
          games directly above it, so it collapses to a counts line with the quick list one click
          away. Same games, one table. */}
      <section id="nfl-games" className="scroll-mt-24">
        <HubHeader
          model={__hubModel}
          deferToCanonical={{ note: "The full weekly table below carries every game with its projected score and total — this quick list is the same games in short form." }}
        />
      </section>
      {/* P177-A: the shared sport hero. The freshness badge rides in the badge slot and
          re-derives the REAL browser ET date after mount, so a slate page left open overnight
          stops claiming to be today's. */}
      <SportOverviewHero
        headingLevel="h2"
        eyebrow="NFL · public beta"
        sport="NFL"
        tagline={`Experimental ${index?.model?.phaseLabel ? `${index.model.phaseLabel} ` : ""}simulations`}
        accent="nfl"
        icon={identity.icon}
        iconGradient={identity.gradient}
        iconLabel={identity.ballLabel}
        /* "Live" must mean the games are ON, not that we published simulations for them. Keyed to
           simulation count alone, this pill read "Live · 2 games" beside its own freshness badge
           reading "Upcoming · 2026-08-20" — two contradictory claims on one line, three days early.
           The slate day decides tense; the simulation count only distinguishes ready from pending. */
        statusKind={
          slateDay && slateDay > currentEtDate() ? "upcoming"
          : slateDay && slateDay < currentEtDate() ? "settled"
          : simulatedOnSlate > 0 ? "live"
          : slateGames.length > 0 ? "linesPending"
          : "upcoming"
        }
        statusCaption={slateGames.length > 0 ? `${slateGames.length} game${slateGames.length === 1 ? "" : "s"}` : undefined}
        matchupLine={weekLabel ? `${weekLabel} · ${slateGames.length} game${slateGames.length === 1 ? "" : "s"}` : slateDay ? `${slateLabel} · ${slateGames.length} game${slateGames.length === 1 ? "" : "s"} on the slate` : undefined}
        badge={<FreshnessBadge slateDate={slateDay} serverToday={currentEtDate()} noun="slate" />}
        stats={[
          { label: weekLabel ? "Games this week" : "Games on the slate", value: String(slateGames.length), sub: weekLabel ?? slateDay ?? "no capture" },
          { label: "Simulated", value: String(simulatedOnSlate), sub: simulatedOnSlate > 0 ? "10,000 runs each" : "none published" },
          /* P246 §6: the hero counted the INDEX's market events — which still held the archived
             Aug-29 capture after authorization expired, advertising "1" beside a Week-1 slate with
             no current prices. The stat is the WEEK's own count, and zero says why. */
          /* The time alone said "captured 17:45Z", which reads as today whatever day it was — a
             capture taken the day before a slate would have worn today's clock. And the zero state
             blamed authorization, which has been valid since 2026-09-10: what is missing is a RUN,
             not a permission, and a wrong reason is worse than none. Both now state what is true. */
          { label: "Sportsbook prices", value: String(slateMarketRows.length), sub: slateMarketRows.length ? capturedLabel(markets.capturedAt) : lastCaptureLabel(markets?.capturedAt) },
        ]}
        ctas={[
          { href: "#nfl-slate", label: "See the slate", primary: true },
          /* A CTA to a section that did not render is a dead button — the second slot follows
             what this build actually shows. */
          slateMarketRows.length ? { href: "#nfl-markets", label: "Sportsbook prices" } : { href: "#nfl-boards", label: "Weekly top boards" },
        ]}
        /* P250-W2: this said the same thing the lead paragraph below says, one line apart — a
           reader met three consecutive disclaimers before a single number. The hero states the
           frame; the model's own recorded result states the limit, once. */
        framing="Experimental regular-season simulations · educational · paper-only."
      />

      <div style={{ maxWidth: 680 }}>
        {/* THE HONEST LIMIT IS READ FROM THE MODEL ARTIFACT, not retyped here.
         *
         * This paragraph used to carry its own copy, and the copy had drifted into a kinder claim:
         * the page said the model picked winners "barely better than a coin flip" while the model's
         * own recorded honestLimit says "no better than a coin flip". A hand-maintained caveat that
         * flatters the model past its measured result is worse than no caveat, and it can only drift
         * in that direction. Rendering the artifact's own sentence makes that impossible.
         *
         * It stays in the LEAD, not behind a disclosure — it changes how every number on this page
         * should be read, and a guard holds it here on purpose. P250-W2 removed the two hand-typed
         * sentences that used to sit above it and said the same thing twice more.
         */}
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
          {index?.model?.plainEnglish?.honestLimit}
        </p>
      </div>

      {/* ── THE SLATE ─────────────────────────────────────────────────────────
          One card per game, each carrying its own simulation and its own full report. */}
      <section aria-labelledby="nfl-slate" id="nfl-slate" className="scroll-mt-24">
        <SectionHeader
          eyebrow={weekLabel ? "This week" : slateDay ? `Slate · ${slateDay}` : "Slate"}
          title={
            slateGames.length === 0
              ? "No slate in the capture window"
              : weekLabel
                ? `${weekLabel} — ${slateGames.length} game${slateGames.length === 1 ? "" : "s"}`
                : `${slateLabel} — ${slateGames.length} game${slateGames.length === 1 ? "" : "s"}`
          }
          sub={
            slateGames.length === 0
              ? "No scheduled games remain in the committed schedule capture. Nothing is invented to fill this space."
              : `The full ${weekLabel ?? "slate"}: ${simulatedOnSlate} of ${slateGames.length} carry a published simulation${weekCounts.missedPreEvent ? `, ${weekCounts.missedPreEvent} missed pre-event coverage` : ""}.`
          }
          rightSlot={experimentalChip}
        />
        {/* P246 §3 (founder): the week reads as ONE COMPACT TABLE, not a wall of cards —
            kickoff, matchup, the model's winner, the derived score/total pair, readiness, one
            action. Guard-held absence copy lives in the readiness cell. Prices are NOT a column
            here: they carry their own section below, rendered only from a current authorized
            capture, so this table never mixes a book's number into a row of model output. (This
            comment used to say no such capture existed because the authorization had expired; the
            receipt was renewed 2026-09-10 and the price section does render. The reason for keeping
            prices out of this table was never the absence of prices.) */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                {["Kickoff (ET)", "Matchup", "Model winner", "Projected score", "Total", "Conditions", "Status", ""].map((h) => (
                  <th key={h || "action"} scope="col" style={{ textAlign: "left", padding: "7px 9px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slateGames.map((g) => {
                const e = eventById.get(g.providerEventId);
                const sim = e?.projectedScore ?? null;
                const wx = weatherByEvent.get(String(g.providerEventId)) ?? null;
                /* P252: the EFFECTIVE lifecycle. The stamp is written when the event window runs
                   and not re-examined until the next one, so this table said "scheduled" beside a
                   game that had kicked off three hours earlier. */
                const started = e ? hasStarted({ ...e, kickoffUtc: e.kickoffUtc ?? g.dateUtc }, nowIso) : false;
                /* the favourite is pHome vs pAway — the same rule coherence.mjs holds (P245) */
                const fav = e?.winProbability
                  ? e.winProbability.home >= e.winProbability.away
                    ? { abbr: g.home.abbr, p: e.winProbability.home }
                    : { abbr: g.away.abbr, p: e.winProbability.away }
                  : null;
                const td = (extra: Record<string, string | number> = {}) => ({ padding: "8px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, ...extra });
                return (
                  <tr key={g.providerEventId}>
                    <td className="font-mono" style={td({ color: "var(--vault-text-mute)", fontSize: 11.5, whiteSpace: "nowrap" })}>{etKickoff(g.dateUtc)}</td>
                    <td style={td({ fontSize: 13 })}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <TeamLogo team={g.away.abbr} sport="nfl" size="sm" ariaLabel={`${g.away.name} logo`} />
                        {g.away.abbr} at
                        <TeamLogo team={g.home.abbr} sport="nfl" size="sm" ariaLabel={`${g.home.name} logo`} />
                        {g.home.abbr}
                      </span>
                    </td>
                    <td className="font-mono" style={td()}>{fav ? `${fav.abbr} ${(fav.p * 100).toFixed(1)}%` : "—"}</td>
                    <td className="font-mono" style={td({ whiteSpace: "nowrap" })}>{sim ? `${g.away.abbr} ${sim.away} — ${sim.home} ${g.home.abbr}` : "—"}</td>
                    <td className="font-mono" style={td()}>{e?.total ? <>{e.total.median} <span style={{ color: "var(--vault-text-faint)" }}>({e.total.p10}–{e.total.p90})</span></> : "—"}</td>
                    {/* Conditions, not an input: the summary carries its own caveats (an unknown
                        roof says so inside the sentence), so the cell prints it whole. */}
                    <td style={td({ fontSize: 11, color: wx?.notableWind ? "var(--vault-warn)" : "var(--vault-text-mute)", maxWidth: 200 })}>
                      {wx?.summary ?? "—"}
                    </td>
                    <td style={td({ fontSize: 11, color: "var(--vault-text-mute)", maxWidth: 220 })}>
                      {started
                        ? sim ? "Kicked off · forecast frozen" : "Kicked off before a forecast was published — missed coverage, never backfilled."
                        : sim ? "Simulated · 10,000 runs" : "Simulation publishes closer to kickoff and says so here when it does."}
                    </td>
                    <td style={td({ whiteSpace: "nowrap" })}>
                      {sim ? (
                        <Link href={`/nfl/game/${g.providerEventId}/`} className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 10.5, color: "var(--vault-gold-bright)" }}>
                          View game →
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.6, color: "var(--vault-text-faint)", maxWidth: 760 }}>
          Projected scores come from the median total and margin, so they add up to the printed total.
        </p>
        {weather?.rows?.length ? (
          <p style={{ margin: "6px 0 0", fontSize: 11.5, lineHeight: 1.6, color: "var(--vault-text-faint)", maxWidth: 760 }}>
            Conditions are the forecast nearest kickoff, captured {String(weather.capturedAt).slice(0, 16).replace("T", " ")}Z.{" "}
            <strong>The model does not use them</strong> — no weather term enters the total or the win chance, and these
            are shown beside the forecast so you can see what it is not accounting for. {weather.attribution}
          </p>
        ) : null}
        {forecastArtifact?.generatedAt ? (
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 720 }}>
            Updated {etKickoff(forecastArtifact.generatedAt).replace(" ET", "")} ET · frozen pre-kickoff · <a href="#nfl-coverage" style={{ color: "var(--vault-gold-bright)" }}>Model details</a>
            {slateGames[0] ? <> · <Link href={`/nfl/week/${slateGames[0].seasonType}-${String(slateGames[0].week).padStart(2, "0")}/`} style={{ color: "var(--vault-gold-bright)" }}>Week permalink</Link></> : null}
          </p>
        ) : null}
      </section>

      {/* ── WEEKLY TOP BOARDS · P246 §3/§5 ─────────────────────────────────────
          Rendered VERBATIM from the canonical ranking owner. Top-N is a MAXIMUM, never a quota;
          a confirmed-out player never ranks; a withheld family names the exact bar it failed. */}
      {weeklyBoards?.boards?.length ? (
        <section aria-labelledby="nfl-boards" id="nfl-boards" className="scroll-mt-24">
          <SectionHeader
            eyebrow={weeklyBoards.scope.kind === "REMAINING_EVENTS" ? `This week · ${weeklyBoards.scope.eventsIncluded} games left` : "This week"}
            title="Weekly top boards"
            sub={`Ranked across ${weeklyBoards.scope.kind === "REMAINING_EVENTS" ? `the ${weeklyBoards.scope.eventsIncluded} games still to kick off (${weeklyBoards.scope.eventsDroppedAfterKickoff} dropped after kickoff)` : "every game this week"} by one ranking owner. A top-N table is a maximum, not a quota — fewer qualified players publish fewer rows, and a player listed out never ranks here.`}
            rightSlot={experimentalChip}
          />
          {/* P251-F5: the board block moved to a client component so it can be filtered by team
              and by player name. Same rows, same ranking, same states — the chips narrow what is
              SHOWN and never re-rank, and a board with no matching row says so instead of
              vanishing. The hub carried no control of any kind before this. */}
          {/*
            PROJECTED AT THE BOUNDARY, NOT PASSED WHOLE (P229's lesson, applied here).
            Handing the artifact's board objects to a client component serialises EVERY field into
            the RSC payload — including `basis`, which carries internal model ids the public page
            must never carry. This ships the fields the component actually renders and nothing else.
          */}
          <NflWeeklyBoards boards={weeklyBoards.boards.map((b: { id: string; title: string; state: string; reason?: string; rows?: Array<Record<string, unknown>> }) => ({
            id: b.id,
            title: b.title,
            state: b.state,
            reason: b.reason,
            rows: (b.rows ?? []).map((r) => ({
              playerId: String(r.playerId), name: String(r.name), team: String(r.team), opponent: String(r.opponent),
              kickoffUtc: String(r.kickoffUtc), providerEventId: String(r.providerEventId),
              value: Number(r.value), median: r.median as number | undefined,
              p10: r.p10 as number | undefined, p90: r.p90 as number | undefined,
            })),
          }))}
            /* P251-F9: abbr → published club name, from the forecast artifact — the follow store
               and the search index both key on the name, and no second identity space is made. */
            teamNames={Object.fromEntries((forecastArtifact?.forecasts ?? []).flatMap((x: { home?: { abbr?: string; name?: string }; away?: { abbr?: string; name?: string } }) =>
              [x.home, x.away].filter((t): t is { abbr: string; name: string } => !!t?.abbr && !!t?.name).map((t) => [t.abbr, t.name])))}
          />
        </section>
      ) : null}

      {/* ── GAME REPORTS · P234 · Release I ───────────────────────────────────────────────────
           `/nfl/game/[eventId]` is statically generated for every forecast this project has
           published, and until now NOTHING in the export linked to it. The route was reachable
           only by typing it. That is the same defect Program 178 recorded for the Simulate lobby —
           "discovery was the defect; the artifacts were real" — and it is worth fixing on its own
           terms rather than waiting for a slate that makes it look busy.

           Each row states the game's OWN state, so a settled preseason report is offered as what it
           is: a frozen pre-event forecast beside a played game, never a current read. */}
      {(forecastArtifact?.forecasts ?? []).length ? (
        <section aria-labelledby="nfl-reports" id="nfl-reports" className="scroll-mt-24">
          <SectionHeader
            eyebrow="Per-game reports"
            title="Every forecast we published"
            sub="Each one shows what the model said before kickoff, and is labelled with where that game now stands."
          />
          <ul className="mt-3 flex flex-col gap-2 m-0 p-0" style={{ listStyle: "none" }}>
            {((forecastArtifact?.forecasts ?? []) as Array<{
              providerEventId: string; matchup: string; kickoffUtc: string; seasonType: number; week: number;
            }>)
              .slice()
              .sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc))
              .slice(0, 12)
              .map((f) => {
                const ev = eventById.get(f.providerEventId);
                const played = hasStarted({ lifecycle: ev?.lifecycle, kickoffUtc: ev?.kickoffUtc ?? f.kickoffUtc }, nowIso);
                return (
                  <li key={f.providerEventId}>
                    <Link
                      href={`/nfl/game/${f.providerEventId}/`}
                      className="vault-glow-hover flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[10px] px-3 py-2.5 no-underline"
                      style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", color: "inherit" }}
                    >
                      <span style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 650 }}>{f.matchup}</span>
                      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
                        {/* ET, like every other date on this site. `kickoffUtc.slice(0,10)` printed the
                            UTC calendar day, so every night game was listed a day late: the games
                            list said "Mon, Sep 14 · 8:15 PM ET" for DEN at KC and this list said
                            2026-09-15 for the same kickoff. */}
                        {etDay(f.kickoffUtc)} · {f.seasonType === 1 ? "preseason" : "regular season"} week {f.week}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]"
                        style={{ fontSize: 9, color: played ? "var(--vault-text-mute)" : "var(--vault-gold-bright)", background: "var(--vault-wash-soft)" }}
                      >
                        {played ? "played · frozen forecast" : "upcoming"}
                      </span>
                      <span className="ml-auto font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>
                        Open report →
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}

      {laterGames.length ? (
        <section aria-labelledby="nfl-later" id="nfl-later">
          <SectionHeader
            eyebrow="Schedule"
            title={laterTitle}
            sub={schedule ? `From the committed schedule capture (${schedule.generatedAt}). Simulations publish inside each game's own event window, not weeks ahead.` : "No schedule capture is readable — shown as missing rather than guessed."}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {laterGames.map((g) => (
              <EventCard
                key={g.providerEventId}
                sport="nfl"
                away={{ abbr: g.away.abbr, name: g.away.name }}
                home={{ abbr: g.home.abbr, name: g.home.name }}
                kickoffLabel={etKickoff(g.dateUtc)}
                meta={g.venue}
                eyebrow={`${seasonContextFor(g).state.replace(/_/g, " ").toLowerCase()} · week ${g.week}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      {vault && (vault.watchlist?.length || vault.selections?.length) ? (
        <section aria-labelledby="nfl-vault" id="nfl-vault" className="scroll-mt-24">
          <SectionHeader
            eyebrow="Players"
            title="Endzone Vault"
            rightSlot={
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--sport-nfl)", border: "1px solid var(--vault-border)", borderRadius: 6, padding: "2px 6px" }}>
                {vault.state === "ACTIVE" ? "CARD" : "WATCHLIST"}
              </span>
            }
            /* P250-GD5 (founder): one line says what the section is. The badge beside the title
               already reads WATCHLIST or CARD; repeating that in prose — three times, as this did —
               costs the reader and tells them nothing the badge did not. The full evaluation and
               pricing state stay one click away in Coverage and on /methodology. */
            sub="Who our model thinks is most likely to score"
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  {["Player", "Game", "Chance to score", "Playing time"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(vault.state === "ACTIVE" ? vault.selections : vault.watchlist).slice(0, 8).map((c) => (
                  <tr key={c.playerId}>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>
                      {/* P177-B: the shared portrait, keyed by the ESPN athlete id already inside
                          the Vault's own playerId ("nfl-athlete-4430807"). A dead id 404s cleanly
                          and falls to the initials disc — the same policy every other sport uses. */}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <PlayerAvatar playerId={espnAthleteId(c.playerId)} playerName={c.name} team={c.team} sport="nfl" size="sm" />
                        <span>
                          {c.name} <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{c.position ?? ""} · {c.team}</span>
                        </span>
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12, color: "var(--vault-text-mute)" }}>{c.event}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{(c.tdProbability * 100).toFixed(1)}%</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 11.5, color: "var(--vault-text-mute)" }}>
                      {c.roleState === "ACTIVE_EXPECTED" ? "Expected to play" : "Playing time unknown"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {slateMarketRows.length ? (
        <section aria-labelledby="nfl-markets" id="nfl-markets" className="scroll-mt-24">
          <SectionHeader
            eyebrow={`Prices · captured ${markets.capturedAt}`}
            title="Sportsbook prices for this slate"
            sub="These are the sportsbooks' own numbers, shown as facts with attribution — captured before every kickoff below, and GameTimePicks publishes no NFL prediction beside them. The win percentages are each book's price with its margin removed, then the median across books; they describe the market, not a forecast of ours."
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  {["Game", "Kickoff", "Books", "Market win % (home / away)", "Spread (home)", "Total"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slateMarketRows.map((r) => (
                  <tr key={r.providerEventId}>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <TeamLogo team={r.away.abbr} sport="nfl" size="sm" ariaLabel={`${r.away.name} logo`} />
                        {r.away.abbr} at
                        <TeamLogo team={r.home.abbr} sport="nfl" size="sm" ariaLabel={`${r.home.name} logo`} />
                        {r.home.abbr}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{etKickoff(r.kickoffUtc)}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{r.books.length}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{pct(r.consensus.homeWinProbNoVig)} / {pct(r.consensus.awayWinProbNoVig)}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{typeof r.consensus.spreadHome === "number" ? r.consensus.spreadHome.toFixed(1) : "—"}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{typeof r.consensus.total === "number" ? r.consensus.total.toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 700 }}>
            Source: The Odds API, median across the captured books per game. Prices move after capture;
            the stamp above is the moment these were read, and nothing here is a recommendation to wager.
            {propAbsence ? " The same authorized capture probed player markets for this window and found none offered — so no player or touchdown prices appear anywhere on this page." : ""}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="nfl-results" id="nfl-results" className="scroll-mt-24">
        <SectionHeader
          eyebrow="Results"
          title="Recent finals"
          sub="Finals join by durable event identity; a result without pre-event schedule lineage is quarantined and reported, never settled."
        />
        {finals.length ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {finals.map((r: { providerEventId: string; shortName: string; dateUtc: string; ftHome: number; ftAway: number; home: { abbr: string }; away: { abbr: string } }) => (
              <li key={r.providerEventId} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
                <TeamLogo team={r.away?.abbr} sport="nfl" size="sm" />
                <span style={{ fontSize: 13 }}>{r.away?.abbr} {r.ftAway} — {r.ftHome} {r.home?.abbr}</span>
                <TeamLogo team={r.home?.abbr} sport="nfl" size="sm" />
                <span style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>final · {r.dateUtc.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>No finals in the current capture window{results ? ` (captured ${results.generatedAt})` : ""}.</p>
        )}
      </section>

      {/*
        RECENT FINALS SHOWED SCORES AND NOT PICKS. A reader could see how the games ended and
        nothing about how the model's forecasts for those games did — the half that flatters,
        published alone. These rows come from the experimental settlement ledger, which is where
        those forecasts are already graded, and they carry its terms: the team model has cleared no
        preregistered bar, and a tie is recorded as void rather than as a miss.
      */}
      {nflGraded ? <GradedPicksSection record={nflGraded} href="/results/picks/nfl" /> : null}
      {/* The interval label's own track record, beside the record of the picks. */}
      <IntervalCalibrationPanel cal={nflCalibration} />

      <section aria-labelledby="nfl-coverage" id="nfl-coverage" className="scroll-mt-24">
        <SectionHeader
          eyebrow="Status"
          title="Coverage, market by market"
          sub="Readiness is stated per layer — a page section is never filled merely because it exists."
        />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                {["Layer", "Status", "What that means"].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.layer}>
                  <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>{c.layer}</td>
                  <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 11.5, fontFamily: "var(--font-mono, monospace)", color: c.state === "LIVE" || c.state === "DEPLOYED" ? "var(--gtp-success-on-dark)" : "var(--vault-text-mute)" }}>{c.state}</td>
                  <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* P250-GD5: the player-families narrative section is retired. Its artifact
          (nfl/player-families-public.json) has NO generator — it was written once on 2026-08-14 and
          froze, so a month later it was still telling readers on a live regular-season page that we
          publish no per-player projections "for this weekend" while the player board beside it
          published them. The same facts, derived and current, are in the Coverage table (from
          model-status.json) and on /methodology; a page does not need a third copy, least of all a
          stale one. */}

      {participation ? (
        <section aria-labelledby="nfl-participation" id="nfl-participation">
          <SectionHeader
            eyebrow={`Playing time · ${participation.eventsCovered} games`}
            title={participation.headline}
            sub={participation.whyNotKnown}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            {[["What we do instead", participation.whatWeDoInstead], ["Why it matters", participation.whyItMatters]].map(([h, body]) => (
              <article key={h} style={{ border: "1px solid var(--vault-border)", borderRadius: 12, padding: "12px 14px" }}>
                <p style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</p>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>{body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {pregameAudit ? (
        <section aria-labelledby="nfl-audit" id="nfl-audit">
          <SectionHeader
            eyebrow={`Graded · ${pregameAudit.etDate}`}
            title={pregameAudit.headline}
            sub={`${pregameAudit.whatThisIs} ${pregameAudit.honestLimit}`}
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  {["Game", "We said", "Result", "Margin off by", "Total off by", "Inside our range"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pregameAudit.games.map((g) => (
                  <tr key={g.matchup}>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>
                      {g.matchup}{g.tie ? <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}> · tie</span> : null}
                    </td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)" }}>{g.predicted}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{g.actual}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{g.marginError}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{g.totalError}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12, color: g.inRange ? "var(--gtp-success-on-dark)" : "var(--vault-text-mute)" }}>{g.inRange ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl style={{ margin: "12px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px 16px", fontSize: 12.5 }}>
            <div><dt style={{ color: "var(--vault-text-faint)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Winners called</dt>
              <dd style={{ margin: "2px 0 0", fontFamily: "var(--font-mono, monospace)" }}>{pregameAudit.winnersCorrect} of {pregameAudit.decisiveGames}{pregameAudit.ties > 0 ? ` (${pregameAudit.ties} tie excluded)` : ""}</dd></div>
            <div><dt style={{ color: "var(--vault-text-faint)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Score off by, on average</dt>
              <dd style={{ margin: "2px 0 0", fontFamily: "var(--font-mono, monospace)" }}>{pregameAudit.teamScoreAverageError} points</dd></div>
            <div><dt style={{ color: "var(--vault-text-faint)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Result inside our range</dt>
              <dd style={{ margin: "2px 0 0", fontFamily: "var(--font-mono, monospace)" }}>margin {Math.round(pregameAudit.rangeHitRate.margin * 100)}% · total {Math.round(pregameAudit.rangeHitRate.total * 100)}% <span style={{ color: "var(--vault-text-faint)" }}>(aiming for {Math.round(pregameAudit.rangeHitRate.target * 100)}%)</span></dd></div>
          </dl>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)", maxWidth: 720 }}>
            {pregameAudit.versusSportsbooks}
          </p>
        </section>
      ) : null}

      {differentiation ? (
        <section aria-labelledby="nfl-differentiation" id="nfl-differentiation">
          <SectionHeader
            eyebrow="What this model knows"
            title={differentiation.headline}
            sub={differentiation.whyGamesLookAlike}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            {differentiation.heads.map((h) => (
              <article key={h.head} style={{ border: "1px solid var(--vault-border)", borderRadius: 12, padding: "12px 14px" }}>
                <p style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
                  {h.head}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>{h.plainEnglish}</p>
              </article>
            ))}
          </div>
          {/* P250-GD5 (founder): the model's own read stays above; the engineering narrative — what
              we found, what we tried, what would change it — moves behind one click. A reader who
              wants it gets all of it; everyone else gets the model's answer and moves on. */}
          {(differentiation.whatWeFoundAndFixed || differentiation.weTriedToFixIt || differentiation.whatWouldChangeIt) ? (
            <details style={{ marginTop: 12, border: "1px solid var(--vault-rule)", borderRadius: 10, padding: "8px 12px", maxWidth: 760 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--vault-text-mute)", minHeight: 32 }}>
                How we tested this
              </summary>
              {differentiation.whatWeFoundAndFixed ? (
                <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
                  <strong style={{ color: "var(--vault-text-mute)" }}>What we found and fixed:</strong> {differentiation.whatWeFoundAndFixed}
                </p>
              ) : null}
              {differentiation.weTriedToFixIt ? (
                <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
                  {differentiation.weTriedToFixIt.what} {differentiation.weTriedToFixIt.result} {differentiation.weTriedToFixIt.decision}
                </p>
              ) : null}
              {differentiation.whatWouldChangeIt ? (
                <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>{differentiation.whatWouldChangeIt}</p>
              ) : null}
            </details>
          ) : null}
        </section>
      ) : null}

      {productReceipts ? (
        <section aria-labelledby="nfl-product-receipts" id="nfl-product-receipts">
          <SectionHeader
            eyebrow={`Products · run ${productReceipts.runId} · next ${productReceipts.nextRunUtc}`}
            title="All four NFL lanes ran today"
            sub={productReceipts.plainEnglish}
          />
          <details style={{ border: "1px solid var(--vault-rule)", borderRadius: 10, padding: "8px 12px" }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--vault-text-mute)", minHeight: 32 }}>Per-product detail</summary>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  {["Product", "Result", "Candidates looked at", "Why none qualified"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productReceipts.lanes.map((l) => (
                  <tr key={l.product}>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>{l.label}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 11.5, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)" }}>{l.state}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{l.candidatesConsidered}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, lineHeight: 1.55, color: "var(--vault-text-mute)" }}>
                      {l.rejections.map((r) => `${r.count} × ${r.label}`).join("; ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </details>
          <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)", maxWidth: 760 }}>
            <strong style={{ color: "var(--vault-text)" }}>What would change this:</strong>{" "}
            {productReceipts.overDetermined.gates.join("; ")}.
          </p>
        </section>
      ) : null}

      {productEligibility ? (
        <section aria-labelledby="nfl-products" id="nfl-products">
          <SectionHeader
            eyebrow={`Evaluated ${productEligibility.generatedAt}`}
            title="Why NFL is not in the paper products"
            sub={productEligibility.plainEnglish}
          />
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {(productEligibility.products.find((p) => p.whatWouldQualify.length)?.whatWouldQualify ?? []).map((w) => (
              <li key={w} style={{ fontSize: 12.5, color: "var(--vault-text-mute)", display: "flex", gap: 8 }}>
                <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>·</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 700 }}>
            This evaluation runs on every NFL event window and is recorded, so the answer for any past
            day stays recoverable. The same gate is enforced in the money path itself — an ineligible
            sport is refused there too, not merely omitted from the pool.
          </p>
        </section>
      ) : null}

      {/* P177-A: the shared 4-card action rail /mlb ends on. Every href is a real route. */}
      <QuickActionRail
        heading="Where to go next"
        cards={[
          { href: "/methodology", eyebrow: "Method", title: "How this works", sub: "What the model does — and cannot do." },
          { href: "/results", eyebrow: "Record", title: "Tracked results", sub: "Every forecast graded against the official result." },
          { href: "/sports", eyebrow: "Coverage", title: "All sports", sub: "What is live and what is deliberately not." },
          { href: "/mlb", eyebrow: "MLB", title: "MLB hub", sub: "The settled, longer-running side of the site." },
        ]}
      />

      {/* This paragraph used to read "No NFL models, simulations, or picks are published on this
          site." That stopped being true the day the public beta shipped, and a page that contradicts
          its own contents is exactly the failure the canonical index exists to prevent. */}
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 680 }}>
        The NFL simulations on this page are published as experimental and are never presented as
        picks. Player markets and the Endzone Vault stay gated on their own separate evidence —
        team readiness never auto-publishes a player market. See{" "}
        <Link href="/methodology" style={{ color: "var(--sport-nfl)" }}>methodology</Link> and{" "}
        <Link href="/sports" style={{ color: "var(--sport-nfl)" }}>all sports coverage</Link>.
      </p>
    </div>
  );
}
