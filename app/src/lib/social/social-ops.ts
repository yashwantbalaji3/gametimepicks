/**
 * SOCIAL OPERATIONS SURFACE — a PURE builder that turns the already-generated internal social pack into a
 * reviewable Morning / Afternoon / Evening operating board for the Social Head. It does NOT generate content
 * and does NOT post: it presents each slot's copy, canonical destination (+ a coarse source-attributed
 * variant per launch channel), the source timestamp, the slate date, freshness, and an approval state.
 *
 * Honesty guards (Phase 5 + Phase 9):
 *   • A slot that claims "today" while the latest slate is NOT today is flagged STALE and is not launchable.
 *   • An afternoon Spotlight whose canonical game report is unavailable/mismatched is flagged UNAVAILABLE.
 *   • Approval state is read (never invented) from a repo-native artifact and defaults to "draft".
 *
 * No React/Next imports so tsx can unit-test it directly; the /ops page passes the built pack + today +
 * latest slate + the set of available canonical game paths.
 */
import { withSource } from "@/lib/analytics/source";

export type ApprovalState = "draft" | "reviewed" | "approved" | "skipped";
export type SlotBlock = null | "stale" | "unavailable";

export interface SocialOpsSlot {
  slot: "morning" | "afternoon" | "evening";
  title: string;
  /** The human-review draft copy (verbatim from the pack) — never auto-posted. */
  copy: string;
  /** Canonical first-party destination path (valid WITHOUT any source parameter). */
  destinationPath: string | null;
  /** Coarse source-attributed variants for the launch channels (canonical + ?source=). */
  attributed: { x: string | null; discord: string | null };
  slateDate: string | null;
  generatedAt: string | null;
  freshnessState: "fresh" | "stale" | "unknown";
  approvalState: ApprovalState;
  /** Non-null ⇒ NOT launchable; the reason. */
  blocked: SlotBlock;
  note: string | null;
}

export interface SocialOpsBoard {
  today: string;
  slateDate: string | null;
  slots: SocialOpsSlot[];
  /** How many slots are launchable right now (not blocked). */
  launchable: number;
}

/** Minimal structural view of the built pack the board reads. */
export interface SocialPackView {
  date?: string | null;
  generatedAt?: string | null;
  sections?: {
    morningBrief?: { message?: string | null; todayUrl?: string | null } | null;
    largestSimulationDifferences?: Array<{ game?: string | null; gameUrl?: string | null; player?: string | null }> | null;
    resultsRecap?: { settledDate?: string | null; note?: string | null } | null;
  } | null;
}

const APPROVAL_STATES: ReadonlySet<string> = new Set(["draft", "reviewed", "approved", "skipped"]);
function readApproval(approvals: Record<string, string> | undefined, slot: string): ApprovalState {
  const v = approvals?.[slot];
  return typeof v === "string" && APPROVAL_STATES.has(v) ? (v as ApprovalState) : "draft";
}

function attributed(path: string | null): { x: string | null; discord: string | null } {
  return { x: path ? withSource(path, "x") : null, discord: path ? withSource(path, "discord") : null };
}

/**
 * Build the review board for a given built pack.
 * @param opts.today ET calendar day (YYYY-MM-DD).
 * @param opts.availableGamePaths canonical game report paths that actually exist on the slate (for the
 *   afternoon Spotlight availability guard). When omitted, availability is not asserted.
 * @param opts.approvals repo-native slot→state map (defaults every slot to "draft").
 */
export function buildSocialOpsBoard(
  pack: SocialPackView | null | undefined,
  opts: { today: string; availableGamePaths?: ReadonlySet<string>; approvals?: Record<string, string> },
): SocialOpsBoard {
  const today = opts.today;
  const slateDate = pack?.date ?? null;
  const generatedAt = pack?.generatedAt ?? null;
  // A pack that claims "today" but was built for another day is STALE (its morning/afternoon copy over-claims).
  const claimsToday = slateDate != null;
  const freshness: "fresh" | "stale" | "unknown" = slateDate == null ? "unknown" : slateDate === today ? "fresh" : "stale";
  const stale = claimsToday && freshness === "stale";

  const morningPath = pack?.sections?.morningBrief?.todayUrl ? "/today" : "/today"; // canonical, param-free
  const spot = pack?.sections?.largestSimulationDifferences?.[0] ?? null;
  const spotPath = typeof spot?.gameUrl === "string" && spot.gameUrl ? spot.gameUrl : null;
  const spotAvailable = spotPath != null && (opts.availableGamePaths == null || opts.availableGamePaths.has(spotPath));
  const recapSettled = pack?.sections?.resultsRecap?.settledDate ?? null;

  const slots: SocialOpsSlot[] = [
    {
      slot: "morning",
      title: "Morning — today's slate is live",
      copy: pack?.sections?.morningBrief?.message ?? "",
      destinationPath: morningPath,
      attributed: attributed(morningPath),
      slateDate,
      generatedAt,
      freshnessState: freshness,
      approvalState: readApproval(opts.approvals, "morning"),
      blocked: stale ? "stale" : null,
      note: stale ? `Draft claims ${slateDate}, but today is ${today} — stale; do not launch as "today".` : null,
    },
    {
      slot: "afternoon",
      title: "Afternoon — simulation spotlight",
      copy: spot?.game ? `Spotlight: ${spot.game}${spot.player ? ` — ${spot.player}` : ""}` : "",
      destinationPath: spotPath,
      attributed: attributed(spotPath),
      slateDate,
      generatedAt,
      freshnessState: freshness,
      approvalState: readApproval(opts.approvals, "afternoon"),
      blocked: !spotAvailable ? "unavailable" : stale ? "stale" : null,
      note: !spotAvailable
        ? "Spotlight game report is unavailable or mismatched — do not surface."
        : stale
          ? `Draft claims ${slateDate}, but today is ${today} — stale; do not launch as "today".`
          : null,
    },
    {
      // Evening recap references the settled (yesterday) date — it does NOT claim today's slate, so it is
      // never "stale-for-today"; it is only unavailable when there is no settled prior date.
      slot: "evening",
      title: "Evening — results recap",
      copy: recapSettled ? `Recap of settled ${recapSettled} → /results` : "",
      destinationPath: "/results",
      attributed: attributed("/results"),
      slateDate: recapSettled,
      generatedAt,
      freshnessState: recapSettled ? "fresh" : "unknown",
      approvalState: readApproval(opts.approvals, "evening"),
      blocked: recapSettled ? null : "unavailable",
      note: recapSettled ? null : "No settled prior-date recap available yet.",
    },
  ];

  return { today, slateDate, slots, launchable: slots.filter((s) => s.blocked == null).length };
}
