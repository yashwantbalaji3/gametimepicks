/**
 * THE TWO FOUNDER GATES, ANSWERABLE IN ONE SITTING — Program 231 · F.
 *
 * Two decisions have blocked activation across three programs, and neither is engineering: the NFL
 * paid-odds authorization expired by its own terms, and Moonshot is paused on an exact token. Both
 * have sat as a sentence in a report — "founder-gated" — which is a label, not a question somebody
 * can answer.
 *
 * These are the questions, with the evidence attached.
 *
 * DERIVED WHERE DERIVABLE. The credit figures come from the P171 ledger the calls themselves wrote;
 * Moonshot's record comes from the same state module the public page renders. A packet quoting a
 * hand-typed number would be asking the founder to authorise spend against a figure nobody checked —
 * which is precisely the shape of the mistake it exists to prevent. Anything not derivable is a
 * stated constant from the committed receipt, and says so.
 *
 * PREPARE, DO NOT EXECUTE. Nothing here issues a request, creates a schedule, or mutates a product.
 * The answer tokens are a CLOSED set so there is no free text to misparse, and no token is a
 * credential — they are decisions, and the never-share line is on the box for the one that touches
 * money.
 */
import fs from "node:fs";
import path from "node:path";

export const GATE_PACKETS_VERSION = 1;

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/*
 * A GATE THAT HAS BEEN ANSWERED IS NOT A GATE (P287).
 *
 * This packet hardcoded "Program 171's NFL odds authorization expired at program close" as its
 * question and "NFL publishes no priced product today" as its evidence. The founder answered it on
 * 2026-09-10 — docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md, NFL-only, team markets, 500-credit
 * ceiling — and the capture has been running against it since. So this box asked the founder to
 * decide something already decided, against a coverage claim the priced Week-1 slate contradicts.
 *
 * That is not a cosmetic staleness. A stale renewal prompt invites a SECOND authorization for spend
 * that is already authorized, which is the one mistake this whole packet exists to prevent. (It
 * misled a reader for real: it was quoted back to the founder in September as a live expiry.)
 *
 * So the packet now READS the live receipt rather than asserting its absence, and reports RESOLVED
 * with the terms actually granted. Fail-closed in the honest direction: an unreadable or
 * unrecognised receipt goes back to asking the question, because "we could not read it" must never
 * render as "you are authorized".
 */
const NFL_RECEIPTS = [
  // Newest first — the first readable one wins, exactly as the capture resolves it.
  "docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md",
  "docs/receipts/ODDS_AUTHORIZATION_P171.md",
];

/** The live NFL odds receipt's stated terms, or null when none can be read. */
function nflAuthorization(root) {
  for (const rel of NFL_RECEIPTS) {
    let text;
    try { text = fs.readFileSync(path.join(root, rel), "utf8"); } catch { continue; }
    // A receipt that says it lapsed is not the live one, whatever its filename.
    if (/\blapsed\b[^.]{0,80}\bclose\b/i.test(text) && !/## Operative terms/.test(text)) continue;
    const term = (label) => {
      const m = new RegExp(`^\\|\\s*${label}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, "im").exec(text);
      return m ? m[1].replace(/\*\*/g, "").trim() : null;
    };
    const ceiling = term("Cumulative ceiling");
    const markets = term("Markets");
    const scope = term("Scope");
    const expiry = term("Expiry");
    const granted = /founder,?\s*(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1] ?? null;
    // Every term must be present, or we do not know what was authorized.
    if (!ceiling || !markets || !scope || !expiry) continue;
    return { receipt: rel, ceiling, markets, scope, expiry, granted };
  }
  return null;
}

function nflOddsPacket(root) {
  const ledger = readJson(path.join(root, "data/internal/research/odds/nfl/p171-ledger.json"));
  const used = ledger?.cumulativeCredits ?? null;
  const opening = ledger?.openingBalance ?? null;
  const requests = ledger?.requests ?? [];
  const paid = requests.filter((r) => (r.creditsUsed ?? 0) > 0);
  const lastPaid = paid.length ? paid[paid.length - 1] : null;
  const auth = nflAuthorization(root);

  const ledgerEvidence = [
    used == null
      ? "No credit ledger is committed — the spend figure cannot be stated, so nothing should be signed against it."
      : `${used} credits spent across ${requests.length} recorded requests (${paid.length} of them paid).`,
    opening
      ? `Opening balance, provider-verified from response headers on ${opening.capturedAt}: ${opening.providerRequestsUsed} used, ${opening.providerRequestsRemaining} remaining on the account.`
      : "No provider-verified opening balance is recorded.",
    lastPaid ? `Last paid call: ${lastPaid.at} — ${lastPaid.purpose}.` : "No paid call is recorded under this authorization.",
  ];

  if (auth) {
    return {
      id: "gate-nfl-odds-renewal",
      title: "NFL paid odds — authorized",
      gate: "RESOLVED",
      question: `Answered${auth.granted ? ` on ${auth.granted}` : ""}. Nothing is being asked; these are the terms in force.`,
      evidence: [
        `Live receipt: ${auth.receipt}. Scope ${auth.scope}. Markets ${auth.markets}. Ceiling ${auth.ceiling}. Expiry: ${auth.expiry}.`,
        ...ledgerEvidence,
      ],
      scopeIfRenewed: null,
      rules: [
        "Bulk endpoints only where the provider charges per-market — a per-event loop costs ~20x for the same data.",
        "No blind retry on a quota-bearing endpoint; a typed transient failure only, bounded.",
        "Request/response metadata is redacted in every receipt; no provider key is ever logged or committed.",
        "Every call appends to the authorization ledger before the data is used.",
      ],
      dryRun: "npx tsx app/scripts/nfl/capture-nfl-odds.mjs --dry-run — prints the request plan and credit estimate, issues nothing.",
      answerTokens: [],
      forbiddenWithoutToken: "any market outside the receipt's stated scope, any call whose worst case would breach the stated ceiling, and any new cron — a schedule is still a separate decision.",
      neverShare: "These terms authorise SPEND. They are not a credential.",
    };
  }

  return {
    id: "gate-nfl-odds-renewal",
    title: "NFL paid odds — renew the authorization, or leave NFL on free data",
    gate: "FOUNDER",
    question: "No readable NFL odds authorization receipt is committed. Authorize a scope and ceiling, or decline?",
    evidence: [
      "No committed receipt states a scope, a ceiling and an expiry — so the capture refuses every call, and nothing here can say what is permitted.",
      ...ledgerEvidence,
      "NFL coverage without one: the offered window reports NOT_YET_CAPTURED with that reason, and no priced NFL product publishes.",
    ],
    scopeIfRenewed: {
      sport: "americanfootball_nfl only — every other sport key out of scope",
      markets: "team ML/spread/total, supported pass/rush/receive props, anytime-TD",
      ceiling: "names a cumulative credit ceiling and an expiry (date OR ceiling, whichever first)",
      cadence: "no cron is created by this answer; a schedule is a separate decision",
    },
    rules: [
      "Bulk endpoints only where the provider charges per-market — a per-event loop costs ~20x for the same data.",
      "No blind retry on a quota-bearing endpoint; a typed transient failure only, bounded.",
      "Request/response metadata is redacted in every receipt; no provider key is ever logged or committed.",
      "Every call appends to the authorization ledger before the data is used.",
    ],
    dryRun: "npx tsx app/scripts/nfl/capture-nfl-odds.mjs --dry-run — prints the request plan and credit estimate, issues nothing.",
    /*
     * PARAMETERISED, so the authorisation carries its own limits.
     *
     * The first draft offered three fixed tokens — renew-as-scoped, renew-narrowed, decline — which
     * meant the ceiling and expiry would have been inferred from a receipt rather than stated by the
     * person authorising the spend. An authorisation whose limits someone else filled in is not a
     * limit. The answer now names the scope, the ceiling and the expiry itself.
     */
    answerTokens: [
      { token: "AUTHORIZE:NFL:<market-scope>:<credit-ceiling>:<expiry>", does: "renews with the scope, cumulative ceiling and expiry YOU state — e.g. AUTHORIZE:NFL:team-markets:500:2026-10-01" },
      { token: "DEFER", does: "NFL stays on free data; the offered window keeps reporting NOT_YET_CAPTURED with that reason" },
    ],
    forbiddenWithoutToken: "any paid call, and any new cron",
    neverShare: "This decision authorises SPEND. It is not a credential and must not be answered by anyone who is not the account owner.",
  };
}

/**
 * The Moonshot packet.
 *
 * Its record and failure mode are read from the same module the public page renders, so the founder
 * and the visitor are looking at one set of numbers.
 */
function moonshotPacket(state) {
  const rec = state?.displayRecord ?? null;
  return {
    id: "gate-moonshot-disposition",
    title: "Moonshot — repair, formally pause, or retire",
    gate: "FOUNDER",
    question: "Moonshot publishes cards no settler can reach. Build the missing pieces, pause it formally, or retire it?",
    evidence: [
      rec ? `Record of reference: ${rec.wins}-${rec.losses} from ${rec.source}.` : "No settled record is available.",
      state?.contradictions?.length
        ? `${state.contradictions.length} recorded contradiction(s) between its own artifacts, listed verbatim on /moonshot.`
        : "No contradictions are currently recorded.",
      state?.lastPublishedDate
        ? `Last published ${state.lastPublishedDate}${state.daysSincePublished != null ? ` — ${state.daysSincePublished} days ago` : ""}; ${state.openCardCount ?? 0} open card(s), ${state.unsettleableCardCount ?? 0} of them unsettleable.`
        : "No publication date is recorded.",
      "Failure mode: publishing needs multi-lane exposure accounting in the paper ledger; settling needs its cards registered as product cards with game identity on every leg.",
    ],
    consequences: {
      repair: "the two missing pieces are built; the product resumes with a settleable record",
      pause: "the state becomes formal, the public page keeps saying so, and the open cards stay visible and ungraded",
      retire: "the route is withdrawn; the ledger bytes are preserved and remain reachable from the archive",
    },
    preserved: "In every branch the historical ledger is preserved byte-for-byte. No answer rewrites the record.",
    rollback: "Pause and retire are reversible by the same token; repair is a normal release with its own rollback parent.",
    dryRun: "npx tsx app/scripts/products/build-daily-product-receipts.mjs --dry-run — derives Moonshot's day and writes nothing.",
    answerTokens: [
      { token: "MOONSHOT_REPAIR_PAUSE_OR_RETIRE:REPAIR", does: "authorises building exposure accounting + card registration" },
      { token: "MOONSHOT_REPAIR_PAUSE_OR_RETIRE:PAUSE", does: "formalises the pause; no code path activates" },
      { token: "MOONSHOT_REPAIR_PAUSE_OR_RETIRE:RETIRE", does: "withdraws the route; the ledger is archived intact" },
    ],
    forbiddenWithoutToken: "activation, retirement, mutation of the pause state, or any rewrite of its history",
    neverShare: null,
  };
}

/**
 * The protected console's delivery packet.
 *
 * Not a decision about what to build — the console is built, protected and verified. It is a
 * decision about whether to RUN the committed redeploy runbook, and it exists because the answer had
 * quietly been "no" for twenty days while every report said K1 was closed.
 */
function consoleDeliveryPacket(deployment) {
  return {
    id: "gate-console-redeploy",
    title: "Protected console — run the committed redeploy, or leave it on the 2026-08-12 build",
    gate: "EXTERNAL",
    question: "The protected console is live and SSO-protected, and its deployment predates four programs of console work. Redeploy it now?",
    evidence: [
      deployment?.detail
        ? `Delivery verifier: ${deployment.state} — ${deployment.detail}.`
        : "Delivery verifier could not read the deployment age from this checkout.",
      "The security boundary is intact and was re-verified: unauthenticated /launch returns 302 to Vercel SSO with zero content bytes, deny responses carry no-store, and public /launch and /ops still 404.",
      "What is NOT on the deployed build: the derived incident register, both founder decision packets, and every evidence panel added since Program 210.",
      "The runbook is committed at docs/ADMIN_DEPLOYMENT_GTP_OPS.md and needs no new credentials — the project link already exists in this checkout.",
    ],
    rules: [
      "NEVER re-add a production domain (auto-assigned or custom) to the ops project while the plan lacks production-domain authentication — the ADR records a ~4-minute unauthenticated window created exactly that way, and domain attachment is the only path that reopens it.",
      "Deployment URLs and the team-scoped generated URL inherit Standard Protection; redeploys do not change that.",
      "The private host is never committed to this repository, and no verifier prints it.",
    ],
    dryRun: "node app/scripts/ops/verify-console-delivery.mjs — reports application-ready, host-configured and content-current separately, deploys nothing.",
    answerTokens: [
      { token: "CONSOLE_REDEPLOY:RUN", does: "run the committed runbook now (vercel pull → build --prod → deploy --prebuilt --prod), then re-run verify-admin-access" },
      { token: "CONSOLE_REDEPLOY:DEFER", does: "the console keeps serving the 2026-08-12 build; the delivery verifier keeps reporting it STALE" },
    ],
    forbiddenWithoutToken: "any deploy to the protected project, and any change to its domain or protection settings",
    neverShare: null,
  };
}

/**
 * @param {{ appDir: string, moonshotState?: any, deployment?: any }} o
 */
export function buildGatePackets({ appDir, moonshotState = null, deployment = null }) {
  const root = path.join(appDir, "..");
  const packets = [consoleDeliveryPacket(deployment), nflOddsPacket(root), moonshotPacket(moonshotState)];
  /* P287: `open` was packets.length, which was true only while every packet was permanently open.
     A resolved gate counted as something still owed — the same flattery in reverse: a founder
     reading "3 decisions waiting" makes time for three, and one of them is already made. */
  const open = packets.filter((p) => p.gate !== "RESOLVED");
  return {
    version: GATE_PACKETS_VERSION,
    packets,
    counts: { open: open.length, resolved: packets.length - open.length, total: packets.length },
  };
}
