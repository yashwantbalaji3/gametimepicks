/**
 * THE SLATE'S TENSE, ON THE READER'S DAY (#761 PR 2).
 *
 * Hub status pills ("Live · 15 games") and "Live today" chips were decided on the BUILD clock. The page is
 * a static export, so once the build is a day old the pill still says "Live" while the FreshnessBadge
 * beside it (reader clock) says "Latest slate · yesterday" — two contradictory claims on one line.
 *
 * The rule each hub already used, now applied to the reader's ET day:
 *   slate after today  → "upcoming"
 *   slate before today → "settled"
 *   slate is today     → the page's own readiness kind (live / linesPending / upcoming)
 * No slate date → the readiness kind unchanged (nothing to judge tense by).
 */
export function slateTenseKind({ slateDate, today, readyKind }) {
  if (typeof slateDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(slateDate)) return readyKind;
  if (slateDate > today) return "upcoming";
  if (slateDate < today) return "settled";
  return readyKind;
}

/** True when the slate is the reader's today. */
export function isReaderToday(slateDate, today) {
  return typeof slateDate === "string" && slateDate === today;
}
