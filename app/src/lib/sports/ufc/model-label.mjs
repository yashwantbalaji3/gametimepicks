/**
 * PLAIN LABELS FOR THE UFC MODEL'S PROVENANCE (QA P3, 2026-10-05).
 *
 * The bout page, Cage Chaos and the /ufc hub printed producer identifiers straight to readers:
 * "model ufc-fight-model@e657fc40b64d", "scrape_ufc_stats (GPL-3.0)", and any unmapped
 * notModelled key in camelCase. The id stays in the artifact (model-provenance.test.mjs pins its
 * fingerprint); only what a reader sees is translated here.
 */

/** "ufc-fight-model@e657fc40b64d" → "UFC fight model, version e657fc4". Unknown shapes → "UFC fight model". */
export function ufcModelLabel(id) {
  if (!id) return null;
  const m = /^ufc-fight-model@([0-9a-f]{7,})$/i.exec(String(id).trim());
  return m ? `UFC fight model, version ${m[1].slice(0, 7).toLowerCase()}` : "UFC fight model";
}

const SOURCE_LABELS = [
  [/^scrape_ufc_stats\b/i, "UFCStats fight records"],
];

/** The corpus source as a reader-facing name; never the scraper's package name. */
export function ufcCorpusSourceLabel(source) {
  if (!source) return null;
  for (const [re, label] of SOURCE_LABELS) if (re.test(String(source))) return label;
  return "public fight records";
}

const NOT_MODELLED_LABELS = { methodOfVictory: "Method of victory", moneyline: "Moneyline" };

/** notModelled keys: known ones by name, anything else de-camel-cased ("someNewThing" → "Some new thing"). */
export function ufcNotModelledLabel(key) {
  if (NOT_MODELLED_LABELS[key]) return NOT_MODELLED_LABELS[key];
  const words = String(key ?? "").replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}
