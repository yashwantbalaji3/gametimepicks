/**
 * /world-cup/round-of-32 — Round of 32 Model Picks Board.
 *
 * Renders the pre-generated, de-vigged Round-of-32 board (real odds via The Odds API) as a compact,
 * mobile-readable table plus a "Model Bracket Lean" section. EVERY value comes from the artifact —
 * nothing is fabricated. Picks are 90-minute markets only; the "advance" lean is the 90-min moneyline
 * favorite used as a de-vig PROXY (not an outright/to-advance market) and is labelled as such.
 *
 * Rows/cards deep-link to a game-detail page ONLY when one exists for that slug (active-window games);
 * otherwise the row is non-clickable so we never 404.
 */
import Link from "next/link";
import WorldCupSectionTabs from "@/components/world-cup/world-cup-section-tabs";
import SectionHeader from "@/components/section-header";
import FlagBadge from "@/components/flag-badge";
import { gameDetailParams } from "@/lib/game-detail";
import {
  loadRoundOf32Board,
  groupRoundOf32ByDate,
  formatRoundOf32DateHeader,
  formatAmericanOdds,
  formatProbability,
  winPercent,
  upsetRisk,
  knockoutRisk,
  type RoundOf32Game,
  type RoundOf32Status,
} from "@/lib/world-cup/round-of-32";
import { deriveGameScript } from "@/lib/world-cup/game-script";

export const metadata = {
  title: "Knockout Model Picks · FIFA World Cup 2026 · GameTime Picks",
  description:
    "World Cup knockout model-pick board — de-vigged moneyline, totals, BTTS, and safer/value markets for every game in the window. 90-minute markets only. Educational, paper-only; not betting advice.",
};

const STATUS_META: Record<RoundOf32Status, { label: string; color: string; explain: string }> = {
  live_odds: { label: "Live odds", color: "var(--vault-success)", explain: "Real posted odds are in — the model picks below are de-vigged from them." },
  started: { label: "Started", color: "var(--vault-text-mute)", explain: "Kickoff has passed — picks are frozen as a record, not live advice." },
  completed: { label: "Completed — awaiting settlement", color: "var(--vault-text-faint)", explain: "This game has finished. The picks are kept as a record; official settlement is pending — not a live pick." },
  odds_pending: { label: "Odds pending", color: "var(--vault-warn)", explain: "No book has priced this fixture yet — picks appear once odds post." },
};

const CONFIDENCE_COLOR: Record<string, string> = {
  Strong: "var(--vault-success)",
  Solid: "var(--vault-gold-bright)",
  Lean: "var(--vault-gold)",
  "Coin-flip": "var(--vault-text-mute)",
};

const RISK_COLOR: Record<string, string> = {
  Low: "var(--vault-success)",
  Medium: "var(--vault-warn)",
  High: "var(--vault-gold-bright)",
};

function StatusPill({ status }: { status: RoundOf32Status }) {
  const m = STATUS_META[status] ?? STATUS_META.odds_pending;
  return (
    <span
      className="font-mono uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-[3px] inline-block"
      style={{ color: m.color, border: `1px solid ${m.color}`, fontSize: 9.5, whiteSpace: "nowrap" }}
    >
      {m.label}
    </span>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--vault-rule)",
  whiteSpace: "nowrap",
  verticalAlign: "top",
};
const headStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  whiteSpace: "nowrap",
  color: "var(--vault-text-faint)",
  fontSize: 9.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  borderBottom: "1px solid var(--vault-border)",
};

export default function RoundOf32Page() {
  const board = loadRoundOf32Board();

  if (!board) {
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
        <div className="mb-6"><WorldCupSectionTabs /></div>
        <SectionHeader eyebrow="Knockout stage" title="Knockout Model Picks Board" sub="The board is not available right now. Check back once the next knockout slate publishes." />
      </div>
    );
  }

  const grouped = groupRoundOf32ByDate(board);

  // EVERY live_odds game now links somewhere: active-window games keep their full detail page
  // (`/games/world-cup/<slug>`, full props); the remaining future games get the team-market detail
  // page (`/world-cup/round-of-32/<slug>`, props pending). gameDetailParams() returns the slugs that
  // have a full page — anything not in that set is a future game.
  const detailSlugs = new Set(
    gameDetailParams()
      .filter((p) => p.sport === "world-cup")
      .map((p) => p.gameId),
  );
  const isActiveWindow = (g: RoundOf32Game): boolean => detailSlugs.has(g.gameSlug);
  const detailHrefFor = (g: RoundOf32Game): string | null => {
    // Live and just-completed games both link to their detail page (live = a pick, completed = a record);
    // odds-pending games have nothing to show yet.
    if (g.status !== "live_odds" && g.status !== "completed") return null;
    return isActiveWindow(g) ? `/games/world-cup/${g.gameSlug}` : `/world-cup/round-of-32/${g.gameSlug}`;
  };

  const liveCount = board.byStatus?.live_odds ?? board.games.filter((g) => g.status === "live_odds").length;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6"><WorldCupSectionTabs /></div>

      <SectionHeader
        eyebrow={`${board.stage} · ${board.gameCount} games · through ${board.horizonEt}`}
        title={`${board.stage} — Model Picks Board`}
        sub="One compact board for every knockout game in the window — model moneyline, totals, BTTS, and the safer + value market per game. De-vigged from real posted odds. 90-minute markets only (Draw is a real outcome; advancement is a de-vig proxy, not an outright market)."
      />

      {/* Disclaimer / informational banner — straight from the artifact, plus the paper-only line. */}
      <div
        className="rounded-[8px] px-4 py-3 mb-5 flex flex-col gap-1.5"
        style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}
      >
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{board.disclaimer}</p>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          Paper-only · educational · not betting advice
        </span>
      </div>

      {/* Status legend — each chip carries a one-line explanation so the states read as intentional. */}
      <div
        className="rounded-[8px] px-3.5 py-3 mb-4 flex flex-col gap-2"
        style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--vault-rule)" }}
      >
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>What the status chips mean</span>
        {(["live_odds", "odds_pending", "started", "completed"] as RoundOf32Status[]).map((s) => (
          <div key={s} className="flex items-start gap-2.5">
            <span className="shrink-0 pt-0.5"><StatusPill status={s} /></span>
            <span className="leading-snug" style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>{STATUS_META[s].explain}</span>
          </div>
        ))}
        <span className="font-mono mt-0.5" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {liveCount} of {board.gameCount} games have live model odds.
        </span>
      </div>

      {/* ───────────────────────── Compact picks table ───────────────────────── */}
      <section aria-label="Round of 32 model picks table" className="mb-10">
        <div className="flex items-center justify-between gap-2 mb-1.5 sm:hidden">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Full picks board</span>
          <span className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>swipe sideways →</span>
        </div>
        <div className="overflow-x-auto rounded-[10px]" style={{ border: "1px solid var(--vault-border)", WebkitOverflowScrolling: "touch" }}>
          <table className="w-full border-collapse" style={{ fontSize: 12, minWidth: 920 }}>
            <thead>
              <tr style={{ background: "rgba(26, 16, 11,0.7)" }}>
                <th style={headStyle}>Kickoff ET</th>
                <th style={headStyle}>Match</th>
                <th style={headStyle}>Model ML pick</th>
                <th style={headStyle}>ML odds</th>
                <th style={headStyle}>Win %</th>
                <th style={headStyle}>Total pick</th>
                <th style={headStyle}>Total odds</th>
                <th style={headStyle}>BTTS</th>
                <th style={headStyle}>Best safer market</th>
                <th style={headStyle}>Best value market</th>
                <th style={headStyle}>Confidence</th>
                <th style={headStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ date, games }) => (
                <RoundOf32DateGroup key={date} date={date} games={games} detailHrefFor={detailHrefFor} isActiveWindow={isActiveWindow} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          Scroll the table sideways on mobile. Tap any row to open its detail page — active-window games show full props, future games show team-market picks (props pending).
        </p>
      </section>

      {/* ───────────────────────── Model Bracket Lean ───────────────────────── */}
      <section aria-label="Model bracket lean">
        <SectionHeader
          eyebrow="Model bracket lean"
          title="Who the model leans to advance"
          sub="The model's 90-minute moneyline favorite per game, with upset risk and a one-line expected game script. This is a 90-minute model proxy, NOT an outright/to-advance market — extra time and penalties can still flip a tie."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {board.games.map((g) => (
            <BracketLeanCard key={g.eventId} g={g} href={detailHrefFor(g)} activeWindow={isActiveWindow(g)} />
          ))}
        </div>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Generated {board.generatedAt}. Slate {board.slateLabel}. All picks de-vigged from real posted odds; 90-minute regulation markets only. Paper-only educational analytics — not betting advice, and not the Bank Builder ladder.
      </p>
    </div>
  );
}

/** Per-row props chip: full props (green) for active-window games, props pending (amber) for future. */
function PropsChip({ active }: { active: boolean }) {
  const color = active ? "var(--vault-success)" : "var(--vault-warn)";
  return (
    <span
      className="font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[3px] inline-block"
      style={{ color, border: `1px solid ${color}`, fontSize: 9, whiteSpace: "nowrap" }}
    >
      {active ? "Full props" : "Props pending"}
    </span>
  );
}

function RoundOf32DateGroup({
  date,
  games,
  detailHrefFor,
  isActiveWindow,
}: {
  date: string;
  games: RoundOf32Game[];
  detailHrefFor: (g: RoundOf32Game) => string | null;
  isActiveWindow: (g: RoundOf32Game) => boolean;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={12}
          className="font-mono uppercase tracking-[0.12em]"
          style={{
            background: "rgba(242, 54, 69, 0.10)",
            color: "var(--vault-gold-bright)",
            fontSize: 10,
            padding: "6px 10px",
            borderBottom: "1px solid var(--vault-border)",
            position: "sticky",
            left: 0,
          }}
        >
          {formatRoundOf32DateHeader(date)} · {games.length} game{games.length === 1 ? "" : "s"}
        </td>
      </tr>
      {games.map((g) => (
        <RoundOf32Row key={g.eventId} g={g} href={detailHrefFor(g)} activeWindow={isActiveWindow(g)} />
      ))}
    </>
  );
}

function RoundOf32Row({ g, href, activeWindow }: { g: RoundOf32Game; href: string | null; activeWindow: boolean }) {
  const p = g.picks;
  const ml = p?.moneyline;
  const win = winPercent(g);
  const conf = CONFIDENCE_COLOR[g.confidence] ?? "var(--vault-text-mute)";
  const dash = "—";

  // Kickoff ET in the artifact is "Mon Jun 29 · 1:00 PM ET" — show the time-of-day portion compactly.
  const koTime = g.kickoffEt?.includes("·") ? g.kickoffEt.split("·").slice(1).join("·").trim() : g.kickoffEt;

  const matchCell = (
    <div className="flex items-center gap-1.5" style={{ whiteSpace: "nowrap" }}>
      <FlagBadge code={g.homeCode ?? ""} size="sm" />
      <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{g.home}</span>
      <span style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>v</span>
      <FlagBadge code={g.awayCode ?? ""} size="sm" />
      <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{g.away}</span>
      {href ? <span style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>→</span> : null}
    </div>
  );

  return (
    <tr className="vault-glow-hover" style={{ background: href ? "rgba(26, 16, 11,0.25)" : undefined }}>
      <td style={{ ...cellStyle, color: "var(--vault-text-mute)", fontSize: 11 }}>{koTime || dash}</td>
      <td style={cellStyle}>
        {href ? (
          <Link href={href} style={{ textDecoration: "none" }} aria-label={`Open ${g.home} vs ${g.away} game detail`}>
            {matchCell}
          </Link>
        ) : (
          matchCell
        )}
      </td>
      <td style={{ ...cellStyle, color: "var(--vault-text)", fontWeight: 600 }}>{ml?.pick ?? dash}</td>
      <td style={{ ...cellStyle, color: "var(--vault-text-mute)" }} className="tabular">{formatAmericanOdds(ml?.americanOdds)}</td>
      <td style={{ ...cellStyle, color: "var(--vault-gold-bright)", fontWeight: 600 }} className="tabular">
        {win != null ? `${win}%` : dash}
      </td>
      <td style={{ ...cellStyle, color: "var(--vault-text)" }}>{p?.total?.pick ?? dash}</td>
      <td style={{ ...cellStyle, color: "var(--vault-text-mute)" }} className="tabular">{formatAmericanOdds(p?.total?.americanOdds)}</td>
      <td style={{ ...cellStyle, color: "var(--vault-text)" }}>{p?.btts?.pick ?? dash}</td>
      <td style={{ ...cellStyle, color: "var(--vault-text-mute)" }}>
        {p?.saferMarket ? (
          <span>
            {p.saferMarket.pick} <span style={{ color: "var(--vault-text-faint)" }} className="tabular">{formatAmericanOdds(p.saferMarket.americanOdds)} · {formatProbability(p.saferMarket.modelProbability)}</span>
          </span>
        ) : (
          dash
        )}
      </td>
      <td style={{ ...cellStyle, color: "var(--vault-text-mute)" }}>
        {p?.valueMarket ? (
          <span>
            {p.valueMarket.pick} <span style={{ color: "var(--vault-text-faint)" }} className="tabular">{formatAmericanOdds(p.valueMarket.americanOdds)} · {formatProbability(p.valueMarket.modelProbability)}</span>
          </span>
        ) : (
          dash
        )}
      </td>
      <td style={cellStyle}>
        <span className="font-mono uppercase tracking-[0.06em]" style={{ color: conf, fontSize: 10 }}>{g.confidence}</span>
      </td>
      <td style={cellStyle}>
        <div className="flex flex-col gap-1 items-start">
          <StatusPill status={g.status} />
          {g.status === "live_odds" ? <PropsChip active={activeWindow} /> : null}
        </div>
        {!p && g.note ? <div className="mt-1" style={{ color: "var(--vault-text-faint)", fontSize: 9.5, whiteSpace: "normal", maxWidth: 160 }}>{g.note}</div> : null}
      </td>
    </tr>
  );
}

function BracketLeanCard({ g, href, activeWindow }: { g: RoundOf32Game; href: string | null; activeWindow: boolean }) {
  const ml = g.picks?.moneyline;
  const win = winPercent(g);
  const risk = upsetRisk(g);
  const conf = CONFIDENCE_COLOR[g.confidence] ?? "var(--vault-text-mute)";
  // Unified model game script (score lean + total + BTTS + tie-together explanation) + knockout risk —
  // only for games still to play. The SAME engine game-detail uses, so the reads are identical across pages;
  // derived from the board's real market picks, never fabricated.
  const gs = g.status !== "completed" ? deriveGameScript(g) : null;
  const ko = gs?.knockoutRisk ?? null;

  const inner = (
    <article
      className="rounded-[10px] px-4 py-3.5 flex flex-col gap-2.5 h-full"
      style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)", borderLeft: "3px solid var(--vault-gold-bright)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FlagBadge code={g.homeCode ?? ""} size="sm" />
          <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>{g.home}</span>
          <span style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>v</span>
          <FlagBadge code={g.awayCode ?? ""} size="sm" />
          <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>{g.away}</span>
        </div>
        <StatusPill status={g.status} />
      </div>

      <div className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{g.kickoffEt}</div>

      {ml ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex flex-col">
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Lean to advance (90-min proxy)</span>
              <span style={{ color: "var(--vault-gold-bright)", fontSize: 15, fontWeight: 700 }}>{ml.pick}</span>
            </div>
            <span className="tabular" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>{win != null ? `${win}%` : "—"}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {risk ? (
              <span
                className="font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[3px]"
                style={{ color: RISK_COLOR[risk.label] ?? "var(--vault-text-mute)", border: `1px solid ${RISK_COLOR[risk.label] ?? "var(--vault-text-mute)"}`, fontSize: 9 }}
              >
                Upset risk {risk.label} · {risk.pct}%
              </span>
            ) : null}
            <span className="font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[3px]" style={{ color: conf, border: `1px solid ${conf}`, fontSize: 9 }}>
              {g.confidence}
            </span>
            {ko ? (
              <span title={ko.reason} className="font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[3px]" style={{ color: RISK_COLOR[ko.label] ?? "var(--vault-text-mute)", border: `1px solid ${RISK_COLOR[ko.label] ?? "var(--vault-text-mute)"}`, fontSize: 9 }}>
                Knockout risk {ko.label}
              </span>
            ) : null}
          </div>

          {/* Unified model game script — score lean + total + BTTS, tied together. Derived from the real
              ML/totals/BTTS picks, NOT a guaranteed score. Directional (never blank) when totals are absent. */}
          {gs?.available ? (
            <div className="flex flex-col gap-1 rounded-[7px] px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)" }}>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Model score lean · {gs.confidence} confidence</span>
              <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>{gs.scoreLean}</span>
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-mono px-1.5 py-0.5 rounded-[3px]" style={{ color: "var(--vault-text-mute)", background: "rgba(255,255,255,0.03)", fontSize: 9 }}>Total: {gs.totalLean ?? "not offered yet"}</span>
                <span className="font-mono px-1.5 py-0.5 rounded-[3px]" style={{ color: "var(--vault-text-mute)", background: "rgba(255,255,255,0.03)", fontSize: 9 }}>BTTS: {gs.bttsLean ?? "not offered yet"}</span>
              </div>
              <span style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{gs.explanation}</span>
              {gs.conflictWarning ? <span style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>⚠ {gs.conflictWarning}</span> : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>No model pick yet</span>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{g.note ?? "Odds not posted for this fixture yet — no fabricated pick."}</p>
        </div>
      )}

      <div className="mt-auto pt-1 flex items-center justify-between gap-2">
        {g.status === "live_odds" ? <PropsChip active={activeWindow} /> : <span />}
        {href ? (
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>View game →</span>
        ) : null}
      </div>
    </article>
  );

  return href ? (
    <Link href={href} style={{ textDecoration: "none" }} aria-label={`Open ${g.home} vs ${g.away} game detail`}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
