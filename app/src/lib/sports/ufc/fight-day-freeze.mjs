/**
 * FIGHT-DAY FREEZE (UFC-001, 2026-10-10): nothing pregame is rebuilt or bought once the card has started.
 *
 * GitHub crons in this repo drift by hours: the Saturday 11:00Z fight-week run has started anywhere from 14:57Z to
 * 21:00Z. A run that lands after the first bout would (a) rebuild and republish the pregame card mid-event and (b) spend
 * an odds credit on IN-PLAY prices and overwrite the pregame `odds-latest.json` with them. Both are refused here.
 *
 * The card freeze is bounded: it holds only for the SAME event, only while its card is still SCHEDULED_CARD, and only for
 * FREEZE_HOURS after the first scheduled bout. After that the normal Sunday rollover to the next card is untouched.
 */
export const FREEZE_HOURS = 12;

/** True once `nowIso` is at or after the card's first scheduled bout. Unparseable times never count as started. */
export function cardHasStarted(startUtc, nowIso) {
  const start = Date.parse(startUtc ?? "");
  const now = Date.parse(nowIso ?? "");
  return Number.isFinite(start) && Number.isFinite(now) && now >= start;
}

/**
 * Keep the committed pregame card instead of rebuilding it?
 * @param {{ existing: any, eventId: string | number | null | undefined, nowIso: string }} p
 * @returns {{ frozen: boolean, reason: string | null }}
 */
export function pregameCardFreeze({ existing, eventId, nowIso }) {
  const no = { frozen: false, reason: null };
  if (!existing || existing.state !== "SCHEDULED_CARD") return no;
  const ev = existing.event ?? {};
  if (eventId == null || String(ev.providerEventId ?? "") !== String(eventId)) return no;
  if (!cardHasStarted(ev.startUtc, nowIso)) return no;
  if (Date.parse(nowIso) >= Date.parse(ev.startUtc) + FREEZE_HOURS * 3600_000) return no;
  return { frozen: true, reason: `${ev.name ?? "the card"} started at ${ev.startUtc}; the pregame card generated ${existing.generatedAt ?? "earlier"} is kept unchanged` };
}
