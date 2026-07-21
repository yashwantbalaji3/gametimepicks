/**
 * MLB Game Lab report — a PURE derivation of one fixture's board leans into a
 * scannable "what the model reads" view. No fetch, no fs, no money, no
 * settlement. It reshapes only the REAL fields the MLB board already carries
 * (see `MlbBoardData` in ../data-mlb → ../types-mlb).
 *
 * HONESTY CONTRACT (enforced by src/lib/game-lab-mlb-report.test.mjs):
 *   • There is NO persisted per-game Monte-Carlo artifact. This module NEVER
 *     claims "10,000 simulations", "N runs", "simulated", or a per-game
 *     "distribution". The `unavailable[]` list names exactly the things we do
 *     NOT have and labels each "not yet simulated / no persisted artifact".
 *   • It surfaces ONLY keys that exist on a board lean/game. It does not invent
 *     xG, scorelines, run-expectancy, first-to-score, corners, cards, etc.
 *   • Product mapping is DESCRIPTIVE / LINK-ONLY — it links to a product page,
 *     it never approves, places, or implies a placed card. It deliberately
 *     omits Bank Builder / Moonshot / WC Specials (those are soccer-driven; an
 *     MLB game does not prove membership in any of them).
 *
 * SIGNAL THRESHOLDS (documented here AND exported so a test can pin them):
 *   • supported ⇔ edgePct >= SUPPORTED_EDGE_MIN (5) AND confidence !== "Low"
 *   • opposed   ⇔ edgePct <= OPPOSED_EDGE_MAX  (0)
 *   • neutral   ⇔ everything in between (incl. the >=5-but-Low band, which we
 *     will NOT call supported — a Low-confidence edge is a watch, not a read).
 *   The bands are inclusive at the SUPPORTED bound and at the OPPOSED bound;
 *   because SUPPORTED requires confidence !== "Low", a 5%+ edge on a Low lean
 *   lands in neutral, never in two buckets at once.
 */
import type { MlbBoardData } from "../types-mlb";

/** edgePct at/above this AND confidence !== "Low" ⇒ "supported". */
export const SUPPORTED_EDGE_MIN = 5;
/** edgePct at/below this ⇒ "opposed" (the model reads against the posted lean). */
export const OPPOSED_EDGE_MAX = 0;
/** A game whose best |edgePct| lean clears this is "strong" enough to note a
 *  DERIVED Top-10 link. Descriptive only — not an endorsement of a card. */
export const STRONG_EDGE_MIN = 10;
/** How many rows the "biggest leans" ladder shows. */
export const BIGGEST_LEANS_N = 8;

export type MlbLeanSignal = "supported" | "neutral" | "opposed";

/** One recent game entry — mirrors the board lean's `recentGames[]` exactly. */
export interface MlbRecentGame {
  date: string | null;
  opponent: string | null;
  isHome: boolean | null;
  value: number | null;
}

/** One lean, reshaped for the Game Lab view. Every field traces to a real
 *  board-lean key; nothing is fabricated. */
export interface MlbLeanRow {
  id: string;
  playerName: string;
  playerId: number | null;
  playerTeamAbbr: string | null;
  playerRole: string | null;
  marketKey: string | null;
  marketLabel: string | null;
  line: number | null;
  /** The posted lean side, verbatim from the board ("Over" | "Under" | "Pass" | …). */
  lean: string | null;
  projection: number | null;
  sigma: number | null;
  samples: number | null;
  oddsOver: number | null;
  oddsUnder: number | null;
  impliedOver: number | null;
  impliedUnder: number | null;
  modelProbOver: number | null;
  modelProbUnder: number | null;
  edgePct: number | null;
  confidence: string | null;
  riskFlags: string[];
  reasonBullets: Array<{ label: string; text: string; tone: string }>;
  recentGames: MlbRecentGame[];
  recentSeries: number[];
  /** Derived from edgePct + confidence (see thresholds above). */
  signal: MlbLeanSignal;
}

export interface MlbGameLabProductLink {
  label: string;
  href: string;
  note: string;
}

export interface MlbGameLabUnavailable {
  label: string;
  reason: string;
}

export interface MlbGameLabView {
  // ── game meta ──
  gamePk: number | string;
  homeTeamAbbr: string | null;
  awayTeamAbbr: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  venue: string | null;
  status: string | null;
  awayPitcher: string | null;
  homePitcher: string | null;

  leanCount: number;
  rows: MlbLeanRow[];
  /** Rows sorted by descending |edgePct|, capped to BIGGEST_LEANS_N. */
  biggestLeans: MlbLeanRow[];
  supported: MlbLeanRow[];
  neutral: MlbLeanRow[];
  opposed: MlbLeanRow[];

  /** Plain-language reads from the top supported rows. No hype. */
  whatModelLikes: string[];
  /** The honest downside — small samples, wide bands, risk flags, box-score settlement. */
  whatBreaksIt: string[];

  /** LINK-ONLY. Never Bank Builder / Moonshot / WC Specials. */
  productMapping: MlbGameLabProductLink[];
  /** The honest "we don't have a per-game Monte-Carlo for this" placeholders. */
  unavailable: MlbGameLabUnavailable[];
}

// ── number / value guards (never NaN, never undefined leaking through) ──
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
/** |edgePct| for sorting/ranking — null edges sort last. */
function absEdge(r: MlbLeanRow): number {
  return r.edgePct == null ? -1 : Math.abs(r.edgePct);
}

/** Classify a lean into supported / neutral / opposed from the documented thresholds. */
export function classifyMlbLeanSignal(
  edgePct: number | null,
  confidence: string | null,
): MlbLeanSignal {
  if (edgePct == null) return "neutral";
  if (edgePct <= OPPOSED_EDGE_MAX) return "opposed";
  if (edgePct >= SUPPORTED_EDGE_MIN && confidence !== "Low") return "supported";
  return "neutral";
}

/** Round to one decimal for copy; guards null. */
function edge1(v: number | null): string {
  if (v == null) return "—";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}

/** Build the Game Lab view for one fixture, or null when the game/leans aren't
 *  present on the board. */
export function buildMlbGameLabReport(
  board: MlbBoardData,
  gamePk: number | string,
): MlbGameLabView | null {
  if (!board) return null;
  const games = arr<MlbBoardData["games"][number]>(board.games);
  const leans = arr<MlbBoardData["leans"][number]>(board.leans);

  const wanted = String(gamePk);
  const game = games.find((g) => g != null && String(g.gamePk) === wanted) ?? null;
  const gameLeans = leans.filter((l) => l != null && String(l.gamePk) === wanted);

  // No such game AND no leans for that pk ⇒ nothing to report.
  if (!game && gameLeans.length === 0) return null;

  const rows: MlbLeanRow[] = gameLeans.map((l) => {
    const edgePct = num((l as { edgePct?: unknown }).edgePct);
    const confidence = str((l as { confidence?: unknown }).confidence);
    const recentGames = arr<Record<string, unknown>>(
      (l as { recentGames?: unknown }).recentGames,
    ).map((g) => ({
      date: str(g.date),
      opponent: str(g.opponent),
      isHome: bool(g.isHome),
      value: num(g.value),
    }));
    const reasonBullets = arr<Record<string, unknown>>(
      (l as { reasonBullets?: unknown }).reasonBullets,
    )
      .map((b) => ({
        label: str(b.label) ?? "",
        text: str(b.text) ?? "",
        tone: str(b.tone) ?? "default",
      }))
      .filter((b) => b.text.length > 0);

    return {
      id: str((l as { id?: unknown }).id) ?? `${wanted}-${str((l as { playerName?: unknown }).playerName) ?? "player"}`,
      playerName: str((l as { playerName?: unknown }).playerName) ?? "—",
      playerId: num((l as { playerId?: unknown }).playerId),
      playerTeamAbbr: str((l as { playerTeamAbbr?: unknown }).playerTeamAbbr),
      playerRole: str((l as { playerRole?: unknown }).playerRole),
      marketKey: str((l as { marketKey?: unknown }).marketKey),
      marketLabel: str((l as { marketLabel?: unknown }).marketLabel),
      line: num((l as { line?: unknown }).line),
      lean: str((l as { lean?: unknown }).lean),
      projection: num((l as { projection?: unknown }).projection),
      sigma: num((l as { sigma?: unknown }).sigma),
      samples: num((l as { samples?: unknown }).samples),
      oddsOver: num((l as { oddsOver?: unknown }).oddsOver),
      oddsUnder: num((l as { oddsUnder?: unknown }).oddsUnder),
      impliedOver: num((l as { impliedOver?: unknown }).impliedOver),
      impliedUnder: num((l as { impliedUnder?: unknown }).impliedUnder),
      modelProbOver: num((l as { modelProbOver?: unknown }).modelProbOver),
      modelProbUnder: num((l as { modelProbUnder?: unknown }).modelProbUnder),
      edgePct,
      confidence,
      riskFlags: arr<string>((l as { riskFlags?: unknown }).riskFlags).filter(
        (f): f is string => typeof f === "string",
      ),
      reasonBullets,
      recentGames,
      recentSeries: arr<number>((l as { recentSeries?: unknown }).recentSeries).filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n),
      ),
      signal: classifyMlbLeanSignal(edgePct, confidence),
    };
  });

  const biggestLeans = [...rows]
    .sort((a, b) => absEdge(b) - absEdge(a))
    .slice(0, BIGGEST_LEANS_N);

  const supported = rows.filter((r) => r.signal === "supported");
  const neutral = rows.filter((r) => r.signal === "neutral");
  const opposed = rows.filter((r) => r.signal === "opposed");

  // Rank supported by |edge| for the plain-language bullets.
  const topSupported = [...supported].sort((a, b) => absEdge(b) - absEdge(a));

  // ── whatModelLikes: projection vs line, recent form, sample size, edge, confidence ──
  const whatModelLikes: string[] = topSupported.slice(0, 5).map((r) => {
    const side = r.lean && r.lean !== "Pass" ? r.lean : "the model side";
    const proj = r.projection != null ? r.projection.toFixed(1) : "—";
    const lineTxt = r.line != null ? String(r.line) : "—";
    const mkt = r.marketLabel ?? "market";
    const conf = r.confidence ?? "—";
    const samp = r.samples != null ? `${r.samples} games` : "limited samples";
    const parts = [
      `${r.playerName} — ${side} ${lineTxt} ${mkt}: projection ${proj} vs line ${lineTxt}`,
      `model gap ${edge1(r.edgePct)} at ${conf} confidence over ${samp}`,
    ];
    return parts.join(" · ");
  });
  if (whatModelLikes.length === 0) {
    whatModelLikes.push(
      "No lean cleared the supported bar for this game (gap ≥ 5% at Medium+ confidence). The model reads this slate as close to the posted prices.",
    );
  }

  // ── whatBreaksIt: the honest downside, always incl. box-score settlement ──
  const whatBreaksIt: string[] = [];
  const smallSample = rows.filter((r) => r.samples != null && r.samples < 15);
  if (smallSample.length > 0) {
    const names = smallSample
      .slice(0, 3)
      .map((r) => `${r.playerName} (${r.samples})`)
      .join(", ");
    whatBreaksIt.push(
      `Thin samples make some projections noisier: ${names}${smallSample.length > 3 ? ", …" : ""}.`,
    );
  }
  const wideBand = rows.filter((r) => r.sigma != null && r.projection != null && r.sigma >= 2.5);
  if (wideBand.length > 0) {
    const w = wideBand[0];
    whatBreaksIt.push(
      `Wide projection bands: e.g. ${w.playerName} projects ${w.projection?.toFixed(1)} ± ${w.sigma?.toFixed(1)} — a real single-game swing.`,
    );
  }
  const flagged = rows.filter((r) => r.riskFlags.length > 0);
  if (flagged.length > 0) {
    const flags = [...new Set(flagged.flatMap((r) => r.riskFlags))].slice(0, 4);
    whatBreaksIt.push(`Model risk flags present on ${flagged.length} lean(s): ${flags.join(", ")}.`);
  }
  const oppNames = opposed.slice(0, 3).map((r) => r.playerName);
  if (oppNames.length > 0) {
    whatBreaksIt.push(
      `The model reads AGAINST the posted lean on ${opposed.length} row(s) (gap ≤ 0%): ${oppNames.join(", ")}.`,
    );
  }
  whatBreaksIt.push(
    "Odds and lines move; a projection is a central read, not an outcome.",
  );
  whatBreaksIt.push(
    "Player props settle on the official box score — a late scratch, an early hook, or a rain-shortened game can void or swing any leg.",
  );

  // ── productMapping: LINK-ONLY, descriptive. Never BB / Moonshot / WC Specials. ──
  const bestEdge = biggestLeans.length > 0 ? absEdge(biggestLeans[0]) : -1;
  const productMapping: MlbGameLabProductLink[] = [
    {
      label: "Parlay Lab",
      href: "/picks",
      note:
        rows.length > 0
          ? "Explore and build paper parlays from this slate's eligible legs. Link only — nothing is placed."
          : "No qualified leans for this game yet — the Parlay Lab shows the rest of the slate.",
    },
    {
      label: "Track Record",
      href: "/results",
      note: "See how the model's settled reads have actually performed. Link only — this game is not a claim of membership.",
    },
  ];
  if (bestEdge >= STRONG_EDGE_MIN) {
    productMapping.push({
      label: "Top 10",
      href: "/picks",
      note: `Derived: this game's strongest read carries a ${edge1(biggestLeans[0].edgePct)} model gap, high enough to surface among the day's Top 10. Descriptive ranking, not an endorsement.`,
    });
  }
  if (rows.length === 0) {
    productMapping.push({
      label: "No play",
      href: "/mlb",
      note: "No model-qualified leans for this game — treated as a no-play here, not padded to look active.",
    });
  }

  // ── unavailable: the honest "not yet simulated" placeholders ──
  const NOT_SIMMED = "No persisted per-game Monte-Carlo artifact yet — not yet simulated.";
  const unavailable: MlbGameLabUnavailable[] = [
    { label: "Scoreline / final-margin distribution", reason: NOT_SIMMED },
    { label: "Game total (runs) distribution", reason: NOT_SIMMED },
    { label: "Player-prop volatility distribution", reason: NOT_SIMMED },
    { label: "First-to-score / first-inning run", reason: NOT_SIMMED },
    { label: "Run-expectancy heatmap", reason: NOT_SIMMED },
  ];

  return {
    gamePk,
    homeTeamAbbr: str(game?.homeTeamAbbr) ?? (rows[0] ? str(gameLeans[0]?.homeTeamAbbr) : null),
    awayTeamAbbr: str(game?.awayTeamAbbr) ?? (rows[0] ? str(gameLeans[0]?.awayTeamAbbr) : null),
    homeTeamName: str(game?.homeTeamName) ?? (rows[0] ? str(gameLeans[0]?.homeTeamName) : null),
    awayTeamName: str(game?.awayTeamName) ?? (rows[0] ? str(gameLeans[0]?.awayTeamName) : null),
    venue: str(game?.venue) ?? (rows[0] ? str(gameLeans[0]?.venue) : null),
    status: str(game?.status),
    awayPitcher: str(game?.awayProbablePitcherName),
    homePitcher: str(game?.homeProbablePitcherName),
    leanCount: rows.length,
    rows,
    biggestLeans,
    supported,
    neutral,
    opposed,
    whatModelLikes,
    whatBreaksIt,
    productMapping,
    unavailable,
  };
}
