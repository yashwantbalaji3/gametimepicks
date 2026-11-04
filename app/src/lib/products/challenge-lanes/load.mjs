/**
 * THE SITE'S LANE LOADER (BBM V2, SPEC rev 2 §3, §6). Every lane the site shows is read by the engine's ONE public
 * reader (lib/challenge-lanes/public-reader.mjs readLaneProjection), then refused by the site if it is a fixture or
 * carries anything priced (acceptLaneProjection), then folded by the engine's pricedLaneDisplay over its encrypted
 * prices (price-display.mjs readLanePrices). Absent or refused → an explicit "record not published" lane, never a guess.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { LANE_IDS, lanesOf, laneView, unavailableLaneView, acceptLaneProjection } from "./lane.mjs";
import { readLaneProjection } from "../../challenge-lanes/public-reader.mjs";
import { pricedLaneDisplay } from "../../challenge-lanes/display.mjs";
import { readLanePrices } from "../../challenge-lanes/price-display.mjs";
import { bestInk } from "../../simulation-theater/nba/nba-team-colors.mjs";
import { readPropAnalysis } from "../../odds/nba-prop-analysis.mjs";
import { propAnalysisView } from "./prop-analysis.mjs";
import { readResearchDisplay } from "../../challenge-lanes/research-io.mjs";
import { researchView } from "./research.mjs";

const KEY_ENV = "GTP_ODDS_DISPLAY_KEY";
/**
 * The environment a reader gets. Production and CI builds pass process.env as is (the key comes from the build's own
 * environment). LOCAL DEVELOPMENT ONLY (`next dev` with GTP_DEV_ROUTES=1 and no key in the environment): read that one
 * variable from the repo-root .env in-process, as scripts/challenge-lanes/cli.mjs does, because `next dev` loads only
 * app/.env*. The value is never logged, written, or put on a command line.
 */
export function displayEnv(env = process.env, { appDir = process.cwd() } = {}) {
  if (env[KEY_ENV] || env.NODE_ENV !== "development" || env.GTP_DEV_ROUTES !== "1") return env;
  const v = keyFromRepoEnv(appDir);
  return v ? { ...env, [KEY_ENV]: v } : env;
}

/**
 * GTP_ODDS_DISPLAY_KEY from the repo-root .env, or null. In a git worktree the .env lives in the MAIN checkout, found
 * from the worktree's `.git` pointer file ("gitdir: <main>/.git/worktrees/<name>"). Local tooling only; never logged.
 */
export function keyFromRepoEnv(appDir = process.cwd()) {
  const root = path.resolve(appDir, "..");
  const roots = [root];
  try {
    const pointer = fs.readFileSync(path.join(root, ".git"), "utf8").match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
    if (pointer) roots.push(path.resolve(pointer, "..", "..", ".."));
  } catch { /* a normal checkout: .git is a directory */ }
  for (const r of roots) {
    try {
      const line = fs.readFileSync(path.join(r, ".env"), "utf8").split("\n").find((l) => l.startsWith(`${KEY_ENV}=`));
      const v = line ? line.slice(KEY_ENV.length + 1).replace(/[\r"' ]/g, "") : "";
      if (v) return v;
    } catch { /* try the next root */ }
  }
  return null;
}

/**
 * The day's provisional prop analysis panel (founder P0, 2026-11-04), decrypted by nba-engine-eval's readPropAnalysis
 * (data/odds-display/nba/prop-analysis/<date>.json.enc; null with site display off, no file, no key or another key;
 * throws on tamper) and presented without a side, price or probability; staleness is judged at the build instant. BUILD TIME ONLY: renders into HTML only.
 * @param {{ appDir?: string, date?: string | null, env?: Record<string, string | undefined>, asOf?: string }} [opts]
 */
export const loadPropAnalysis = ({ appDir = process.cwd(), date = null, env = displayEnv(process.env, { appDir }), asOf = undefined } = {}) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "")) ? propAnalysisView(readPropAnalysis({ appDir, date, env }), { now: asOf ? Date.parse(asOf) : Date.now() }) : null;

/** The NBA team colour DATA (names + listed colours), read server-side like the theater's loader; null if unreadable. */
export function readTeamColours(appDir = process.cwd()) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(appDir, "src", "lib", "simulation-theater", "nba", "nba-team-colors.json"), "utf8"));
    return { teams: data.teams, aliases: data.aliases, inkFor: (fill) => bestInk(data, fill) };
  } catch { return null; }
}

/** bb-social condition 2: show a lane graphic only when the repo file's bytes are the bytes the engine recorded. */
export const imageVerifiedIn = (appDir) => (imagePath, sha) => {
  try { return createHash("sha256").update(fs.readFileSync(path.join(appDir, "public", imagePath))).digest("hex") === sha; } catch { return false; }
};

/* The build's ET product day, for AWAITING QUALIFIED SELECTION. One formatter for the module (#1262). */
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const etProductDay = (now = Date.now()) => ET_DAY.format(now);

/** { doc, view } for an accepted file, or { doc: null, view: <unavailable>, reason }. */
export function loadChallengeLane({ appDir = process.cwd(), laneId, env = displayEnv(process.env, { appDir }), productDay = etProductDay() }) {
  if (!LANE_IDS.includes(laneId)) throw new Error(`unknown lane ${laneId}`);
  const r = readLaneProjection({ appDir, laneId });
  if (!r.ok) {
    const missing = r.refusal === "MISSING";
    return { doc: null, view: unavailableLaneView(laneId, missing ? "The lane record has not been published yet." : "The lane record did not pass verification, so it is not shown."), reason: r.refusal };
  }
  const v = acceptLaneProjection(r.doc, { laneId });
  if (!v.ok) return { doc: null, view: unavailableLaneView(laneId, "The lane record did not pass verification, so it is not shown."), reason: v.reason };
  /* The engine's priced fold: its decrypted prices (null with no key, another key, no file, or NBA site display off;
     throws on tamper) over its laneDisplay. Build time only; the result renders into HTML and nowhere else. */
  const display = pricedLaneDisplay(r.doc, readLanePrices({ appDir, laneId, env }));
  return { doc: r.doc, view: laneView(r.doc, { display, teams: readTeamColours(appDir), imageVerified: imageVerifiedIn(appDir), productDay }), reason: null };
}

/**
 * The day's research candidates for a product (founder 2026-11-04), or null with no file: the engine's one reader
 * (research-io.mjs readResearchDisplay — public/data/challenge-research/<product>/<date>.json, verified, plus its
 * encrypted companion when NBA site display is authorized and the key opens it), presented by researchView. A file that
 * does not verify, or a companion from another file, THROWS (a tampered record fails the build). Build time only.
 * @param {{ appDir?: string, product: string, date: string | null, env?: Record<string, string | undefined>, asOf?: string }} opts
 */
export function loadResearch({ appDir = process.cwd(), product, date, env = displayEnv(process.env, { appDir }), asOf = undefined }) {
  return researchView(readResearchDisplay({ appDir, product, date, env }), { now: asOf ? Date.parse(asOf) : Date.now() });
}

/** Both lanes of a product, A then B, through the one loader. */
export function loadProductLanes(product, opts = {}) {
  return lanesOf(product).map((laneId) => loadChallengeLane({ ...opts, laneId }).view);
}
