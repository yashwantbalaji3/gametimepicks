/**
 * DISPLAY CLEAN-UP FOR A VERIFIED ANSWER (Session 2). Presentation only — no word, number or claim changes:
 *
 *   • evidence citation tokens ("[E2:report]", "[E1.1, E2.1]") are the verifier's bookkeeping, not reader copy — the
 *     answer's sources are already listed under "Used:" and its links as chips;
 *   • a markdown link keeps its LABEL; its href is never rendered from text (the approved links are the chips), and a
 *     line that is nothing but a link is dropped, because its chip is already there;
 *   • an ISO timestamp ("2026-09-30T11:16:33.113Z") is shown as the same instant in ET ("Sep 30, 7:16 AM ET").
 */
const ET_STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** @param {string} text */
export function readableAnswer(text) {
  return String(text ?? "")
    /* A line that is ONLY a link repeats a chip the answer already shows — dropped, not shown twice. */
    .replace(/^[ \t]*[-•]?[ \t]*\[[^\]\n]+\]\([^)\s]*\)[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/\s?\[\s*E\d+(?:[.:][\w-]+)?(?:\s*,\s*E\d+(?:[.:][\w-]+)?)*\s*\](?!\()/g, "")
    .replace(/\[([^\]\n]+)\]\((?:[^)\s]*)\)/g, "$1")
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z\b/g, (iso) => {
      const t = Date.parse(iso);
      return Number.isFinite(t) ? `${ET_STAMP.format(new Date(t))} ET` : iso;
    })
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+([.,;:])/g, "$1");
}
