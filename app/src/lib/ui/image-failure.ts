/**
 * THE PRE-HYDRATION IMAGE-FAILURE RACE — one owner for every remote `<img>` fallback.
 *
 * Program 230 · incident. Every avatar and logo in this app already carries an `onError` handler
 * that swaps in initials or a monogram, and those handlers are correct. They are also, on a static
 * export, frequently too late.
 *
 * The site is `output: "export"`, so the browser receives complete SSR HTML and starts fetching
 * every `<img>` while it is still parsing — long before the React bundle loads and hydration
 * attaches any listener. An image that fails in that window fires its `error` event into a DOM node
 * with no handler on it. The event does not queue and it does not replay: React hydrates, attaches
 * `onError`, and waits forever for an event that already happened. The broken-image icon stays.
 *
 * It shows up wherever a headshot or logo 404s — a retired ESPN athlete id, a team-logo slug the CDN
 * spells differently — and it showed up in the P214 identity fixture as 42 MLB team logos on `/`
 * and 12 UFC fighter portraits on `/ufc/` surviving as broken icons with their fallbacks never
 * rendered. The fixture was right; the components could not have passed it.
 *
 * THE FIX IS TO ASK THE ELEMENT, NOT TO WAIT FOR THE EVENT. A ref callback runs during the commit
 * that attaches `onError`, so the two windows tile exactly:
 *
 *     failed BEFORE the listener existed  → `complete && naturalWidth === 0` on mount, caught here
 *     fails AFTER the listener exists     → the `onError` prop, unchanged
 *
 * A `loading="lazy"` image the browser has not started yet reports `complete === false`, so a
 * deferred image is never mistaken for a failed one.
 */

/**
 * Report an image that has ALREADY failed by the time React can see it.
 *
 * Pass as the `ref` of an `<img>` that also carries an `onError`. Null-safe: React calls a ref
 * callback with `null` on unmount, which is exactly what happens when the fallback replaces the
 * image, so this must not act on it.
 */
export function reportIfAlreadyFailed(
  el: HTMLImageElement | null,
  onFailed: () => void,
): void {
  if (!el) return;
  /* `complete` is true for "load finished" AND "load failed"; only a failure has no intrinsic
     width. Together they are the browser's own record of an event React missed. */
  if (el.complete && el.naturalWidth === 0) onFailed();
}
