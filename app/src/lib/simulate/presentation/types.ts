/**
 * THE PRESENTATION MANIFEST — Program 234 · Release B.
 *
 * One immutable projection of an ALREADY-COMMITTED report into the chapters a bounded player can
 * show. It is a projection and nothing else: it runs no prediction engine, prices nothing, settles
 * nothing, and reads exactly one artifact revision. Every number in it is carried, never derived —
 * so "the value on screen equals the value in the report" is provable by identity rather than by
 * re-deriving the same arithmetic twice and hoping the two agree.
 *
 * WHY A MANIFEST AND NOT PROPS. The player is a presentation with a clock. If it read the report
 * directly it would be free to reach for a field mid-playback that a later chapter had changed, and
 * a reader watching a fixed frame has no way to notice. Freezing the projection at build time makes
 * "no prediction changes between playbacks" a property of the data rather than a promise about the
 * component.
 *
 * ONE REVISION, ENFORCED. MLB joins two artifacts (the full-game simulation and the decision engine)
 * that each stamp an `artifactHash`. The builder refuses to emit a manifest when they disagree,
 * because a presentation that narrates one revision's win probability beside another's projected
 * score is wrong in a way no chapter could disclose.
 *
 * A CHAPTER IS OMITTED, NEVER FAKED. `supportedChapters` is derived from what the report actually
 * carries. A sport with no player model has no player chapter; it does not get an empty one.
 */

/**
 * What the player can present. The four sports, plus `board` for the content types that are not one
 * event: today's Top 10, a published parlay, a results recap. `board` has no entry in the sport
 * theme registry and resolves to the generic arena, which is the correct answer rather than a gap —
 * a Top 10 spanning two sports must not wear either one's colours.
 */
export type PresentationSport = "mlb" | "nfl" | "epl" | "ufc" | "board";

export type ChapterKind =
  | "event"
  | "outcome"
  | "distribution"
  | "margin"
  | "scores"
  | "players"
  | "limits"
  | "closing";

/** A labelled quantity carried verbatim from the report. `value` is the number the report holds. */
export interface PresentationStat {
  readonly label: string;
  readonly value: number | null;
  /** How the player must render it. Formatting is shared so two surfaces cannot disagree. */
  readonly format: "probability" | "count" | "decimal1" | "decimal2" | "signed" | "text";
  /** Pre-resolved text for `format: "text"` and for values that are genuinely words. */
  readonly text?: string;
  /** A short qualification printed beneath the number — never a claim, always a limit or a source. */
  readonly note?: string;
}

export interface PresentationBar {
  readonly label: string;
  /** Share of the distribution in [0,1]. Carried from the artifact. */
  readonly p: number;
  readonly highlight?: boolean;
}

export interface PresentationChapter {
  readonly id: string;
  readonly kind: ChapterKind;
  readonly title: string;
  /** One plain sentence. The chapter's truth carrier — motion decorates, this states. */
  readonly line: string;
  readonly stats: readonly PresentationStat[];
  readonly bars: readonly PresentationBar[];
  /** Bullet rows (player picks, limits). Kept short so the frame never needs a scrollbar. */
  readonly rows: readonly { readonly label: string; readonly detail: string; readonly value?: string }[];
  /**
   * Axis caption for a chapter that draws a distribution. It lives HERE rather than in the player
   * because units belong to the sport: the player hardcoded "Total runs · share of simulated games"
   * and printed it under an EPL goals histogram, which was both the wrong unit and a run-count claim
   * for a model that runs no trials.
   */
  readonly axisCaption?: string;
  /** Milliseconds this chapter holds during auto-play. Longer for denser chapters. */
  readonly holdMs: number;
}

export interface PresentationProvenance {
  /** The one artifact revision every chapter was projected from. */
  readonly artifactHash: string | null;
  readonly modelVersion: string | null;
  readonly simulationVersion: number | null;
  /** Only present when the source explicitly permits the claim. Never inferred from an array length. */
  readonly runCount: number | null;
  readonly generatedAt: string | null;
  readonly marketCapturedAt: string | null;
  readonly bookmaker: string | null;
}

export interface PresentationManifest {
  readonly schema: 1;
  readonly sport: PresentationSport;
  /** Canonical event identity — the same id the report and the ledgers use. */
  readonly eventId: string;
  readonly slug: string;
  readonly title: string;
  /** Display date (the product/slate day) and the real kickoff instant. */
  readonly displayDate: string;
  readonly startUtc: string | null;
  readonly venue: string | null;
  readonly home: { readonly name: string; readonly abbr: string; readonly logo: string | null };
  readonly away: { readonly name: string; readonly abbr: string; readonly logo: string | null };
  /**
   * The report's own verdict, carried. `degraded` is shown, not hidden.
   *
   * `archived` is the retrospective reading: the event has started or settled, so no new forecast
   * may be generated for it — but the FROZEN pre-event forecast still exists and is worth showing,
   * labelled with its true event date and never framed as a live read. Refusing to show it at all
   * would confuse "cannot forecast this now" with "cannot display what we forecast then".
   */
  readonly readiness: "ready" | "degraded" | "archived";
  readonly provenance: PresentationProvenance;
  readonly supportedChapters: readonly ChapterKind[];
  readonly chapters: readonly PresentationChapter[];
  /** Where the full, non-animated report lives. Always reachable, even if the player fails. */
  readonly reportHref: string;
}

/** Why a presentation could not be built. Typed so the player states a reason instead of blanking. */
export interface PresentationUnavailable {
  readonly schema: 1;
  readonly sport: PresentationSport;
  readonly eventId: string;
  readonly unavailable: true;
  readonly reason: string;
  readonly reportHref: string;
}

export type PresentationResult = PresentationManifest | PresentationUnavailable;

export const isPresentable = (r: PresentationResult | null | undefined): r is PresentationManifest =>
  !!r && !("unavailable" in r);
