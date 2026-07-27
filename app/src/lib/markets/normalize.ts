/**
 * CANONICAL SPORTSBOOK NORMALIZATION (Sprint 028 · Phase 1).
 *
 * Turns the two live MLB artifacts into canonical market objects. This is the ONLY place that
 * knows the providers' shapes — everything downstream consumes `SportsbookMarket`.
 *
 * Fail-closed throughout, because a sportsbook number that is quietly wrong is worse than one that
 * is visibly missing:
 *   · an unrecognised market family becomes UNSUPPORTED rather than being guessed at
 *   · an unreadable price becomes MALFORMED with a null value — never coerced to 0
 *   · a missing line stays null — a 0.0 total would render as a real market
 *   · `team` is not inferred from anything; props arrive unattributed and say so via `mapping`
 *
 * Nothing here derives probability. `impliedProb` / `noVigProb` are carried through from the
 * artifact when present, because the existing pipeline already computes them — a second
 * implementation would eventually disagree with the first.
 */
import {
  PLAYER_FAMILY_BY_PROVIDER_KEY,
  type GameMarketFamily,
  type MappingStatus,
  type MarketPrice,
  type MarketProvenance,
  type MarketSide,
  type SportsbookGameMarket,
  type SportsbookPlayerMarket,
} from "./types";

/** A finite number, or null. Rejects NaN/Infinity/strings so nothing silently becomes 0. */
function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/**
 * American odds must be a finite non-zero integer-ish number. 0 is not a valid American price, so
 * treating it as one would invent a market. Returns null for anything unreadable.
 */
function odds(x: unknown): number | null {
  const n = num(x);
  if (n === null || n === 0) return null;
  return n;
}

function price(side: MarketSide, raw: unknown): MarketPrice {
  const r = (raw ?? {}) as Record<string, unknown>;
  const american = odds(r.odds ?? r.americanOdds);
  const hasAnySource = raw != null && typeof raw === "object";
  return {
    side,
    americanOdds: american,
    impliedProb: num(r.impliedProb),
    noVigProb: num(r.noVigProb ?? r.coverNoVigProb),
    // A side that exists in the payload but whose price cannot be read is MALFORMED — distinct
    // from a side the artifact simply does not carry, which is UNAVAILABLE.
    status: american !== null ? "OK" : hasAnySource ? "MALFORMED" : "UNAVAILABLE",
  };
}

const provenanceOf = (j: Record<string, unknown>, artifactRef: string, date: string): MarketProvenance => ({
  artifactDate: (j.date as string) ?? date,
  artifactGeneratedAt: (j.generatedAt as string) ?? null,
  source: (j.source as string) ?? null,
  book: (j.bookmaker as string) ?? null,
  artifactRef,
});

/** Overall market status from its sides: usable when at least one side has a real price. */
function statusFromPrices(prices: ReadonlyArray<MarketPrice>): SportsbookGameMarket["status"] {
  if (!prices.length) return "UNAVAILABLE";
  if (prices.some((p) => p.status === "OK")) return "OK";
  return prices.some((p) => p.status === "MALFORMED") ? "MALFORMED" : "UNAVAILABLE";
}

/**
 * Normalize the MLB team-markets artifact into MONEYLINE / RUN_LINE / TOTAL markets.
 *
 * Only these three families are emitted. The live artifact has no team totals (verified in
 * docs/SPORTSBOOK_COVERAGE_MATRIX.md and pinned by sportsbook-coverage.test.mjs), so there is no
 * branch here that could produce one.
 */
export function normalizeGameMarkets(
  artifact: unknown,
  artifactRef: string,
  fallbackDate = "",
): SportsbookGameMarket[] {
  const j = (artifact ?? {}) as Record<string, unknown>;
  const games = (j.games ?? {}) as Record<string, Record<string, unknown>>;
  if (!games || typeof games !== "object") return [];
  const prov = provenanceOf(j, artifactRef, fallbackDate);
  const sport = ((j.sport as string) ?? "mlb").toLowerCase();

  const out: SportsbookGameMarket[] = [];
  for (const g of Object.values(games)) {
    if (!g || typeof g !== "object") continue;
    const eventId = (g.gameId as string) ?? "";
    // No event identity means nothing can be attached to it. Skip rather than publish an orphan.
    if (!eventId) continue;

    const base = {
      kind: "game" as const,
      sport,
      league: sport.toUpperCase(),
      eventId,
      eventStart: (g.commenceTime as string) ?? null,
      homeTeam: (g.homeTeam as string) ?? "",
      awayTeam: (g.awayTeam as string) ?? "",
      // Game markets name both teams explicitly, so identity is stated by the provider.
      mapping: "EXACT" as MappingStatus,
      provenance: { ...prov, book: (g.bookmaker as string) ?? prov.book },
    };

    const ml = (g.moneyline ?? null) as Record<string, unknown> | null;
    if (ml) {
      const prices = [price("HOME", ml.home), price("AWAY", ml.away)];
      out.push({ ...base, family: "MONEYLINE" as GameMarketFamily, line: null, prices, status: statusFromPrices(prices) });
    }

    const rl = (g.runLine ?? null) as Record<string, unknown> | null;
    if (rl) {
      const prices = [price("HOME", rl.home), price("AWAY", rl.away)];
      out.push({ ...base, family: "RUN_LINE", line: num(rl.line), prices, status: statusFromPrices(prices) });
    }

    const tot = (g.total ?? null) as Record<string, unknown> | null;
    if (tot) {
      const prices = [price("OVER", tot.over), price("UNDER", tot.under)];
      out.push({ ...base, family: "TOTAL", line: num(tot.line), prices, status: statusFromPrices(prices) });
    }
  }
  return out;
}

/**
 * Normalize the MLB player-props artifact.
 *
 * EVERY provider family is normalized, including the five with no modeled counterpart — market
 * context is useful on its own, and deciding what may be COMPARED is a separate concern
 * (the pairing registry). An unrecognised family is emitted with status UNSUPPORTED rather than
 * dropped, so a new provider family shows up as explicitly unsupported instead of vanishing.
 */
export function normalizePlayerMarkets(
  artifact: unknown,
  artifactRef: string,
  fallbackDate = "",
): SportsbookPlayerMarket[] {
  const j = (artifact ?? {}) as Record<string, unknown>;
  const props = (j.props ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(props)) return [];
  const prov = provenanceOf(j, artifactRef, fallbackDate);

  const out: SportsbookPlayerMarket[] = [];
  for (const p of props) {
    if (!p || typeof p !== "object") continue;
    const playerName = (p.player as string) ?? "";
    const eventId = (p.gameId as string) ?? "";
    if (!playerName) continue; // an unnamed player cannot be attached to anything

    const providerFamily = (p.market as string) ?? "";
    const family = PLAYER_FAMILY_BY_PROVIDER_KEY[providerFamily];

    // The selection string carries the side ("Over 17.5" / "Under 4.5").
    const selection = String(p.selection ?? "");
    const side: MarketSide = /^under/i.test(selection) ? "UNDER" : "OVER";
    const american = odds(p.americanOdds);
    const prices: MarketPrice[] = [
      {
        side,
        americanOdds: american,
        // The props artifact carries no probabilities — it is raw prices only. Not computed here.
        impliedProb: null,
        noVigProb: null,
        status: american !== null ? "OK" : "MALFORMED",
      },
    ];

    // `team` is null on every live row. It is left null and the mapping state says so; nothing is
    // inferred from the matchup string, which would be a guess dressed as data.
    const team = (p.team as string) ?? null;
    const mapping: MappingStatus = team ? "EXACT" : "UNRESOLVED";

    out.push({
      kind: "player",
      sport: "mlb",
      league: "MLB",
      eventId,
      eventStart: (p.startTimeUtc as string) ?? null,
      playerName,
      playerId: (p.playerId as string) ?? null,
      team,
      opponent: (p.opponent as string) ?? null,
      family: family ?? null, // null, not a placeholder — an unmodeled family must not borrow a real name
      providerFamily,
      line: num(p.point),
      prices,
      status: !family ? "UNSUPPORTED" : !eventId ? "UNAVAILABLE" : statusFromPrices(prices),
      mapping,
      provenance: prov,
    });
  }
  return out;
}
