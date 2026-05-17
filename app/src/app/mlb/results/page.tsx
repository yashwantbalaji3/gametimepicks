import Link from "next/link";
import {
  latestMlbResultDate,
  getMlbComparisonReport,
  getMlbLifetimeSummary,
} from "@/lib/data-mlb-results";
import { mlbMarketLabel } from "@/lib/format-mlb";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";
import MlbResultsSummary from "@/components/mlb/mlb-results-summary";
import MlbResultsBreakdown from "@/components/mlb/mlb-results-breakdown";
import MlbPendingGames from "@/components/mlb/mlb-pending-games";
import NeonStatPanel from "@/components/neon-stat-panel";

export const metadata = {
  title: "MLB Results · GameTime Picks",
  description:
    "Educational MLB model audit. Every model lean graded against the verified final box score after the game completes.",
};

export default function MlbResultsPage() {
  const date = latestMlbResultDate();
  const lifetime = getMlbLifetimeSummary();
  const report = date ? getMlbComparisonReport(date) : null;

  if (!report || !lifetime) {
    return <MlbResultsEmptyShell />;
  }

  const top = report.topHits ?? [];
  const misses = report.biggestMisses ?? [];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      <MlbResultsSummary report={report} />

      <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NeonStatPanel
          label="Final games settled"
          value={String(report.finalGamesSettled)}
          sub={`of ${report.scheduledGames} on slate`}
          valueAccent="gold"
        />
        <NeonStatPanel
          label="Wins · Losses"
          value={`${report.wins} · ${report.losses}`}
          sub={report.pushes > 0 ? `${report.pushes} pushes` : "no pushes"}
          valueAccent="default"
        />
        <NeonStatPanel
          label="Pending games"
          value={String(report.pendingGames)}
          sub={report.pendingGames === 0 ? "all final" : "awaiting grade"}
          valueAccent={report.pendingGames === 0 ? "success" : "warn"}
        />
        <NeonStatPanel
          label="Stat unavailable"
          value={String(report.unavailableCount)}
          sub="player didn't appear"
          valueAccent="mute"
        />
      </section>

      <MlbResultsBreakdown report={report} />

      <section className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CallList
          title="Top hits"
          tone="success"
          empty="No graded wins yet."
          rows={top.map((r) => ({
            id: r.id,
            line1: `${r.playerName}`,
            line2: `${mlbMarketLabel(r.marketKey)} · ${r.lean} ${r.line}`,
            line3: `actual ${r.actual} · edge ${
              r.edgePct !== null ? r.edgePct.toFixed(1) + "%" : "—"
            } · ${r.confidence}`,
            tag: r.confidence,
          }))}
        />
        <CallList
          title="Biggest misses"
          tone="warn"
          empty="No graded losses yet."
          rows={misses.map((r) => ({
            id: r.id,
            line1: `${r.playerName}`,
            line2: `${mlbMarketLabel(r.marketKey)} · ${r.lean} ${r.line}`,
            line3: `proj ${r.projection ?? "—"} · actual ${r.actual} · ${r.confidence}`,
            tag: r.confidence,
          }))}
        />
      </section>

      <MlbPendingGames games={report.pendingGameList || []} />

      <section className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-2"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            How rows grade
          </div>
          Pitcher strikeouts graded against{" "}
          <span style={{ color: "var(--vault-text)" }}>
            stats.pitching.strikeOuts
          </span>
          . Batter hits against{" "}
          <span style={{ color: "var(--vault-text)" }}>
            stats.batting.hits
          </span>
          , total bases against{" "}
          <span style={{ color: "var(--vault-text)" }}>
            stats.batting.totalBases
          </span>{" "}
          (falls back to <span style={{ color: "var(--vault-text)" }}>
            singles + 2·doubles + 3·triples + 4·HR
          </span>{" "}
          if the API field is missing). Over wins if actual &gt; line; Under
          wins if actual &lt; line; push if equal.
        </div>
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-2"
            style={{ color: "var(--vault-warn)", fontSize: 10 }}
          >
            What's excluded
          </div>
          Insufficient-data leans are never counted. Missing
          projection / line / lean rows are skipped. When a player didn't
          appear in the final box score (called up after probable, late
          scratch, etc.) the row is marked <span style={{ color: "var(--vault-text)" }}>
            actual unavailable
          </span>{" "}
          and excluded from the decisive denominator. Home-run markets
          live on the separate{" "}
          <Link href="/mlb/power" style={{ color: "var(--vault-warn)" }}>
            Power Board
          </Link>
          .
        </div>
      </section>

      <section className="mt-8 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        <Link href="/mlb/board" style={{ color: "var(--vault-gold-bright)" }}>
          ← back to MLB board
        </Link>
      </section>
    </div>
  );
}

function MlbResultsEmptyShell() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          MLB model audit · pending first slate
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          Grades land here once final box scores post.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          MLB Results is built from the same audit pipeline as the NBA model
          audit. Once a slate completes and box scores are verified, every
          eligible MLB lean is graded here.{" "}
          <Link href="/mlb/board" style={{ color: "var(--vault-gold-bright)" }}>
            Open the live MLB board →
          </Link>
        </p>
      </section>
    </div>
  );
}

interface CallRow {
  id: string;
  line1: string;
  line2: string;
  line3: string;
  tag: string;
}

function CallList({
  title,
  tone,
  empty,
  rows,
}: {
  title: string;
  tone: "success" | "warn";
  empty: string;
  rows: CallRow[];
}) {
  const accent = tone === "success" ? "var(--vault-success)" : "var(--vault-warn)";
  return (
    <div
      className="rounded-[6px]"
      style={{
        background: "rgba(7, 11, 26, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="px-4 py-3 font-mono uppercase tracking-[0.16em]"
        style={{
          color: accent,
          fontSize: 10,
          borderBottom: "1px solid var(--vault-border)",
        }}
      >
        {title}
      </div>
      <ul className="flex flex-col list-none p-0 m-0">
        {rows.length === 0 ? (
          <li
            className="px-4 py-3 text-[12px]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {empty}
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-0.5 px-4 py-3"
              style={{ borderBottom: "1px solid var(--vault-rule)" }}
            >
              <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>
                {r.line1}
              </span>
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
              >
                {r.line2}
              </span>
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
              >
                {r.line3}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
