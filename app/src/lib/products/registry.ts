/**
 * Product Registry — the single source of truth for every paper product on the platform. Each product has
 * a stable `id` (used to key its performance ledger + public results pages), a real launch date sourced
 * from its first on-disk artifact, and a lifecycle status. This is reference data only; it never touches
 * a bankroll. New products are added here once; retired products keep their id so history stays intact.
 *
 * Launch dates are sourced from real artifacts:
 *   Mr. Dub / Bank Builder — portfolio.json startingDate + first ledger event (2026-06-09)
 *   WC Specials — first world-cup/markets file (2026-06-11)
 *   Moonshot — moonshot-lane/active.json generatedAt (2026-06-19)
 *   Homer Nukes — first mlb/home-run-props board (2026-06-23, MLB public release)
 *   Diamond Specials — removed in PR #579 (retired)
 */

export type ProductSport = "mlb" | "soccer" | "multi";
export type ProductStatus = "active" | "retired";

export interface ProductDef {
  /** Stable id — keys the performance ledger + results pages. Never reused or renamed. */
  id: string;
  name: string;
  sport: ProductSport;
  /** YYYY-MM-DD, sourced from the product's first real artifact. */
  launchDate: string;
  status: ProductStatus;
  /** Paper-only products never move the real bankroll on settle. All current products are paper. */
  paperOnly: boolean;
  /** Public route, or null if the product has no standalone page yet. */
  route: string | null;
  /** One-line description for results pages. */
  blurb: string;
}

export const PRODUCT_REGISTRY: ReadonlyArray<ProductDef> = [
  { id: "homer-nukes", name: "Homer Nukes", sport: "mlb", launchDate: "2026-06-23", status: "active", paperOnly: true, route: "/homer-nukes",
    blurb: "Daily 5-leg MLB home-run parlay, flat $20 paper stake." },
  { id: "bank-builder", name: "Bank Builder", sport: "multi", launchDate: "2026-06-09", status: "active", paperOnly: true, route: "/bank-builder",
    blurb: "Two-lane paper bankroll ladder graded from official results." },
  { id: "moonshot", name: "Moonshot", sport: "soccer", launchDate: "2026-06-19", status: "active", paperOnly: true, route: "/moonshot",
    blurb: "High-volatility World Cup longshot ladder ($25 → target)." },
  { id: "wc-specials", name: "World Cup Specials", sport: "soccer", launchDate: "2026-06-11", status: "active", paperOnly: true, route: "/world-cup-specials",
    blurb: "Daily set of World Cup longshot specials (goalscorer + shots legs)." },
  { id: "mr-dub", name: "Mr. Dub", sport: "multi", launchDate: "2026-06-09", status: "active", paperOnly: true, route: "/mr-dub",
    blurb: "The paper portfolio that bankrolls every product from one balance." },
  { id: "diamond-specials", name: "Diamond Specials", sport: "mlb", launchDate: "2026-06-12", status: "retired", paperOnly: true, route: null,
    blurb: "Retired (removed in PR #579) — id retained so history stays intact." },
];

const BY_ID = new Map(PRODUCT_REGISTRY.map((p) => [p.id, p]));

export const getProduct = (id: string): ProductDef | null => BY_ID.get(id) ?? null;
export const activeProducts = (): ProductDef[] => PRODUCT_REGISTRY.filter((p) => p.status === "active");
export const productsBySport = (sport: ProductSport): ProductDef[] => PRODUCT_REGISTRY.filter((p) => p.sport === sport);
export const isKnownProduct = (id: string): boolean => BY_ID.has(id);
