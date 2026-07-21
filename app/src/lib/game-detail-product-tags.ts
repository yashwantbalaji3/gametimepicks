/**
 * Product-tag map for the MLB game report — answers, for any generated pick, "does this exact leg feed an
 * ACTIVE paper product card?" (Bank Builder Lane A / Lane B, Moonshot Step 1). Read straight from the two
 * display artifacts the products already own; NEVER touches money. Paper/review only, $0 exposure.
 *
 * Keyed by a normalized `player|market|side|line` so a player with two picks (e.g. Total Bases + Hits) is
 * tagged only on the leg the product actually uses. A pick with no active-card match → no tag (watchlist only).
 * Fail-closed: any read/parse error yields an empty map (no tag rather than a wrong tag).
 */
import fs from "node:fs";
import path from "node:path";

export interface ProductTag {
  product: "bank-builder" | "moonshot";
  label: string;              // "Bank Builder Lane A" | "Bank Builder Lane B" | "Moonshot Step 1"
  reviewMode: boolean;        // always true today (paper/review)
  exposure: number;           // always 0 (paper)
}

const norm = (player: unknown, market: unknown, side: unknown, line: unknown): string =>
  `${String(player ?? "").trim().toLowerCase()}|${String(market ?? "").trim().toLowerCase()}|${String(side ?? "").trim().toLowerCase()}|${line ?? ""}`;

const readJson = (p: string): any => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
};

/**
 * Build the active-product leg → tag map from the dual-bank-builder + moonshot active artifacts.
 * `root` is the public data dir (…/public/data).
 */
export function loadProductTagMap(root: string): Map<string, ProductTag> {
  const map = new Map<string, ProductTag>();

  // Bank Builder — both lanes' ACTIVE review step legs.
  const bb = readJson(path.join(root, "methodology", "launch", "dual-bank-builder-active.json"));
  for (const [laneKey, laneLabel] of [["laneA", "Bank Builder Lane A"], ["laneB", "Bank Builder Lane B"]] as const) {
    const lane = bb?.run?.[laneKey];
    const step = Array.isArray(lane?.steps) ? lane.steps.find((s: any) => s?.status === "active" && Array.isArray(s?.legs) && s.legs.length) : null;
    for (const l of step?.legs ?? []) {
      map.set(norm(l.participantName, l.marketType, l.side, l.line), { product: "bank-builder", label: laneLabel, reviewMode: !!l.reviewMode, exposure: 0 });
    }
  }

  // Moonshot — the active Step-1 review card's legs.
  const ms = readJson(path.join(root, "moonshot-lane", "active.json"));
  const card = ms?.ladder?.[0]?.card;
  for (const l of card?.legs ?? []) {
    // Moonshot legs carry a DISPLAY `participant` ("Zack Wheeler Over 6.5 Ks"), not a bare player — strip the
    // " Over/Under <line> …" suffix so it matches a generated pick's bare `player` ("Zack Wheeler").
    const player = String(l.participant ?? "").split(/\s+(?:Over|Under)\s+/i)[0].trim();
    map.set(norm(player, l.market, l.side, l.line), { product: "moonshot", label: "Moonshot Step 1", reviewMode: !!l.reviewMode, exposure: 0 });
  }

  return map;
}

/** Look up a generated pick's product tag (or null when the leg is not in any active card → watchlist only). */
export function productTagFor(map: Map<string, ProductTag>, player: unknown, market: unknown, side: unknown, line: unknown): ProductTag | null {
  return map.get(norm(player, market, side, line)) ?? null;
}
