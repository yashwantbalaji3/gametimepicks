/**
 * A leg's selection in words, said ONCE (audit 2026-10-28 F18: the slip printed "Over 0.5 0.5 Hits" — the MLB props feed
 * already puts the line inside the side, "Over 0.5", and the renderers appended the line again).
 * Pure, import-free, client-safe. Nothing is guessed: a side that does not end in its own line gets the line appended.
 *
 * @param {string | null | undefined} side   e.g. "Over", "over", "Over 0.5", "Under 7"
 * @param {number | string | null | undefined} line
 * @param {string | null | undefined} market e.g. "Hits"
 */
export function selectionText(side, line, market) {
  const s = String(side ?? "").trim();
  const l = line == null || line === "" ? "" : String(line);
  const sideHasLine = l !== "" && new RegExp(`(^|\\s)[+-]?${l.replace(/[.+]/g, (c) => `\\${c}`)}$`).test(s);
  return [s, sideHasLine ? "" : l, String(market ?? "").trim()].filter(Boolean).join(" ");
}
