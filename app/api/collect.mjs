/**
 * First-party analytics collector — HTTP shell (Program 092-095 Lane G).
 *
 * A single Vercel serverless function beside the static export (project-root /api convention;
 * the Next app lives under src/, so this directory is Vercel's, not Next's). All decisions live
 * in _collect-core.mjs (unit-tested); this file only does transport:
 *
 *   - kill switch first: ANALYTICS_COLLECTOR_ENABLED unset/0 → 204 and nothing else happens
 *   - POST only, JSON only, hard 2 KB cap
 *   - same-origin gate (production + canonical *.vercel.app previews)
 *   - validated events are stored as append-only day-bucketed objects via the Vercel Blob REST
 *     API when BLOB_READ_WRITE_TOKEN is present; otherwise STAGING mode: a structured log line
 *     only (visible in function logs) so staging can prove the pipeline without a store
 *   - stores exactly the normalized event — never IP, user-agent, referrer, cookies, or headers
 *   - always answers 204 fast; a failure here can never affect the public product
 */
import { validateCollectPayload, collectorDisabled, MAX_BODY_BYTES } from "./_collect-core.mjs";

const ALLOWED_ORIGINS = [
  "https://gametimepicks.yashwantbalaji.com",
  "https://gametime-picks.vercel.app",
];

function originAllowed(origin) {
  if (!origin) return true; // sendBeacon may omit Origin; the schema gate still applies
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/gametime-picks-[a-z0-9-]+\.vercel\.app$/.test(origin); // canonical previews
}

export default async function handler(req, res) {
  // STAGING PROBE: only when NO store token exists (so nothing can ever be persisted) and the
  // caller asks explicitly, validation results are echoed so a preview deployment can be
  // black-box tested. Reasons name keys, never values. With a token present this path is dead
  // and every response is a silent 204.
  const stagingProbe = !process.env.BLOB_READ_WRITE_TOKEN && req.query?.staging === "1";

  // Kill switch — hard OFF is indistinguishable from success on purpose (never breaks the UI).
  if (collectorDisabled() && !stagingProbe) return res.status(204).end();
  if (req.method !== "POST") return res.status(204).end();
  if (!originAllowed(req.headers.origin)) return res.status(204).end();

  let raw = req.body;
  try {
    if (typeof raw === "string") {
      if (raw.length > MAX_BODY_BYTES) return res.status(204).end();
      raw = JSON.parse(raw);
    }
  } catch {
    return res.status(204).end();
  }
  if (JSON.stringify(raw ?? "").length > MAX_BODY_BYTES) return res.status(204).end();

  const v = validateCollectPayload(raw);
  if (!v.ok) {
    // Rejected events are counted, never stored. No payload echo — a forbidden value must not
    // leak into logs either.
    console.log(JSON.stringify({ collect: "rejected", reason: v.reason }));
    if (stagingProbe) return res.status(200).json({ accepted: false, reason: v.reason });
    return res.status(204).end();
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    // STAGING mode: prove the pipeline end-to-end without a store; nothing is persisted.
    console.log(JSON.stringify({ collect: "accepted-staging", event: v.event }));
    if (stagingProbe) return res.status(200).json({ accepted: true, event: v.event });
    return res.status(204).end();
  }

  try {
    // Append-only: one tiny object per event under the day bucket; the internal roll-up job
    // aggregates. Random suffix avoids read-modify-write races entirely.
    const key = `analytics/${v.event.dayBucket}/${crypto.randomUUID()}.json`;
    await fetch(`https://blob.vercel-storage.com/${key}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "x-content-type": "application/json",
        "x-add-random-suffix": "0",
      },
      body: JSON.stringify(v.event),
    });
  } catch {
    // Storage failure is invisible to the user by contract.
  }
  return res.status(204).end();
}
