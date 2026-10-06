/**
 * ASK PREFILL — `/ask/?q=…` opens Ask with a question already typed (2026-10-05 audit, finding A10).
 *
 * Every link into Ask was a bare `/ask/`, so a reader on a player or team page had to retype the name they were
 * already looking at. A page can now link to `askHrefFor("How has Bijan Robinson done lately?")`.
 *
 * PREFILL, NEVER SEND. The question lands in the composer and the reader presses Ask. Nothing is answered on page
 * load, for two reasons: a static link is followed by crawlers and link previews, and each answer spends the
 * model budget; and a question the reader did not choose to send is not their question. Because the reader sends
 * it, the question takes the ordinary planner → executor → verifier path — a link cannot skip a check.
 *
 * The text is bounded and cleaned here, not trusted: control characters go, whitespace collapses, and anything
 * past the cap is cut at a word boundary. React renders it as text, so it cannot become markup.
 */
import { ASK_ROUTE } from "./contract.mjs";

/** Long enough for any real question; short enough that a crafted link cannot paste an essay into the box. */
export const ASK_PREFILL_MAX = 300;

/** Clean a would-be question. Returns "" when nothing usable remains. */
export function cleanAskPrefill(raw) {
  if (typeof raw !== "string") return "";
  // eslint-disable-next-line no-control-regex
  let text = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > ASK_PREFILL_MAX) {
    const cut = text.slice(0, ASK_PREFILL_MAX);
    const space = cut.lastIndexOf(" ");
    text = (space > ASK_PREFILL_MAX / 2 ? cut.slice(0, space) : cut).trim();
  }
  return text;
}

/** The prefill carried by a location's query string (`window.location.search`), or "". */
export function askPrefillFromSearch(search) {
  if (typeof search !== "string" || !search) return "";
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return "";
  }
  return cleanAskPrefill(params.get("q") ?? "");
}

/** The link another page uses to open Ask with `question` typed in. A blank question gives the bare route. */
export function askHrefFor(question) {
  const q = cleanAskPrefill(question);
  return q ? `${ASK_ROUTE}?${new URLSearchParams({ q }).toString()}` : ASK_ROUTE;
}
