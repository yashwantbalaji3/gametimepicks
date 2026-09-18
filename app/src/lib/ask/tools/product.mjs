/**
 * ASK PRODUCT TOOLS — time, identity, Last-N, help retrieval and arithmetic.
 *
 * These five share a property worth stating once: none of them is allowed to be answered by the model
 * from its own knowledge, even though each looks like something a language model "obviously" knows.
 *
 *   getGameTimeNow        a model's idea of "today" comes from its training data and the text in front
 *                         of it. Both are wrong. The product date is a server clock, in ET.
 *   resolveEntity         two players share a name far more often than a model expects. A confident
 *                         wrong id produces a fluent answer about the wrong person, which is the worst
 *                         failure shape there is — so ambiguity is a question, never a guess.
 *   getPlayerRecentGames  "recent form" invites summarising from memory. It reads the page's own Last-N.
 *   searchGameTimeHelp    a model will happily describe a product feature that does not exist.
 *   calculate             money arithmetic done in prose is arithmetic done wrong eventually.
 */
import {
  ASK_BANKROLL,
  ASK_ERROR,
  ASK_RECENT_SHARDS,
  ASK_STATUS,
  askAssetPath,
  recentShardOf,
} from "../contract.mjs";
import { ASK_RECENT_ROW } from "../contract.mjs";

/* ────────────────────────────────  getGameTimeNow  ──────────────────────────────── */

const ET = "America/New_York";
const etFormat = (d, opts) => new Intl.DateTimeFormat("en-CA", { timeZone: ET, ...opts }).format(d);

/**
 * The product's clock. `productDateEt` is the date every "today" question is answered against.
 *
 * The clock is injected (`ctx.now`) rather than read from `Date` inside this module, so the eval suite
 * can pin a date and assert an answer — a time tool that cannot be frozen makes every downstream test
 * depend on the day it runs.
 */
export async function getGameTimeNow(_args, ctx) {
  const now = ctx.now ? ctx.now() : new Date();
  return {
    status: ASK_STATUS.OK,
    nowUtc: now.toISOString(),
    nowEt: `${etFormat(now, { year: "numeric", month: "2-digit", day: "2-digit" })} ${etFormat(now, { hour: "2-digit", minute: "2-digit", hour12: false })}`,
    productDateEt: etFormat(now, { year: "numeric", month: "2-digit", day: "2-digit" }),
    timezone: ET,
  };
}

/* ────────────────────────────────  resolveEntity  ──────────────────────────────── */

/** Case, accent and punctuation folded. Identity stays the canonical id; this only matches SPELLING. */
const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Name → canonical id, with a DETERMINISTIC confidence state rather than an invented score (§119).
 *
 *   EXACT                 the folded name matches exactly one entity's folded label
 *   UNIQUE_SEARCH_MATCH   one entity matches on a looser rule (all query words present)
 *   AMBIGUOUS             more than one plausible entity — the caller must ask, not pick
 *   NONE                  nothing matched
 *
 * There is no "90% confident". A fuzzy score invites a threshold, and a threshold invites picking the
 * higher of two people with the same surname. Ambiguity is surfaced with the candidates attached so
 * the conversation can resolve it in one question.
 */
export async function resolveEntity(args, ctx) {
  const loaded = await ctx.turn.load(askAssetPath.entities());
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };

  const wanted = fold(args.text);
  if (!wanted) return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.ENTITY_NOT_FOUND, resolution: "NONE", candidates: [] };

  const pool = (loaded.json.entries ?? []).filter(
    (e) => e.kind === args.kind && (!args.sport || e.sport === args.sport),
  );

  const exact = pool.filter((e) => fold(e.label) === wanted);
  if (exact.length === 1) return resolved("EXACT", exact[0]);
  if (exact.length > 1) return ambiguous(exact);

  // Looser rule: every word the caller typed appears in the label. "allen" matches "Keenan Allen" and
  // "Josh Allen" — deliberately BOTH, so the caller is asked rather than handed the first one.
  const words = wanted.split(" ").filter(Boolean);
  const loose = pool.filter((e) => {
    const label = fold(e.label);
    return words.every((w) => label.includes(w));
  });
  if (loose.length === 1) return resolved("UNIQUE_SEARCH_MATCH", loose[0]);
  if (loose.length > 1) return ambiguous(loose);

  return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.ENTITY_NOT_FOUND, resolution: "NONE", query: args.text, candidates: [] };

  function resolved(resolution, e) {
    return {
      status: ASK_STATUS.OK,
      resolution,
      entity: { id: e.id, kind: e.kind, sport: e.sport, label: e.label, slug: e.slug, hint: e.hint ?? null },
      links: e.path ? [{ id: "entity", label: `Open ${e.label}`, href: e.path }] : [],
    };
  }
  function ambiguous(list) {
    return {
      status: ASK_STATUS.PARTIAL,
      error: ASK_ERROR.AMBIGUOUS_ENTITY,
      resolution: "AMBIGUOUS",
      query: args.text,
      // Bounded: a list of forty same-surname players is not a question a person can answer.
      candidates: list.slice(0, 6).map((e) => ({ id: e.id, sport: e.sport, label: e.label, hint: e.hint ?? null })),
      totalCandidates: list.length,
    };
  }
}

/* ──────────────────────────────  getPlayerRecentGames  ────────────────────────────── */

/**
 * The player research page's own Last 3/5/10, across recorded seasons.
 *
 * Reads exactly ONE shard, chosen by the same hash the builder used. The `windows` aggregates are the
 * page's own arithmetic, copied; the dated rows are the page's own game log. Nothing is averaged here.
 */
export async function getPlayerRecentGames(args, ctx) {
  const shard = recentShardOf(args.playerId);
  const loaded = await ctx.turn.load(askAssetPath.recent(args.sport, shard));
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };

  const doc = loaded.json;
  const player = doc.players?.[args.playerId];
  if (!player) {
    // A miss here is genuinely "not recorded for this sport", not "wrong shard" — the shard is a pure
    // function of the id, so an id in this sport's corpus is always in the shard we just read.
    return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.ENTITY_NOT_FOUND, detail: args.playerId, sport: args.sport };
  }

  const columns = doc.columns ?? [];
  const keys = columns.map((c) => c.key);
  const family = args.statFamily ? matchColumn(args.statFamily, columns) : null;
  if (args.statFamily && !family) {
    return {
      status: ASK_STATUS.PARTIAL,
      error: ASK_ERROR.UNSUPPORTED_DATA,
      detail: `${args.statFamily} is not a recorded family for ${args.sport}`,
      availableFamilies: columns.map((c) => ({ key: c.key, label: c.label })),
    };
  }

  const wanted = family ? [family] : headline(player, keys);
  const rows = (player.rows ?? []).slice(0, args.limit).map((r) => {
    const values = {};
    for (const key of wanted) {
      const i = keys.indexOf(key);
      // MISSING IS NOT ZERO. An absent value stays null so the writer must say "not recorded".
      values[key] = i === -1 ? null : r[ASK_RECENT_ROW.VALUES + i] ?? null;
    }
    return {
      date: r[ASK_RECENT_ROW.DATE],
      seasonId: r[ASK_RECENT_ROW.SEASON],
      opponent: doc.teams?.[r[ASK_RECENT_ROW.OPP]] ?? null,
      homeAway: r[ASK_RECENT_ROW.HA],
      result: r[ASK_RECENT_ROW.RESULT],
      values,
    };
  });

  const windows = {};
  for (const key of wanted) {
    const w = (player.windows?.[key] ?? []).find((x) => x.size === args.limit);
    if (w) windows[key] = { size: w.size, recordedGames: w.n, sum: w.sum, average: w.avg };
  }

  return {
    status: rows.length < args.limit ? ASK_STATUS.PARTIAL : ASK_STATUS.OK,
    player: { id: args.playerId, label: player.label, coverage: player.coverage ?? null },
    requested: args.limit,
    returned: rows.length,
    families: wanted.map((k) => ({ key: k, label: columns.find((c) => c.key === k)?.label ?? k })),
    rows,
    /* The owner's own Last-N aggregates. Present only where the owner computed that window size. */
    windows,
    links: player.path ? [{ id: "player", label: `Open ${player.label}'s research page`, href: player.path }] : [],
  };
}

/** The families this player actually has non-null values for, capped so an answer stays readable. */
function headline(player, keys) {
  const counts = keys.map((k, i) => [k, (player.rows ?? []).filter((r) => r[ASK_RECENT_ROW.VALUES + i] != null).length]);
  return counts.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
}

function matchColumn(wanted, columns) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(wanted);
  const hit = columns.filter((c) => norm(c.key) === target || norm(c.label) === target);
  return hit.length === 1 ? hit[0].key : null;
}

/* ────────────────────────────────  searchGameTimeHelp  ──────────────────────────────── */

/**
 * Lexical retrieval over the authored help corpus (§25) — BM25-shaped, deliberately not embeddings.
 *
 * Embeddings were considered and deferred on evidence rather than on taste: the corpus is 22 authored
 * chunks with hand-written keyword lists, the questions are short and vocabulary-aligned with the
 * product's own words, and a paid embedding provider is a founder gate. The eval measures this; if
 * lexical retrieval materially fails the golden help questions, THAT is the evidence for a rerank, and
 * it will be in the receipt rather than in an opinion.
 */
export async function searchGameTimeHelp(args, ctx) {
  const loaded = await ctx.turn.load(askAssetPath.help());
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };

  const chunks = loaded.json.chunks ?? [];
  const qWords = [...new Set(fold(args.query).split(" ").filter((w) => w.length > 2 && !STOP.has(w)))];
  if (!qWords.length) return { status: ASK_STATUS.PARTIAL, error: ASK_ERROR.UNSUPPORTED_DATA, detail: "no searchable terms", sections: [] };

  // Document frequency over the corpus, so a word in every chunk ("gametime") carries almost no weight.
  const df = new Map();
  const docs = chunks.map((c) => {
    const bag = new Set(fold(`${c.title} ${c.section} ${c.keywords.join(" ")} ${c.text}`).split(" "));
    for (const w of bag) df.set(w, (df.get(w) ?? 0) + 1);
    return { chunk: c, bag, keywords: new Set(c.keywords.map(fold)), title: fold(c.title) };
  });

  const N = docs.length || 1;
  const scored = docs
    .map((d) => {
      let score = 0;
      for (const w of qWords) {
        if (!d.bag.has(w)) continue;
        const idf = Math.log((N + 1) / ((df.get(w) ?? 0) + 0.5));
        // A hit in the title or an authored keyword is a stronger signal than a hit in the body: the
        // keyword lists exist precisely to say "this chunk is ABOUT this".
        const weight = d.title.includes(w) ? 3 : [...d.keywords].some((k) => k.includes(w)) ? 2.5 : 1;
        score += idf * weight;
      }
      // A multi-word phrase appearing verbatim is worth more than its words appearing apart.
      if (qWords.length > 1 && [...d.keywords].some((k) => k.includes(fold(args.query)))) score += 4;
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.d.chunk.id < b.d.chunk.id ? -1 : 1));

  if (!scored.length) {
    return { status: ASK_STATUS.PARTIAL, error: ASK_ERROR.UNSUPPORTED_DATA, detail: "nothing in the help corpus matched", sections: [] };
  }

  const sections = scored.slice(0, args.limit).map(({ d }) => ({
    id: d.chunk.id,
    title: d.chunk.title,
    section: d.chunk.section,
    text: d.chunk.text,
    route: d.chunk.route,
  }));

  return {
    status: ASK_STATUS.OK,
    matched: scored.length,
    sections,
    links: sections.filter((s) => s.route).map((s) => ({ id: s.id, label: s.title, href: s.route })),
  };
}

const STOP = new Set([
  "the", "and", "for", "are", "can", "you", "how", "what", "does", "did", "why", "where", "when", "who",
  "with", "from", "this", "that", "have", "has", "was", "were", "will", "your", "its", "about", "get",
  "see", "use", "using", "there", "them", "they", "any", "all", "out", "into", "not",
]);

/* ────────────────────────────────  calculate  ──────────────────────────────── */

/**
 * Four fixed operations over numbers an owner already produced. No expression parser, no `eval`, no
 * variables — the operation is an enum and the operands are bounded numbers (§117, §160).
 *
 * This exists so the writer never does money arithmetic in prose. Its most common use is the only one
 * that is genuinely dynamic: scaling a candidate's own `profitPer100` to a stake the user named.
 */
export async function calculate(args) {
  const round2 = (n) => Math.round(n * 100) / 100;
  switch (args.op) {
    case "STAKE_RETURN": {
      if (args.stake === undefined || args.profitPer100 === undefined) {
        return { status: ASK_STATUS.ERROR, error: ASK_ERROR.MISSING_ARGUMENT, detail: "STAKE_RETURN needs stake and profitPer100" };
      }
      if (args.stake < ASK_BANKROLL.min || args.stake > ASK_BANKROLL.max) {
        return { status: ASK_STATUS.ERROR, error: ASK_ERROR.INVALID_ARGUMENT, detail: "stake outside the permitted range" };
      }
      const profit = round2((args.stake * args.profitPer100) / 100);
      return {
        status: ASK_STATUS.OK,
        op: args.op,
        inputs: { stake: args.stake, profitPer100: args.profitPer100 },
        profit,
        totalReturn: round2(args.stake + profit),
        /* Said explicitly so the writer repeats it: this is what the candidate pays IF every leg wins.
           It is not an expectation, and it is not a probability-weighted value. */
        meaning: "profit if every leg in the candidate wins, at the prices the candidate was built with",
      };
    }
    case "PERCENT_OF": {
      if (args.value === undefined || args.percent === undefined) return missing("PERCENT_OF needs value and percent");
      return { status: ASK_STATUS.OK, op: args.op, inputs: { value: args.value, percent: args.percent }, result: round2((args.value * args.percent) / 100) };
    }
    case "SUM": {
      if (args.value === undefined || args.addend === undefined) return missing("SUM needs value and addend");
      return { status: ASK_STATUS.OK, op: args.op, inputs: { value: args.value, addend: args.addend }, result: round2(args.value + args.addend) };
    }
    case "MULTIPLY": {
      if (args.value === undefined || args.factor === undefined) return missing("MULTIPLY needs value and factor");
      return { status: ASK_STATUS.OK, op: args.op, inputs: { value: args.value, factor: args.factor }, result: round2(args.value * args.factor) };
    }
    default:
      return { status: ASK_STATUS.ERROR, error: ASK_ERROR.INVALID_ARGUMENT, detail: "unknown operation" };
  }
  function missing(detail) {
    return { status: ASK_STATUS.ERROR, error: ASK_ERROR.MISSING_ARGUMENT, detail };
  }
}

export { ASK_RECENT_SHARDS };
