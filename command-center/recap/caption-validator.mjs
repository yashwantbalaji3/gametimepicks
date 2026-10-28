/**
 * CAPTION VALIDATOR — deterministic, and stricter than any writer.
 *
 * Whatever seat wrote a caption (template, pasted ChatGPT text, a future API model), it is refused unless:
 *   • every number in it appears in a claim's display string (no invented scores, probabilities or records);
 *   • it uses none of the forbidden terms — the same list the MLB social pack enforces
 *     (app/scripts/build-mlb-social-content.mjs FORBIDDEN_TERMS), matched as whole words;
 *   • it says "forecast" (the product's word for the graded number) and contains no URL (link posts cost 13× more
 *     on the X API, and link policy is a founder decision);
 *   • a forecast that missed the winner says so plainly;
 *   • it fits one X post (280 characters);
 *   • it uses none of the phrases the founder retired from public surfaces (public-registry.ts RETIRED_PUBLIC_PHRASES,
 *     carried on the bundle's publicLabel).
 */
import { FORBIDDEN_TERMS } from "../../app/scripts/build-mlb-social-content.mjs";
import { REASON } from "../contracts/index.mjs";
import { claimOf } from "./fact-bundle-nfl.mjs";
import { retiredPhraseIn } from "./public-registry.mjs";

export const MAX_CAPTION_CHARS = 280;
const EXTRA_FORBIDDEN = ["odds", "bet now", "sure thing", "can't lose", "parlay"];

const numbersIn = (s) => String(s).match(/\d+(?:\.\d+)?/g) ?? [];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function allowedNumbers(bundle) {
  const set = new Set();
  for (const c of bundle.claims) for (const n of numbersIn(c.display)) set.add(n);
  return set;
}

/** @returns {{ ok: boolean, problems: Array<{code:string, detail:string}> }} */
export function validateCaption(text, bundle) {
  const problems = [];
  const allowed = allowedNumbers(bundle);
  for (const n of numbersIn(text)) {
    if (!allowed.has(n)) problems.push({ code: REASON.UNTRACEABLE_NUMBER, detail: `"${n}" is not in the fact bundle` });
  }
  for (const term of [...FORBIDDEN_TERMS, ...EXTRA_FORBIDDEN]) {
    if (new RegExp(`\\b${escapeRe(term)}\\b`, "i").test(text)) problems.push({ code: REASON.FORBIDDEN_TERM, detail: `"${term}"` });
  }
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co)\b/i.test(text)) problems.push({ code: REASON.URL_IN_CAPTION, detail: "captions carry no links" });
  if (!/\b(forecast|prediction|predicted|projection|projected)/i.test(text)) problems.push({ code: REASON.MISSING_FORECAST_WORD, detail: 'must call the number a prediction / projection (or "forecast")' });
  if (claimOf(bundle, "result.side")?.value === "LOSS" && !/\bmiss(ed)?\b|\bwrong\b/i.test(text)) {
    problems.push({ code: REASON.MISS_NOT_DISCLOSED, detail: "the forecast missed the winner; the caption must say so" });
  }
  const retired = retiredPhraseIn(text, bundle.publicLabel?.retiredPhrases ?? []);
  if (retired) problems.push({ code: REASON.RETIRED_PHRASE, detail: `"${retired}" was retired from public surfaces (public-registry.ts)` });
  if (text.length > MAX_CAPTION_CHARS) problems.push({ code: REASON.TOO_LONG, detail: `${text.length} > ${MAX_CAPTION_CHARS} characters` });
  return { ok: problems.length === 0, problems };
}
