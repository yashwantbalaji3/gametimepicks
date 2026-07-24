/**
 * COARSE ACQUISITION SOURCE — a PURE classifier that maps a first-party `?source=` parameter (and, as a
 * fallback, a COARSE referrer host) to exactly ONE of a closed set of source buckets. Privacy-first by
 * construction: it stores/forwards only a single coarse bucket — never a full referrer URL, a campaign
 * micro-identifier, an advertising id, or any cross-session/cross-site identifier. Unknown inputs fall back
 * deterministically (external-but-unknown → `referral`; nothing → `direct`).
 *
 * No React/Next imports so tsx can unit-test it directly; the client bootstrap calls it with values it reads
 * from `location.search` + a coarse `document.referrer` host.
 */

/** The closed set of coarse source buckets (mirrors the analytics contract's SOURCE_BUCKETS). */
export const SOURCE_BUCKETS = ["direct", "x", "discord", "instagram", "tiktok", "organic", "referral"] as const;
export type SourceBucket = (typeof SOURCE_BUCKETS)[number];
const SOURCE_SET: ReadonlySet<string> = new Set(SOURCE_BUCKETS);

/** Approved `?source=` param values + their aliases → bucket. Anything else is ignored (not trusted). */
const PARAM_ALIASES: Record<string, SourceBucket> = {
  x: "x", twitter: "x",
  discord: "discord",
  instagram: "instagram", ig: "instagram",
  tiktok: "tiktok", tt: "tiktok",
  organic: "organic", search: "organic",
  direct: "direct",
  referral: "referral",
};

/** Coarse referrer HOSTS we recognise (host only — never the full URL). */
const SOCIAL_HOSTS: Record<string, SourceBucket> = {
  "t.co": "x", "twitter.com": "x", "x.com": "x", "mobile.twitter.com": "x",
  "discord.com": "discord", "discord.gg": "discord", "discordapp.com": "discord",
  "instagram.com": "instagram", "l.instagram.com": "instagram",
  "tiktok.com": "tiktok", "vm.tiktok.com": "tiktok",
};
const SEARCH_HOST_PREFIXES = ["google.", "bing.", "duckduckgo.", "ecosia.", "yahoo.", "brave.", "startpage.", "search.", "baidu."];

/** Normalize a raw `?source=` value to a bucket, or null when it is absent/unrecognised. */
export function normalizeSourceParam(raw: unknown): SourceBucket | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase();
  if (!k || k.length > 24) return null; // reject junk/oversized values outright
  if (PARAM_ALIASES[k]) return PARAM_ALIASES[k];
  return SOURCE_SET.has(k) ? (k as SourceBucket) : null;
}

/** Classify a COARSE referrer host (no path/query) to a bucket, or null when unrecognised. */
export function classifyReferrerHost(host: unknown): SourceBucket | null {
  if (typeof host !== "string") return null;
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  if (!h) return null;
  if (SOCIAL_HOSTS[h]) return SOCIAL_HOSTS[h];
  if (SEARCH_HOST_PREFIXES.some((p) => h.startsWith(p) || h.includes(`.${p}`))) return "organic";
  return null;
}

/**
 * Deterministically classify the visit's coarse source. Priority: an approved `?source=` param wins; then a
 * same-origin (internal) navigation is `direct`; then a recognised referrer host; then external-but-unknown
 * is `referral`; nothing is `direct`. Pure — no storage, no clock, no network.
 */
export function classifySource(input: { sourceParam?: string | null; referrerHost?: string | null; sameOrigin?: boolean }): SourceBucket {
  const fromParam = normalizeSourceParam(input.sourceParam);
  if (fromParam) return fromParam;
  if (input.sameOrigin) return "direct";
  const fromRef = classifyReferrerHost(input.referrerHost);
  if (fromRef) return fromRef;
  const hasExternalRef = typeof input.referrerHost === "string" && input.referrerHost.trim().length > 0;
  return hasExternalRef ? "referral" : "direct";
}

/** Append the approved coarse `?source=` param to a first-party path (used by the social pack). Idempotent;
 *  never touches a path that already carries a source; leaves canonical paths valid without it. */
export function withSource(path: string, source: SourceBucket): string {
  if (!path || source === "direct") return path; // internal/direct links stay parameter-free
  if (/[?&]source=/.test(path)) return path;
  const [base, hash = ""] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}source=${source}${hash ? `#${hash}` : ""}`;
}
