/**
 * TEAM CONTRACTS — what Grok, ChatGPT and Claude Code hand to each other through the orchestrator, and the
 * deterministic checks between them. The same schema is shown to a manual seat (in its prompt), sent to an API seat
 * (structured output) and enforced on whatever comes back, so a pasted answer and an API answer are held to one bar.
 */
import { REASON } from "./index.mjs";

const str = (maxLength = 2000) => ({ type: "string", maxLength });
const arr = (items, maxItems = 20) => ({ type: "array", items, maxItems });

export const X_RESEARCH_SCHEMA = {
  type: "object",
  required: ["query", "findings", "caveats"],
  properties: {
    query: str(400),
    findings: arr({
      type: "object",
      required: ["topic", "summary", "sources"],
      properties: {
        topic: str(200), summary: str(800), sport: str(40),
        sources: arr({ type: "object", required: ["url"], properties: { url: str(300), author: str(80), postedAt: str(40), excerpt: str(280) } }, 6),
        signals: str(400), relevanceToGTP: str(400),
      },
    }, 8),
    caveats: arr(str(400), 10),
  },
};

export const CONTENT_PROPOSALS_SCHEMA = {
  type: "object",
  required: ["proposals"],
  properties: {
    proposals: arr({
      type: "object",
      required: ["findingIndex", "type", "text", "rationale"],
      properties: {
        findingIndex: { type: "integer" }, type: { type: "string", enum: ["post", "reply", "thread"] },
        replyToUrl: str(300), text: str(600), rationale: str(600),
        graphic: { type: "string", enum: ["none", "recap-card", "chart"] }, dataUsed: arr(str(200), 10),
      },
    }, 3),
  },
};

export const CONTENT_PLAN_SCHEMA = {
  type: "object",
  required: ["summary", "weekly", "kpis", "risks"],
  properties: {
    summary: str(800),
    weekly: arr({ type: "object", required: ["day", "format", "theme", "dataSource"], properties: { day: str(20), format: str(80), theme: str(200), dataSource: str(200), example: str(400) } }, 7),
    kpis: arr(str(200), 8), risks: arr(str(300), 8), automationCandidates: arr(str(300), 8),
  },
};

export const FEASIBILITY_REVIEW_SCHEMA = {
  type: "object",
  required: ["summary", "automationSteps", "tests", "openQuestions"],
  properties: {
    summary: { type: "string", maxLength: 800 },
    automationSteps: { type: "array", maxItems: 10, items: { type: "object", required: ["step", "reuses", "newWork", "risk"], properties: { step: { type: "string", maxLength: 200 }, reuses: { type: "string", maxLength: 300 }, newWork: { type: "string", maxLength: 400 }, risk: { type: "string", maxLength: 300 } } } },
    tests: { type: "array", maxItems: 10, items: { type: "string", maxLength: 300 } },
    openQuestions: { type: "array", maxItems: 10, items: { type: "string", maxLength: 300 } },
  },
};

const isStr = (x, max = Infinity) => typeof x === "string" && x.trim().length > 0 && x.length <= max;
const done = (errors) => ({ ok: errors.length === 0, errors });

export function validateXResearch(a) {
  const e = [];
  if (!isStr(a?.query, 400)) e.push("query");
  if (!Array.isArray(a?.findings) || a.findings.length < 1 || a.findings.length > 8) e.push("findings (1–8)");
  (a?.findings ?? []).forEach((f, i) => {
    if (!isStr(f?.topic, 200)) e.push(`findings[${i}].topic`);
    if (!isStr(f?.summary, 800)) e.push(`findings[${i}].summary`);
    if (!Array.isArray(f?.sources) || !f.sources.length || f.sources.some((s) => !isStr(s?.url, 300))) e.push(`findings[${i}].sources (each needs a url)`);
  });
  if (!Array.isArray(a?.caveats)) e.push("caveats");
  return done(e);
}

export function validateContentProposals(a) {
  const e = [];
  if (!Array.isArray(a?.proposals) || a.proposals.length !== 3) e.push("proposals (exactly 3)");
  (a?.proposals ?? []).forEach((p, i) => {
    if (!Number.isInteger(p?.findingIndex)) e.push(`proposals[${i}].findingIndex`);
    if (!["post", "reply", "thread"].includes(p?.type)) e.push(`proposals[${i}].type`);
    if (!isStr(p?.text, 600)) e.push(`proposals[${i}].text`);
    if (!isStr(p?.rationale, 600)) e.push(`proposals[${i}].rationale`);
  });
  return done(e);
}

export function validateContentPlan(a) {
  const e = [];
  if (!isStr(a?.summary, 800)) e.push("summary");
  if (!Array.isArray(a?.weekly) || a.weekly.length < 3 || a.weekly.length > 7) e.push("weekly (3–7 days)");
  (a?.weekly ?? []).forEach((d, i) => ["day", "format", "theme", "dataSource"].forEach((k) => { if (!isStr(d?.[k], 400)) e.push(`weekly[${i}].${k}`); }));
  if (!Array.isArray(a?.kpis)) e.push("kpis");
  if (!Array.isArray(a?.risks)) e.push("risks");
  return done(e);
}

/** A specific public X post: https://x.com/<handle>/status/<id> (twitter.com accepted). */
export const X_POST_URL = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/;

/**
 * Which findings are usable: at least one source is a specific X post URL. The Command Center records the links;
 * it does not fetch them (no X API access), so nothing here claims the posts say what the summary says.
 */
export function checkEvidence(research) {
  const findings = (research?.findings ?? []).map((f, i) => {
    const urls = (f.sources ?? []).map((s) => String(s.url ?? ""));
    const valid = urls.filter((u) => X_POST_URL.test(u));
    const invalid = urls.filter((u) => !X_POST_URL.test(u));
    return { index: i, topic: f.topic, linkedPosts: valid, rejectedLinks: invalid, verdict: valid.length ? "SOURCE-LINKED" : "UNSOURCED" };
  });
  return {
    findings, usable: findings.filter((f) => f.verdict === "SOURCE-LINKED").map((f) => f.index),
    method: "link format check only: each usable finding cites at least one specific X post. Links not fetched or confirmed.",
  };
}

/** Numbers a draft states (team names that contain digits — 49ers, 76ers — are names, not numbers). */
const numbersIn = (s) => String(s ?? "").replace(/\b(49ers|76ers)\b/gi, "").match(/\d+(?:\.\d+)?/g) ?? [];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EXTRA_FORBIDDEN = ["odds", "bet", "bets", "betting", "parlay", "lock", "guaranteed", "sure thing", "can't lose", "pick", "picks"];

/**
 * Every draft: refers to a usable finding; ≤ 280 characters; no links; none of the forbidden terms; every number in
 * it appears in the GameTimePicks facts or in that finding's own text. A reply must target one of that finding's
 * cited posts.
 */
export function checkProposals(proposals, { research, evidence, facts, forbidden = [] }) {
  const factNumbers = new Set(numbersIn(JSON.stringify(facts?.games ?? [])));
  const results = (proposals?.proposals ?? []).map((p, i) => {
    const problems = [];
    const usable = evidence?.usable?.includes(p.findingIndex);
    if (!usable) problems.push({ code: "FINDING_NOT_USABLE", detail: `findingIndex ${p.findingIndex} is not a source-linked finding` });
    const f = research?.findings?.[p.findingIndex];
    const findingNumbers = new Set(numbersIn(JSON.stringify(f ?? {})));
    for (const n of numbersIn(p.text)) if (!factNumbers.has(n) && !findingNumbers.has(n)) problems.push({ code: REASON.UNTRACEABLE_NUMBER, detail: `"${n}" is in neither GameTimePicks facts nor the cited finding` });
    for (const term of [...forbidden, ...EXTRA_FORBIDDEN]) {
      if (new RegExp(`\\b${escapeRe(term)}\\b`, "i").test(p.text)) problems.push({ code: REASON.FORBIDDEN_TERM, detail: `"${term}"` });
    }
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co)\b/i.test(p.text)) problems.push({ code: REASON.URL_IN_CAPTION, detail: "no links in post text" });
    if (p.text.length > 280) problems.push({ code: REASON.TOO_LONG, detail: `${p.text.length} > 280 characters` });
    if (p.type === "reply") {
      const linked = evidence?.findings?.[p.findingIndex]?.linkedPosts ?? [];
      if (!p.replyToUrl || !linked.includes(p.replyToUrl)) problems.push({ code: "REPLY_TARGET_NOT_CITED", detail: "a reply must target one of the finding's cited posts" });
    }
    return { index: i, ok: problems.length === 0, problems: dedupe(problems) };
  });
  return { results, method: "deterministic: wording, length, links, number provenance, reply target" };
}

const dedupe = (ps) => [...new Map(ps.map((p) => [`${p.code}|${p.detail}`, p])).values()];
