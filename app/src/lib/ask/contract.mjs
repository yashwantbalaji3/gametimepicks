/**
 * ASK GAMETIME CONTRACT (v1.6) — versions, budgets, routes, sport policy and refusal codes.
 *
 * ONE definition of every boundary Ask GameTime is allowed to operate inside, in a pure module with no
 * filesystem, no clock, no network — so the serverless endpoint, the browser shell, the projection
 * builder and every test agree by construction rather than by review.
 *
 * THE INVARIANT THIS FILE EXISTS TO PROTECT
 * -----------------------------------------
 * The model may reason about, organise and explain approved tool output. It may never manufacture a
 * sports number, a model result, a live state, a historical fact or a product state that no owner
 * returned. Everything here is written so that a violation is a REFUSAL at a boundary rather than a
 * sentence a reviewer has to notice.
 *
 * WHY THE CAPABILITY LIST IS A CLOSED SET. The model's entire ability is the tool registry. There is
 * no file reader, no shell, no SQL, no URL fetch and no web search — not as a disabled feature, but as
 * code that does not exist. A prompt cannot talk its way into a capability that was never built, which
 * is the only injection defence that does not depend on the model choosing to comply.
 */

/** Bumped when any tool's input or output shape changes in a way a caller could notice. */
export const ASK_SCHEMA_VERSION = 1;

/** The tool registry's own version. Recorded in every operational receipt beside the prompt version. */
export const ASK_TOOL_REGISTRY_VERSION = 1;

/**
 * The system/planner/writer prompt version. Bumped on ANY prompt text change so a receipt can never
 * describe a run by a prompt that has since been edited underneath it (§67 — no hidden prompt drift).
 */
export const ASK_PROMPT_VERSION = 1;

/** The committed projection the emit step publishes, and the public prefix it publishes to. */
export const ASK_PROJECTION_SCHEMA_VERSION = 1;
export const ASK_PROJECTION_DIR = "data/ask-projection/v1";
export const ASK_ASSET_PREFIX = "/data/ask/v1";

/** The public route. `/ask/` was free at v1.5 (production 404) — verified before it was claimed. */
export const ASK_ROUTE = "/ask/";

/** The endpoint the shell posts to. A Vercel function beside the static export, like `/api/live/`. */
export const ASK_ENDPOINT = "/api/ask/";

/**
 * PER-TURN BUDGET (§17). Every number bounds a resource an open-ended agent loop would otherwise
 * consume without limit. These are ceilings, not targets: the median turn uses one planning pass and
 * one or two tools.
 *
 *   planningPasses  2 — one plan, plus one re-plan after a tool answers UNSUPPORTED or AMBIGUOUS.
 *   toolCalls       6 — the widest useful plan (resolve ×2 → compare → matchup → forecast → help).
 *   parallelTools   4 — independent calls only; a dependency edge forces sequencing regardless.
 *   evidenceRows  100 — what reaches the writer AFTER deterministic summarisation, never raw rows.
 *   llmRetries      1 — one structured-output repair. A second is a loop, not a recovery.
 */
export const ASK_BUDGET = Object.freeze({
  maxPlanningPasses: 2,
  maxToolCalls: 6,
  maxParallelTools: 4,
  maxEvidenceRows: 100,
  maxLlmRetries: 1,
  /** Bounded conversation context sent to the provider. Older turns are reduced, never truncated mid-fact. */
  maxConversationTurns: 12,
  maxUserMessageChars: 2000,
  maxRequestBytes: 64 * 1024,
  /** Writer output ceiling. Measured per response type at the canary; this is the hard stop. */
  maxAnswerTokens: 1200,
  maxFollowUps: 3,
  /** Every asset the loader may pull, and the total it may pull in one turn. Mirrors the Live gateway. */
  maxAssetBytes: 3_000_000,
  maxAssetsPerTurn: 8,
  providerTimeoutMs: 30_000,
  toolTimeoutMs: 8_000,
});

/**
 * RATE LIMIT (§70). Coarse, in-memory, per-instance — deliberately NOT a new service.
 *
 * A Vercel function instance is not a global counter, so this bounds a single abusive client against a
 * single warm instance rather than promising a distributed guarantee. It is stated that way in the docs
 * instead of being described as something it is not. A durable distributed limiter needs Redis, which
 * is a founder gate (§184.3); this ships without one.
 */
export const ASK_RATE_LIMIT = Object.freeze({
  windowMs: 60_000,
  maxTurnsPerWindow: 12,
  maxConcurrentPerClient: 2,
  /** Entries evicted past this age so the map cannot grow without bound on a long-lived instance. */
  entryTtlMs: 10 * 60_000,
});

/**
 * STABLE REFUSAL CODES. Core logic never carries a sentence; `copy.mjs` owns every word a reader sees,
 * exactly as the Lab does. A code is part of the contract — renaming one is a schema change.
 */
export const ASK_ERROR = Object.freeze({
  // Request / transport
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  FEATURE_DISABLED: "FEATURE_DISABLED",
  PROVIDER_NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  REQUEST_TOO_LARGE: "REQUEST_TOO_LARGE",
  MALFORMED_REQUEST: "MALFORMED_REQUEST",
  RATE_LIMITED: "RATE_LIMITED",
  // Planner / provider
  PROVIDER_ERROR: "PROVIDER_ERROR",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  MALFORMED_PLAN: "MALFORMED_PLAN",
  MALFORMED_ANSWER: "MALFORMED_ANSWER",
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  // Tool authorisation
  UNKNOWN_TOOL: "UNKNOWN_TOOL",
  UNKNOWN_ARGUMENT: "UNKNOWN_ARGUMENT",
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  MISSING_ARGUMENT: "MISSING_ARGUMENT",
  UNKNOWN_SCHEMA_VERSION: "UNKNOWN_SCHEMA_VERSION",
  // Tool outcome
  UNSUPPORTED_SPORT: "UNSUPPORTED_SPORT",
  UNSUPPORTED_DATA: "UNSUPPORTED_DATA",
  ENTITY_NOT_FOUND: "ENTITY_NOT_FOUND",
  AMBIGUOUS_ENTITY: "AMBIGUOUS_ENTITY",
  NOT_PUBLISHED: "NOT_PUBLISHED",
  ASSET_UNAVAILABLE: "ASSET_UNAVAILABLE",
  // Grounding
  UNSUPPORTED_CLAIM: "UNSUPPORTED_CLAIM",
  UNSUPPORTED_LINK: "UNSUPPORTED_LINK",
  FORBIDDEN_COPY: "FORBIDDEN_COPY",
});

/** A tool result's status. PARTIAL means some of what was asked is genuinely absent, and says which. */
export const ASK_STATUS = Object.freeze({
  OK: "OK",
  PARTIAL: "PARTIAL",
  UNSUPPORTED: "UNSUPPORTED",
  ERROR: "ERROR",
});

/**
 * THE INTENT TAXONOMY (§22). The planner emits one of these; anything else is refused and re-planned.
 * A closed set keeps routing measurable — an eval can assert the intent, not just the prose.
 */
export const ASK_INTENTS = Object.freeze([
  "SITE_HELP",
  "FACTUAL_GAME_QUERY",
  "FACTUAL_PLAYER_QUERY",
  "SEASON_QUERY",
  "TEAM_COMPARE",
  "PLAYER_COMPARE",
  "MATCHUP_CONTEXT",
  "PUBLISHED_FORECAST",
  "LIVE_STATUS",
  "PARLAY_REQUEST",
  "BANKROLL_PARLAY_REQUEST",
  "NAVIGATION_HELP",
  "UNSUPPORTED_DATA",
  "AMBIGUOUS",
]);

/**
 * RISK PROFILES. These are the optimizer artifact's OWN `publicRiskSections` keys, not a vocabulary
 * Ask invented — verified against every optimizer snapshot from 2026-09-10 to 2026-09-17.
 *
 * Risk profile selects among candidates the optimizer already produced. It never changes a projection,
 * a probability, a confidence, a price or a model status (§32).
 */
export const ASK_RISK_PROFILES = Object.freeze(["LOW", "MEDIUM", "HIGH", "LONGSHOT"]);

/** Conversation-local risk profile → the artifact's own section key. */
export const RISK_SECTION_KEY = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  LONGSHOT: "longshot",
});

/**
 * BANKROLL BOUNDS. A stated entertainment budget is conversation-local input, never sports truth and
 * never persisted. The ceiling exists so a typo cannot produce an absurd figure in rendered copy.
 */
export const ASK_BANKROLL = Object.freeze({ min: 1, max: 100_000 });

/**
 * WAGERING COPY THAT MUST NEVER SHIP, in either direction.
 *
 * `forbidden` is checked against the model's own answer: a guarantee, a certainty, or an instruction to
 * recover a loss is refused whether the user asked for it or the model volunteered it. This is a
 * post-generation check, not a prompt instruction, because a prompt instruction is a request and this
 * is a rule.
 */
export const ASK_FORBIDDEN_WAGERING_COPY = Object.freeze([
  "guaranteed", "guarantee", "can't lose", "cannot lose", "risk-free", "risk free", "sure thing",
  "lock of the day", "guaranteed profit", "easy money", "free money", "win it back", "make it back",
  "chase your losses", "chasing losses", "double down", "martingale", "recoup your losses",
  "can not lose", "no-brainer", "sure bet", "cant lose",
]);

/**
 * EXPECTED-VALUE LANGUAGE (§36). There is no approved price-aware EV owner in this repository, so Ask
 * may not use the vocabulary of one. `edgePct` is a model-vs-line difference produced by the optimizer;
 * it is not an expected value and calling it one would be a claim no owner makes.
 *
 * Payout IS owned (`combinedParlayPayoutPer100` over the candidate's own pinned `oddsForSide`), so a
 * payout figure is allowed when it comes from that owner. EV is not.
 */
export const ASK_FORBIDDEN_EV_COPY = Object.freeze([
  "expected value", "+ev", "positive ev", "ev per", "highest ev", "best ev", "most profitable",
  "profitable long-term", "long-term profit", "beat the market", "beats the market", "beat the book",
  "beats the book", "beat the books", "edge over the book", "value bet", "value play",
]);

/**
 * THE APPROVED LINK REGISTRY. Every href Ask can emit is built by code from one of these patterns.
 * The model refers to a link by ID; it never writes a URL. An href that does not match one of these
 * is refused by the answer validator (§99 — no sportsbook link, no affiliate link, no invented route).
 */
export const ASK_LINK_PATTERNS = Object.freeze([
  /^\/ask\/(?:\?[\w%=&.,:+-]{0,512})?$/,
  /^\/research\/lab\/(?:\?[\w%=&.,:+-]{0,1024})?$/,
  /^\/research\/$/,
  /^\/compare\/(?:teams|players)\/(?:mlb|nfl|epl)\/(?:\?[\w%=&.,:+-]{0,512})?$/,
  /^\/compare\/$/,
  /^\/matchups\/(?:mlb|nfl)\/[A-Za-z0-9-]{1,120}\/$/,
  /^\/teams\/(?:mlb|nfl|epl)\/[a-z0-9-]{1,120}\/$/,
  /^\/players\/(?:mlb|nfl|epl|ufc)\/[a-z0-9-]{1,120}\/$/,
  /^\/games\/(?:mlb|nfl)\/[A-Za-z0-9-]{1,120}\/$/,
  /^\/nfl\/game\/[0-9]{1,20}\/$/,
  /^\/nfl\/week\/[A-Za-z0-9-]{1,40}\/$/,
  /^\/mlb\/board\/(?:[0-9]{4}-[0-9]{2}-[0-9]{2}\/)?$/,
  /^\/epl\/match\/[A-Za-z0-9-]{1,120}\/$/,
  /^\/(?:live|today|sports|mlb|nfl|epl|ufc|results|parlay-lab|parlays|build|markets|models|my|saved|following|methodology|learn|responsible-use|system-status)\/$/,
  /^\/$/,
]);

/** Is this href one the product owns? The answer validator's structural check — never a substring test. */
export function isApprovedLink(href) {
  if (typeof href !== "string" || href.length === 0 || href.length > 1200) return false;
  return ASK_LINK_PATTERNS.some((re) => re.test(href));
}

/**
 * ASSET PATH ALLOWLIST. The loader may read these prefixes from the deployment's OWN origin and
 * nothing else. This is the structural reason there is no `fetch(url)` capability: the only network
 * primitive in the Ask runtime accepts a path, not a URL, and refuses a path outside this list.
 */
export const ASK_ASSET_PREFIXES = Object.freeze(["/data/ask/v1/", "/data/lab/v1/", "/data/compare/v1/"]);

/**
 * Refuse anything that is not a plain, traversal-free JSON path under an allowlisted prefix.
 *
 * ⚠ ENCODED TRAVERSAL IS TRAVERSAL. The first version checked for a literal ".." and passed
 * `/data/ask/v1/%2e%2e/%2e%2e/internal.json` — which the HTTP server decodes back into `../..` before
 * it resolves anything. A mutation probe caught it. The path is therefore DECODED first (repeatedly,
 * because `%252e` decodes to `%2e` decodes to `.`), and the decoded form is what the rules apply to.
 *
 * The allowlist is also applied to the decoded form, so an encoded prefix cannot be smuggled past a
 * `startsWith` on the raw string either.
 */
export function isAllowedAssetPath(p) {
  if (typeof p !== "string" || p.length === 0 || p.length > 300) return false;

  // Decode until stable, so no depth of encoding hides a separator. Malformed encoding is refused.
  let decoded = p;
  for (let i = 0; i < 4; i += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return false; // a path that is not valid encoding is not a path we will read
    }
    if (next === decoded) break;
    decoded = next;
  }
  // Anything still encoded after four passes is refused rather than accepted at face value.
  if (/%[0-9a-f]{2}/i.test(decoded)) return false;

  // The checks run on the DECODED form. A backslash is a separator on some hosts; a control character
  // or a NUL is never legitimate in an asset path.
  if (decoded.includes("..") || decoded.includes("//") || decoded.includes("\\")) return false;
  if (decoded.includes("?") || decoded.includes("#")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return false;
  if (!decoded.endsWith(".json")) return false;

  return ASK_ASSET_PREFIXES.some((prefix) => decoded.startsWith(prefix));
}

/**
 * SPORT ELIGIBILITY IS DERIVED, NEVER READ FROM A JSON KEY.
 *
 * ⚠ THE NBA LESSON. The optimizer artifact carries `publicRiskSections.<profile>.nba` on every
 * snapshot. Every one of those arrays is EMPTY and `sourcePools.nbaCount` is 0 — verified across
 * 2026-09-10 … 2026-09-17 — because the key is dormant shape from when NBA was modelled, not a
 * statement that NBA is supported. The capability registry says NBA is HISTORICAL_ONLY: real settled
 * history, no live projection capability, `canEnterPredictionProducts` false.
 *
 * So Ask derives parlay sport eligibility from the capability registry, and the adapter drops any
 * section whose sport is not eligible EVEN IF IT IS NON-EMPTY. If the generator ever starts filling
 * `nba` again while the registry still says HISTORICAL_ONLY, Ask refuses it and the guard fails loudly
 * rather than a legacy JSON key quietly reopening a sport the product does not stand behind.
 *
 * These two lists are the frozen expectation the guard test compares the live registry against; the
 * RUNTIME answer always comes from the registry itself, never from these constants.
 */
export const ASK_EXPECTED_PARLAY_SPORTS = Object.freeze(["mlb"]);
export const ASK_EXPECTED_FORECAST_SPORTS = Object.freeze(["mlb", "nfl", "epl"]);

/** Sport keys Ask will ever discuss at all, in the casing the artifacts use. */
export const ASK_SPORTS = Object.freeze(["MLB", "NFL", "EPL", "UFC"]);

/**
 * FORBIDDEN PROJECTION FIELDS. The Ask projection is public. A field on this list appearing anywhere in
 * it is a build-time refusal — the same closed-list discipline the Lab and compare projections use, so
 * private research cannot reach a public artifact by being added to an owner upstream.
 */
export const FORBIDDEN_ASK_FIELDS = Object.freeze([
  "shadow", "shadowMetrics", "private", "internal", "researchOnly", "candidateModel", "challenger",
  "apiKey", "api_key", "secret", "token", "serviceRole", "sourcePath", "src", "absPath", "repoPath",
  "handoff", "founder", "prereg", "unpublished", "withheld", "estimate",
]);

/** Refuse an artifact whose schema version this build does not understand (§12 — unknown version: refuse). */
export function assertAskVersion(doc, where) {
  if (!doc || typeof doc !== "object") throw new Error(`${where}: not an object`);
  if (doc.schemaVersion !== ASK_PROJECTION_SCHEMA_VERSION) {
    throw new Error(`${where}: schemaVersion ${doc.schemaVersion} is not ${ASK_PROJECTION_SCHEMA_VERSION}`);
  }
  return doc;
}

/** Where each published Ask asset lives. The ONLY shapes the emit step writes and the loader reads. */
export const askAssetPath = Object.freeze({
  manifest: () => `${ASK_ASSET_PREFIX}/manifest.json`,
  entities: () => `${ASK_ASSET_PREFIX}/entities.json`,
  forecasts: () => `${ASK_ASSET_PREFIX}/forecasts.json`,
  matchups: () => `${ASK_ASSET_PREFIX}/matchups.json`,
  parlays: () => `${ASK_ASSET_PREFIX}/parlays.json`,
  help: () => `${ASK_ASSET_PREFIX}/help.json`,
  routes: () => `${ASK_ASSET_PREFIX}/routes.json`,
  recent: (sport, shard) => `${ASK_ASSET_PREFIX}/recent/${String(sport).toLowerCase()}/${shard}.json`,
});

/**
 * HOW MANY Last-N SHARDS PER SPORT, and why sharding at all.
 *
 * A single NFL partition was 2,759 KB — inside the loader's 3 MB ceiling by 8%, which is not headroom,
 * it is a countdown: one more season of players and the build fails. Worse, answering "Keenan Allen's
 * last five games" would have pulled 2.7 MB to read one player.
 *
 * Sharding by a hash of the canonical player id fixes both. The bucket is derived identically in the
 * builder and in the tool from the id alone, so a lookup is still exactly one asset — just a much
 * smaller one — and adding players grows every shard a little rather than one file past a cliff.
 */
export const ASK_RECENT_SHARDS = 8;

/** Bucket a canonical player id. Deterministic, stable across builds, and computed in exactly two places. */
export function recentShardOf(playerId) {
  const s = String(playerId ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % ASK_RECENT_SHARDS;
}

/**
 * Which committed Ask projection files are stored gzipped, mirroring `labStoredGzipped`.
 *
 * The per-player Last-N partitions are large and highly repetitive; stored plain they cost 6 MB in the
 * repository and one of them exceeded the loader's own 3 MB asset ceiling, so the artifact would have
 * been refused at runtime. The small indexes and the manifest stay readable in a diff.
 */
export const askStoredGzipped = (rel) => /^recent\//.test(rel);

/**
 * WHICH ARTIFACTS ARE BUILT AT BUILD TIME RATHER THAN COMMITTED.
 *
 * Forecasts and parlay candidates change several times a day: the nightly pipeline lands MLB
 * prediction snapshots, lineup refreshes and optimizer runs continuously. A COMMITTED snapshot of
 * them is stale within hours, and a `--check` over that snapshot would go red on `main` every time
 * the bot ran — which is the fastest way to teach everyone to ignore a currency check.
 *
 * So they are regenerated by `npm run build` from whatever the build sees, and are not committed.
 * There is nothing to be stale against, and the deploy's forecasts are the deploy's forecasts.
 *
 * Everything else — the entity index, the matchup registry, the help corpus, the Last-N shards — moves
 * with the research projection, changes rarely, and stays committed and checked.
 */
export const ASK_DAILY_FILES = Object.freeze(["forecasts.json", "parlays.json"]);
export const isAskDailyFile = (rel) => ASK_DAILY_FILES.includes(rel);

/** The committed filename for a projection-relative path. The PUBLIC emit always writes plain JSON. */
export const storedName = (rel) => (askStoredGzipped(rel) ? `${rel}.gz` : rel);

/**
 * The packed Last-N row layout. Unpacked in exactly one place so no consumer reads a row by index.
 * Values from `VALUES` onward are aligned to the artifact's own `columns` array.
 */
export const ASK_RECENT_ROW = Object.freeze({ DATE: 0, SEASON: 1, OPP: 2, HA: 3, RESULT: 4, VALUES: 5 });
