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
  const propAbsence = markets?.propMarkets?.state === "PROBED" && (markets.propMarkets.offeredMarkets ?? []).length === 0;

  const coverage = [
    { layer: "Schedule & identities", state: "LIVE", detail: `daily capture · ${schedule ? `${schedule.rows.length} events in window, captured ${schedule.generatedAt}` : "capture unavailable — shown as missing, never guessed"}` },
    { layer: "Results", state: "LIVE", detail: `official finals join by durable event id; results without pre-event schedule lineage are quarantined and say so` },
    { layer: "Team game simulation", state: "PRIVATE_ONLY", detail: "a deterministic joint score simulation exists as private research; publishing requires the repository's activation gate (current pre-event evidence, calibration receipts, explicit approval) — none of that is claimed here" },
    marketRows.length
      ? { layer: "Moneyline / spread / total prices", state: "LIVE", detail: `authorized capture: ${marketRows.length} events across up to ${Math.max(...marketRows.map((r) => r.books.length))} books, captured ${markets.capturedAt} (pre-kickoff). Prices and the de-vigged win probabilities they imply are market facts with attribution — not GameTimePicks predictions.` }
      : { layer: "Moneyline / spread / total prices", state: "AUTH_REQUIRED", detail: "no authorized odds capture exists; no substitute prices are shown and none are invented" },
    { layer: "Player props (pass / rush / receive)", state: "ROLE_UNCERTAIN", detail: `preseason participation is unverified — without source-backed snap evidence every player market abstains, whatever a sportsbook posts${propAbsence ? ". The authorized capture also probed this window: no player-prop markets are offered (NO_MARKET)" : ""}` },
    { layer: "Anytime touchdown · End Zone Vault", state: "NO_VAULT", detail: `the touchdown product holds: participation, current prices, and a committed calibration receipt are all required before anything publishes${propAbsence ? " — and the probed window offers no anytime-touchdown market (NO_MARKET)" : ""} — a hold is an answer, not an outage` },
    { layer: "Settlement", state: "DEPLOYED", detail: "team and scorer settlement contracts are deployed and tested; the first matching pre-event artifacts settle exactly once when they exist" },
  ];

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-mute)" }}>NFL hub · public beta</p>
      <h1 style={{ margin: "6px 0 0", fontSize: 26 }}>NFL — schedule, results, and what is honestly covered</h1>
      <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-dim, var(--text-mute))", maxWidth: 680 }}>
        Everything on this page derives from committed public captures. No NFL predictions, picks, or
        simulations are published here — the coverage table below states each layer&apos;s exact status
        and the reason, in words. Educational and paper-only.
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
