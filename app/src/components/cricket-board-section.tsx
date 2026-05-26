/**
 * CricketBoardSection — IPL cricket card on /projections.
 *
 * Projections-only surface. Cricket never enters the parlay optimizer,
 * custom builder, or Results tracker.
 *
 * Renders:
 *   - Header eyebrow "🏏 IPL · CRICKET"
 *   - Match card (matchup + venue + start time)
 *   - Moneyline market (consensus implied prob, projected winner)
 *   - Total market (consensus line, projection)
 *   - Honest pre-toss disclaimer
 *
 * Empty/pending state:
 *   - When the board has matches but no odds, we still show the
 *     matchup and explain the markets are pending.
 *   - When the board has no matches, the whole section short-circuits
 *     so /projections doesn't display an empty cricket header.
 */
import type { CricketBoard, CricketMatch } from "@/lib/data-cricket";
import {
  formatAmericanOdds,
  formatProbPct,
  formatTotalLine,
} from "@/lib/cricket-projection";
import CricketTeamBadge from "./cricket-team-badge";

interface Props {
  board: CricketBoard | null;
}

export default function CricketBoardSection({ board }: Props) {
  // Don't render anything when nothing is on disk — projections page
  // shouldn't show an empty cricket header on NBA/MLB-only days.
  if (!board || board.matches.length === 0) return null;
  return (
    <section
      className="flex flex-col gap-3 reveal"
      aria-label="IPL cricket projections"
    >
      <SectionHeader board={board} />
      <div className="flex flex-col gap-3">
        {board.matches.map((m) => (
          <CricketMatchCard key={m.matchId} match={m} board={board} />
        ))}
      </div>
      <p
        className="text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {board.preTossNote}
      </p>
    </section>
  );
}

function SectionHeader({ board }: { board: CricketBoard }) {
  const dateLabel = new Date(`${board.date}T00:00:00Z`).toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" },
  );
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden style={{ fontSize: 16 }}>
          🏏
        </span>
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold)", fontSize: 11 }}
        >
          IPL · Cricket
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
        >
          · {dateLabel}
        </span>
      </div>
      {board.oddsStatus !== "ok" && <OddsStatusPill status={board.oddsStatus} />}
    </div>
  );
}

function OddsStatusPill({
  status,
}: {
  status: CricketBoard["oddsStatus"];
}) {
  const label =
    status === "pending"
      ? "Odds pending"
      : status === "unavailable"
        ? "Odds unavailable"
        : "Odds ok";
  return (
    <span
      className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[3px]"
      style={{
        color: "var(--vault-text-mute)",
        border: "1px solid var(--vault-rule)",
        background: "rgba(7,11,26,0.55)",
        fontSize: 9,
      }}
    >
      {label}
    </span>
  );
}

function CricketMatchCard({
  match,
  board,
}: {
  match: CricketMatch;
  board: CricketBoard;
}) {
  const startEt = match.startTimeUtc
    ? new Date(match.startTimeUtc).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      })
    : null;
  return (
    <article
      className="vault-deluxe-card rounded-[10px] flex flex-col gap-3 px-3 sm:px-4 py-3 sm:py-4 overflow-hidden"
      aria-label={`${match.shortName ?? "Cricket match"} projections`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <CricketTeamBadge
            abbr={match.away.abbr}
            name={match.away.name}
            size="md"
          />
          <span
            className="font-mono uppercase"
            style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
          >
            @
          </span>
          <CricketTeamBadge
            abbr={match.home.abbr}
            name={match.home.name}
            size="md"
          />
          <div className="flex flex-col min-w-0">
            <span
              className="font-display tracking-tight truncate"
              style={{
                color: "var(--vault-text)",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {match.shortName ?? "Match"}
            </span>
            <span
              className="font-mono truncate"
              style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
            >
              {match.venue ?? ""}
              {match.venue && startEt ? " · " : ""}
              {startEt ? `${startEt} ET` : ""}
            </span>
          </div>
        </div>
        {match.stage ? (
          <span
            className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[3px] shrink-0"
            style={{
              color: "var(--vault-gold-bright)",
              border: "1px solid var(--vault-border-strong)",
              background: "rgba(7,11,26,0.55)",
              fontSize: 9,
            }}
          >
            {match.stage}
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MoneylineCell match={match} />
        <TotalCell match={match} />
      </div>

      {board.oddsStatus === "pending" ? (
        <p
          className="text-[11px] leading-snug rounded-[4px] px-2 py-1.5"
          style={{
            color: "var(--vault-text-mute)",
            background: "rgba(7,11,26,0.45)",
            border: "1px dashed var(--vault-border)",
          }}
        >
          IPL odds are not posted yet. Markets refresh from the books
          when the slate goes live — typically a few hours before toss.
        </p>
      ) : null}
    </article>
  );
}

function MoneylineCell({ match }: { match: CricketMatch }) {
  const ml = match.markets.moneyline;
  const homeAbbr = match.home.abbr ?? "Home";
  const awayAbbr = match.away.abbr ?? "Away";
  if (!ml) {
    return (
      <MarketShell label="Match winner" projection="—" confidence="insufficient">
        <p
          className="text-[11px] leading-snug"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Awaiting moneyline lines from books.
        </p>
      </MarketShell>
    );
  }
  const projectedAbbr = ml.projection === "home" ? homeAbbr : awayAbbr;
  return (
    <MarketShell
      label="Match winner"
      projection={projectedAbbr}
      confidence={ml.confidence}
    >
      <div className="grid grid-cols-2 gap-2">
        <SideStat
          side={awayAbbr}
          odds={ml.consensus.away}
          prob={ml.consensus.awayImpliedProb}
          active={ml.projection === "away"}
        />
        <SideStat
          side={homeAbbr}
          odds={ml.consensus.home}
          prob={ml.consensus.homeImpliedProb}
          active={ml.projection === "home"}
        />
      </div>
      <p
        className="text-[10px] font-mono"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {ml.books.length} book{ml.books.length === 1 ? "" : "s"} · vig
        removed · dispersion {(ml.consensus.dispersion * 100).toFixed(1)}pp
      </p>
    </MarketShell>
  );
}

function TotalCell({ match }: { match: CricketMatch }) {
  const t = match.markets.total;
  if (!t) {
    return (
      <MarketShell label="Total score" projection="—" confidence="insufficient">
        <p
          className="text-[11px] leading-snug"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Awaiting total lines from books.
        </p>
      </MarketShell>
    );
  }
  return (
    <MarketShell
      label="Total score"
      projection={formatTotalLine(t.projection)}
      confidence={t.confidence}
    >
      <div className="grid grid-cols-2 gap-2">
        <SideStat
          side="Over"
          odds={t.consensus.overOdds}
          prob={t.consensus.overImpliedProb}
          active={false}
        />
        <SideStat
          side="Under"
          odds={t.consensus.underOdds}
          prob={t.consensus.underImpliedProb}
          active={false}
        />
      </div>
      <p
        className="text-[10px] font-mono"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Consensus line {formatTotalLine(t.consensus.line)} · {t.books.length}{" "}
        book{t.books.length === 1 ? "" : "s"} · line dispersion ±
        {t.consensus.lineDispersion.toFixed(1)}
      </p>
    </MarketShell>
  );
}

function MarketShell({
  label,
  projection,
  confidence,
  children,
}: {
  label: string;
  projection: string;
  confidence: "High" | "Medium" | "Low" | "insufficient";
  children: React.ReactNode;
}) {
  const confColor =
    confidence === "High"
      ? "var(--vault-success)"
      : confidence === "Medium"
        ? "var(--vault-gold-bright)"
        : confidence === "Low"
          ? "var(--vault-warn)"
          : "var(--vault-text-faint)";
  return (
    <div
      className="rounded-[6px] px-3 py-2.5 flex flex-col gap-2"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {label}
        </span>
        <span
          className="font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[3px]"
          style={{
            color: confColor,
            border: `1px solid ${confColor}`,
            fontSize: 9,
          }}
        >
          {confidence === "insufficient" ? "no data" : confidence}
        </span>
      </div>
      <div
        className="font-display tracking-tight"
        style={{
          color: "var(--vault-text)",
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {projection}
      </div>
      {children}
    </div>
  );
}

function SideStat({
  side,
  odds,
  prob,
  active,
}: {
  side: string;
  odds: number | null;
  prob: number | null;
  active: boolean;
}) {
  return (
    <div
      className="rounded-[4px] px-2 py-1.5 flex flex-col gap-0.5"
      style={{
        background: active
          ? "rgba(212,175,55,0.10)"
          : "transparent",
        border: active
          ? "1px solid var(--vault-border-strong)"
          : "1px solid var(--vault-rule)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.12em]"
        style={{
          color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
          fontSize: 9,
        }}
      >
        {side}
      </span>
      <span
        className="font-mono"
        style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}
      >
        {formatAmericanOdds(odds)}
      </span>
      <span
        className="font-mono"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {formatProbPct(prob)}
      </span>
    </div>
  );
}
