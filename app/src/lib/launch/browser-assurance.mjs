/**
 * Three-engine browser/state assurance contract (Program 161 · Release C).
 *
 * THE ASSURANCE IS A LIVE GATE, NOT A SNAPSHOT. A committed "browser results" artifact would rot
 * the moment the next artifact landed (the frozen-NOW lesson from receipt #2), so what is committed
 * here is the CONTRACT — which routes must render clean on which engines and what each route's
 * state honesty means — and the proof is every quality-gate run executing e2e/route-assurance.spec.ts
 * on Blink, WebKit and Gecko against the BUILT export. /launch renders this contract verbatim with
 * the gate as its receipt.
 *
 * Routes come from the route-inventory high-traffic public set. A route listed here and missing
 * from the spec (or vice versa) is a guard failure, not a drift to discover later.
 */

export const BROWSER_ASSURANCE_VERSION = 1;

/** The three engines the gate installs and runs. Order is presentation only. */
export const ENGINES = Object.freeze(["chromium", "webkit", "firefox"]);

/**
 * High-traffic public routes under three-engine assurance. `proves` states the honesty property
 * the spec asserts ON TOP of the shared baseline every route gets: HTTP 200, visible body, and
 * zero console/page errors after hydration settles.
 */
export const ASSURED_ROUTES = Object.freeze([
  { route: "/", proves: "the paper record renders from portfolio.json verbatim (artifact-to-DOM money parity)" },
  { route: "/today", proves: "the command center hydrates its date heading without errors" },
  { route: "/sports", proves: "all four sport sections render adapter truth: a real upcoming count or the honest empty sentence — never a blank calendar" },
  { route: "/markets", proves: "market intelligence renders state-conditionally without errors" },
  { route: "/results", proves: "the trust center renders the canonical accounting section" },
  { route: "/mlb", proves: "the MLB hub renders through the availability contract" },
  { route: "/system-status", proves: "every pipeline stage row states its condition in the closed state vocabulary — no invented status words" },
  { route: "/methodology", proves: "the methodology commitments page renders" },
]);
