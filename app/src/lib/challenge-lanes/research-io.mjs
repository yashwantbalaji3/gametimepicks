/**
 * CHALLENGE RESEARCH · FILES. BUILD TIME ONLY (node:fs, node:crypto). Paths and readers for research.mjs docs.
 *   public   app/public/data/challenge-research/<product>/<date>.json        (gtp.challenge-research.public@1)
 *   prices   data/odds-display/challenge-research/<product>/<date>.json.enc  (gtp.odds-display.enc@1, aad challenge-research/<product>)
 * The prices companion is read only when the display record authorizes NBA "site", like the lane prices.
 */
import fs from "node:fs";
import path from "node:path";
import { encryptDisplayArtifact, decryptDisplayArtifact, readDisplayKey } from "../odds/display-crypto.mjs";
import { displayAuthorization } from "../odds/display-authorization.mjs";
import { researchAad, verifyResearch, researchDisplay } from "./research.mjs";
import { canonical } from "./chain.mjs";

export const RESEARCH_PUBLIC_DIR = "public/data/challenge-research";
export const RESEARCH_PRICES_REPO_DIR = "data/odds-display/challenge-research";
const PRODUCTS = new Set(["bank-builder", "moonshot"]);
const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d));

export const serializeResearch = (doc) => `${canonical(doc)}\n`;
export const encryptResearchPrices = (product, prices, key) => encryptDisplayArtifact(JSON.stringify(prices), key, researchAad(product));

/** The verified public research doc, or null (no file). Throws on a file that does not verify. */
export function readResearchPublic({ appDir = process.cwd(), product, date }) {
  if (!PRODUCTS.has(product) || !okDate(date)) return null;
  const f = path.join(appDir, RESEARCH_PUBLIC_DIR, product, `${date}.json`);
  if (!fs.existsSync(f)) return null;
  const doc = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!verifyResearch(doc)) throw new Error(`readResearchPublic: ${product}/${date} does not verify`);
  return doc;
}
/** The decrypted prices companion, or null (no key, another key, no file, display not authorized). */
export function readResearchPrices({ appDir = process.cwd(), product, date, env = process.env, record }) {
  if (!PRODUCTS.has(product) || !okDate(date)) return null;
  if (!displayAuthorization("nba", "site", ...(record ? [record] : [])).ok) return null;
  const k = readDisplayKey(env); if (!k.ok) return null;
  const f = path.join(appDir, "..", RESEARCH_PRICES_REPO_DIR, product, `${date}.json.enc`);
  if (!fs.existsSync(f)) return null;
  const pt = decryptDisplayArtifact(fs.readFileSync(f, "utf8"), k.key, researchAad(product));
  return pt == null ? null : JSON.parse(pt);
}
/** The site's one call: the research display for a product-day, priced when the companion is readable; null if none. */
export function readResearchDisplay(opts) {
  const pub = readResearchPublic(opts);
  return pub ? researchDisplay(pub, readResearchPrices(opts)) : null;
}
