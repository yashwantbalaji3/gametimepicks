/**
 * Four adapters onto the shared hub contract, each reading the owner its sport already has.
 *
 * No adapter invents anything. Where a sport has no forecast for an event, the row still appears
 * with `read: null` and says so — the alternative, dropping it, is how a page comes to imply that
 * every scheduled game is simulated. Where a sport has no per-event report at all (UFC), every row
 * says that once, plainly, instead of offering a link that goes nowhere.
 */
import { buildAllGameDetails, urlSport } from "@/lib/game-detail";
import type { PublicGameDetail } from "@/lib/game-detail";
import { loadEplForecasts, loadEplForecastArchive } from "@/lib/sports/epl/forecast-view";
import type { EplForecastRow } from "@/lib/sports/epl/forecast-view";
import { DEFAULT_LABELS, type HubGameRow, type HubRead, type SportHubModel } from "./contract";

const ET = "America/New_York";

/**
 * A start time we actually have, or nothing.
 *
 * `PublicGameDetail.date` is a calendar day, not an instant. The first version of this adapter turned
 * it into `T00:00:00Z` and rendered the result — which printed "8:00 PM ET" on every row and named
 * the PREVIOUS day, because midnight UTC is the evening before in New York. Two fabricated values
 * from one careless cast. The real first pitch is on the artifacts; when it is not, the row shows the
 * date alone and says nothing about a time.
 */
function startOf(d: Record<string, any>): { iso: string | null; exact: boolean } {
  const iso = d.fullGameSim?.firstPitch ?? d.gameCenter?.firstPitch ?? d.marketIntelligence?.startTime ?? null;
  if (typeof iso === "string" && Number.isFinite(Date.parse(iso))) return { iso, exact: true };
  return { iso: typeof d.date === "string" ? d.date : null, exact: false };
}

const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);   // midday, so no timezone shift can move the date
  return Number.isNaN(d.getTime()) ? day
    : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

function startLabelOf(start: { iso: string | null; exact: boolean }): string {
  if (!start.iso) return "TBD";
  if (!start.exact) return dayLabel(start.iso);          // a date, presented as a date
  const d = new Date(start.iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: ET })} · `
    + `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET })} ET`;
}

/** Started, from a real instant where we have one and from the calendar day where we do not. */
function startedOf(start: { iso: string | null; exact: boolean }, nowMs: number): boolean {
  if (!start.iso) return false;
  if (start.exact) return Date.parse(start.iso) <= nowMs;
  return Date.parse(`${start.iso}T23:59:59Z`) <= nowMs;   // a past DAY has certainly started
}

/**
 * The strongest supported read for one game.
 *
 * `predictionLine` is the deterministic prediction engine's own one-line output — "NYM · UNDER 8 ·
 * SF +1.5" — and it is the model speaking. `gameCenter` is `method: "market_implied"` from the odds
 * feed, and it is the market speaking. They are returned under different kinds and never merged: a
 * de-vigged book number relabelled as model confidence is the exact misreading the kind field exists
 * to prevent.
 */
function readForGame(d: Record<string, any>): HubRead | null {
  if (typeof d.predictionLine === "string" && d.predictionLine.trim()) {
    return { label: d.predictionLine, kind: "MODEL_FORECAST", detail: d.prediction?.modelVersion ?? "simulation" };
  }
  const gc = d.gameCenter;
  if (gc?.moneyline?.favorite) {
    const fav = gc.moneyline.favorite === "home" ? gc.homeTeam : gc.awayTeam;
    const p = gc.moneyline.favorite === "home" ? gc.moneyline.homeWinProb : gc.moneyline.awayWinProb;
    if (fav && typeof p === "number") {
      return { label: `${fav} · ${Math.round(p * 100)}%`, kind: "MARKET_PRICE", detail: gc.source ?? "book price" };
    }
  }
  const team = (d.teamProjections ?? []).filter((x: any) => x.participantType === "team" || x.participantType === "game");
  const best = [...team].sort((a: any, b: any) => (b.modelProbability ?? 0) - (a.modelProbability ?? 0))[0];
  if (best && typeof best.modelProbability === "number") {
    return { label: `${best.pickLabel} · ${Math.round(best.modelProbability * 100)}%`, kind: "MODEL_FORECAST", detail: best.marketLabel };
  }
  return null;
}

/** Status from the artifact where one exists, never inferred over the top of it. */
function statusOf(d: Record<string, any>, started: boolean): string {
  const phase = d.marketIntelligence?.eventPhase;
  if (typeof phase === "string" && phase) return phase.toLowerCase().replace(/_/g, " ");
  return started ? "started or final" : "scheduled";
}

function gameRows(sport: "mlb" | "nfl", nowMs: number): HubGameRow[] {
  return buildAllGameDetails()
    .filter((d) => d.sport === sport)
    .map((detail): HubGameRow => {
      const d = detail as unknown as Record<string, any>;
      const start = startOf(d);
      const started = startedOf(start, nowMs);
      return {
        id: detail.slug,
        startUtc: start.exact ? start.iso : (start.iso ? `${start.iso}T12:00:00Z` : null),
        startLabel: startLabelOf(start),
        matchup: detail.title,
        status: statusOf(d, started),
        started,
        read: readForGame(d),
        reportState: started ? "ARCHIVE" : "READY",
        reportHref: `/games/${urlSport(detail.sport)}/${detail.slug}/`,
      };
    });
}

/** First and last day the rows span, so a "week" is never read as a day. */
function rangeOf(rows: HubGameRow[]): string | null {
  const days = rows.map((r) => r.startLabel.split(" · ")[0]).filter(Boolean);
  if (!days.length) return null;
  const sorted = [...rows].sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)));
  const first = sorted[0].startLabel.split(" · ")[0], last = sorted[sorted.length - 1].startLabel.split(" · ")[0];
  return first === last ? first : `${first} – ${last}`;
}

export function mlbHub(nowIso: string): SportHubModel {
  const rows = gameRows("mlb", Date.parse(nowIso));
  return {
    sport: "mlb", sportLabel: "MLB", labels: DEFAULT_LABELS,
    // The day the board is FOR, taken from the rows rather than the clock: at 2am ET the current
    // board is still yesterday's slate, and calling it "Today" would be the oldest lie on this site.
    periodLabel: rows[0]?.startLabel?.split(" · ")[0] ?? "No slate",
    periodRange: null,
    freshness: null,
    rows,
    present: ["games", "products", "simulations", "picks", "results"],
    emptyReason: "No MLB games are on the board for this date. The board is generated each morning; a date with no games has none scheduled.",
  };
}

/**
 * NFL, and the reason it does not lead with a week.
 *
 * The charter asks NFL to default to the official week and phase. The artifacts do not contain one:
 * every NFL game on the board runs 2026-08-14 to 2026-08-29, carries no prediction, no simulation,
 * no market snapshot and no projections, and its dataStatus reads "Lines pending for this game."
 * Those are preseason fixtures, and the last of them was nine days before this was written.
 *
 * Labelling that "This week" — as the first version did — would be the page inventing a current
 * slate out of an archive. The honest header names the phase and the span, and the empty-read state
 * on every row says the rest. Nothing here is padded to match the other three sports.
 */
export function nflHub(nowIso: string): SportHubModel {
  const rows = gameRows("nfl", Date.parse(nowIso));
  const allStarted = rows.length > 0 && rows.every((r) => r.started);
  const anyRead = rows.some((r) => r.read !== null);
  return {
    sport: "nfl", sportLabel: "NFL", labels: { ...DEFAULT_LABELS, games: "Games" },
    periodLabel: allStarted && !anyRead ? "Preseason archive" : "Current window",
    periodRange: rangeOf(rows),
    freshness: null,
    rows,
    present: ["games", "products", "simulations", "picks", "results"],
    emptyReason: "No NFL games are on the board. Fresh NFL odds are not being captured — the paid acquisition allowance has lapsed and renewal is a founder decision.",
  };
}

/**
 * EPL. Only `CURRENT_PRE_EVENT` rows carry probabilities, by the qualification policy this repository
 * already enforces — so every other row shows its own `unavailableReason` rather than a number the
 * policy withheld.
 */
export function eplHub(nowIso: string): SportHubModel {
  const nowMs = Date.parse(nowIso);
  const set = loadEplForecasts();
  const live: EplForecastRow[] = (set?.rows ?? []) as EplForecastRow[];
  const rows: HubGameRow[] = live.map((r): HubGameRow => {
    const started = startedOf({ iso: r.kickoffUtc, exact: true }, nowMs);
    const p = r.probs;
    let read: HubRead | null = null;
    if (p) {
      const best = [["home", p.home, r.homeClub], ["draw", p.draw, "Draw"], ["away", p.away, r.awayClub]] as const;
      const top = [...best].sort((a, b) => (b[1] as number) - (a[1] as number))[0];
      read = { label: `${top[2] ?? top[0]} · ${Math.round((top[1] as number) * 100)}%`, kind: "MODEL_FORECAST", detail: "match result" };
    }
    return {
      id: r.eventId,
      startUtc: r.kickoffUtc,
      startLabel: startLabelOf({ iso: r.kickoffUtc, exact: true }),
      matchup: r.matchup,
      status: started ? "started or final" : "scheduled",
      started,
      read,
      reportState: r.slug ? (started ? "ARCHIVE" : "READY") : "NONE",
      reportHref: r.slug ? `/epl/match/${r.slug}/` : null,
      reportNote: r.slug ? undefined : (r.unavailableReason ?? "no published forecast"),
    };
  });
  return {
    sport: "epl", sportLabel: "Premier League", labels: { ...DEFAULT_LABELS, games: "Fixtures" },
    periodLabel: live[0]?.matchweek ? `Matchweek ${live[0].matchweek}` : "Next fixtures",
    periodRange: rangeOf(rows),
    freshness: set?.generatedAt ?? null,
    rows,
    present: ["games", "products", "simulations", "picks", "results"],
    emptyReason: "No Premier League fixtures carry a published forecast for this matchweek.",
  };
}

/**
 * UFC. A bout is not a game, and there is no per-bout report route — the card is the unit. Every row
 * therefore says so once, in `reportNote`, rather than linking somewhere that does not exist.
 */
export function ufcHub(nowIso: string, bouts: Array<{ id: string; matchup: string; startUtc: string | null; status?: string; read?: HubRead | null }>, eventLabel: string): SportHubModel {
  const nowMs = Date.parse(nowIso);
  const rows: HubGameRow[] = bouts.map((b): HubGameRow => {
    const started = startedOf({ iso: b.startUtc, exact: Boolean(b.startUtc) }, nowMs);
    return {
      id: b.id, startUtc: b.startUtc, startLabel: startLabelOf({ iso: b.startUtc, exact: Boolean(b.startUtc) }),
      matchup: b.matchup, status: b.status ?? (started ? "started or final" : "scheduled"),
      started, read: b.read ?? null,
      reportState: "NONE", reportHref: null,
      reportNote: "card-level report",
    };
  });
  return {
    sport: "ufc", sportLabel: "UFC", labels: { ...DEFAULT_LABELS, games: "Bouts", simulations: "Card report" },
    periodLabel: eventLabel, periodRange: null, freshness: null, rows,
    present: ["games", "simulations", "picks", "results"],
    emptyReason: "No bouts are on the current card.",
  };
}
