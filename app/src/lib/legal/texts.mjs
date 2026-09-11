/**
 * TERMS OF USE and PRIVACY NOTICE — the one source both the pages and the counsel drafts render from.
 *
 * DRAFTS FOR REVIEW · NOT LEGAL ADVICE. Nothing here publishes on its own: a page is public only when
 * legalReadiness() says so, which needs (a) the content manifest's approval receipt naming a real
 * reviewer, (b) a reviewed content hash equal to the text as it stands, and (c) no unresolved or
 * placeholder parameter left in it. Edit a sentence after approval and the page locks again until it
 * is re-reviewed — approving "whatever is there now" is not approval.
 *
 * WRITTEN FROM FACTS, NOT TEMPLATES. Every statement about data below is one the repository can prove,
 * and the guards beside this file fail if the code stops matching it: no cookies anywhere in src; the
 * only browser-storage uses are the four named in the privacy notice; the only third-party hosts the
 * built pages load images from are the three it names. A generic betting-site policy would assert
 * things about this product that are not true, which is worse than having none.
 */
import crypto from "node:crypto";
import { LEGAL_CONTENT_MANIFEST, canPublishLegal } from "./content-manifest.mjs";

/**
 * The founder's section-3 decisions (docs/LEGAL_SECTION3_DECISION_PACKET.md, answered 2026-09-10).
 * `value: null` means not yet decided; `placeholder: true` means decided only as a stand-in. Either
 * one blocks publication.
 */
export const LEGAL_PARAMETERS = Object.freeze({
  operator: Object.freeze({ value: "GameTime Picks", placeholder: true, source: "founder, 2026-09-10: 'Please use GameTime Picks as a placeholder.' — the legal entity is not yet chosen" }),
  state: Object.freeze({ value: null, source: "founder, 2026-09-10: based in a US state — which state was not given" }),
  audience: Object.freeze({ value: "the United States", source: "founder, 2026-09-10: US only" }),
  minimumAge: Object.freeze({ value: "18", source: "founder, 2026-09-10: 18+. Counsel question 7 — most US states set the sports-betting age at 21" }),
  framing: Object.freeze({ value: "research and education", source: "packet decision 5 — unchanged; every public page already enforces it" }),
  contact: Object.freeze({ value: null, source: "the support destination — blocker-support" }),
  analyticsRetentionDays: Object.freeze({ value: "90", source: "collector spec recommendation (90-day rolling); confirmed when analytics is switched on" }),
  effectiveDate: Object.freeze({ value: null, source: "set when counsel approves the text" }),
  site: Object.freeze({ value: "gametimepicks.yashwantbalaji.com", source: "deployment config" }),
});

const TERMS = {
  title: "Terms of Use",
  sections: [
    { heading: "About these terms", paragraphs: [
      "These terms govern your use of {{site}} (the \"Site\"), operated by {{operator}} (\"we\" or \"us\"). By using the Site you agree to them. If you do not agree, please do not use the Site.",
    ] },
    { heading: "Who the Site is for", paragraphs: [
      "The Site is intended for adults aged {{minimumAge}} or older located in {{audience}}. It is not directed to anyone younger than {{minimumAge}}. You are responsible for knowing and following the laws that apply where you are.",
    ] },
    { heading: "What the Site is, and what it is not", paragraphs: [
      "The Site publishes sports analysis for {{framing}}: simulations, model estimates, market context, and paper-only records of hypothetical positions. No real money is involved.",
      "The Site does not accept wagers, hold funds, operate user accounts, or link to or partner with any sportsbook. Nothing on the Site is betting, financial, or investment advice, or a recommendation to place any wager.",
    ] },
    { heading: "Paper records and estimates", paragraphs: [
      "Records such as Bank Builder, Moonshot, and the published win–loss history track hypothetical paper positions settled against official results. They are not the results of real wagers and do not show that any approach is profitable.",
      "Model estimates and simulations are uncertain and can be wrong. Past results do not predict future results.",
    ] },
    { heading: "Information from other sources", paragraphs: [
      "Schedules, scores, odds, injury designations, images, and other data come from third-party sources and may be delayed, incomplete, or wrong. Odds change constantly, and the figures on the Site reflect the moment they were captured. We do not guarantee that any content is accurate, complete, or current.",
    ] },
    { heading: "Names, logos, and images", paragraphs: [
      "Team and league names, logos, and player images belong to their owners and appear only to identify the teams and players discussed. The Site is independent and is not affiliated with, endorsed by, or sponsored by any league, team, player, or sportsbook.",
    ] },
    { heading: "Acceptable use", paragraphs: [
      "Please do not use the Site in a way that breaks the law, disrupts or overloads it, attempts to gain unauthorized access to it, or presents its content as your own work. You are welcome to share links and short excerpts with attribution.",
    ] },
    { heading: "Our content", paragraphs: [
      "Apart from the third-party material described above, the Site's text, graphics, and software belong to {{operator}} and may not be copied or republished beyond the sharing permitted above without permission.",
    ] },
    { heading: "No warranties", paragraphs: [
      "The Site is provided \"as is\" and \"as available,\" without warranties of any kind, express or implied — including accuracy, fitness for a particular purpose, and non-infringement — to the fullest extent the law allows.",
    ] },
    { heading: "Limitation of liability", paragraphs: [
      "To the fullest extent the law allows, {{operator}} is not liable for any loss or damage arising from your use of, or reliance on, the Site, including any wager you choose to place anywhere. Where liability cannot be excluded, it is limited to the greatest extent the law permits.",
    ] },
    { heading: "Changes", paragraphs: [
      "We may change the Site or these terms at any time. The effective date below shows when these terms last changed; continuing to use the Site after a change means you accept the updated terms.",
    ] },
    { heading: "Governing law", paragraphs: [
      "These terms are governed by the laws of the State of {{state}}, United States, without regard to its conflict-of-law rules.",
    ] },
    { heading: "Contact", paragraphs: ["Questions about these terms: {{contact}}."] },
    { heading: "Effective date", paragraphs: ["{{effectiveDate}}"] },
  ],
};

const PRIVACY = {
  title: "Privacy Notice",
  sections: [
    { heading: "In short", paragraphs: [
      "The Site has no user accounts, sets no cookies, shows no ads, and does not sell or share personal information.",
    ] },
    { heading: "What we collect today", paragraphs: [
      "Visitor analytics are switched off. The Site does not ask for or collect your name, email address, or any other personal information.",
    ] },
    { heading: "If analytics is switched on", paragraphs: [
      "We may turn on first-party, cookieless counting of a fixed list of interactions — for example, opening a game report or viewing the results page. Each event records only the type of interaction, the calendar day, and short fixed labels such as the area of the Site or the sport.",
      "It does not record your IP address, device or browser identifiers, the page you came from, the precise time, or any cookie or session identifier, and it cannot be linked back to you. Event counts are kept for {{analyticsRetentionDays}} days. This notice will carry a new effective date before analytics is switched on.",
    ] },
    { heading: "What is stored on your device", paragraphs: [
      "To remember your reading preferences, the teams you follow, and the picks in your slip, the Site saves small settings in your browser's local storage. One session value records how you arrived, such as from a shared link.",
      "These stay on your device, and you can clear them at any time in your browser's site-data settings. When analytics is on, the arrival value is sent as one of the fixed labels described above.",
    ] },
    { heading: "Services your browser contacts", paragraphs: [
      "The Site is hosted by Vercel, which receives standard request information — such as your IP address and browser type — to deliver pages, and may keep it in its logs under its own privacy policy.",
      "Team logos and player photos load from image servers run by Major League Baseball (mlbstatic.com), ESPN (espncdn.com), and the NBA (nba.com), and your browser sends them the same standard request information. Links to other websites are governed by those websites' own policies.",
    ] },
    { heading: "Email", paragraphs: [
      "The Site does not currently collect email addresses. If a newsletter or support form is added, this notice will be updated before any collection begins.",
    ] },
    { heading: "Children", paragraphs: [
      "The Site is not directed to anyone under {{minimumAge}}, and we do not knowingly collect information from them.",
    ] },
    { heading: "Your choices and rights", paragraphs: [
      "Because the Site does not collect personal information, there is generally nothing held about you to access, correct, or delete. If you believe we hold information about you, contact us and we will respond as the law that applies to you requires.",
    ] },
    { heading: "Changes", paragraphs: [
      "If this notice changes, the effective date below changes with it.",
    ] },
    { heading: "Contact", paragraphs: ["Questions about privacy: {{contact}}."] },
    { heading: "Effective date", paragraphs: ["{{effectiveDate}}"] },
  ],
};

export const LEGAL_DOCUMENTS = Object.freeze({ terms: TERMS, privacy: PRIVACY });

/** The routes each document publishes at. */
export const LEGAL_ROUTES = Object.freeze({ terms: "/terms", privacy: "/privacy" });

const TOKEN = /\{\{(\w+)\}\}/g;

/**
 * Fill the document's parameters. Unresolved ones render as a visible bracketed marker — the review
 * build must show the gap, never paper over it — and are listed so the gate can refuse.
 */
export function renderLegal(id, params = LEGAL_PARAMETERS) {
  const doc = LEGAL_DOCUMENTS[id];
  if (!doc) throw new Error(`renderLegal: unknown legal document ${id}`);
  const unresolved = new Set();
  const placeholders = new Set();
  const fill = (s) => s.replace(TOKEN, (_, key) => {
    const p = params[key];
    if (!p) throw new Error(`renderLegal: ${id} names an unknown parameter {{${key}}}`);
    if (p.value == null || p.value === "") { unresolved.add(key); return `[to be decided: ${key}]`; }
    if (p.placeholder) placeholders.add(key);
    return p.value;
  });
  const sections = doc.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs.map(fill) }));
  const text = [doc.title, ...sections.flatMap((s) => [s.heading, ...s.paragraphs])].join("\n");
  return { id, title: doc.title, sections, text, unresolved: [...unresolved], placeholders: [...placeholders] };
}

/** The hash a reviewer approves: the exact text as rendered, parameters included. */
export function legalContentHash(id, params = LEGAL_PARAMETERS) {
  return crypto.createHash("sha256").update(renderLegal(id, params).text).digest("hex");
}

/**
 * Can this document publish? Total and fail-closed: the manifest's approval, the reviewed hash
 * matching the text as it stands, and no unresolved or placeholder parameter.
 */
export function legalReadiness(id, { manifest = LEGAL_CONTENT_MANIFEST, params = LEGAL_PARAMETERS } = {}) {
  const r = renderLegal(id, params);
  const reasons = [...canPublishLegal(manifest, id).reasons];
  if (r.unresolved.length) reasons.push(`undecided parameters: ${r.unresolved.join(", ")}`);
  if (r.placeholders.length) reasons.push(`placeholder parameters: ${r.placeholders.join(", ")} — a stand-in cannot be a party to the terms`);
  const approved = manifest?.sections?.[id]?.approval?.contentHash;
  if (approved && approved !== legalContentHash(id, params)) reasons.push("the text changed after it was reviewed — re-review before it publishes");
  return { publishable: reasons.length === 0, reasons, unresolved: r.unresolved, placeholders: r.placeholders };
}

/** True when the document may appear on the public site. */
export const legalRouteIsPublic = (id) => legalReadiness(id).publishable;
