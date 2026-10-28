/**
 * OFFICIAL X API PUBLISHER — one approved post (caption + up to 4 images) to the connected GameTimePicks account.
 *
 *   dry-run  builds the exact requests it WOULD send (endpoints, image sizes and hashes, the caption) and returns a
 *            DRY_RUN result. No network, no token needed, $0. The default.
 *   live     1. POST https://api.x.com/2/media/upload        (multipart: media, media_category=tweet_image; scope
 *               media.write) for each image, in order → data.id
 *            2. POST https://api.x.com/2/tweets               ({ text, media: { media_ids } }; 201 → data.id)
 *            Endpoints from docs.x.com (Upload media, Create Post), checked 2026-10-28.
 *
 * Failure classes, which decide what may happen next (orchestrator/publish-flow.mjs):
 *   NOT_SENT  nothing was posted for certain (a media upload failed, or X answered the create call with a 4xx).
 *             Safe to try again after fixing the cause.
 *   UNKNOWN   the create call may have reached X (network error, timeout, 5xx, unreadable answer). NEVER retried
 *             automatically: reconcile() looks for the post first, or the founder records it by hand.
 *
 * The access token comes from x-oauth.mjs at call time and is never logged or returned.
 */
import { sha256 } from "../lib/util.mjs";

export const X_API = "https://api.x.com";
export const X_MEDIA_UPLOAD_URL = `${X_API}/2/media/upload`;
export const X_CREATE_POST_URL = `${X_API}/2/tweets`;
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * Price assumptions (USD) for the spend guard — conservative. Post create: $0.015 on docs.x.com pricing as read on
 * 2026-10-27 (third-party reports since say $0.010). Media upload has no listed price, so it is assumed equal to a
 * post. Reads (reconcile only): $0.005 per post read, $0.010 per user lookup.
 */
export const PRICE_USD = Object.freeze({ post: 0.015, mediaUpload: 0.015, postRead: 0.005, userRead: 0.01 });

export class XPublishError extends Error {
  constructor(outcome, code, detail, extra = {}) {
    super(`${code}: ${detail}`);
    Object.assign(this, { outcome, code, detail, ...extra });
  }
}

/**
 * @param {{ mode: "dry-run"|"live", oauth?: object, fetch?: typeof fetch, readMedia: (file: string) => Buffer,
 *           timeoutMs?: number }} o
 */
export function createXPublisher({ mode = "dry-run", oauth = null, fetch = globalThis.fetch, readMedia, timeoutMs = 30_000 }) {
  if (!["dry-run", "live"].includes(mode)) throw new Error(`unknown publisher mode ${mode}`);
  const live = mode === "live";

  function plan(bundle) {
    const images = (bundle.media ?? []).map((m) => {
      const bytes = readMedia(m.file);
      return { file: m.file, bytes: bytes.length, sha256: sha256(bytes), expectedSha256: m.sha256, data: bytes };
    });
    const problems = [];
    if (images.length > MAX_IMAGES) problems.push(`${images.length} images > ${MAX_IMAGES}`);
    for (const i of images) {
      if (i.sha256 !== i.expectedSha256) problems.push(`${i.file}: the file on disk is not the approved image`);
      if (i.bytes > MAX_IMAGE_BYTES) problems.push(`${i.file}: ${i.bytes} bytes > 5 MB`);
    }
    if (!String(bundle.text ?? "").trim()) problems.push("empty caption");
    return { images, problems };
  }

  const timed = async (url, init) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
  };

  return {
    name: "x-api",
    mode,
    capabilities: () => ({ supportsText: true, supportsImage: true, supportsVideo: false, supportsReplies: false, network: live, maxImages: MAX_IMAGES }),
    quoteCost: (bundle) => ({
      maxUsd: live ? Number((PRICE_USD.post + PRICE_USD.mediaUpload * (bundle.media?.length ?? 0)).toFixed(4)) : 0,
      assumptions: live ? ["post create $0.015 (docs.x.com 2026-10-27)", "media upload priced like a post (no listed price)"] : ["dry run: no request is sent"],
    }),

    /** @param {{ text: string, media: {file: string, sha256: string}[] }} bundle */
    async publish(bundle) {
      const { images, problems } = plan(bundle);
      if (problems.length) throw new XPublishError("NOT_SENT", "MEDIA_INVALID", problems.join("; "));
      const requests = [
        ...images.map((i) => ({ method: "POST", url: X_MEDIA_UPLOAD_URL, body: `multipart: media=<${i.file}, ${i.bytes} bytes, sha256 ${i.sha256.slice(0, 12)}…>, media_category=tweet_image` })),
        { method: "POST", url: X_CREATE_POST_URL, body: { text: bundle.text, media: { media_ids: images.map((_, n) => `<media ${n + 1}>`) } } },
      ];
      if (!live) return { state: "DRY_RUN", providerPostId: null, canonicalUrl: null, requests, network: false };

      const tok = await oauth.accessToken();
      if (!tok.ok) throw new XPublishError("NOT_SENT", tok.code, tok.detail ?? "no X access token");
      const auth = { Authorization: `Bearer ${tok.token}` };
      const mediaIds = [];
      for (const i of images) {
        const form = new FormData();
        form.append("media", new Blob([i.data], { type: "image/png" }), i.file);
        form.append("media_category", "tweet_image");
        let res;
        try {
          res = await timed(X_MEDIA_UPLOAD_URL, { method: "POST", headers: auth, body: form });
        } catch (err) {
          throw new XPublishError("NOT_SENT", "MEDIA_UPLOAD_FAILED", `${i.file}: ${String(err.message ?? err).slice(0, 120)}`, { mediaIds });
        }
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.data?.id) throw new XPublishError("NOT_SENT", res.status === 402 ? "X_CREDITS_REQUIRED" : "MEDIA_UPLOAD_FAILED", `${i.file}: HTTP ${res.status} ${xError(j)}`, { httpStatus: res.status, mediaIds });
        mediaIds.push(String(j.data.id));
      }
      let res;
      try {
        res = await timed(X_CREATE_POST_URL, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ text: bundle.text, media: { media_ids: mediaIds } }) });
      } catch (err) {
        // the request may have reached X before the connection failed
        throw new XPublishError("UNKNOWN", "CREATE_POST_NO_ANSWER", String(err.message ?? err).slice(0, 160), { mediaIds });
      }
      const j = await res.json().catch(() => null);
      if (res.status === 201 && j?.data?.id) {
        const id = String(j.data.id);
        return { state: "PUBLISHED", providerPostId: id, canonicalUrl: `https://x.com/i/status/${id}`, mediaIds, requests, network: true };
      }
      if (res.status >= 400 && res.status < 500) throw new XPublishError("NOT_SENT", res.status === 402 ? "X_CREDITS_REQUIRED" : res.status === 429 ? "X_RATE_LIMITED" : "CREATE_POST_REFUSED", `HTTP ${res.status} ${xError(j)}`, { httpStatus: res.status, mediaIds });
      throw new XPublishError("UNKNOWN", "CREATE_POST_UNCLEAR", `HTTP ${res.status} ${xError(j)}`, { httpStatus: res.status, mediaIds });
    },

    /**
     * After an UNKNOWN outcome: look at the account's latest posts for this exact caption. Costs reads (live only):
     * one user lookup + up to 10 post reads.
     */
    async reconcile({ text, notBefore }) {
      if (!live) return { ok: false, code: "DRY_RUN", detail: "a dry run sent nothing to reconcile" };
      const tok = await oauth.accessToken();
      if (!tok.ok) return { ok: false, code: tok.code, detail: tok.detail };
      const auth = { Authorization: `Bearer ${tok.token}` };
      const me = await (await timed(`${X_API}/2/users/me`, { headers: auth })).json().catch(() => null);
      if (!me?.data?.id) return { ok: false, code: "X_LOOKUP_FAILED", detail: "could not read the connected account" };
      const q = new URLSearchParams({ max_results: "10", "tweet.fields": "created_at" });
      const tl = await (await timed(`${X_API}/2/users/${me.data.id}/tweets?${q}`, { headers: auth })).json().catch(() => null);
      const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
      const hit = (tl?.data ?? []).find((t) => norm(t.text).startsWith(norm(text).slice(0, 120)) && (!notBefore || Date.parse(t.created_at) >= Date.parse(notBefore) - 60_000));
      return { ok: true, found: Boolean(hit), providerPostId: hit?.id ?? null, canonicalUrl: hit ? `https://x.com/${me.data.username}/status/${hit.id}` : null, handle: me.data.username ?? null, costUsd: PRICE_USD.userRead + PRICE_USD.postRead * (tl?.data?.length ?? 0) };
    },
  };
}

const xError = (j) => (j ? String(j.detail ?? j.title ?? j.errors?.[0]?.message ?? "").slice(0, 160) : "");
