/**
 * ASK ASSET LOADER — the ONLY way Ask GameTime reads data, and the reason it has no network capability.
 *
 * WHY THIS IS NOT A TOOL. The tool-first rule would be worthless if the registry contained anything
 * shaped like `fetch(url)`: a prompt could then name any host and the model would have a browser. So
 * the single network primitive in the Ask runtime is this loader, it is NOT registered as a tool, the
 * model never sees it, and it accepts a PATH rather than a URL. A path outside
 * `ASK_ASSET_PREFIXES` is refused before a socket is opened. There is no argument a caller can pass
 * that reaches another host — not a relative path, not a protocol-relative one, not an encoded
 * traversal — because the check runs on the string and the origin is supplied by the runtime, not the
 * caller.
 *
 * WHY HTTP AND NOT THE FILESYSTEM. Vercel deploys `app/api/*.mjs` as functions independently of the
 * Next build, so a function has the imported module graph but NOT `app/public/`. Fetching the
 * published asset from the deployment's own origin means Ask reads exactly the bytes the browser
 * reads — one source, already CDN-cached, and no second copy that can drift from the first. It is the
 * same decision the Live gateway made for a different reason: serve the present at request time.
 *
 * PURE CORE, INJECTED TRANSPORT. `makeAskLoader` takes a `fetchText` and knows nothing else, so the
 * unit suite drives it against a fixture map and the endpoint drives it against its own origin with
 * the identical code path. A loader that behaves differently under test proves nothing about
 * production.
 */
import { ASK_BUDGET, ASK_ERROR, isAllowedAssetPath } from "./contract.mjs";

/** A refusal, never a throw: a missing asset must degrade one tool, not fail the whole turn. */
const fail = (code, path) => ({ ok: false, code, path });

/**
 * @param {(path: string, signal: AbortSignal) => Promise<{ ok: boolean, text?: string, bytes?: number }>} fetchText
 * @param {{ now?: () => number, ttlMs?: number, budget?: typeof ASK_BUDGET }} [opts]
 */
export function makeAskLoader(fetchText, opts = {}) {
  const now = opts.now ?? (() => Date.now());
  const ttlMs = opts.ttlMs ?? 60_000;
  const budget = opts.budget ?? ASK_BUDGET;

  /**
   * Per-turn accounting. The memo spans turns within one warm instance (the assets are public and
   * immutable between deploys); the COUNTERS are per turn, so one conversation cannot walk the whole
   * asset tree by asking many questions inside a single request.
   */
  const memo = new Map();

  return {
    /** A fresh budget for one user turn. Nothing shares a counter across requests. */
    beginTurn() {
      let assets = 0;
      let bytes = 0;
      const seen = new Set();

      return {
        get spent() {
          return { assets, bytes };
        },

        /**
         * Load one allowlisted JSON asset.
         * @returns {Promise<{ok: true, json: any, cached: boolean} | {ok: false, code: string, path: string}>}
         */
        async load(path) {
          if (!isAllowedAssetPath(path)) return fail(ASK_ERROR.ASSET_UNAVAILABLE, String(path).slice(0, 80));

          const hit = memo.get(path);
          if (hit && hit.expires > now()) {
            // A repeat read inside one turn is free and uncounted: the executor de-duplicates identical
            // tool calls, and a second tool legitimately needing the same index must not be starved.
            if (!seen.has(path)) {
              seen.add(path);
              assets += 1;
            }
            return { ok: true, json: hit.json, cached: true };
          }

          if (assets >= budget.maxAssetsPerTurn) return fail(ASK_ERROR.BUDGET_EXCEEDED, path);

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), budget.toolTimeoutMs);
          try {
            const res = await fetchText(path, controller.signal);
            if (!res?.ok || typeof res.text !== "string") return fail(ASK_ERROR.ASSET_UNAVAILABLE, path);

            const size = res.bytes ?? Buffer.byteLength(res.text);
            // Size is checked AFTER the read but BEFORE parsing: a JSON.parse of an unbounded body is
            // the memory failure this bound exists to prevent, and the transport already caps its own read.
            if (size > budget.maxAssetBytes || bytes + size > budget.maxAssetBytes * 2) {
              return fail(ASK_ERROR.BUDGET_EXCEEDED, path);
            }

            let json;
            try {
              json = JSON.parse(res.text);
            } catch {
              return fail(ASK_ERROR.ASSET_UNAVAILABLE, path);
            }

            memo.set(path, { json, expires: now() + ttlMs });
            seen.add(path);
            assets += 1;
            bytes += size;
            return { ok: true, json, cached: false };
          } catch {
            return fail(ASK_ERROR.ASSET_UNAVAILABLE, path);
          } finally {
            clearTimeout(timer);
          }
        },
      };
    },

    /** Test seam only — never called by the endpoint. */
    _clearMemo() {
      memo.clear();
    },
  };
}

/**
 * The production transport: the deployment's own origin, over HTTPS, size-capped and abortable.
 *
 * The origin is derived from the runtime, never from the request body, and never from anything the
 * model produced. A forwarded host header IS attacker-controllable, so it is accepted only when it
 * matches the deployment's own `VERCEL_URL`/configured host — otherwise the configured value wins.
 * That keeps a spoofed `Host:` from redirecting Ask's reads at another server.
 */
export function originFetchText(origin, { maxBytes = ASK_BUDGET.maxAssetBytes } = {}) {
  return async (path, signal) => {
    const res = await fetch(`${origin}${path}`, {
      signal,
      headers: { accept: "application/json" },
      redirect: "error", // never follow a redirect off our own origin
    });
    if (!res.ok) return { ok: false };
    const text = await res.text();
    const bytes = Buffer.byteLength(text);
    if (bytes > maxBytes) return { ok: false };
    return { ok: true, text, bytes };
  };
}

/**
 * Resolve the origin Ask reads its own assets from.
 *
 * Preference order is deliberate: an explicitly configured origin wins (so a preview deployment can be
 * pointed at its own assets), then Vercel's own deployment URL, then the request host ONLY if it is a
 * host we recognise. A request host that is not recognised falls back rather than being trusted.
 */
export function resolveAssetOrigin(env = {}, requestHost = null) {
  const configured = String(env.ASK_ASSET_ORIGIN ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercel = String(env.VERCEL_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  const host = String(requestHost ?? "").trim();
  // A bare hostname with no path, port optional. Anything else is not a host we will read from.
  if (/^[a-z0-9.-]{3,253}(?::\d{2,5})?$/i.test(host)) return `https://${host}`;

  return null;
}

/** The local transport used by the unit suite and the projection checks — reads the built public tree. */
export function fileFetchText(fs, path_, publicDir) {
  return async (assetPath) => {
    try {
      const abs = path_.join(publicDir, assetPath.replace(/^\//, ""));
      // The allowlist already ran; this is the second, independent check that the resolved path did
      // not escape the public tree. Two checks because a single one is a single point of failure.
      if (!abs.startsWith(publicDir)) return { ok: false };
      const text = fs.readFileSync(abs, "utf8");
      return { ok: true, text, bytes: Buffer.byteLength(text) };
    } catch {
      return { ok: false };
    }
  };
}

/** A deterministic in-memory transport for tests: a plain `{ path: json }` map. */
export function fixtureFetchText(fixtures) {
  return async (path) => {
    if (!Object.prototype.hasOwnProperty.call(fixtures, path)) return { ok: false };
    const text = typeof fixtures[path] === "string" ? fixtures[path] : JSON.stringify(fixtures[path]);
    return { ok: true, text, bytes: Buffer.byteLength(text) };
  };
}
