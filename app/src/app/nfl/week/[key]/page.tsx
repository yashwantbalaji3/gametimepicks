/**
 * /nfl/week/[key] — the SHAREABLE week route (P248 · Release C). PUBLIC.
 *
 * One page per official (seasonType, week) period that actually has data — the canonical week
 * register is the shared event read model plus the weekly-boards artifacts the production
 * pipeline writes per period. Nothing is invented for future weeks: a period earns a route by
 * having a committed forecast set, and prev/next links render only when that neighbor exists.
 * Key format `${seasonType}-${paddedWeek}` matches the weekly-boards per-period files.
 */
import type { Metadata } from "next";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import SectionHeader from "@/components/section-header";
import TeamLogo from "@/components/team-logo";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

const read = (rel: string) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", rel), "utf8")); } catch { return null; }
};

type Forecast = {
  providerEventId: string; matchup: string; kickoffUtc: string; seasonType: number; week: number;
  home: { abbr: string; name: string }; away: { abbr: string; name: string };
  forecastSummary: {
    projectedScore: { home: number; away: number };
    winProbability: { home: number; away: number };
    total: { median: number; p10: number; p90: number; head?: string };
  };
};
type BoardRow = { playerId: string; name: string; team: string; opponent: string; providerEventId: string; kickoffUtc: string; value: number; median?: number; p10?: number; p90?: number; probability?: number };
type WeeklyBoards = {
  generatedAt: string; period: { seasonType: number; week: number };
  scope: { kind: string; eventsIncluded: number; eventsDroppedAfterKickoff: number };
  boards: Array<{ id: string; title: string; state: string; reason?: string; caveat?: string; topN: number; rows?: BoardRow[] }>;
};

/** Every period with a committed weekly-boards artifact — the register routes derive from. */
function availableWeekKeys(): string[] {
  try {
    return fs.readdirSync(path.join(process.cwd(), "public/data/nfl/weekly-boards"))
      .filter((f) => /^\d+-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch { return []; }
}

export function generateStaticParams() {
  return availableWeekKeys().map((key) => ({ key }));
}
export const dynamicParams = false;

const phaseLabel = (t: number) => (t === 1 ? "preseason" : t === 3 ? "postseason" : "regular season");
const weekTitle = (key: string) => {
  const [t, w] = key.split("-").map(Number);
  return `Week ${w} · ${phaseLabel(t)}`;
};

export function generateMetadata({ params }: { params: { key: string } }): Metadata {
  return withRouteMetadata(`/nfl/week/${params.key}/`, {
    title: `NFL ${weekTitle(params.key)} — Simulations & Top Boards · GameTime Picks`,
    description: `Frozen pre-kickoff simulations, projected scores and the weekly player boards for NFL ${weekTitle(params.key)}. Educational and paper-only.`,
  });
}

const etKickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

export default function NflWeekPage({ params }: { params: { key: string } }) {
  const keys = availableWeekKeys();
  const idx = keys.indexOf(params.key);
  const prev = idx > 0 ? keys[idx - 1] : null;
  const next = idx >= 0 && idx < keys.length - 1 ? keys[idx + 1] : null;
  const wb = read(`nfl/weekly-boards/${params.key}.json`) as WeeklyBoards | null;
  const [seasonType, week] = params.key.split("-").map(Number);
  const forecasts = ((read("nfl/forecasts/latest.json")?.forecasts ?? []) as Forecast[])
    .filter((f) => f.seasonType === seasonType && f.week === week)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));

  const td = (extra: Record<string, string | number> = {}) => ({ padding: "7px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, ...extra });

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 26 }}>
          NFL {weekTitle(params.key)}
        </h1>
        <nav aria-label="Week navigation" className="font-mono" style={{ fontSize: 11.5 }}>
          {prev ? <Link href={`/nfl/week/${prev}/`} style={{ color: "var(--vault-gold)" }}>← {weekTitle(prev)}</Link> : null}
          {prev && next ? <span style={{ color: "var(--vault-text-faint)" }}> · </span> : null}
          {next ? <Link href={`/nfl/week/${next}/`} style={{ color: "var(--vault-gold)" }}>{weekTitle(next)} →</Link> : null}
          {!prev && !next ? <span style={{ color: "var(--vault-text-faint)" }}>the only captured week so far — neighbors appear when their data exists</span> : null}
        </nav>
        <Link href="/nfl/" className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10.5, color: "var(--vault-gold-bright)", marginLeft: "auto" }}>
          NFL hub →
        </Link>
      </div>

      {forecasts.length ? (
        <section aria-labelledby="week-games">
          <SectionHeader eyebrow="Games" title={`${forecasts.length} games`} sub="Frozen pre-kickoff simulations. Scores derive from the median total and margin, so they always add up." />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr>
                  {["Kickoff (ET)", "Matchup", "Model winner", "Projected score", "Total", ""].map((h) => (
                    <th key={h || "a"} scope="col" style={{ textAlign: "left", padding: "6px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f) => {
                  const s = f.forecastSummary;
                  const fav = s.winProbability.home >= s.winProbability.away
                    ? { abbr: f.home.abbr, p: s.winProbability.home }
                    : { abbr: f.away.abbr, p: s.winProbability.away };
                  return (
                    <tr key={f.providerEventId}>
                      <td className="font-mono" style={td({ fontSize: 11, whiteSpace: "nowrap", color: "var(--vault-text-mute)" })}>{etKickoff(f.kickoffUtc)}</td>
                      <td style={td({ fontSize: 13 })}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <TeamLogo team={f.away.abbr} sport="nfl" size="sm" ariaLabel={`${f.away.name} logo`} />
                          {f.away.abbr} at
                          <TeamLogo team={f.home.abbr} sport="nfl" size="sm" ariaLabel={`${f.home.name} logo`} />
                          {f.home.abbr}
                        </span>
                      </td>
                      <td className="font-mono" style={td()}>{fav.abbr} {(fav.p * 100).toFixed(1)}%</td>
                      <td className="font-mono" style={td({ whiteSpace: "nowrap" })}>{f.away.abbr} {s.projectedScore.away} — {s.projectedScore.home} {f.home.abbr}</td>
                      <td className="font-mono" style={td()}>{s.total.median} <span style={{ color: "var(--vault-text-faint)" }}>({s.total.p10}–{s.total.p90})</span></td>
                      <td style={td({ whiteSpace: "nowrap" })}>
                        <Link href={`/nfl/game/${f.providerEventId}/`} className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 10, color: "var(--vault-gold-bright)" }}>View game →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p style={{ fontSize: 13, color: "var(--vault-text-mute)" }}>
          No forecast set is committed for this week in the current artifact — the weekly boards below are this period&apos;s frozen record.
        </p>
      )}

      {wb?.boards?.length ? (
        <section aria-labelledby="week-boards">
          <SectionHeader
            eyebrow={wb.scope.kind === "REMAINING_EVENTS" ? `${wb.scope.eventsIncluded} games left` : "Full week"}
            title="Weekly top boards"
            sub="One ranking owner; a top-N table is a maximum, not a quota; a family that failed its bar says so."
          />
          <div className="flex flex-col gap-5">
            {wb.boards.map((b) =>
              (b.state === "PUBLISHED" || b.state === "ESTIMATE") && b.rows?.length ? (
                <div key={b.id}>
                  <h2 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "var(--vault-text)" }}>
                    {b.title}
                  </h2>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                      <thead>
                        <tr>
                          {["#", "Player", "Game", b.id === "top_td" ? "TD chance" : "Median", ""].map((h, i) => (
                            <th key={`${h}-${i}`} scope="col" style={{ textAlign: "left", padding: "5px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {b.rows.map((r, i) => (
                          <tr key={`${r.playerId}-${r.team}`}>
                            <td className="font-mono" style={td({ fontSize: 11, color: "var(--vault-text-faint)" })}>{i + 1}</td>
                            <td style={td({ fontSize: 13 })}>{r.name} <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{r.team}</span></td>
                            <td className="font-mono" style={td({ fontSize: 11.5, color: "var(--vault-text-mute)" })}>{r.team} vs {r.opponent}</td>
                            <td className="font-mono" style={td({ fontWeight: 700 })}>{b.id === "top_td" ? `${(r.value * 100).toFixed(1)}%` : r.median}</td>
                            <td style={td({ whiteSpace: "nowrap" })}>
                              <Link href={`/nfl/game/${r.providerEventId}/`} className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 10, color: "var(--vault-gold-bright)" }}>Game →</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p key={b.id} style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 720, border: "1px dashed var(--vault-rule)", borderRadius: 10, padding: "8px 12px" }}>
                  <strong style={{ color: "var(--vault-text-mute)" }}>{b.title}:</strong> not published — {b.reason}
                </p>
              ),
            )}
          </div>
          <p className="font-mono" style={{ margin: "10px 0 0", fontSize: 10.5, color: "var(--vault-text-faint)" }}>
            Board stamp {wb.generatedAt} · {wb.scope.kind === "FULL_WEEK" ? "frozen full-week edition" : `${wb.scope.eventsDroppedAfterKickoff} games dropped after kickoff`}
          </p>
        </section>
      ) : null}
    </div>
  );
}
