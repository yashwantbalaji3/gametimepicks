/**
 * PUBLIC LABELS FROM THE PRODUCT REGISTRY — what a post may call a sport's numbers, read, never decided here.
 *
 * Source of truth: app/src/lib/public-registry.ts (founder directive 2026-10-23, "ONE module every public surface reads
 * to say what a sport or product offers and how far it may be trusted"), which itself reads its gate from
 * app/src/lib/sport-capability-registry.ts. Both are TypeScript the Command Center does not compile, so this module
 * parses the few literals it needs and FAILS CLOSED when one is missing: a post never falls back to a guessed label.
 *
 * Resolution of "Official Forecast" vs EXPERIMENTAL_PUBLIC (founder, 2026-10-28): both are true and they answer
 * different questions. "Official Forecast" is the public TERM for the authorized, frozen output (the NFL family
 * nfl_team publishes as OFFICIAL_FORECAST). EXPERIMENTAL_PUBLIC is the sport's CAPABILITY: published, graded, and NOT
 * eligible for prediction products (productEligible = canEnterPredictionProducts = FULL_MODEL only). The registry
 * carries the "how far to trust it" disclosure once per feature, as the Model Performance note, and retired the
 * per-item "experimental" hedges (RETIRED_PUBLIC_PHRASES). So a post says "Official Forecast", carries the sport's
 * Model Performance sentence verbatim, never says pick/bet, and never uses a retired phrase.
 */
import { readCapabilities } from "./multisport-facts.mjs";

export const PUBLIC_REGISTRY_PATH = "app/src/lib/public-registry.ts";
const KEYS = { NFL: "nfl", NBA: "nba", MLB: "mlb", EPL: "epl", UFC: "ufc" };

const unquote = (s) => JSON.parse(`"${s}"`);
const STR = String.raw`"((?:[^"\\]|\\.)*)"`;

/** The registry literals a post needs. Throws when the file or any literal is missing (fail closed). */
export function readPublicRegistry(src) {
  const text = src.read(PUBLIC_REGISTRY_PATH);
  if (!text) throw new Error(`${src.label} has no ${PUBLIC_REGISTRY_PATH}: no public labels, so no post`);
  const terms = {};
  const termsBlock = text.match(/PUBLIC_TERMS = Object\.freeze\(\{([\s\S]*?)\}/)?.[1] ?? "";
  for (const m of termsBlock.matchAll(new RegExp(String.raw`([A-Z_]+):\s*${STR}`, "g"))) terms[m[1]] = unquote(m[2]);
  const retiredBlock = text.match(/RETIRED_PUBLIC_PHRASES[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
  const retired = [...retiredBlock.matchAll(new RegExp(STR, "g"))].map((m) => unquote(m[1]));
  const consts = {};
  for (const m of text.matchAll(new RegExp(String.raw`export const ([A-Z_]+_NOTE) = ${STR};`, "g"))) consts[m[1]] = unquote(m[2]);

  const sports = {};
  const starts = [...text.matchAll(/sport\(\{\s*key:\s*"([a-z0-9-]+)"/g)];
  starts.forEach((m, i) => {
    const block = text.slice(m.index, starts[i + 1]?.index ?? text.indexOf("]);", m.index));
    const families = [...block.matchAll(new RegExp(String.raw`fam\(${STR},\s*${STR},\s*"(OFFICIAL_FORECAST|WITHHELD)"`, "g"))]
      .map((f) => ({ id: unquote(f[1]), label: unquote(f[2]), publication: f[3] }));
    const mp = block.match(new RegExp(String.raw`modelPerformance:\s*\{\s*availability:\s*"([A-Z_]+)",[^}]*?note:\s*(?:${STR}|([A-Z_]+_NOTE))\s*\}`));
    const method = block.match(new RegExp(String.raw`method:\s*${STR}`));
    const label = block.match(new RegExp(String.raw`label:\s*${STR}`));
    sports[m[1]] = {
      key: m[1],
      label: label ? unquote(label[1]) : null,
      families,
      modelPerformance: mp ? { availability: mp[1], note: mp[2] != null ? unquote(mp[2]) : consts[mp[3]] ?? null } : null,
      method: method ? unquote(method[1]) : null,
    };
  });
  if (!terms.OFFICIAL_FORECAST || !retired.length || !Object.keys(sports).length) {
    throw new Error(`${PUBLIC_REGISTRY_PATH} at ${src.label} could not be read (terms, retired phrases or sports missing): no post`);
  }
  return { path: PUBLIC_REGISTRY_PATH, terms, retired, sports };
}

/**
 * Everything a post about one sport may say about the forecast's standing, all quoted from the two registries.
 * @param {"NFL"|"NBA"|"MLB"|"EPL"|"UFC"} sport
 */
export function publicLabelOf(sport, src, registry = readPublicRegistry(src), caps = readCapabilities(src)) {
  const key = KEYS[sport];
  const s = registry.sports[key];
  const cap = caps[key];
  if (!s || !cap) throw new Error(`${sport} is missing from the public or capability registry at ${src.label}: no post`);
  const officialFamilies = s.families.filter((f) => f.publication === "OFFICIAL_FORECAST").map((f) => f.id);
  return {
    sport,
    term: registry.terms.OFFICIAL_FORECAST,
    capability: cap.state,
    /** canEnterPredictionProducts: FULL_MODEL only — the registry's own rule, restated, never re-decided */
    productEligible: cap.state === "FULL_MODEL",
    officialFamilies,
    withheldFamilies: s.families.filter((f) => f.publication === "WITHHELD").map((f) => f.id),
    modelPerformanceNote: s.modelPerformance?.note ?? null,
    method: s.method,
    retiredPhrases: registry.retired,
    source: { path: registry.path, capabilityPath: "app/src/lib/sport-capability-registry.ts", commit: src.commit ?? null },
  };
}

/** A phrase the founder retired from public surfaces, found in text (case-insensitive), or null. */
export function retiredPhraseIn(text, retired) {
  const t = String(text ?? "").toLowerCase();
  return retired.find((p) => t.includes(p.toLowerCase())) ?? null;
}
