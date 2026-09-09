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
import NflPlayerBoard, { type PlayerBoardArtifact } from "@/components/nfl/player-board";

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
    description: `A 10,000-run simulation of ${f.matchup}: projected score, win chance and total range, beside the sportsbook consensus. Experimental model; educational and paper-only.`,
    alternates: { canonical: `/nfl/game/${f.providerEventId}` },
  };
}

export default function NflGameReport({ params }: { params: { eventId: string } }) {
  const artifact = forecastArtifact();
  const f: Forecast | undefined = (artifact?.forecasts ?? []).find((x: Forecast) => x.providerEventId === params.eventId);
  if (!f) notFound();
  const playerBoard = ((): PlayerBoardArtifact | null => {
    try {
      return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/player-board", `${params.eventId}.json`), "utf8"));
    } catch { return null; }
  })();

  const idx = indexArtifact();
  const idxEvent = (idx?.events ?? []).find((e: { providerEventId: string }) => e.providerEventId === params.eventId);
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
      </header>

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
          <Stat label="Projected score" value={`${f.away.abbr} ${s.projectedScore.away} — ${s.projectedScore.home} ${f.home.abbr}`} sub="from the median total and margin, so the pieces add up" />
          <Stat label="Win chance" value={`${f.away.abbr} ${pct(s.winProbability.away)} · ${f.home.abbr} ${pct(s.winProbability.home)}`} sub={`ties ${pct(s.winProbability.tieMass)}`} />
          <Stat label="Total points" value={`${s.total.median}`} sub={`usually between ${s.total.p10} and ${s.total.p90}`} />
          <Stat label="Margin" value={`${s.margin.median > 0 ? "+" : ""}${s.margin.median}`} sub={`80% of games land ${s.margin.p10} to ${s.margin.p90}`} />
        </div>
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
        const availMark = (p: { participation: string }) =>
          p.participation === "ACTIVE_PROJECTED" ? "" : ` · ${p.participation.toLowerCase().replaceAll("_", " ")}`;
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
                    <span className="font-mono" style={{ color: "var(--gtp-bank-cta)", fontWeight: 700 }}>{(p.markets.anytime_td!.probability! * 100).toFixed(1)}%</span>
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
            {arrivalsOf(t.abbr).length ? (
              <div style={{ marginTop: 10 }}>
                <p className="font-mono" style={{ margin: 0, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-warn)" }}>New arrivals · not in these numbers</p>
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>Per game at their previous club — history, not a projection.</p>
                {arrivalsOf(t.abbr).map((a) => (
                  <p key={a.playerId} style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                    <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{a.name}</span>{" "}
                    <span className="font-mono" style={{ color: "var(--vault-text-mute)" }}>
                      {a.lastSeason.targetsPg > 0 ? `${a.lastSeason.receptionsPg} rec · ${a.lastSeason.recYdsPg} yds` : a.lastSeason.passAttPg >= 1 ? `${a.lastSeason.passYdsPg} pass yds` : `${a.lastSeason.rushYdsPg} rush yds`}/g at {a.lastSeason.club}
                    </span>
                  </p>
                ))}
              </div>
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
          <NflPlayerBoard board={playerBoard} teams={[f.away.abbr, f.home.abbr]} />

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
                      <strong style={{ color: "var(--gtp-bank-cta)" }}>{(p.markets.anytime_td!.probability! * 100).toFixed(1)}%</strong>{" "}
                      <span style={{ color: "var(--vault-text)" }}>{p.name}</span> · {p.team}
                      {p.participation !== "ACTIVE_PROJECTED" ? <span style={{ color: "var(--vault-text-faint)" }}> · {p.participation.toLowerCase().replaceAll("_", " ")}</span> : null}
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
