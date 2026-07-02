/**
 * Shared PRODUCT-STATUS vocabulary — one canonical set of states + one tone mapping so every surface
 * (Home, Today, Games, MLB, Picks, Bank Builder, Moonshot, WC Specials, World Cup, Results, Track Record)
 * labels a product the SAME way. The goal from the brief: no product disappears, no stale product looks
 * active, no retired product looks active.
 *
 * Pure data only — the <StatusBadge> component renders these. Kept exhaustive so a `switch` over
 * ProductStatus is compile-checked when new states are added.
 */
export type ProductStatus =
  | "active" // a product with live paper exposure right now
  | "live" // an event currently in progress / live odds
  | "pregame" // scheduled, not yet started
  | "in_progress" // a game/slate underway
  | "completed" // finished, not yet officially graded
  | "awaiting_settlement" // finished, waiting on the official box score
  | "awaiting_refresh" // the slate/data is behind today — needs a fresh generation
  | "proposed" // a candidate card the model surfaced, not yet approved
  | "approved" // operator-approved, pinned
  | "settled" // officially graded
  | "skipped" // intentionally not played (gated / below threshold)
  | "no_qualified_play" // nothing cleared the bar today (honest empty state)
  | "market_pending" // the market exists but odds haven't posted yet
  | "market_unavailable" // the book doesn't offer this market for the fixture
  | "retired" // permanently discontinued (e.g. Homer Nukes)
  | "stale"; // shown for reference but out of date

/** Tone buckets → the badge palette. Kept small so the visual language stays consistent. */
export type StatusTone = "positive" | "live" | "neutral" | "info" | "warn" | "muted" | "danger";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

const META: Record<ProductStatus, StatusMeta> = {
  active: { label: "Active", tone: "positive" },
  live: { label: "Live", tone: "live" },
  pregame: { label: "Pregame", tone: "info" },
  in_progress: { label: "In progress", tone: "live" },
  completed: { label: "Completed", tone: "neutral" },
  awaiting_settlement: { label: "Awaiting settlement", tone: "warn" },
  awaiting_refresh: { label: "Awaiting refresh", tone: "warn" },
  proposed: { label: "Proposed", tone: "info" },
  approved: { label: "Approved", tone: "positive" },
  settled: { label: "Settled", tone: "neutral" },
  skipped: { label: "Skipped", tone: "muted" },
  no_qualified_play: { label: "No qualified play", tone: "muted" },
  market_pending: { label: "Market pending", tone: "warn" },
  market_unavailable: { label: "Market unavailable", tone: "muted" },
  retired: { label: "Retired", tone: "muted" },
  stale: { label: "Stale", tone: "warn" },
};

export function statusMeta(status: ProductStatus): StatusMeta {
  return META[status] ?? { label: String(status), tone: "muted" };
}

/** Every known status (for exhaustiveness tests + storybook-style rendering). */
export const ALL_PRODUCT_STATUSES = Object.keys(META) as ProductStatus[];
