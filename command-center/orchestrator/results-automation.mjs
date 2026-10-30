/**
 * LIVE RESULTS AUTOMATION. Published prediction → official outcome → deterministic text → queue → permitted send → receipt.
 * No per-result approval: the founder configures it once. Everything starts OFF, and nothing sends without the recorded
 * one-time authorization. Reply mode also needs its own compliance confirmation; standalone is the fallback. Only canonical
 * (final) results are acted on. Every outcome is keyed by event + market + selection, so a post and its alternate, a restart
 * or a retry can never produce a second send. An unknown send is never retried.
 *
 * Adapters: one per sport/market. Each lists its selections from a published post and resolves one against official data.
 */
import { digestOf, shortId } from "../lib/util.mjs";
import { resultsAccuracy } from "../recap/results-accuracy.mjs";
import { createXPublisher, PRICE_USD, XPublishError } from "../publishers/x-api.mjs";

export const AUTHORIZATION_TEXT = "I authorize automatic GameTimePicks result posts";
export const DEFAULT_CONFIG = Object.freeze({ enabled: false, paused: false, mode: "standalone", replyCompliant: false, sports: { NBA: false, NFL: false }, markets: { winner: false, anytime_td: false }, autoMisses: false, dailyCap: 10, cooldownMin: 10, maxAttempts: 3 });
const pick = (list, key) => list[parseInt(digestOf(key).slice(0, 8), 16) % list.length];

export const TEMPLATES = Object.freeze({
  winner: {
    WIN: [
      (o) => `🏀 BANGGG! 💥\n${o.team.toUpperCase()} WIN! ✅🔥\nOur ${o.teamShort} winner prediction comes through!\nFinal: ${o.final}\nAnother prediction recorded. 💚`,
      (o) => `✅ ${o.team} get it done!\nOur winner prediction hits. 🔥\nFinal: ${o.final}`,
      (o) => `🏀 Called it. ${o.team} win! ✅\nFinal: ${o.final}\nAnother result added to the GameTimePicks record. 💚`,
    ],
    MISS: [(o) => `That one didn't land. ❌\nWe had the ${o.team}. Final: ${o.final}\nThe miss is recorded. Every prediction gets tracked.`, (o) => `❌ Our ${o.team} prediction missed.\nFinal: ${o.final}\nIt's on the record with every other result.`],
  },
  anytime_td: {
    WIN: [(o) => `🚨 TOUCHDOWN! 🚨\nBANGGG! 💥\n${o.player.toUpperCase()} FOUND THE END ZONE! 🏈✅\nOur anytime TD prediction HITS! 🔥`, (o) => `🏈 ${o.player} scored! ✅\nOur anytime TD prediction comes through. 🔥`],
    MISS: [(o) => `No touchdown for ${o.player}. ❌\nOur anytime TD prediction missed, and it's recorded.`],
  },
});

// ── adapters ─────────────────────────────────────────────────────────────────────────────────────────────────
const nbaWinner = {
  sport: "NBA", market: "winner", kinds: new Set(["nba-game", "lr-nba-game", "lr-nba-game-winner"]),
  selections: (p) => [{ eventId: p.package.eventId, selection: p.package.favoured ?? p.package.imported?.content?.game?.winner ?? p.package.imported?.content?.winner?.winner ?? null }],
  async resolve(s, ctx) {
    const b = await ctx.bundle(s.date);
    const g = b?.games?.find((x) => String(x.eventId) === String(s.eventId));
    if (!g) { const x = b?.excluded?.find((e) => String(e.eventId) === String(s.eventId)); return { status: x && !/NO_OFFICIAL_FINAL|UNDER_REVIEW/.test(x.code) ? "VOID" : "UNRESOLVED", detail: x?.code ?? "no official final yet" }; }
    if (s.selection !== g.predictedWinner) return { status: "EXCEPTION", detail: `the post said ${s.selection}, the graded record says ${g.predictedWinner}` };
    const t = g.home.abbr === s.selection ? g.home : g.away;
    const team = String(t.name ?? t.abbr);
    const nick = team.split(" ").pop();
    return { status: g.correct ? "WIN" : "MISS", vars: { team: nick, teamShort: team.split(" ").slice(0, -1).join(" ") || team, final: `${g.away.abbr} ${g.finalAway}, ${g.home.abbr} ${g.finalHome}` }, evidence: { frozenAt: g.frozenAt ?? null, receipt: g.receiptPayloadSha256 ?? null, finalRecordedAt: g.finalRecordedAt ?? null } };
  },
};
const nflAnytimeTd = {
  sport: "NFL", market: "anytime_td", kinds: new Set(["td-top3"]),
  selections: (p) => String(p.package.candidatesKey ?? "").split("|").filter(Boolean).map((c) => ({ eventId: p.package.eventId, selection: c.split(":")[0] })),
  async resolve(s, ctx) {
    const raw = ctx.src.read(`data/internal/nfl/prop-settlement/${s.date}.json`);
    const row = raw ? JSON.parse(raw).rows.find((r) => r.settlementId === `${s.eventId}:${s.selection}:anytime_td`) : null;
    if (!row) return { status: "UNRESOLVED", detail: "no settlement row yet" };
    if (row.finality !== "CANONICAL") return { status: "UNRESOLVED", detail: `finality ${row.finality}: can still change` };
    if (row.measurementState !== "OBSERVED") return { status: "VOID", detail: row.noMeasurementReason ?? row.measurementState };
    return { status: row.lineResult === "YES" ? "WIN" : "MISS", vars: { player: row.playerName }, evidence: { settlementId: row.settlementId, frozenIdentity: row.frozenIdentity, settledAt: row.settledAt, corrections: row.corrections ?? [] } };
  },
};
export const ADAPTERS = Object.freeze([nbaWinner, nflAnytimeTd]);

export function createResultsAutomation({ store, clock, posts, dataSource, oauth = null, fetch: fetchFn, spentThisMonth = () => 0, capUsd = () => 0, isPaused = () => false, mode = () => "dry-run" }) {
  const of = (k) => store.list().filter((e) => e.kind === k).map((e) => ({ ...e.data, at: e.at }));
  const config = () => { const c = of("results-automation-config").at(-1)?.config; return { ...DEFAULT_CONFIG, ...c, sports: { ...DEFAULT_CONFIG.sports, ...c?.sports }, markets: { ...DEFAULT_CONFIG.markets, ...c?.markets } }; };
  const authorized = () => of("results-automation-authorization").at(-1) ?? null;
  const latest = () => { const m = new Map(); for (const o of of("result-outcome")) m.set(o.key, { ...(m.get(o.key) ?? {}), ...o }); return m; };

  /** Published posts, oldest first: the first post that made a selection is its parent, so alternates can't double it. */
  const tracked = () => {
    const out = new Map();
    for (const p of posts().filter((x) => x.receipt)) for (const a of ADAPTERS) {
      if (!a.kinds.has(p.package?.kind) || !p.package.eventId) continue;
      for (const s of a.selections(p)) {
        const key = `${a.sport}|${s.eventId}|${a.market}|${s.selection}`;
        if (!out.has(key)) out.set(key, { key, adapter: a, ...s, date: p.package.laneDate ?? p.package.date, postId: p.postId, parentPostId: p.receipt.providerPostId, parentUrl: p.receipt.canonicalUrl, title: p.package.title });
      }
    }
    return [...out.values()];
  };

  async function tick() {
    const cur = latest();
    const res = { tracked: 0, recorded: 0, unresolved: 0, exceptions: 0, overturned: 0 };
    const src = dataSource();
    const cache = new Map();
    const ctx = { src, bundle: (d) => { if (!cache.has(d)) cache.set(d, resultsAccuracy({ src, date: d }).catch(() => null)); return cache.get(d); } };
    for (const t of tracked()) {
      res.tracked += 1;
      const was = cur.get(t.key);
      const r = await t.adapter.resolve(t, ctx);
      if (r.status === "UNRESOLVED") { res.unresolved += 1; continue; }
      if (r.status === "EXCEPTION") {
        if (store.claim(`outcome-exception|${t.key}`, { at: clock() }).won) store.append("result-exception", "results-automation", { key: t.key, postId: t.postId, code: "PREDICTION_MISMATCH", detail: r.detail });
        res.exceptions += 1; continue;
      }
      if (was) {
        if (was.status !== r.status && was.status !== "OVERTURNED" && store.claim(`outcome-overturn|${t.key}|${r.status}`, { at: clock() }).won) {
          // a correction after the fact: stop anything unsent; a sent post needs a person, so it is raised, never auto-edited
          store.append("result-outcome", "results-automation", { key: t.key, status: "OVERTURNED", correctedTo: r.status, sendState: was.sendState === "SENT" ? "SENT_NEEDS_CORRECTION" : "CANCELLED" });
          res.overturned += 1;
        }
        continue;
      }
      if (!store.claim(`outcome|${t.key}`, { at: clock() }).won) continue;
      const tpl = TEMPLATES[t.adapter.market]?.[r.status];
      const text = tpl ? pick(tpl, t.key)(r.vars) : null;
      store.append("result-outcome", "results-automation", { key: t.key, sport: t.adapter.sport, market: t.adapter.market, eventId: t.eventId, selection: t.selection, postId: t.postId, title: t.title, parentPostId: t.parentPostId, parentUrl: t.parentUrl, status: r.status, text, evidence: r.evidence ?? { detail: r.detail }, sendState: text ? "PREPARED" : "RECORDED_ONLY", attempts: 0 });
      res.recorded += 1;
    }
    return res;
  }

  /** Why a prepared outcome may not go now; null when it may. */
  function blockOf(o, c, sentToday, lastAt) {
    if (!c.enabled) return "automation is off";
    if (c.paused || isPaused()) return "paused";
    if (!authorized()) return "no one-time authorization";
    if (mode() !== "live") return "publishing isn't live";
    if (!c.sports[o.sport]) return `${o.sport} is off`;
    if (!c.markets[o.market]) return `${o.market} is off`;
    if (o.status === "MISS" && !c.autoMisses) return "automatic miss posts are off";
    if (c.mode === "reply" && !c.replyCompliant) return "reply mode isn't confirmed compliant";
    if (sentToday >= c.dailyCap) return "daily cap reached";
    if (lastAt && Date.parse(clock()) - Date.parse(lastAt) < c.cooldownMin * 60_000) return "cooling down";
    if (spentThisMonth() + PRICE_USD.post > capUsd()) return "spend cap reached";
    return null;
  }
  async function sendDue() {
    const c = config();
    const queue = [...latest().values()].filter((o) => o.sendState === "PREPARED" || o.sendState === "RETRY");
    const sends = of("result-send").filter((s) => s.state === "SENT");
    let sentToday = sends.filter((s) => s.at.slice(0, 10) === clock().slice(0, 10)).length, lastAt = sends.at(-1)?.at ?? null;
    const out = [];
    for (const o of queue) {
      if (blockOf(o, c, sentToday, lastAt)) continue;
      const attempt = o.attempts ?? 0;
      if (!store.claim(`resultsend|${o.key}|${attempt}`, { at: clock() }).won) continue;
      store.append("result-outcome", "results-automation", { key: o.key, sendState: "SENDING", attempts: attempt + 1 }); // committed first: a crash reads as unknown, never as unsent
      const provider = createXPublisher({ mode: "live", oauth, fetch: fetchFn, readMedia: () => Buffer.alloc(0), clock });
      try {
        const r = await provider.publish({ text: o.text, media: [], ...(c.mode === "reply" ? { replyTo: o.parentPostId } : {}) });
        store.append("publish-spend", "results-automation", { reason: `result ${o.key}`, costUsd: PRICE_USD.post });
        store.append("result-send", "results-automation", { key: o.key, state: "SENT", mode: c.mode, providerPostId: r.providerPostId, url: r.canonicalUrl });
        store.append("result-outcome", "results-automation", { key: o.key, sendState: "SENT", replyUrl: r.canonicalUrl, providerPostId: r.providerPostId });
        sentToday += 1; lastAt = clock(); out.push({ key: o.key, state: "SENT" });
      } catch (err) {
        const notSent = err instanceof XPublishError && err.outcome === "NOT_SENT";
        const state = !notSent ? "UNKNOWN" : attempt + 1 >= c.maxAttempts ? "FAILED" : "RETRY";
        store.append("result-send", "results-automation", { key: o.key, state, code: err.code ?? "ERROR", detail: String(err.detail ?? err.message).slice(0, 200) });
        store.append("result-outcome", "results-automation", { key: o.key, sendState: state });
        out.push({ key: o.key, state });
      }
    }
    return out;
  }

  function setConfig(patch) {
    const c = config();
    const next = { ...c, ...patch, sports: { ...c.sports, ...patch?.sports }, markets: { ...c.markets, ...patch?.markets } };
    if (!["standalone", "reply"].includes(next.mode)) return { ok: false, code: "BAD_MODE", detail: String(next.mode) };
    if (!(next.dailyCap >= 0 && next.dailyCap <= 50)) return { ok: false, code: "BAD_CAP", detail: "dailyCap 0-50" };
    store.append("results-automation-config", "founder", { config: next });
    return { ok: true, config: next };
  }
  function authorize(text, actor) {
    if (String(text ?? "").trim() !== AUTHORIZATION_TEXT) return { ok: false, code: "AUTHORIZATION_TEXT", detail: `type exactly: ${AUTHORIZATION_TEXT}` };
    store.append("results-automation-authorization", actor.id ?? "founder", { by: actor.id ?? "founder", authentication: actor.authentication ?? null, id: shortId("auth", { at: clock() }) });
    return { ok: true };
  }
  const state = () => {
    const c = config(); const all = [...latest().values()].reverse(); const sends = of("result-send");
    const sent = sends.filter((s) => s.state === "SENT");
    const sentToday = sent.filter((s) => s.at.slice(0, 10) === clock().slice(0, 10)).length;
    return { config: c, authorized: Boolean(authorized()), authorizationText: AUTHORIZATION_TEXT, monitored: tracked().map(({ adapter, ...t }) => ({ ...t, market: adapter.market, sport: adapter.sport })).filter((t) => !latest().has(t.key)).slice(0, 60),
      outcomes: all.slice(0, 80).map((o) => ({ ...o, eligibility: ["PREPARED", "RETRY"].includes(o.sendState) ? blockOf(o, c, sentToday, sent.at(-1)?.at ?? null) ?? "ready to send" : o.sendState })),
      sends: sends.slice(-30).reverse(), exceptions: of("result-exception").slice(-20).reverse(), totals: all.reduce((a, o) => (a[o.status] = (a[o.status] ?? 0) + 1, a), {}), sentToday, costPerPostUsd: PRICE_USD.post };
  };
  return { tick, sendDue, setConfig, authorize, config, state };
}
