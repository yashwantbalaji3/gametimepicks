/**
 * Empty-state taxonomy — single source of truth for the 6 patterns
 * documented in `docs/UI_UX_AUDIT_2026-05-27.md`. Each variant carries
 * its own eyebrow, body, and tone. Pages pick a variant rather than
 * writing prose inline so the copy stays consistent and the tests can
 * lock it down.
 *
 * Honesty rules:
 *   - No banned copy. The audit doc lists the forbidden words; the
 *     unit test asserts none appear in the catalog.
 *   - No promises about future results. Every body sentence describes
 *     what's true RIGHT NOW.
 *   - Replay and Custom variants explicitly note their non-official
 *     status so the taxonomy itself enforces the integrity boundary.
 */

export type EmptyStateVariant =
  | "no-games"
  | "no-props"
  | "no-safe-slips"
  | "settlement-pending"
  | "replay-only"
  | "custom-only";

export type EmptyStateTone = "neutral" | "info" | "warn";

export interface EmptyStateCopy {
  variant: EmptyStateVariant;
  eyebrow: string;
  body: string;
  tone: EmptyStateTone;
}

/**
 * Catalog keyed by variant. Tests assert every variant in the union
 * has an entry here.
 */
export const EMPTY_STATE_COPY: Record<EmptyStateVariant, EmptyStateCopy> = {
  "no-games": {
    variant: "no-games",
    eyebrow: "No games on the board",
    body: "No games are scheduled for this sport on this date.",
    tone: "neutral",
  },
  "no-props": {
    variant: "no-props",
    eyebrow: "Games scheduled, props pending",
    body: "Games are on the board, but player props are not available yet. We do not fabricate prop lines.",
    tone: "info",
  },
  "no-safe-slips": {
    variant: "no-safe-slips",
    eyebrow: "No safe slip cleared the filters",
    body: "Props are available, but the safety filters did not find a clean official slip for this lane today.",
    tone: "info",
  },
  "settlement-pending": {
    variant: "settlement-pending",
    eyebrow: "Settlement pending",
    body: "Results will update after games finish and the nightly settle runs.",
    tone: "info",
  },
  "replay-only": {
    variant: "replay-only",
    eyebrow: "Replay · not official",
    body: "This is a retrospective replay, not the official live model. Not included in the official public hit rate.",
    tone: "warn",
  },
  "custom-only": {
    variant: "custom-only",
    eyebrow: "Custom · not officially tracked",
    body: "Custom builds are for exploration and are not included in the official public hit rate.",
    tone: "neutral",
  },
};

/** Tiny convenience — throws on unknown so a bad call surfaces at
 *  TypeScript level rather than rendering blank. */
export function getEmptyStateCopy(variant: EmptyStateVariant): EmptyStateCopy {
  const copy = EMPTY_STATE_COPY[variant];
  if (!copy) {
    throw new Error(`Unknown empty-state variant: ${variant}`);
  }
  return copy;
}

/**
 * Catalog of banned copy. The matching unit test scans every body +
 * eyebrow in EMPTY_STATE_COPY and asserts none appear. Keep this in
 * lockstep with `docs/UI_UX_AUDIT_2026-05-27.md`.
 */
export const BANNED_COPY_PATTERNS: ReadonlyArray<RegExp> = [
  /\block\b/i,
  /\bguaranteed\b/i,
  /\bfree money\b/i,
  /\brisk[\s-]?free\b/i,
  /\bcan(?:'|’)?t miss\b/i,
  /\beasy win\b/i,
  /\bno[\s-]?brainer\b/i,
  /\bsure thing\b/i,
  /\bsharp money\b/i,
];
