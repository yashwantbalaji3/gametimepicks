/**
 * /world-cup/round-of-32/[slug] — FUTURE Round-of-32 game detail page.
 *
 * Statically generated for the Round-of-32 board games that DON'T already have a full active-window
 * game-detail page (`/games/world-cup/<slug>`). Those future fixtures have de-vigged TEAM markets from
 * the board artifact but NO player props yet, so this page renders a team-market Model Picks table
 * (with honest "Unavailable" rows for markets the feed doesn't offer), a Bracket Lean block, a plain
 * rationale, the team-market parlays (Safe / Balanced / Aggressive), and a clear "player props pending"
 * line. EVERY value comes from `board.json` — nothing is fabricated; every missing field guards to "—".
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import WorldCupSectionTabs from "@/components/world-cup/world-cup-section-tabs";
import SectionHeader from "@/components/section-header";
import FlagBadge from "@/components/flag-badge";
import { gameDetailParams } from "@/lib/game-detail";
import {
  loadRoundOf32Board,
  buildBoardTeamParlays,
  formatAmericanOdds,
  formatProbability,
  winPercent,
  upsetRisk,
  expectedGameScript,
  type RoundOf32Game,
  type RoundOf32MarketPick,
  type BoardTeamParlayResult,
} from "@/lib/world-cup/round-of-32";
import { deriveGameScript } from "@/lib/world-cup/game-script";

export const dynamicParams = false;

/** World-cup slugs that already have a full active-window detail page — excluded here so we never duplicate. */
function activeWorldCupSlugs(): Set<string> {
  return new Set(gameDetailParams().filter((p) => p.sport === "world-cup").map((p) => p.gameId));
}

/** The future board games: live_odds board games whose slug has NO full game-detail page. */
function futureGames(): RoundOf32Game[] {
  const board = loadRoundOf32Board();
  if (!board) return [];
  const active = activeWorldCupSlugs();
  return board.games.filter((g) => !active.has(g.gameSlug));
}

export function generateStaticParams() {
  return futureGames().map((g) => ({ slug: g.gameSlug }));
}

function gameForSlug(slug: string): RoundOf32Game | null {
  const board = loadRoundOf32Board();
  return board?.games.find((g) => g.gameSlug === slug) ?? null;
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const g = gameForSlug(params.slug);
  if (!g) return { title: "Round of 32 · GameTime Picks" };
  return {
    title: `${g.home} vs ${g.away} · Round of 32 · GameTime Picks`,
    description: `${g.home} vs ${g.away} — de-vigged team-market model picks and team parlays for this Round-of-32 game. Player props pending until the active betting window. Educational, paper-only; not betting advice.`,
  };
}

const DASH = "—";

const CONFIDENCE_COLOR: Record<string, string> = {
  Strong: "var(--vault-success)",
  Solid: "var(--vault-gold-bright)",
  Lean: "var(--vault-gold)",
  "Coin-flip": "var(--vault-text-mute)",
  High: "var(--vault-success)",
  Speculative: "var(--vault-text-mute)",
};
const RISK_COLOR: Record<string, string> = {
  Low: "var(--vault-success)",
  Medium: "var(--vault-warn)",
  High: "var(--vault-gold-bright)",
};
const VOL_COLOR: Record<string, string> = {
  Low: "var(--vault-success)",
  Medium: "var(--vault-gold-bright)",
  High: "var(--vault-warn)",
  Extreme: "var(--vault-warn)",
};

const cellStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: "1px solid var(--vault-rule)",
  verticalAlign: "top",
};
const headStyle: React.CSSProperties = {
  padding: "9px 12px",
  textAlign: "left",
  whiteSpace: "nowrap",
  color: "var(--vault-text-faint)",
  fontSize: 9.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  borderBottom: "1px solid var(--vault-border)",
};

interface ModelRow {
  market: string;
  pick: string;
  odds: string;
  prob: string;
  confidence: string;
  note: string;
  available: boolean;
}

/** A live team-market row from a board pick, or a placeholder when the pick is absent. */
function liveRow(market: string, pick: RoundOf32MarketPick | undefined, confidence: string, note: string): ModelRow {
  if (!pick) {
    return { market, pick: DASH, odds: DASH, prob: DASH, confidence, note, available: true };
  }
  return {
    market,
    pick: pick.pick || DASH,
    odds: formatAmericanOdds(pick.americanOdds),
    prob: formatProbability(pick.modelProbability),
    confidence,
    note,
    available: true,
  };
}

export default function FutureGameDetailRoute({ params }: { params: { slug: string } }) {
  const g = gameForSlug(params.slug);
  if (!g) notFound();

  // Defensive: if a slug ever gains a full active-window page, advertise "Full props available".
  const hasFullPage = activeWorldCupSlugs().has(g.gameSlug);
  const picks = g.picks;
  const ml = picks?.moneyline;
  const win = winPercent(g);
  const risk = upsetRisk(g);
  const script = expectedGameScript(g);
  const conf = CONFIDENCE_COLOR[g.confidence] ?? "var(--vault-text-mute)";

  // Model Picks team table — live rows straight from the board picks, then honest UNAVAILABLE rows for
  // markets the current feed does not offer (so we never imply they exist or fabricate a value).
  const liveRows: ModelRow[] = picks
    ? [
        liveRow("Full-Time Moneyline", picks.moneyline, g.confidence, "90-minute regulation; Draw is a real third outcome."),
        liveRow("Total Goals", picks.total, g.confidence, picks.total ? `Line ${picks.total.line}.` : "Not posted for this fixture yet."),
        liveRow("BTTS", picks.btts, g.confidence, "Both teams to score, 90 minutes."),
        liveRow("Double Chance", picks.doubleChance, g.confidence, "Favorite avoids defeat (win or draw)."),
        liveRow("Draw No Bet", picks.drawNoBet, g.confidence, "Stake refunded on a draw."),
      ]
    : [];
  const unavailableRows: ModelRow[] = [
    { market: "1st Half Moneyline", pick: DASH, odds: DASH, prob: DASH, confidence: DASH, note: "Not offered by current feed", available: false },
    { market: "1st Half Total", pick: DASH, odds: DASH, prob: DASH, confidence: DASH, note: "Not offered by current feed", available: false },
    { market: "Total Corners", pick: DASH, odds: DASH, prob: DASH, confidence: DASH, note: "Not offered by current feed", available: false },
    { market: "Cards", pick: DASH, odds: DASH, prob: DASH, confidence: DASH, note: "Not offered by current feed", available: false },
  ];
  const rows = [...liveRows, ...unavailableRows];

  const parlays = buildBoardTeamParlays(g);

  // Plain-English rationale derived from the picks (favorite + why, scoring lean).
  const rationale = buildRationale(g);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6"><WorldCupSectionTabs /></div>

      <Link
        href="/world-cup/round-of-32"
        className="inline-flex items-center mb-4 -ml-1 px-1 py-2 font-mono uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-gold-bright)", fontSize: 10, textDecoration: "none", minHeight: 40 }}
      >
        ← Round of 32 board
      </Link>

      {/* ─────────────────────── Header ─────────────────────── */}
      <header className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <FlagBadge code={g.homeCode ?? ""} size="md" />
          <span style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 700 }}>{g.home}</span>
          <span style={{ color: "var(--vault-text-faint)", fontSize: 14 }}>vs</span>
          <FlagBadge code={g.awayCode ?? ""} size="md" />
          <span style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 700 }}>{g.away}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
            {g.kickoffEt || DASH}
          </span>
          {hasFullPage ? (
            <span
              className="font-mono uppercase tracking-[0.08em] px-2 py-0.5 rounded-[3px]"
              style={{ color: "var(--vault-success)", border: "1px solid var(--vault-success)", fontSize: 9.5 }}
            >
              Full props available
            </span>
          ) : (
            <span
              className="font-mono uppercase tracking-[0.08em] px-2 py-0.5 rounded-[3px]"
              style={{ color: "var(--vault-warn)", border: "1px solid var(--vault-warn)", fontSize: 9.5 }}
            >
              Player props pending
            </span>
          )}
        </div>
      </header>

      {/* ─────────────────────── Model-read HERO — the 5-second betting summary ───────────────────────
          Predicted score, result lean, total lean, BTTS lean and knockout risk in one band. Every value
          comes from the SAME deriveGameScript engine the board uses (real market picks, never a
          fabricated score); markets the feed doesn't offer render "not offered yet". */}
      {(() => {
        const gs = deriveGameScript(g);
        if (!gs?.available) return null;
        const ko = gs.knockoutRisk;
        const cell = (label: string, value: string | null, accent?: string) => (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{label}</span>
            <span className="truncate" style={{ color: accent ?? "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>{value ?? "not offered yet"}</span>
          </div>
        );
        return (
          <section aria-label="Model read" className="mb-9 rounded-[10px] px-4 py-3.5" style={{ border: "1px solid var(--vault-border)", background: "linear-gradient(135deg, rgba(212,175,55,0.07), rgba(26,16,11,0.5))" }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5">
              {cell("Model score lean", gs.scoreLean, "var(--vault-gold)")}
              {cell("Total goals lean", gs.totalLean)}
              {cell("BTTS lean", gs.bttsLean)}
              {ko ? cell("Knockout risk", ko.label, ko.label === "High" ? "var(--gtp-bank-heat)" : ko.label === "Medium" ? "var(--vault-warn)" : "var(--vault-success)") : cell("Knockout risk", null)}
            </div>
            <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{gs.explanation}{ko ? ` · ${ko.reason}` : ""}</p>
            {gs.conflictWarning ? <p className="mt-1 text-[10.5px]" style={{ color: "var(--gtp-bank-heat)" }}>⚠ {gs.conflictWarning}</p> : null}
          </section>
        );
      })()}

      {/* ─────────────────────── Model Picks team table ─────────────────────── */}
      <section aria-label="Model picks" className="mb-9">
        <SectionHeader eyebrow="Model picks" title="Team-market model picks" sub="De-vigged from real posted odds. 90-minute regulation markets only. Markets the current feed does not offer are listed as Unavailable — never fabricated." />
        <div className="flex items-center justify-end mb-1.5 sm:hidden">
          <span className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>swipe table sideways →</span>
        </div>
        <div className="overflow-x-auto rounded-[10px]" style={{ border: "1px solid var(--vault-border)", WebkitOverflowScrolling: "touch" }}>
          <table className="w-full border-collapse" style={{ fontSize: 12, minWidth: 720 }}>
            <thead>
              <tr style={{ background: "rgba(26, 16, 11,0.7)" }}>
                <th style={headStyle}>Market</th>
                <th style={headStyle}>Pick</th>
                <th style={headStyle}>Odds</th>
                <th style={headStyle}>Model probability</th>
                <th style={headStyle}>Confidence</th>
                <th style={headStyle}>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.market} style={{ background: r.available ? undefined : "rgba(255,255,255,0.015)" }}>
                  <td style={{ ...cellStyle, color: r.available ? "var(--vault-text)" : "var(--vault-text-mute)", fontWeight: 600, whiteSpace: "nowrap" }}>{r.market}</td>
                  <td style={{ ...cellStyle, color: "var(--vault-text)", whiteSpace: "nowrap" }}>
                    {r.available ? r.pick : <span style={{ color: "var(--vault-text-faint)", fontStyle: "italic" }}>Not offered</span>}
                  </td>
                  <td style={{ ...cellStyle, color: "var(--vault-text-mute)" }} className="tabular">{r.odds}</td>
                  <td style={{ ...cellStyle, color: "var(--vault-gold-bright)" }} className="tabular">{r.prob}</td>
                  <td style={cellStyle}>
                    <span className="font-mono uppercase tracking-[0.06em]" style={{ color: r.available ? (CONFIDENCE_COLOR[r.confidence] ?? "var(--vault-text-mute)") : "var(--vault-text-faint)", fontSize: 10 }}>
                      {r.confidence}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, color: "var(--vault-text-faint)", fontSize: 11, whiteSpace: "normal", minWidth: 180 }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!picks ? (
          <p className="mt-2 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
            No model picks are posted for this fixture yet — no fabricated values shown.
          </p>
        ) : null}
      </section>

      {/* ─────────────────────── Bracket Lean ─────────────────────── */}
      <section aria-label="Bracket lean" className="mb-9">
        <SectionHeader eyebrow="Bracket lean" title="Who the model leans to advance" />
        <div
          className="rounded-[10px] px-4 py-4 flex flex-col gap-3"
          style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)", borderLeft: "3px solid var(--vault-gold-bright)" }}
        >
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="flex flex-col">
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Model favorite to advance</span>
              <span style={{ color: "var(--vault-gold-bright)", fontSize: 18, fontWeight: 700 }}>{ml?.pick ?? DASH}</span>
            </div>
            <span className="tabular" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 700 }}>
              {win != null ? `${win}%` : DASH}
            </span>
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
          </div>
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
            <span style={{ color: "var(--vault-text-faint)" }}>Expected game script: </span>
            {script ?? "No live pick to derive a game script from."}
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
            Advancement here is a <strong style={{ color: "var(--vault-text-mute)" }}>90-minute model proxy, not an outright market</strong> — extra time and penalties can still flip a tie.
          </p>
        </div>
      </section>

      {/* ─────────────────────── Plain-English rationale ─────────────────────── */}
      {rationale ? (
        <section aria-label="Rationale" className="mb-9">
          <SectionHeader eyebrow="Rationale" title="Why the model leans this way" />
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{rationale}</p>
        </section>
      ) : null}

      {/* ─────────────────────── Team-market parlays ─────────────────────── */}
      <section aria-label="Team-market parlays" className="mb-9">
        <SectionHeader
          eyebrow="Team-market parlays"
          title="Safe · Balanced · Aggressive"
          sub="Built only from this game's posted team markets (moneyline, total, BTTS, double chance) — same-game and correlated. Combined prices are a model estimate from multiplying the real leg prices."
        />
        {parlays.length === 0 ? (
          <div
            className="rounded-[10px] px-4 py-5 flex flex-col gap-1.5"
            style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-border)" }}
          >
            <span style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 600 }}>No quality parlay available yet</span>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              No team markets are posted for this fixture yet, so there is nothing to combine. Tiers appear here once the books price this game — we never pad a slip with weak legs.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {parlays.map((p) => <ParlayCard key={p.tier} parlay={p} />)}
          </div>
        )}
      </section>

      {/* ─────────────────────── Props-pending line + footer ─────────────────────── */}
      <div
        className="rounded-[8px] px-4 py-3 mb-5"
        style={{ background: "rgba(242, 159, 54, 0.08)", border: "1px solid var(--vault-warn)" }}
      >
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          <strong style={{ color: "var(--vault-warn)" }}>Player props pending</strong> — they will appear when this game enters the active betting window.
        </p>
      </div>

      <p className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        Paper-only · educational · not betting advice
      </p>
    </div>
  );
}

/** Plain-English rationale (favorite + why, scoring lean) derived from the board picks. Null when no picks. */
function buildRationale(g: RoundOf32Game): string | null {
  const p = g.picks;
  if (!p?.moneyline) return null;
  const ml = p.moneyline;
  const win = winPercent(g);
  const favLine =
    win != null
      ? `The model leans ${ml.pick} (${formatAmericanOdds(ml.americanOdds)}, ${win}% to win in regulation)`
      : `The model leans ${ml.pick} (${formatAmericanOdds(ml.americanOdds)})`;

  let strength: string;
  if (win == null) strength = "as the side carrying the play";
  else if (win >= 65) strength = "as a clear favorite with limited upset risk over 90 minutes";
  else if (win >= 50) strength = "as a modest favorite — a real result, not a lock";
  else strength = "in a coin-flip tie where the draw is very much live";

  const totalTxt = p.total ? `The totals lean is ${p.total.pick} (${formatProbability(p.total.modelProbability)})` : "No total is posted for this fixture";
  const bttsTxt = p.btts ? `, and the model takes ${p.btts.pick} on both-teams-to-score` : "";
  const scriptTail = expectedGameScript(g);

  return `${favLine} ${strength}. ${totalTxt}${bttsTxt}. ${scriptTail ?? ""}`.trim();
}

function ParlayCard({ parlay }: { parlay: BoardTeamParlayResult }) {
  if (!parlay.available) {
    return (
      <article
        className="rounded-[10px] px-4 py-3.5 flex flex-col gap-2 h-full"
        style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-border)" }}
      >
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{parlay.tier}</span>
        <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5, fontWeight: 600 }}>No quality parlay available yet</span>
        <p className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>{parlay.reason}</p>
      </article>
    );
  }
  const volColor = VOL_COLOR[parlay.volatility] ?? "var(--vault-text-mute)";
  const confColor = CONFIDENCE_COLOR[parlay.confidence] ?? "var(--vault-text-mute)";
  return (
    <article
      className="rounded-[10px] px-4 py-3.5 flex flex-col gap-2.5 h-full"
      style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)", borderTop: "3px solid var(--vault-gold-bright)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>{parlay.title}</span>
        <span className="tabular" style={{ color: "var(--vault-gold-bright)", fontSize: 15, fontWeight: 700 }}>{formatAmericanOdds(parlay.combinedOdds)}</span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {parlay.legs.map((l, i) => (
          <li key={`${l.market}-${i}`} className="flex items-baseline justify-between gap-2" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--vault-text-mute)" }}>
              <span style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{l.market}</span>{" "}
              <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{l.pick}</span>
            </span>
            <span className="tabular" style={{ color: "var(--vault-text-mute)" }}>{formatAmericanOdds(l.americanOdds)}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          $10 → <span className="tabular" style={{ color: "var(--vault-text)" }}>${parlay.payout.toFixed(2)}</span> profit
        </span>
        <span className="font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[3px]" style={{ color: confColor, border: `1px solid ${confColor}`, fontSize: 9 }}>
          {parlay.confidence}
        </span>
        <span className="font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[3px]" style={{ color: volColor, border: `1px solid ${volColor}`, fontSize: 9 }}>
          Vol {parlay.volatility}
        </span>
      </div>

      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{parlay.whyTheseLegs}</p>
      <p className="text-[10.5px] leading-relaxed" style={{ color: "var(--vault-warn)" }}>⚠ {parlay.correlationNote}</p>
    </article>
  );
}
