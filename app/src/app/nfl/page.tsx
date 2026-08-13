/**
 * /nfl — NFL hub (Program 169 · Release J; market layer Program 171 · Release F). PUBLIC.
 *
 * The honest first-class NFL surface: the REAL slate and results from committed captures, plus —
 * when an authorized capture exists — the current market prices as FACTS with provenance
 * (per-event de-vigged consensus, book counts, absolute capture stamps), and a coverage table
 * that states each product layer's exact typed state and reason. Nothing here is a prediction:
 * team research is PRIVATE and evidence-gated (the repository's activation contract), player
 * markets abstain while preseason participation is unverified, and sportsbook prices are never
 * presented as GameTimePicks output. The /sports directory design rule carries over — coverage
 * in words, absolute capture times, no liveness theater, an explicit no-picks line.
 *
 * Data: build-time reads of COMMITTED PUBLIC artifacts only (no network, no private research).
 */
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import TeamLogo from "@/components/team-logo";
import { seasonContextFor } from "@/lib/sports/nfl/season-context.mjs";

export const metadata: Metadata = {
  title: "NFL Hub — Schedule, Results & Coverage Status · GameTime Picks",
  description:
    "The NFL slate from committed schedule captures, recent finals, and an honest market-by-market coverage table. Educational and paper-only; no NFL predictions are published.",
};

const read = (rel: string) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", rel), "utf8")); } catch { return null; }
};

const etKickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

type MarketRow = {
  providerEventId: string;
  kickoffUtc: string;
  home: { abbr: string; name: string };
  away: { abbr: string; name: string };
  books: Array<{ book: string }>;
  consensus: { homeWinProbNoVig: number | null; awayWinProbNoVig: number | null; spreadHome: number | null; total: number | null };
};

export default function NflHubPage() {
  const schedule = read("nfl/schedule/latest.json");
  const results = read("nfl/results/latest.json");
  const markets = read("nfl/markets/latest.json");
  const upcoming = (schedule?.rows ?? [])
    .filter((r: { statusRaw: string }) => r.statusRaw === "STATUS_SCHEDULED")
    .sort((a: { dateUtc: string }, b: { dateUtc: string }) => a.dateUtc.localeCompare(b.dateUtc))
    .slice(0, 12);
  const finals = (results?.rows ?? []).filter((r: { statusRaw: string }) => /^STATUS_FINAL/.test(r.statusRaw));

  // market rows are pre-kickoff facts by construction: keep only rows whose capture precedes
  // their own kickoff (a static truth that cannot rot), sorted by kickoff.
  const marketRows: MarketRow[] = ((markets?.rows ?? []) as MarketRow[])
    .filter((r) => markets?.capturedAt && r.kickoffUtc && markets.capturedAt < r.kickoffUtc)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const pct = (p: number | null) => (typeof p === "number" ? `${(p * 100).toFixed(1)}%` : "—");

  // P173-A: public-beta forecasts. Only rows generated BEFORE their own kickoff render — a static
  // truth that cannot rot — and only while the artifact exists. No artifact, no section.
  type Forecast = {
    providerEventId: string; kickoffUtc: string; generatedAt: string;
    home: { abbr: string; name: string }; away: { abbr: string; name: string };
    forecastSummary: {
      projectedScore: { home: number; away: number };
      winProbability: { home: number; away: number; calibration: string };
      total: { median: number; p10: number; p90: number };
    };
    marketComparison: { state: string; marketTotal?: number | null; marketHomeWinPct?: number | null };
  };
  const forecastArtifact = read("nfl/forecasts/latest.json");
  const forecasts: Forecast[] = ((forecastArtifact?.forecasts ?? []) as Forecast[])
    .filter((f) => f.generatedAt < f.kickoffUtc)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const forecastCard = forecastArtifact?.modelCard ?? null;

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
  ];

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-mute)" }}>NFL hub · public beta</p>
      <h1 style={{ margin: "6px 0 0", fontSize: 26 }}>NFL — schedule, results, and what is honestly covered</h1>
      <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-dim, var(--text-mute))", maxWidth: 680 }}>
        Everything on this page derives from committed public captures. We publish experimental
        preseason simulations — not picks, and not a claim to beat the sportsbook market: this model
        forecast winners barely better than a coin flip when tested on a season it had never seen,
        so its win percentages sit deliberately close to even. The coverage table below states each
        layer&apos;s exact status and the reason, in words. Educational and paper-only.
      </p>

      <section aria-labelledby="nfl-slate" style={{ marginTop: 28 }}>
        <h2 id="nfl-slate" style={{ fontSize: 17, marginBottom: 4 }}>Upcoming games</h2>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--text-mute)" }}>
          {schedule ? `From the committed schedule capture (${schedule.generatedAt}); all games below are ${seasonContextFor(upcoming[0] ?? {}).state === "PRESEASON" ? "preseason" : "scheduled"} — kickoff times in ET.` : "No schedule capture is readable — shown as missing rather than guessed."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {upcoming.map((g: { providerEventId: string; shortName: string; dateUtc: string; seasonType: number; week: number; venue: string; home: { abbr: string; name: string }; away: { abbr: string; name: string } }) => (
            <article key={g.providerEventId} style={{ border: "1px solid var(--vault-border)", borderRadius: 12, padding: "12px 14px" }}>
              <p style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
                {seasonContextFor(g).state.replace(/_/g, " ").toLowerCase()} · week {g.week}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <TeamLogo team={g.away.abbr} sport="nfl" size="sm" ariaLabel={`${g.away.name} logo`} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{g.away.abbr}</span>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>at</span>
                <TeamLogo team={g.home.abbr} sport="nfl" size="sm" ariaLabel={`${g.home.name} logo`} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{g.home.abbr}</span>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12.5 }}>{etKickoff(g.dateUtc)}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--vault-text-mute)" }}>{g.venue}</p>
            </article>
          ))}
        </div>
        {upcoming.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>No scheduled games in the committed capture window.</p> : null}
      </section>

      {forecasts.length ? (
        <section aria-labelledby="nfl-forecasts" style={{ marginTop: 28 }}>
          <h2 id="nfl-forecasts" style={{ fontSize: 17, marginBottom: 4 }}>
            Our simulations for tonight <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-gold)", border: "1px solid var(--vault-border)", borderRadius: 6, padding: "2px 6px", verticalAlign: "middle" }}>EXPERIMENTAL</span>
          </h2>
          <p style={{ margin: "0 0 4px", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 720, lineHeight: 1.6 }}>
            {forecastCard?.what}
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 720, lineHeight: 1.6 }}>
            <strong style={{ color: "var(--vault-text)" }}>Read this first:</strong> {forecastCard?.honestLimit} {forecastCard?.whatItIsGoodFor}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {forecasts.map((f) => (
              <article key={f.providerEventId} style={{ border: "1px solid var(--vault-border)", borderRadius: 12, padding: "12px 14px" }}>
                <p style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
                  {etKickoff(f.kickoffUtc)}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <TeamLogo team={f.away.abbr} sport="nfl" size="sm" ariaLabel={`${f.away.name} logo`} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{f.forecastSummary.projectedScore.away}</span>
                  <span style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>at</span>
                  <TeamLogo team={f.home.abbr} sport="nfl" size="sm" ariaLabel={`${f.home.name} logo`} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{f.forecastSummary.projectedScore.home}</span>
                  <span style={{ fontSize: 11, color: "var(--vault-text-mute)", marginLeft: "auto" }}>projected</span>
                </div>
                <dl style={{ margin: "10px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", fontSize: 12 }}>
                  <dt style={{ color: "var(--vault-text-faint)" }}>Win chance</dt>
                  <dd style={{ margin: 0, fontFamily: "var(--font-mono, monospace)" }}>
                    {f.away.abbr} {(f.forecastSummary.winProbability.away * 100).toFixed(1)}% · {f.home.abbr} {(f.forecastSummary.winProbability.home * 100).toFixed(1)}%
                  </dd>
                  <dt style={{ color: "var(--vault-text-faint)" }}>Total points</dt>
                  <dd style={{ margin: 0, fontFamily: "var(--font-mono, monospace)" }}>
                    {f.forecastSummary.total.median} <span style={{ color: "var(--vault-text-faint)" }}>(likely {f.forecastSummary.total.p10}–{f.forecastSummary.total.p90})</span>
                  </dd>
                  {f.marketComparison.state === "MARKET_VIEW" ? (
                    <>
                      <dt style={{ color: "var(--vault-text-faint)" }}>Sportsbooks</dt>
                      <dd style={{ margin: 0, fontFamily: "var(--font-mono, monospace)" }}>
                        total {f.marketComparison.marketTotal} · {f.home.abbr} {((f.marketComparison.marketHomeWinPct ?? 0) * 100).toFixed(1)}%
                      </dd>
                    </>
                  ) : null}
                </dl>
                <p style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.45, color: "var(--vault-text-faint)" }}>
                  {f.forecastSummary.winProbability.calibration}
                </p>
              </article>
            ))}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 720 }}>
            Generated {forecastArtifact?.generatedAt} under model {forecastArtifact?.model?.id} before every kickoff shown, and frozen at that moment — the forecast never changes after the fact, and each one is settled against the official result. {forecastCard?.whyPublishItAtAll}
          </p>
        </section>
      ) : null}

      {vault && (vault.watchlist?.length || vault.selections?.length) ? (
        <section aria-labelledby="nfl-vault" style={{ marginTop: 28 }}>
          <h2 id="nfl-vault" style={{ fontSize: 17, marginBottom: 4 }}>
            End Zone Vault <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-gold)", border: "1px solid var(--vault-border)", borderRadius: 6, padding: "2px 6px", verticalAlign: "middle" }}>
              {vault.state === "ACTIVE" ? "CARD" : "WATCHLIST"}
            </span>
          </h2>
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 720, lineHeight: 1.6 }}>
            {vault.state === "ACTIVE"
              ? vault.reason
              : <>Who our model thinks is most likely to score tonight. <strong style={{ color: "var(--vault-text)" }}>This is a watchlist, not a card</strong> — {vault.reason.replace(/^\d+ model candidates, but no card: /, "")}</>}
          </p>
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
                      {c.name} <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{c.position ?? ""} · {c.team}</span>
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
        <section aria-labelledby="nfl-markets" style={{ marginTop: 28 }}>
          <h2 id="nfl-markets" style={{ fontSize: 17, marginBottom: 4 }}>Sportsbook prices for this slate</h2>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 700 }}>
            Captured {markets.capturedAt} — before every kickoff below. These are the sportsbooks&apos; own
            numbers, shown as facts with attribution: GameTimePicks publishes no NFL prediction beside
            them. The win percentages are each book&apos;s price with its margin removed, then the median
            across books; they describe the market, not a forecast of ours.
          </p>
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

      <section aria-labelledby="nfl-results" style={{ marginTop: 28 }}>
        <h2 id="nfl-results" style={{ fontSize: 17, marginBottom: 4 }}>Recent finals</h2>
        {finals.length ? (
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
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
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>
          Finals join by durable event identity; a result without pre-event schedule lineage is quarantined and reported, never settled.
        </p>
      </section>

      <section aria-labelledby="nfl-coverage" style={{ marginTop: 28 }}>
        <h2 id="nfl-coverage" style={{ fontSize: 17, marginBottom: 4 }}>Coverage, market by market</h2>
        <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
          Readiness is stated per layer — a page section is never filled merely because it exists.
        </p>
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

      <p style={{ margin: "28px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 680 }}>
        No NFL models, simulations, or picks are published on this site. When a layer&apos;s evidence
        gates pass, it activates market by market — team readiness never auto-publishes player
        markets. See <Link href="/methodology" style={{ color: "var(--vault-gold)" }}>methodology</Link> and{" "}
        <Link href="/sports" style={{ color: "var(--vault-gold)" }}>all sports coverage</Link>.
      </p>
    </main>
  );
}
