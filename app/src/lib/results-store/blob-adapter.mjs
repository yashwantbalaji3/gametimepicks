/**
 * Vercel Blob adapter for the results store (PILOT — not wired into any workflow or function yet; needs founder approval).
 * Uses the SDK already in Production (@vercel/blob 2.8.0, api/collect.mjs): a PRIVATE store, the server-side
 * BLOB_READ_WRITE_TOKEN, write-once `put` by default, `ifMatch` for the manifest compare-and-swap, `get` with
 * `useCache: false` when the caller needs the latest manifest. Maps the SDK's errors onto the core's two codes.
 */
export async function blobAdapter({ token = process.env.BLOB_READ_WRITE_TOKEN } = {}) {
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set — the results store is unavailable (no fallback writes)");
  const { get, put, BlobPreconditionFailedError } = await import("@vercel/blob");
  return {
    async get(key, { fresh = false } = {}) {
      const r = await get(key, { access: "private", token, useCache: !fresh });
      if (!r || r.statusCode !== 200) return null;
      return { text: await new Response(r.stream).text(), etag: r.blob.etag };
    },
    async put(key, text, { allowOverwrite = false, ifMatch } = {}) {
      try {
        const r = await put(key, text, { access: "private", token, contentType: "application/json", addRandomSuffix: false,
          allowOverwrite, ...(ifMatch ? { ifMatch } : {}), cacheControlMaxAge: key.endsWith("manifest.json") ? 60 : 31536000 });
        return { etag: r.etag };
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) throw Object.assign(new Error(e.message), { code: "PRECONDITION" });
        if (/already exists/i.test(String(e?.message))) throw Object.assign(new Error(e.message), { code: "EXISTS" });
        throw e;
      }
    },
  };
}
