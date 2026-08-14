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
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import EventCard from "@/components/event-card";
import PlayerAvatar from "@/components/player-avatar";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import SportOverviewHero from "@/components/sport-overview-hero";
import TeamLogo from "@/components/team-logo";
import FreshnessBadge from "@/components/ui/freshness-badge";
import { currentEtDate } from "@/lib/freshness";
import { getSportIdentity } from "@/lib/sport-identity";
import { seasonContextFor } from "@/lib/sports/nfl/season-context.mjs";

export const metadata: Metadata = {
  title: "NFL Hub — Slate, Experimental Simulations & Coverage Status · GameTime Picks",
  description:
    "Every game on the next NFL slate with its experimental preseason simulation, the sportsbook prices captured before kickoff, and an honest market-by-market coverage table. Educational and paper-only.",
};

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

export default function NflHubPage() {
  const schedule = read("nfl/schedule/latest.json");
  const results = read("nfl/results/latest.json");
  const markets = read("nfl/markets/latest.json");
  const index = read("nfl/index.json");
  // P180-A: how the last slate's frozen forecasts actually did. Published because a model that only
  // shows its predictions and never its grades is asking to be taken on trust.
  // P182-A: the playing-time answer. Published because every player row on this page is only as
  // good as the participation assumption behind it, and ours is "we do not know, here is how much".
  // P183-B: all four player families were tested and rejected. Published because a site that shows
  // only the models that worked is not showing its work.
  const playerFamilies = read("nfl/player-families-public.json") as
    | { headline: string; whatWeTested: string; theCompetitor: string; whatItMeans: string;
        noMarketAnyway: string; results: Array<{ family: string; n: number; verdict: string; why: string }> }
    | null;
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
  const productEligibility = read("nfl/product-eligibility.json") as
    | { generatedAt: string; plainEnglish: string; consideredEvents: number;
        products: Array<{ product: string; label: string; state: string; eligible: boolean; reason: string; whatWouldQualify: string[] }> }
    | null;
  const finals = (results?.rows ?? []).filter((r: { statusRaw: string }) => /^STATUS_FINAL/.test(r.statusRaw));

  // market rows are pre-kickoff facts by construction: keep only rows whose capture precedes
  // their own kickoff (a static truth that cannot rot), sorted by kickoff.
  const marketRows: MarketRow[] = ((markets?.rows ?? []) as MarketRow[])
    .filter((r) => markets?.capturedAt && r.kickoffUtc && markets.capturedAt < r.kickoffUtc)
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
  const anchorUtc: string | null = index?.nextKickoffUtc ?? allScheduled[0]?.dateUtc ?? null;
  const slateDay = anchorUtc ? etDay(anchorUtc) : null;
  const slateGames = slateDay ? allScheduled.filter((r) => etDay(r.dateUtc) === slateDay) : [];
  const laterGames = slateDay ? allScheduled.filter((r) => etDay(r.dateUtc) > slateDay).slice(0, 9) : allScheduled.slice(0, 9);
  const simulatedOnSlate = slateGames.filter((g) => eventById.get(g.providerEventId)?.projectedScore).length;

  const forecastArtifact = read("nfl/forecasts/latest.json");
  const forecastCard = forecastArtifact?.modelCard ?? null;
  // per-event calibration sentence, keyed the same way the index keys events
  const calibrationById = new Map<string, string>(
    ((forecastArtifact?.forecasts ?? []) as Array<{ providerEventId: string; forecastSummary: { winProbability: { calibration: string } } }>)
      .map((f) => [f.providerEventId, f.forecastSummary.winProbability.calibration]),
  );

  // P174-E: End Zone Vault. Renders only when the evaluator produced candidates; a NO_VAULT or
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
    layerRow("Anytime touchdown · End Zone Vault", modelStatus?.anytimeTd, "no calibration receipt on file"),
    { layer: "Settlement", state: "DEPLOYED", detail: "team and scorer settlement contracts are deployed and tested; the first matching pre-event artifacts settle exactly once when they exist" },
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
    <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-gold)", border: "1px solid var(--vault-border)", borderRadius: 6, padding: "2px 6px", verticalAlign: "middle" }}>
      EXPERIMENTAL
    </span>
  );

  return (
    // P176: adopt the SHARED application shell /mlb uses (vault-page-shell, 1440px) instead of
    // a 900px document. Same class, same padding scale, same overflow guard — the largest single
    // parity gap in the ledger, closed by using the existing owner rather than a fork.
    // A DIV, not a <main>: the app layout already provides the single main landmark, which is
    // exactly why /mlb wraps in a div too. Using <main> here produced two landmarks.
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden flex flex-col gap-10">
      {/* P177-A: the shared sport hero. The freshness badge rides in the badge slot and
          re-derives the REAL browser ET date after mount, so a slate page left open overnight
          stops claiming to be today's. */}
      <SportOverviewHero
        eyebrow="NFL · public beta"
        sport="NFL"
        tagline="Experimental preseason simulations"
        accent="nfl"
        icon={identity.icon}
        iconGradient={identity.gradient}
        iconLabel={identity.ballLabel}
        statusKind={simulatedOnSlate > 0 ? "live" : slateGames.length > 0 ? "linesPending" : "upcoming"}
        statusCaption={slateGames.length > 0 ? `${slateGames.length} game${slateGames.length === 1 ? "" : "s"}` : undefined}
        matchupLine={slateDay ? `${slateLabel} · ${slateGames.length} game${slateGames.length === 1 ? "" : "s"} on the slate` : undefined}
        badge={<FreshnessBadge slateDate={slateDay} serverToday={currentEtDate()} noun="slate" />}
        stats={[
          { label: "Games on the slate", value: String(slateGames.length), sub: slateDay ?? "no capture" },
          { label: "Simulated", value: String(simulatedOnSlate), sub: simulatedOnSlate > 0 ? "10,000 runs each" : "none published" },
          { label: "Sportsbook prices", value: String(index?.counts?.marketEvents ?? marketRows.length), sub: markets?.capturedAt ? `captured ${markets.capturedAt.slice(11, 16)}Z` : "no capture" },
        ]}
        ctas={[
          { href: "#nfl-slate", label: "See the slate", primary: true },
          { href: "#nfl-markets", label: "Sportsbook prices" },
        ]}
        framing="Experimental, educational, paper-only. This model has not been shown to beat the sportsbook market — nothing here is a pick or a recommendation to wager."
      />

      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--text-dim, var(--text-mute))", maxWidth: 680 }}>
        Everything on this page derives from committed public captures. We publish experimental
        preseason simulations — not picks, and not a claim to beat the sportsbook market: this model
        forecast winners barely better than a coin flip when tested on a season it had never seen,
        so its win percentages sit deliberately close to even. The coverage table below states each
        layer&apos;s exact status and the reason, in words.
      </p>

      {/* ── THE SLATE ─────────────────────────────────────────────────────────
          One card per game, each carrying its own simulation and its own full report. */}
      <section aria-labelledby="nfl-slate" id="nfl-slate">
        <SectionHeader
          eyebrow={slateDay ? `Slate · ${slateDay}` : "Slate"}
          title={slateGames.length === 0 ? "No slate in the capture window" : `${slateLabel} — ${slateGames.length} game${slateGames.length === 1 ? "" : "s"}`}
          sub={
            slateGames.length === 0
              ? "No scheduled games remain in the committed schedule capture. Nothing is invented to fill this space."
              : `Every game on this slate, with the simulation we published for it before kickoff. ${simulatedOnSlate} of ${slateGames.length} are simulated; a game without one says so rather than showing a blank. ${forecastCard?.honestLimit ?? ""}`
          }
          rightSlot={experimentalChip}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
          {slateGames.map((g) => {
            const e = eventById.get(g.providerEventId);
            const sim = e?.projectedScore ?? null;
            const started = e?.lifecycle === "STARTED" || e?.lifecycle === "SETTLED";
            return (
              <EventCard
                key={g.providerEventId}
                sport="nfl"
                away={{ abbr: g.away.abbr, name: g.away.name, score: sim ? sim.away : undefined }}
                home={{ abbr: g.home.abbr, name: g.home.name, score: sim ? sim.home : undefined }}
                scoreCaption="projected"
                kickoffLabel={etKickoff(g.dateUtc)}
                meta={g.venue}
                eyebrow={`${seasonContextFor(g).state.replace(/_/g, " ").toLowerCase()} · week ${g.week}`}
                badge={
                  started ? (
                    <span className="font-mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--vault-text-faint)" }}>KICKED OFF</span>
                  ) : sim ? (
                    <span className="font-mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--vault-gold)" }}>SIMULATED</span>
                  ) : null
                }
                href={sim ? `/nfl/game/${g.providerEventId}` : undefined}
                hrefLabel="Open full simulation →"
                footnote={sim ? calibrationById.get(g.providerEventId) : "No simulation was published for this game."}
              >
                {sim && e?.winProbability && e?.total ? (
                  <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", fontSize: 12 }}>
                    <dt style={{ color: "var(--vault-text-faint)" }}>Win chance</dt>
                    <dd style={{ margin: 0, fontFamily: "var(--font-mono, monospace)" }}>
                      {g.away.abbr} {(e.winProbability.away * 100).toFixed(1)}% · {g.home.abbr} {(e.winProbability.home * 100).toFixed(1)}%
                    </dd>
                    <dt style={{ color: "var(--vault-text-faint)" }}>Total points</dt>
                    <dd style={{ margin: 0, fontFamily: "var(--font-mono, monospace)" }}>
                      {e.total.median} <span style={{ color: "var(--vault-text-faint)" }}>(likely {e.total.p10}–{e.total.p90})</span>
                    </dd>
                  </dl>
                ) : null}
              </EventCard>
            );
          })}
        </div>
        {forecastArtifact?.generatedAt ? (
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 720 }}>
            Simulations generated {forecastArtifact.generatedAt} under model {forecastArtifact?.model?.id} before every kickoff shown, and frozen at that moment — the forecast never changes after the fact, and each one is settled against the official result. {forecastCard?.whyPublishItAtAll}
          </p>
        ) : null}
      </section>

      {laterGames.length ? (
        <section aria-labelledby="nfl-later" id="nfl-later">
          <SectionHeader
            eyebrow="Schedule"
            title="Later this preseason"
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
        <section aria-labelledby="nfl-vault" id="nfl-vault">
          <SectionHeader
            eyebrow="Players"
            title="End Zone Vault"
            rightSlot={
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-gold)", border: "1px solid var(--vault-border)", borderRadius: 6, padding: "2px 6px" }}>
                {vault.state === "ACTIVE" ? "CARD" : "WATCHLIST"}
              </span>
            }
            sub={
              vault.state === "ACTIVE"
                ? vault.reason
                : `Who our model thinks is most likely to score. This is a watchlist, not a card — ${vault.reason.replace(/^\d+ model candidates, but no card: /, "")}`
            }
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
                      {c.roleState === "ACTIVE_EXPECTED" ? "Expected to play" : "Unknown — preseason"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 720 }}>
            These percentages never add to 100%: defences, special teams and unlisted players hold the rest. {vault.disclaimer}
          </p>
        </section>
      ) : null}

      {marketRows.length ? (
        <section aria-labelledby="nfl-markets" id="nfl-markets">
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
                {marketRows.map((r) => (
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

      <section aria-labelledby="nfl-results" id="nfl-results">
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

      <section aria-labelledby="nfl-coverage" id="nfl-coverage">
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
                  <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 11.5, fontFamily: "var(--font-mono, monospace)", color: c.state === "LIVE" || c.state === "DEPLOYED" ? "var(--gtp-success-on-dark, #7ee2a8)" : "var(--vault-text-mute)" }}>{c.state}</td>
                  <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {playerFamilies ? (
        <section aria-labelledby="nfl-player-families" id="nfl-player-families">
          <SectionHeader
            eyebrow="Player projections"
            title={playerFamilies.headline}
            sub={`${playerFamilies.whatWeTested} ${playerFamilies.theCompetitor}`}
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  {["Family", "Games of evidence", "Result", "Why"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerFamilies.results.map((r) => (
                  <tr key={r.family}>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>{r.family}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)" }}>{r.n.toLocaleString()}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 11.5, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)" }}>{r.verdict}</td>
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, lineHeight: 1.55, color: "var(--vault-text-mute)" }}>{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text)", maxWidth: 760 }}>
            {playerFamilies.whatItMeans}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 760 }}>
            {playerFamilies.noMarketAnyway}
          </p>
        </section>
      ) : null}

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
                    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12, color: g.inRange ? "var(--gtp-success-on-dark, #7ee2a8)" : "var(--vault-text-mute)" }}>{g.inRange ? "yes" : "no"}</td>
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
          {differentiation.whatWeFoundAndFixed ? (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)", maxWidth: 720 }}>
              <strong style={{ color: "var(--vault-text)" }}>What we found and fixed:</strong> {differentiation.whatWeFoundAndFixed}
            </p>
          ) : null}
          {differentiation.weTriedToFixIt ? (
            <div style={{ margin: "12px 0 0", padding: "12px 14px", border: "1px solid var(--vault-border)", borderRadius: 12, maxWidth: 760 }}>
              <p style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
                We tried to fix it — here is what happened
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
                {differentiation.weTriedToFixIt.what} {differentiation.weTriedToFixIt.bars}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text)" }}>
                {differentiation.weTriedToFixIt.result} {differentiation.weTriedToFixIt.decision}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)" }}>
                {differentiation.weTriedToFixIt.alsoLearned}
              </p>
            </div>
          ) : null}
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 720 }}>
            {differentiation.whatWouldChangeIt}
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
        picks. Player markets and the End Zone Vault stay gated on their own separate evidence —
        team readiness never auto-publishes a player market. See{" "}
        <Link href="/methodology" style={{ color: "var(--vault-gold)" }}>methodology</Link> and{" "}
        <Link href="/sports" style={{ color: "var(--vault-gold)" }}>all sports coverage</Link>.
      </p>
    </div>
  );
}
