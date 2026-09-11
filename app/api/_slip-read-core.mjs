/**
 * SLIP-READ ENDPOINT — the decisions, without the network (P263).
 *
 * Everything the handler must decide before it spends a cent or touches a stored image lives here, so
 * each refusal can be driven in a test: not configured, not signed in, not your folder, too big, wrong
 * type. The handler does the fetching and nothing else.
 *
 * FAIL-CLOSED, like the morning trigger: with no keys the endpoint answers 503 and reads nothing.
 */

/** Claude's vision input types. A slip photographed as a PDF or HEIC is converted client-side first. */
export const ALLOWED_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp", "image/gif"]);
/** Generous for a phone screenshot, far below the model's limit; a bigger file is a mistake, not a slip. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const REQUIRED_ENV = Object.freeze(["ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);

/** Which required variables are absent. Names only — a value is never read into a message or a log. */
export function missingConfig(env = {}) {
  return REQUIRED_ENV.filter((k) => !String(env[k] ?? "").trim());
}

/**
 * A storage key must be `<user id>/<file>`, and the user id must be the caller's own.
 *
 * The bucket's own policies enforce this for the browser, but this endpoint reads with the service
 * role, which bypasses them — so the check has to exist here too, or one user could name another
 * user's path and have the server fetch it for them.
 */
export function pathBelongsTo(path, userId) {
  if (typeof path !== "string" || !path || typeof userId !== "string" || !userId) return false;
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;
  const [folder, ...rest] = path.split("/");
  return folder === userId && rest.length === 1 && rest[0].length > 0;
}

/**
 * @param {{ env?: object, authorization?: string, body?: object }} input
 * @returns {{ status: number, reason: string, proceed: boolean }}
 */
export function decideSlipRead({ env = {}, authorization, body = {} } = {}) {
  const missing = missingConfig(env);
  if (missing.length) return { status: 503, proceed: false, reason: `slip reading is not configured (${missing.join(", ")})` };

  const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim() : "";
  if (!token) return { status: 401, proceed: false, reason: "sign in to read a slip" };

  const { path, contentType, bytes, userId } = body ?? {};
  if (!userId || !pathBelongsTo(path, userId)) {
    return { status: 403, proceed: false, reason: "a slip can only be read from your own folder" };
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    return { status: 415, proceed: false, reason: `unsupported image type${contentType ? ` (${contentType})` : ""}` };
  }
  if (!Number.isFinite(bytes) || bytes <= 0) return { status: 400, proceed: false, reason: "the image size was not stated" };
  if (bytes > MAX_IMAGE_BYTES) return { status: 413, proceed: false, reason: "that image is larger than 8MB" };

  return { status: 200, proceed: true, reason: "ready to read" };
}

/** What the handler logs. Never the key, never the token, never the image. */
export function auditLine(decision, { userId, path } = {}) {
  return JSON.stringify({
    slipRead: decision.proceed ? "reading" : "refused",
    status: decision.status,
    reason: decision.reason,
    // The path already contains the user id; nothing else identifying is recorded.
    path: typeof path === "string" ? path : null,
    user: typeof userId === "string" ? `${userId.slice(0, 8)}…` : null,
  });
}
