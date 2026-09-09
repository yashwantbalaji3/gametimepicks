/**
 * ONE BOUT, ONE URL (P251 · F3).
 *
 * UFC was the only live sport with no per-event route. Every "View report" on the hub was an
 * anchor to a row further down the same page, so a bout could not be shared, bookmarked, linked
 * to from a ranked panel, or indexed — and this is the sport whose model is the best evidenced on
 * the site: three heads, all PASS on preregistered bars, measured over 3,557 held-out fights.
 *
 * The card artifact is already the whole read. This is the lookup that lets a route address one
 * bout inside it, and the static-params list the export needs.
 */
import fs from "node:fs";
import path from "node:path";

import type { UfcBout, UfcCardArtifact } from "@/components/sports/ufc-card";

export function loadUfcCard(): UfcCardArtifact | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "card-latest.json"), "utf8"),
    ) as UfcCardArtifact;
  } catch {
    return null;
  }
}

export interface UfcBoutContext {
  card: UfcCardArtifact;
  bout: UfcBout;
  /** Position on the card, 0 = main event — the hub's own ordering, never re-sorted here. */
  index: number;
  /** Every other bout on the same card, in card order, for the sibling strip. */
  siblings: UfcBout[];
}

export function findUfcBout(boutId: string): UfcBoutContext | null {
  const card = loadUfcCard();
  const bouts = card?.bouts ?? [];
  const index = bouts.findIndex((b) => String(b.boutId) === String(boutId));
  if (!card || index < 0) return null;
  return { card, bout: bouts[index], index, siblings: bouts.filter((_, i) => i !== index) };
}

/** Every bout the current card carries — including the ones the model refuses to read. */
export function ufcBoutIds(): string[] {
  return (loadUfcCard()?.bouts ?? []).map((b) => String(b.boutId));
}

/** "Main event" / "Co-main event" / "Bout 3 of 13" — the card's own vocabulary for position. */
export function boutPositionLabel(index: number, total: number): string {
  if (index === 0) return "Main event";
  if (index === 1) return "Co-main event";
  return `Bout ${index + 1} of ${total}`;
}
