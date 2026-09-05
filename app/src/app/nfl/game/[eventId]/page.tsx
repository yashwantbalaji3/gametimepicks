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
import SectionHeader from "@/components/section-header";
import PresentationLauncher from "@/components/simulate/presentation-launcher";
import { buildNflPresentation } from "@/lib/simulate/presentation/nfl";

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

/** The per-game simulation artifact: team opportunity plus one distribution per player family. */
type GameSim = {
  providerEventId: string;
  status: string;
  simulationSummary: { runCount: number };
  players: Array<{
    playerId: string; name: string; position: string | null; team: string; family: string;
    anytimeTdProbability: number | null; marketState: string;
    projections: Array<{ field: string; label: string; distribution: { p10: number; p50: number; p90: number; mean: number }; thresholds: Array<{ line: number; modelProbabilityOver: number }> }>;
  }>;
  conservation: { enforcedWithinDraw: string[]; notEnforcedAcrossFamilies: string };
};

const readPublic = (rel: string) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", rel), "utf8")); } catch { return null; }
};
const forecastArtifact = () => readPublic("nfl/forecasts/latest.json");
const indexArtifact = () => readPublic("nfl/index.json");

const etTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

export function generateStaticParams() {
  return (forecastArtifact()?.forecasts ?? []).map((f: Forecast) => ({ eventId: f.providerEventId }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  const f = (forecastArtifact()?.forecasts ?? []).find((x: Forecast) => x.providerEventId === params.eventId);
  if (!f) return { title: "NFL game · GameTime Picks" };
  return {
    title: `${f.matchup} — experimental simulation · GameTime Picks`,
    description: `A 10,000-run simulation of ${f.matchup}: projected score, win chance and total range, beside the sportsbook consensus. Experimental preseason model; educational and paper-only.`,
    alternates: { canonical: `/nfl/game/${f.providerEventId}` },
  };
}

export default function NflGameReport({ params }: { params: { eventId: string } }) {
  const artifact = forecastArtifact();
  const f: Forecast | undefined = (artifact?.forecasts ?? []).find((x: Forecast) => x.providerEventId === params.eventId);
  if (!f) notFound();

  const idx = indexArtifact();
  const idxEvent = (idx?.events ?? []).find((e: { providerEventId: string }) => e.providerEventId === params.eventId);
  // P183-F: the per-game simulation — team opportunity plus every player's distribution, from the
  // SAME joint process that produced the score above.
  const simArtifact = readPublic("nfl/game-simulations/latest.json") as { games: GameSim[] } | null;
  const sim: GameSim | undefined = (simArtifact?.games ?? []).find((g) => g.providerEventId === params.eventId);
  const lifecycle: string = idxEvent?.lifecycle ?? "UPCOMING";
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

  /*
   * THE PRESENTATION SOURCE. Built from the artifacts this page already read, deriving readiness
   * from the SAME `teamSignal` the header above uses — so the frame cannot call a game
   * simulation-ready while the section header beside it calls it baseline-only. Kickoff/lifecycle
   * come from the index; a started game presents its FROZEN pre-event forecast, labelled.
   */
  const presentation = buildNflPresentation(
    {
      providerEventId: f.providerEventId,
      canonicalEventId: `nfl-${f.providerEventId}`,
      matchup: f.matchup,
      kickoffUtc: f.kickoffUtc,
      home: f.home,
      away: f.away,
      lifecycle: started ? "STARTED" : "UPCOMING",
      locked: started,
      state: idxEvent?.state ?? (started ? "STARTED" : "PUBLIC_EXPERIMENTAL"),
      projectedScore: s.projectedScore,
      winProbability: { home: s.winProbability.home, away: s.winProbability.away },
      total: s.total,
      hasMarket: typeof mc.marketHomeWinPct === "number",
      venue: f.venue,
      playerCandidates: sim?.players?.length ?? 0,
      reportHref: `/nfl/game/${f.providerEventId}/`,
      readiness: f.teamSignal?.state === "APPLIED" ? "SIMULATION_READY" : "BASELINE_ONLY",
      simulationReady: f.teamSignal?.state === "APPLIED",
      readinessReason:
        f.teamSignal?.note ??
        (f.teamSignal?.state === "APPLIED"
          ? "Event-specific inputs measurably moved this game's distribution."
          : "No event-specific signal cleared the significance gate, so this run uses a shared prior."),
    },
    { indexGeneratedAt: f.generatedAt, runCount: f.model?.simulations ?? null, modelVersion: f.model?.id ?? null },
  );

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
        {started ? (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 720 }}>
            This game has kicked off. Everything below is exactly what was published before kickoff and has not been changed since — that is the point of keeping it.
          </p>
        ) : null}
        {/* P234 · C — the same control as the other three sports. A started game plays its frozen
            pre-event forecast, labelled as one; it is never re-presented as a current read. */}
        <div style={{ marginTop: 16 }}>
          <PresentationLauncher
            presentation={presentation}
            label={started ? "Play the frozen forecast" : "Play the game forecast"}
          />
        </div>
      </header>

      <section aria-labelledby="sim-summary" style={{ marginTop: 26 }}>
        {/* P179-A0: the report states its OWN readiness before showing a number. A page that leads
            with "19-18" and mentions the limitation three sections later has already made the
            claim. `teamSignal` is written by the significance gate, so this cannot drift from the
            engine that produced the distribution. */}
        <SectionHeader
          eyebrow={f.teamSignal?.state === "APPLIED" ? "Simulation" : "Simulation · BASELINE ONLY"}
          title={f.teamSignal?.state === "APPLIED" ? "What our model expects" : "What a league-average preseason game looks like"}
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
          <Stat label="Projected score" value={`${f.away.abbr} ${s.projectedScore.away} — ${s.projectedScore.home} ${f.home.abbr}`} sub="median of every simulated game" />
          <Stat label="Win chance" value={`${f.away.abbr} ${pct(s.winProbability.away)} · ${f.home.abbr} ${pct(s.winProbability.home)}`} sub={`ties ${pct(s.winProbability.tieMass)}`} />
          <Stat label="Total points" value={`${s.total.median}`} sub={`usually between ${s.total.p10} and ${s.total.p90}`} />
          <Stat label="Margin" value={`${s.margin.median > 0 ? "+" : ""}${s.margin.median}`} sub={`80% of games land ${s.margin.p10} to ${s.margin.p90}`} />
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 760, lineHeight: 1.6 }}>
          {s.winProbability.calibration}
        </p>
      </section>

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

      <section aria-labelledby="vs-market" style={{ marginTop: 26 }}>
        <SectionHeader eyebrow="Comparison" title="Us versus the sportsbooks" sub="two independent reads, shown side by side" />
        {mc.state === "MARKET_VIEW" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 12 }}>
              <Stat label="Our win chance" value={pct(s.winProbability.home)} sub={`${f.home.abbr} to win`} />
              <Stat label="Sportsbook win chance" value={pct(mc.marketHomeWinPct)} sub={`median of ${mc.books} books, margin removed`} />
              <Stat label="Difference" value={gapPp == null ? "—" : `${gapPp > 0 ? "+" : ""}${gapPp} pp`} sub="percentage points — a difference, not a recommendation" />
              <Stat label="Totals" value={`${s.total.median} vs ${mc.marketTotal ?? "—"}`} sub="our median against the market total" />
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 760, lineHeight: 1.6 }}>{mc.note}</p>
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>Prices captured {mc.capturedAt} — before kickoff.</p>
          </>
        ) : (
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{mc.note}</p>
        )}
      </section>

      {sim ? (
        <section aria-labelledby="sim-players">
          <SectionHeader
            eyebrow={`Player simulations · ${sim.players.length} players · ${sim.simulationSummary.runCount.toLocaleString()} runs`}
            title="Every player we can model, with the range"
            sub="Each row is a distribution from the same simulation that produced the score above — team volume, then each player's share of it, then efficiency. Wide ranges are the point: preseason playing time is genuinely uncertain, and these numbers carry that rather than hiding it."
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  {["Player", "Stat", "Low (10th)", "Projected", "High (90th)", "Model chance", "Any TD"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sim.players.flatMap((pl) =>
                  pl.projections.map((pr, i) => (
                    <tr key={`${pl.playerId}-${pr.field}`}>
                      <td style={{ padding: "6px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {i === 0 ? <>{pl.name} <span style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{pl.position ?? ""} · {pl.team}</span></> : ""}
                      </td>
                      <td style={{ padding: "6px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 12, color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{pr.label}</td>
                      <td style={{ padding: "6px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 12, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)" }}>{pr.distribution.p10}</td>
                      <td style={{ padding: "6px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>{pr.distribution.p50}</td>
                      <td style={{ padding: "6px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 12, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)" }}>{pr.distribution.p90}</td>
                      <td style={{ padding: "6px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 11.5, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)" }}>
                        {pr.thresholds.map((t) => `${Math.round(t.modelProbabilityOver * 100)}% over ${t.line}`).join(" · ")}
                      </td>
                      <td style={{ padding: "6px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 12, fontFamily: "var(--font-mono, monospace)" }}>
                        {i === 0 && pl.anytimeTdProbability != null ? `${(pl.anytimeTdProbability * 100).toFixed(1)}%` : ""}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 760 }}>
            No sportsbook offers NFL player markets for this game, so these are model-only research
            estimates with no price to compare against — we do not invent a line. Tested against a
            simple role baseline, none of these families beat it, which is why they are published as
            ranges rather than as picks. {sim.conservation.notEnforcedAcrossFamilies}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="how-read" style={{ marginTop: 26 }}>
        <SectionHeader eyebrow="Reading key" title="What these numbers mean" />
        <dl style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, fontSize: 12.5 }}>
          {[
            ["Projected score", "The middle outcome across every simulated game — not a prediction of the exact final."],
            ["Win chance", "How often each side won across the simulations, after the calibration described above."],
            ["80% range", "Eight in ten simulated games landed inside this band. Real games land outside it too."],
            ["pp (percentage points)", "The plain difference between two percentages. A gap is a difference, not an advantage."],
            ["Experimental", "This model has not been shown to be sharper than the sportsbook price. Its results are tracked openly."],
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
