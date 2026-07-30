/**
 * EPL preview view model — everything the internal surface shows, and nothing else.
 *
 * The surface answers exactly two questions: what does the market believe, and what actually
 * happened. There is no GameTimePicks number on it. That is a structural property here, not a
 * styling choice: this module builds no field the canonical artifact does not already contain, and
 * `MODEL_FIELD_KEYS` is refused at artifact validation, so a modelled figure has no route onto the
 * page even if a future template asked for one.
 *
 * Movement is derived ONLY from multiple real capture snapshots. With one snapshot the model reports
 * `SINGLE_CAPTURE` and the surface says so — a line drawn between one point and itself is a claim
 * about data we do not have.
 */
import type { EventIdentity } from "@/lib/identity/event-identity";
import { readLifecycle, type LifecycleReading } from "./epl-lifecycle";
import {
  MATCH_RESULT_OUTCOMES,
  readMatchResult1x2,
  type MatchResult1x2Reading,
  type MatchResultOutcome,
} from "./epl-markets";
import { isRowPregame, type EplFixtureRow, type EplOddsRow } from "./epl-artifacts";
import { buildEplClubIndex, type EplClubIndex } from "./epl-clubs";
import { eplSettlementReadiness, type EplSettlementReadiness } from "./epl-settlement-adapter";

/** One capture of one book's three-way price, with its eligibility verdict attached. */
export interface EplCaptureView {
  readonly book: string;
  readonly capturedAt: string;
  readonly reading: MatchResult1x2Reading;
  /** `capturedAt < kickoffIso`. False rows never reach here — validation rejects them upstream. */
  readonly pregame: boolean;
}

export type MovementState =
  /** No capture at all for this fixture. */
  | "NO_CAPTURE"
  /** Exactly one snapshot per book. Movement is not observable and is not shown. */
  | "SINGLE_CAPTURE"
  /** Two or more snapshots for at least one book. Movement is measured between real captures. */
  | "MULTI_CAPTURE";

export interface EplMovementView {
  readonly state: MovementState;
  readonly snapshotCount: number;
  readonly firstCapturedAt: string | null;
  readonly lastCapturedAt: string | null;
  /**
   * No-vig change per outcome, first capture to last, for one book. Present ONLY on MULTI_CAPTURE.
   * Absent means "not observed", never zero.
   */
  readonly noVigDelta: Readonly<Record<MatchResultOutcome, number>> | null;
  readonly deltaBook: string | null;
}

export interface EplFixtureView {
  readonly eventId: string;
  readonly homeClub: string;
  readonly awayClub: string;
  readonly homeAbbr: string | null;
  readonly awayAbbr: string | null;
  readonly kickoffUtc: string;
  readonly kickoffUtcLabel: string;
  readonly kickoffEtLabel: string;
  /** Upstream aliases, rendered as `provider:id` so provenance is visible rather than implied. */
  readonly providerRefs: readonly string[];
  readonly lifecycle: LifecycleReading;
  readonly captures: readonly EplCaptureView[];
  readonly movement: EplMovementView;
  readonly settlement: EplSettlementReadiness;
}

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const utcFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const label = (fmt: Intl.DateTimeFormat, iso: string, suffix: string): string => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? `${fmt.format(new Date(t))} ${suffix}` : "unknown";
};

function buildMovement(rows: readonly EplOddsRow[]): EplMovementView {
  if (rows.length === 0) {
    return {
      state: "NO_CAPTURE",
      snapshotCount: 0,
      firstCapturedAt: null,
      lastCapturedAt: null,
      noVigDelta: null,
      deltaBook: null,
    };
  }

  const sorted = [...rows].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const byBook = new Map<string, EplOddsRow[]>();
  for (const row of sorted) byBook.set(row.book, [...(byBook.get(row.book) ?? []), row]);

  const multi = [...byBook.entries()].find(([, list]) => new Set(list.map((r) => r.capturedAt)).size > 1);
  const base = {
    snapshotCount: sorted.length,
    firstCapturedAt: sorted[0].capturedAt,
    lastCapturedAt: sorted[sorted.length - 1].capturedAt,
  };

  if (!multi) {
    return { state: "SINGLE_CAPTURE", ...base, noVigDelta: null, deltaBook: null };
  }

  const [book, list] = multi;
  const first = readMatchResult1x2(list[0].prices);
  const last = readMatchResult1x2(list[list.length - 1].prices);
  if (first.status !== "OK" || last.status !== "OK") {
    return { state: "MULTI_CAPTURE", ...base, noVigDelta: null, deltaBook: book };
  }

  const noVigDelta = Object.fromEntries(
    MATCH_RESULT_OUTCOMES.map((o) => [o, last.noVig![o] - first.noVig![o]]),
  ) as Record<MatchResultOutcome, number>;
  return { state: "MULTI_CAPTURE", ...base, noVigDelta, deltaBook: book };
}

/**
 * Assemble the preview rows.
 *
 * Fixtures drive the list, not odds: a fixture with no capture is a real and useful state (it says
 * the ingest has not reached it), while an odds row with no fixture is an unresolved reference and is
 * dropped rather than rendered under a provider's own spelling.
 */
export function buildEplPreview(input: {
  fixtures: readonly EplFixtureRow[];
  odds: readonly EplOddsRow[];
  identities?: readonly EventIdentity[];
  clubIndex?: EplClubIndex;
  approvedResultsSources?: readonly string[];
}): EplFixtureView[] {
  const index = input.clubIndex ?? buildEplClubIndex();
  const settlement = eplSettlementReadiness(input.approvedResultsSources);
  const identityById = new Map((input.identities ?? []).map((i) => [i.eventId, i]));

  const oddsByEvent = new Map<string, EplOddsRow[]>();
  for (const row of input.odds) {
    oddsByEvent.set(row.eventId, [...(oddsByEvent.get(row.eventId) ?? []), row]);
  }

  return [...input.fixtures]
    .sort((a, b) => Date.parse(a.kickoffIso) - Date.parse(b.kickoffIso))
    .map((fixture) => {
      const rows = oddsByEvent.get(fixture.eventId) ?? [];
      const identity = identityById.get(fixture.eventId);
      const refs = [
        ...fixture.providerRefs,
        ...(identity?.providerIds ?? []),
      ].map((r) => `${r.provider}:${r.id}`);

      return {
        eventId: fixture.eventId,
        homeClub: fixture.homeClub,
        awayClub: fixture.awayClub,
        homeAbbr: index.resolve(fixture.homeClub)?.abbr ?? null,
        awayAbbr: index.resolve(fixture.awayClub)?.abbr ?? null,
        kickoffUtc: fixture.kickoffIso,
        kickoffUtcLabel: label(utcFormatter, fixture.kickoffIso, "UTC"),
        kickoffEtLabel: label(etFormatter, fixture.kickoffIso, "ET"),
        providerRefs: [...new Set(refs)].sort(),
        lifecycle: readLifecycle(fixture.lifecycle),
        captures: [...rows]
          .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
          .map((row) => ({
            book: row.book,
            capturedAt: row.capturedAt,
            reading: readMatchResult1x2(row.prices),
            pregame: isRowPregame(row),
          })),
        movement: buildMovement(rows),
        settlement,
      };
    });
}

/**
 * Every sentence the preview surface renders.
 *
 * Kept as data so the no-model guard can read the copy directly rather than parse JSX, and so the
 * claims this surface makes are enumerable in one place.
 */
export const EPL_PREVIEW_COPY = {
  title: "EPL market intelligence — internal preview",
  subtitle:
    "Unlisted, founder-facing, and not promoted anywhere. Premier League only; three-way match result only.",
  noModel:
    "There is no GameTimePicks number on this page. Every probability below is our conversion of a " +
    "sportsbook's posted three-way price. No projection, no rating, no selection, no comparison " +
    "between a model and a market.",
  probabilities:
    "No-vig figures remove the book's overround proportionally across home, draw and away, so the " +
    "three sum to 1. Raw implied figures still carry the book's margin.",
  leakage:
    "Every row records when we captured it. A capture that does not precede kickoff is refused at " +
    "validation, so no row on this page could see the result it describes.",
  singleCapture:
    "One capture. Movement is not shown, because a line drawn between one snapshot and itself is a " +
    "claim about data we do not have.",
  lifecycleNote:
    "Postponed and abandoned fixtures render as first-class states. A rescheduled fixture is a new " +
    "event identity — markets never roll over to it.",
  sampleData:
    "These rows are committed SAMPLE artifacts, not a capture. They exist to pin the schema before " +
    "the first real ingest and never count toward coverage.",
} as const;
