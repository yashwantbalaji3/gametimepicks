/**
 * Centralized result-icon helpers for the Results pages.
 *
 * PR #111 (Results mobile redesign) introduces a consistent visual
 * vocabulary for hit / miss / push / pending across:
 *   - parlay slips
 *   - parlay legs
 *   - settled per-player picks
 *
 * Accessibility:
 *   - Never rely on color alone — every icon has an aria-label.
 *   - Icons are real Unicode glyphs (no icon font dependency).
 *   - "tone" maps to CSS custom property names already in the
 *     theme so consumers can paint without re-deriving rules.
 *
 * Honesty:
 *   - "pending" / "unresolved" / "stats_unavailable" are explicitly
 *     NOT counted as a loss anywhere. They render as "—" with the
 *     mute tone so the page is honest about the state.
 *   - Push (➖) is its own state. It does not count toward wins or
 *     losses in any helper.
 */

export type ResultKind =
  | "win"
  | "loss"
  | "push"
  | "pending"
  | "unknown";

export interface ResultIconMeta {
  /** Display glyph. Safe to render inline as text. */
  icon: string;
  /** Short label suitable for chips ("Hit" / "Miss" / "Push" / "—"). */
  label: string;
  /** Long label suitable for screen readers + tooltips. */
  ariaLabel: string;
  /** Theme custom-property name (e.g. var(--vault-success)). */
  tone: string;
}

const REGISTRY: Record<ResultKind, ResultIconMeta> = {
  win: {
    icon: "✅",
    label: "Hit",
    ariaLabel: "Hit",
    tone: "var(--vault-success)",
  },
  loss: {
    icon: "❌",
    label: "Miss",
    ariaLabel: "Miss",
    tone: "var(--vault-warn)",
  },
  push: {
    icon: "➖",
    label: "Push",
    ariaLabel: "Push — excluded from hit rate",
    tone: "var(--vault-text-mute)",
  },
  pending: {
    icon: "—",
    label: "Pending",
    ariaLabel: "Pending or unavailable — excluded from hit rate",
    tone: "var(--vault-text-faint)",
  },
  unknown: {
    icon: "—",
    label: "—",
    ariaLabel: "Unknown",
    tone: "var(--vault-text-faint)",
  },
};

/**
 * Normalize any of the strings we see in graded data to a single
 * ResultKind. Anything we can't classify safely maps to "unknown",
 * never to "win"/"loss".
 *
 * Accepts:
 *   - parlay slip status: "win" / "loss" / "push" / "pending" / "void"
 *   - parlay leg result: "win" / "loss" / "push" / "unresolved" / null
 *   - settled-lean result: "win" / "loss" / "push" / "stats_unavailable"
 *                          / "invalid"
 *   - any string casing
 */
export function normalizeResult(raw: unknown): ResultKind {
  if (raw === null || raw === undefined) return "pending";
  const s = String(raw).toLowerCase().trim();
  if (s === "win" || s === "hit" || s === "true") return "win";
  if (s === "loss" || s === "lose" || s === "miss" || s === "false") return "loss";
  if (s === "push") return "push";
  if (
    s === "pending" ||
    s === "unresolved" ||
    s === "stats_unavailable" ||
    s === "dnp" ||
    s === "unavailable" ||
    s === "void" ||
    s === ""
  ) {
    return "pending";
  }
  if (s === "invalid") return "unknown";
  return "unknown";
}

/** Get the icon metadata for any raw result. */
export function getResultIcon(raw: unknown): ResultIconMeta {
  return REGISTRY[normalizeResult(raw)];
}

/** Convenience: just the glyph. */
export function getResultGlyph(raw: unknown): string {
  return REGISTRY[normalizeResult(raw)].icon;
}

/** Convenience: just the screen-reader label. */
export function getResultLabel(raw: unknown): string {
  return REGISTRY[normalizeResult(raw)].label;
}

/** Convenience: just the theme tone. */
export function getResultTone(raw: unknown): string {
  return REGISTRY[normalizeResult(raw)].tone;
}

/** True for "win"/"loss" (decisive). Push + pending excluded. */
export function isDecisive(raw: unknown): boolean {
  const k = normalizeResult(raw);
  return k === "win" || k === "loss";
}
