/**
 * flagEmoji — pure ISO-3166 code → Unicode emoji-flag conversion. Extracted from
 * data-world-cup.ts so CLIENT components (FlagBadge in games-experience, etc.) can
 * import it without dragging node:fs into the browser bundle. No data, no fs.
 */
export function flagEmoji(code: string): string {
  if (!code) return "";
  // Special-case the GB sub-flag codes that aren't representable as
  // regional-indicator pairs. The Unicode flag spec uses tag sequences;
  // most modern fonts render these correctly.
  if (code === "GB-ENG") return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (code === "GB-SCT") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
  if (code === "GB-WLS") return "🏴󠁧󠁢󠁷󠁬󠁳󠁿";
  if (code.length !== 2) return "";
  const A = 0x1f1e6;
  const a = "A".charCodeAt(0);
  const u = code.toUpperCase();
  return String.fromCodePoint(A + (u.charCodeAt(0) - a), A + (u.charCodeAt(1) - a));
}
