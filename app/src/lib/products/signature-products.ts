/**
 * THE SIGNATURE PRODUCT FOR EACH SPORT — one flagship read per league.
 *
 * Each is the single question that league's model is best placed to answer, named so a reader knows
 * what they are getting before they open it. The list is here rather than scattered across pages so
 * the products page, the nav and each sport hub cannot drift on what exists.
 *
 * ── State is EARNED, never declared ─────────────────────────────────────────────────────────────
 * A product is LIVE only where a validated model and a settleable source both exist. Two of these
 * are named and deliberately unbuilt: naming a product costs nothing and gives the roadmap a shape,
 * but shipping an empty one under a good name is how a placeholder becomes a promise.
 */

export type SignatureState = "live" | "coming-soon";

export interface SignatureProduct {
  readonly sport: string;
  readonly sportLabel: string;
  readonly name: string;
  readonly href: string | null;
  readonly state: SignatureState;
  /** The question it answers, in one line. */
  readonly question: string;
  /** What it rests on — or, when it is not built, exactly what is missing. */
  readonly basis: string;
}

export const SIGNATURE_PRODUCTS: readonly SignatureProduct[] = [
  {
    sport: "mlb",
    sportLabel: "Baseball",
    name: "Homer Nukes",
    href: "/homer-nukes",
    state: "live",
    question: "Who is most likely to go deep today?",
    basis:
      "A home-run probability per batter, computed from free MLB Stats API season totals and the " +
      "opposing starter's home runs allowed, each regressed toward the league rate.",
  },
  {
    sport: "nfl",
    sportLabel: "Football",
    name: "End Zone Vault",
    href: "/nfl",
    state: "live",
    question: "Who reaches the end zone?",
    basis:
      "Touchdown allocation across a roster, from participation shares and the drive model. " +
      "Published as experimental: the team model was rejected on its own preregistered bars.",
  },
  {
    /*
     * UFC carries the strongest validated model on this site — the only one that beats its baseline
     * on a proper held-out corpus (3,557 fights): winner 57.6% against 50.0%, method 52.7% against
     * 46.7%, round 60.6% against 55.3%, all three clearing their preregistered gain bars.
     *
     * So the product is named for what that model uniquely does. Anyone can guess a winner; the
     * method and round heads say HOW and WHEN a fight ends, which is the part a fight fan argues
     * about all week.
     *
     * "Canvas Call" over the earlier "Finish Line": the canvas is where a fight actually ends, and
     * a "call" is both our prediction and the official verdict. It covers a knockout, a submission
     * AND a decision — where "finish" in MMA means specifically NOT a decision, so the old name
     * quietly excluded the most common outcome the model predicts.
     */
    sport: "ufc",
    sportLabel: "UFC",
    name: "Canvas Call",
    href: "/ufc",
    state: "live",
    question: "How does this fight end — and in which round?",
    basis:
      "Three heads over 3,557 held-out fights: winner, method and round. The only model here that " +
      "beat its baseline on every head it was tested on.",
  },
  {
    sport: "soccer",
    sportLabel: "Soccer",
    name: "Top Bins",
    href: null,
    state: "coming-soon",
    /* "Top Bins" — the top corner, and the register a fan actually speaks in. "Golden Boot" was a
       borrowed trophy name for a SEASON-long scoring race, which is not what a match-day product
       reads; this one is about the goal itself. */
    question: "Who finds the top corner?",
    basis:
      "Not built. No odds feed is ingested for the Premier League and no scorer model has been " +
      "fitted, so there is nothing to publish. The schedule is live; the product is not.",
  },
  {
    sport: "nba",
    sportLabel: "Basketball",
    name: "Bucket Brigade",
    href: null,
    state: "coming-soon",
    /* "Bucket Brigade" carries the plural-and-vivid shape Homer Nukes established. "Heat Check" is
       real basketball slang but it is everywhere — half the analytics sites use it, so it names
       nothing of ours. */
    question: "Who is filling it up tonight?",
    basis:
      "Not built. The NBA surface is a settled archive — the league is out of season and no live " +
      "board or player model is running.",
  },
];

export const liveSignatureProducts = () => SIGNATURE_PRODUCTS.filter((p) => p.state === "live");
export const signatureFor = (sport: string) => SIGNATURE_PRODUCTS.find((p) => p.sport === sport) ?? null;
