/**
 * /live NFL HUB — server-side roster. NODE ONLY; never imported by a client component.
 *
 * WHAT THIS IS. The static half of the NFL hub: for today's slate, everything knowable at BUILD
 * time — the canonical ESPN event id, the matchup, kickoff, and each frozen GameTimePicks
 * prediction with the frozen sportsbook line it was published against. The moving half (score,
 * quarter, clock, the factual stat so far) arrives at read time from the live gateway and is joined
 * on `providerEventId`.
 *
 * ⚠ THE ROSTER MAKES NO CLAIM ABOUT THE PRESENT. Exactly as the MLB roster does not: no "is live",
 *   no "has started", and above all NO measurement field. A static artifact that asserts something
 *   about now ages into a lie, and a `live: 0` baked at build time would be a measurement nobody
 *   took. `kickoffUtc` travels as a schedule fact, never as a verdict.
 *
 * ⚠ READ-ONLY OVER FROZEN ARTIFACTS. This module opens the Sunday player boards and never writes.
 *   The prediction and the line it carries are reproduced exactly as published — no re-projection,
 *   no re-pricing, no rounding of the model's own number.
 *
 * REUSES THE EXISTING OWNERS, inventing nothing:
 *   PRODUCT_CLEARED_FAMILY_STATES  the promotion allowlist that already decides publishability
 *   LIVE_TRACKABLE_MARKETS         the live adapter's OWN map of what it can measure
 *   nflTeamRefByAbbr / labelForRef the canonical club registry, for full names and follow marks
 */
import fs from "node:fs";
import path from "node:path";

import { currentEtDate } from "@/lib/freshness";
import { PRODUCT_CLEARED_FAMILY_STATES } from "@/lib/products/candidate-universe.mjs";
import { LIVE_TRACKABLE_MARKETS } from "./adapters/espn-nfl.mjs";
import { type FollowRef, labelForRef, nflTeamRefByAbbr } from "@/lib/follow/entity-registry";

/** One frozen GameTimePicks prediction, with the frozen line it was published against. */
export interface TrackedPrediction {
  playerId: string;
  player: string;
  teamAbbr: string;
  /** The family key, e.g. `player_reception_yds`. */
  market: string;
  /** The family's own published label, e.g. "Receiving yards". Never invented here. */
  marketLabel: string;
  /**
   * The frozen GameTimePicks number. For a volume family this is the model's mean; for a
   * probability family (`anytime_td`) it is null and `pregameProbability` carries the claim.
   */
  gtp: number | null;
  pregameProbability: number | null;
  /** The frozen sportsbook line, or null when the family is priced as a probability. */
  line: number | null;
  sportsbook: string | null;
  capturedAt: string | null;
  /**
   * Can the live adapter actually measure this while the game is played? Derived from the adapter's
   * own map, so a rail is never offered for a stat nothing can fill. `anytime_td` is false.
   */
  liveTrackable: boolean;
}

export interface NflHubRosterGame {
  /** Canonical ESPN numeric event id — the join key to the live envelope AND to the board file. */
  providerEventId: string;
  matchup: string;
  /** Scheduled kickoff (UTC ISO, seconds-normalised). A SCHEDULE fact, never a claim about now. */
  kickoffUtc: string | null;
  awayAbbr: string;
  homeAbbr: string;
  awayTeam: string;
  homeTeam: string;
  /** ESPN club logo URLs. The card renders through TeamLogo, which owns the fallback. */
  awayLogo: string;
  homeLogo: string;
  awayRef: FollowRef | null;
  homeRef: FollowRef | null;
  trackedPredictionCount: number;
  trackedPredictions: TrackedPrediction[];
  /** When the frozen board was published — the provenance of every number above. */
  boardGeneratedAt: string | null;
}

export interface NflHubRoster {
  etDate: string;
  games: NflHubRosterGame[];
  /** Distinguishes "no NFL games today" from "no boards published". */
  boardsPresent: boolean;
}

const readJson = (abs: string) => {
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
};

/**
 * `2026-09-27T17:00Z` → `2026-09-27T17:00:00Z`.
 *
 * The boards omit seconds. `Date.parse` accepts that in V8 but it is not guaranteed, and the same
 * normaliser already appears in the Phase H probe — so the shape is a known property of this feed,
 * not a defensive guess.
 */
const normalizeInstant = (iso: unknown): string | null => {
  if (typeof iso !== "string" || !iso) return null;
  const s = iso.replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z");
  return Number.isFinite(Date.parse(s)) ? s : null;
};

const etDateOf = (iso: string | null): string | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(t));
};

/** ESPN's club logo CDN, the same path `TeamLogo` resolves. */
const logoUrl = (abbr: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;

/** `"CAR @ CLE"` → `["CAR","CLE"]`. Away first, which is what the board's own string means. */
const sidesOf = (matchup: unknown): [string, string] | null => {
  if (typeof matchup !== "string") return null;
  const m = matchup.split("@").map((s) => s.trim());
  return m.length === 2 && m[0] && m[1] ? [m[0], m[1]] : null;
};

/**
 * Every frozen prediction on one board that a product may show.
 *
 * The family's promotion `state` is the gate, read through the allowlist that already owns that
 * decision — so an ESTIMATE or WITHHELD family cannot reach the hub because it was never promoted,
 * and a new state nobody has cleared fails closed rather than appearing by default.
 */
function trackedFor(board: any): TrackedPrediction[] {
  const families = board?.families ?? {};
  const out: TrackedPrediction[] = [];
  for (const p of board?.players ?? []) {
    if (typeof p?.name !== "string" || typeof p?.playerId !== "string") continue;
    for (const [market, m] of Object.entries((p?.markets ?? {}) as Record<string, any>)) {
      const fam = families[market];
      if (!fam || !PRODUCT_CLEARED_FAMILY_STATES.has(fam.state)) continue;
      const mkt = m?.market ?? null;
      const gtp = typeof m?.mean === "number" ? m.mean : null;
      const prob = typeof m?.probability === "number" ? m.probability : null;
      /* A row that carries neither a volume projection nor a probability is not a prediction. */
      if (gtp === null && prob === null) continue;
      out.push({
        playerId: p.playerId,
        player: p.name,
        teamAbbr: typeof p.team === "string" ? p.team : "",
        market,
        marketLabel: typeof fam.label === "string" ? fam.label : market,
        gtp,
        pregameProbability: prob,
        line: typeof mkt?.line === "number" ? mkt.line : null,
        sportsbook: typeof mkt?.sportsbook === "string" ? mkt.sportsbook : null,
        capturedAt: normalizeInstant(mkt?.capturedAt),
        /* Widened deliberately: the adapter's set is narrowly typed, and the board's family key is
           an arbitrary string. The membership test is the point — the cast does not weaken it. */
        liveTrackable: (LIVE_TRACKABLE_MARKETS as readonly string[]).includes(market),
      });
    }
  }
  /* Trackable first (they are the ones that move), then by the size of the claim. */
  out.sort((a, b) =>
    Number(b.liveTrackable) - Number(a.liveTrackable) ||
    a.player.localeCompare(b.player) ||
    a.market.localeCompare(b.market));
  return out;
}

/**
 * Today's NFL roster, built from the frozen Sunday boards.
 *
 * `nowIso` is injectable so tests and fixtures pin a date instead of depending on the day they run.
 */
export function buildNflHubRoster(
  nowIso?: string,
  /**
   * How many predictions per game travel to the BROWSER.
   *
   * ⚠ Today's real slate carries 788 product-eligible predictions across 14 games — 50 to 68 each.
   *   Serialising all of them into a static page is the /build/custom incident verbatim: 481 legs
   *   shipped that nothing rendered. `trackedPredictionCount` still reports the TRUE total, so the
   *   count on the card is honest while the list is an explicit preview.
   */
  { previewPerGame = 3 }: { previewPerGame?: number } = {},
): NflHubRoster {
  const etDate = currentEtDate(nowIso ? new Date(nowIso) : undefined);
  const dir = path.join(process.cwd(), "public/data/nfl/player-board");
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return { etDate, games: [], boardsPresent: false };
  }

  const games: NflHubRosterGame[] = [];
  for (const f of files) {
    const board = readJson(path.join(dir, f));
    const kickoffUtc = normalizeInstant(board?.kickoffUtc);
    /*
     * Grouped by the ET date of KICKOFF, not by filename or by the UTC date — a 20:25 ET Sunday
     * night game is 00:20Z on Monday, and a UTC filter would drop it from its own slate.
     */
    if (etDateOf(kickoffUtc) !== etDate) continue;
    const id = board?.providerEventId === undefined || board?.providerEventId === null ? null : String(board.providerEventId);
    const sides = sidesOf(board?.matchup);
    /* No stable id or no nameable sides ⇒ no card. The join is by ESPN id, never by team string. */
    if (!id || !sides) continue;
    const [awayAbbr, homeAbbr] = sides;
    const awayRef = nflTeamRefByAbbr(awayAbbr);
    const homeRef = nflTeamRefByAbbr(homeAbbr);
    const tracked = trackedFor(board);
    games.push({
      providerEventId: id,
      matchup: board.matchup,
      kickoffUtc,
      awayAbbr,
      homeAbbr,
      /* The registry's full club name when it resolves; the abbreviation is a truthful fallback. */
      awayTeam: (awayRef && labelForRef(awayRef)) || awayAbbr,
      homeTeam: (homeRef && labelForRef(homeRef)) || homeAbbr,
      awayLogo: logoUrl(awayAbbr),
      homeLogo: logoUrl(homeAbbr),
      awayRef,
      homeRef,
      trackedPredictionCount: tracked.length,
      trackedPredictions: tracked.slice(0, Math.max(0, previewPerGame)),
      boardGeneratedAt: normalizeInstant(board?.generatedAt),
    });
  }

  games.sort((a, b) => {
    const ta = Date.parse(a.kickoffUtc ?? "");
    const tb = Date.parse(b.kickoffUtc ?? "");
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return a.providerEventId.localeCompare(b.providerEventId);
    if (!Number.isFinite(ta)) return 1;
    if (!Number.isFinite(tb)) return -1;
    return ta - tb || a.providerEventId.localeCompare(b.providerEventId);
  });

  return { etDate, games, boardsPresent: files.length > 0 };
}
