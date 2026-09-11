/**
 * Daily analytics retention (P256 · Task 4). Invoked by the Vercel cron in vercel.json; deletes every
 * day bucket older than RETENTION_DAYS from the private analytics store and reports what it did.
 * Refuses (401) any caller that is not the cron. A failure deletes nothing further and is reported,
 * never retried blindly — the next day's run reconciles whatever is still over the window.
 */
import { list, del } from "@vercel/blob";
import { ANALYTICS_PREFIX, RETENTION_DAYS, cronAuthorized, expiredDayFolders, retentionCutoff } from "./_retention-core.mjs";

export default async function handler(req, res) {
  if (!cronAuthorized(req.headers?.authorization, process.env.CRON_SECRET)) return res.status(401).json({ ok: false });
  const now = new Date().toISOString();
  try {
    const folders = [];
    let cursor;
    do {
      const page = await list({ prefix: ANALYTICS_PREFIX, mode: "folded", cursor });
      folders.push(...(page.folders ?? []));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    const expired = expiredDayFolders(folders, now);
    let deleted = 0;
    for (const folder of expired) {
      let c;
      do {
        const page = await list({ prefix: folder, cursor: c });
        const urls = page.blobs.map((b) => b.url);
        if (urls.length) { await del(urls); deleted += urls.length; }
        c = page.hasMore ? page.cursor : undefined;
      } while (c);
    }
    console.log(JSON.stringify({ retention: "ok", cutoff: retentionCutoff(now), folders: folders.length, expiredFolders: expired.length, deleted }));
    return res.status(200).json({ ok: true, retentionDays: RETENTION_DAYS, cutoff: retentionCutoff(now), expiredFolders: expired.length, deleted });
  } catch (e) {
    console.log(JSON.stringify({ retention: "error", message: String(e?.message ?? e).slice(0, 200) }));
    return res.status(500).json({ ok: false });
  }
}
