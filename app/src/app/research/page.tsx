/**
 * /research — THE RESEARCH HOME. PUBLIC.
 *
 * Research home PR (2026-10-05). This page used to be a "Research engine · public beta" note about an MLB dataset
 * milestone ("30 qualifying MLB observation dates") that no longer described the product, and it linked to none of
 * the research that exists: player and team pages, Compare, Model Lab, the Forecast Record. The discoverability audit
 * (Research & Model Lab department) found it was the only page named "Research" in the footer and in Ask, and a dead
 * end. It is now the directory of Research:
 *
 *   1. the tools — Research Lab, Compare, Forecast Record, Model Lab, Ask — each with what it answers;
 *   2. every team page, by sport, from the research projection index (the same registry that generates them, so every
 *      link is a page this export serves) — the team directory the site did not have, with no new route;
 *   3. what Research covers, per sport: published page counts and the inclusion bar, from the committed research
 *      readiness receipt. Counts and every number in the bars (games, appearances, bouts, seasons) are read from the
 *      receipt's `sports` and `thresholds`; only the sentence around them is written here, because the receipt's own
 *      `rules` strings are engineering notes (they name a provider and say "noindex").
 *
 * Facts and measured records only: no forecast, no pick, and no reader-clock words in static HTML.
 */
import fs from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow, PANEL, ResearchShell, Section } from "@/components/research-pages/research-primitives";
import { RESEARCH_PROJECTION_DIR, assertProjectionVersion } from "@/lib/research-pages/contract.mjs";
import { researchIndex, type ResearchSport } from "@/lib/research-pages/projection-store";
import { inclusionCopy, type Thresholds } from "@/lib/research-pages/research-home";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata: Metadata = withRouteMetadata("/research/", {
  title: "Research: teams, players and our forecast record | GameTimePicks",
  description: "Recorded facts about NFL, MLB, Premier League and UFC teams and players, side-by-side comparisons, and how every forecast GameTimePicks published turned out.",
});

const SPORTS: ReadonlyArray<{ sport: ResearchSport; name: string; hub: string }> = [
  { sport: "NFL", name: "NFL", hub: "/nfl/" },
  { sport: "MLB", name: "MLB", hub: "/mlb/" },
  { sport: "EPL", name: "Premier League", hub: "/epl/" },
  { sport: "UFC", name: "UFC", hub: "/ufc/" },
];

type Readiness = {
  thresholds: Thresholds;
  sports: Record<string, { players: { published: number } | null; teams: { published: number } | null }>;
};

function readiness(): Readiness {
  const p = path.join(process.cwd(), "..", RESEARCH_PROJECTION_DIR, "readiness.json");
  return assertProjectionVersion(JSON.parse(fs.readFileSync(p, "utf8")), "research readiness") as Readiness;
}

const TOOLS: ReadonlyArray<{ href: string; title: string; body: string }> = [
  { href: "/research/lab/", title: "Research Lab", body: "Find recorded games by team, opponent, result or date; filter player games on one recorded stat; read season results team by team." },
  { href: "/compare/", title: "Compare", body: "Two teams or two players side by side on the same recorded stat, with the number of games behind every figure." },
  { href: "/results/forecasts/", title: "Forecast Record", body: "Every forecast GameTimePicks published, frozen before the game and measured against the official result." },
  { href: "/models/", title: "Model Lab", body: "Which models are live, being tested, holding or paused, and the measured record behind each." },
  { href: "/ask/", title: "Ask GameTime", body: "Ask about a game, a player or a forecast. Answers come from GameTimePicks' own data, with links to the page behind them." },
];

const card: React.CSSProperties = { ...PANEL, display: "block", textDecoration: "none", color: "var(--vault-text)", minHeight: 44 };
const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 10px", borderRadius: 999, border: "1px solid var(--vault-rule)", color: "var(--vault-text)", textDecoration: "none", fontSize: 13 };
const cell: React.CSSProperties = { padding: "6px 8px", borderTop: "1px solid var(--vault-border)" };

export default function ResearchHome() {
  const index = researchIndex();
  const ready = readiness();
  const teamsBySport = new Map<ResearchSport, Array<{ label: string; path: string }>>();
  for (const e of index) {
    if (e.kind !== "team") continue;
    const list = teamsBySport.get(e.sport) ?? [];
    list.push({ label: e.label, path: e.path });
    teamsBySport.set(e.sport, list);
  }
  for (const list of teamsBySport.values()) list.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <ResearchShell back={{ href: "/", label: "Home" }}>
      <Eyebrow>Research</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>Teams, players and how our forecasts did</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 680, lineHeight: 1.6 }}>
        Recorded facts about teams and players, side-by-side comparisons, and the measured record of every forecast GameTimePicks published. Nothing on these pages is a pick.
      </p>

      <Section id="research-tools" title="Research tools" sub="Each tool reads the same recorded data and says what it does not cover.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} style={card}>
              <strong>{t.title} →</strong>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--vault-text-mute)", marginTop: 4, lineHeight: 1.5 }}>{t.body}</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section id="research-teams" title="Team research" sub="Every team with a research page. Each team page links its players, games and comparisons.">
        {SPORTS.filter((s) => teamsBySport.get(s.sport)?.length).map((s) => (
          <div key={s.sport} style={{ marginTop: 12 }}>
            <h3 id={`teams-${s.sport.toLowerCase()}`} style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700 }}>{s.name} teams</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {teamsBySport.get(s.sport)!.map((t) => (
                <li key={t.path}><Link href={t.path} style={chip}>{t.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
          Player pages are linked from each team page and from game pages. UFC fighters have no team; each fighter&apos;s page is linked from their bout on the <Link href="/ufc/" style={{ color: "var(--vault-gold-bright)" }}>UFC hub</Link>.
        </p>
      </Section>

      <Section id="research-coverage" title="What Research covers" sub="A page is published only when GameTimePicks has recorded enough for it. A missing page means too few recorded games, not zero.">
        <div style={{ overflowX: "auto", position: "relative" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                {["Sport", "Pages", "Who gets a page"].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SPORTS.map((s) => {
                const r = ready.sports[s.sport];
                const rule = inclusionCopy(s.sport, ready.thresholds);
                const players = r?.players?.published ?? 0;
                const teams = r?.teams?.published ?? null;
                return (
                  <tr key={s.sport}>
                    <th scope="row" style={{ ...cell, textAlign: "left", whiteSpace: "nowrap" }}>
                      <Link href={s.hub} style={{ color: "var(--vault-gold-bright)" }}>{s.name}</Link>
                    </th>
                    <td className="font-mono" style={{ ...cell, whiteSpace: "nowrap" }}>
                      {teams != null ? <>{teams} team{teams === 1 ? "" : "s"}<br /></> : null}
                      {players} {s.sport === "UFC" ? "fighter" : "player"}{players === 1 ? "" : "s"}
                    </td>
                    <td style={{ ...cell, color: "var(--vault-text-mute)", lineHeight: 1.5 }}>
                      {rule.team ? <><strong style={{ color: "var(--vault-text)" }}>Teams:</strong> {rule.team}<br /></> : null}
                      <strong style={{ color: "var(--vault-text)" }}>{s.sport === "UFC" ? "Fighters" : "Players"}:</strong> {rule.player}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
          NBA has a schedule and official finals on the <Link href="/nba/" style={{ color: "var(--vault-gold-bright)" }}>NBA hub</Link> and no research pages.
        </p>
      </Section>

      <p style={{ marginTop: 28, fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
        Everything here is paper-only and educational. <Link href="/methodology/" style={{ color: "var(--vault-gold-bright)" }}>Methodology</Link> explains how each number is built.
      </p>
    </ResearchShell>
  );
}
