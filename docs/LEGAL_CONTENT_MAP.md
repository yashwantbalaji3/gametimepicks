# Legal / privacy — counsel-ready issue list and content map

**Status: NOT STARTED. No legal route exists in the public export, and this document publishes none.**
**Nothing here is legal advice.** It separates what the repository can state as fact from what is a
business decision for the founder and what requires a qualified adviser.

Program 138 · prepared 2026-08-05 · gate `business-legal` = FAIL (founder-owned)

---

## 1. Why this gate is genuinely blocking

The product publishes a **paper-only, educational** record of simulated betting positions with no
real money. That framing is a large part of the legal answer — and it is currently asserted only in
body copy on individual pages. There is no Terms page, no privacy policy, no stated operator, no
jurisdiction, and no age position. For internal alpha (operator is the only user) that is tolerable.
For any beta with real users it is not, because at that point the site is making representations to
third parties about accuracy, availability, and data handling with nothing behind them.

## 2. Repository FACTS a lawyer can rely on

These are verifiable from the codebase, not claims to be checked:

| Fact | Evidence |
|---|---|
| No real-money wagering, deposits, withdrawals, or account balances exist | no payment integration anywhere in the repo; bankroll is a paper figure in committed JSON |
| No user accounts, logins, passwords, or profiles exist | static export; no auth of any kind |
| No cookies are set, and none are used for analytics | analytics contract is cookieless by design (§3 of `ANALYTICS_ACTIVATION_DECISION.md`) |
| No PII is collected today; analytics is OFF in production | `ANALYTICS_APPROVED_ENDPOINT_PENDING.md`; observer reports `analytics OFF` |
| If activated, analytics collects closed-enum events at **day** granularity with no IP, user-agent, referrer, cookie, or session id | `api/_collect-core.mjs` + `event-contract.ts`, guard-tested |
| Settlement is from official sources only; the published record is 19–14 | protected artifacts, settlement lineage gate |
| The site states it is educational and not betting advice | disclaimer banner on every route |
| Hosting is Vercel; the domain is `gametimepicks.yashwantbalaji.com` | deployment config |

## 3. FOUNDER business decisions (not legal questions — nobody else can answer these)

1. **Operating entity.** A named legal person or company must stand behind the Terms. Sole trader
   under the founder's own name, or an incorporated company? This determines whose name appears.
2. **Jurisdiction.** Which country's law governs, and where are disputes heard? Follow the entity.
3. **Target geography.** Who is the site *for*? This drives everything below — a US audience raises
   state-level gambling-adjacent questions that a UK-only audience does not.
4. **Age position.** 18+, 21+, or no restriction? The product takes no bets, but it publishes betting
   analysis, and most jurisdictions treat promotion of gambling to minors seriously.
5. **Audience claim.** Is this "research and education" (current framing) or "picks you can follow"?
   The current copy is firmly the former and the record supports it — the model demonstrably does not
   beat the market (Sprint 056/057). Keep it.

## 4. QUESTIONS THAT REQUIRE A QUALIFIED ADVISER

Do not answer these from the repository. Each is jurisdiction-specific:

- Does publishing paper betting analysis constitute regulated gambling advertising or affiliate
  activity in the target geography, given no bets are taken and no operator is linked?
- Is an age gate legally required, and if so what form satisfies it?
- What responsible-gambling signposting is mandatory versus advisable?
- What disclaimer language limits liability for a published record that users might act on?
- What privacy notice is required for cookieless, day-granularity, PII-free event counts — and does
  it require consent under the target regime, or is it out of scope as non-personal data?
- Are there advertising-standards implications in publishing a win/loss record at all?

## 5. Content map — routes, only after approved text exists

Nothing below is built. Each entry names where the approved text would go and what evidence closes it.

| Route | Purpose | Source of text | Links from |
|---|---|---|---|
| `/terms` | Terms of use, liability, no-advice, accuracy/availability | counsel-approved, founder-signed | footer |
| `/privacy` | What is/isn't collected, analytics posture, retention, contact | counsel-approved; §2 facts are the input | footer |
| *(existing)* `/responsible-use` | already live; may need counsel review of wording | founder + counsel | footer |

Retention posture to confirm with counsel once analytics is live: day-bucketed counts with no
identifiers arguably fall outside personal-data retention rules, but the answer must come from the
adviser, not from this file.

## 6. Acceptance evidence for moving the gate off FAIL

The gate moves only on **all** of:

1. Final text supplied by the founder (counsel-reviewed), with **approver name, date, and version**.
2. Routes deployed to production and reachable from the footer on mobile and desktop.
3. Accessibility gate green on the new routes (they join the launch-critical matrix).
4. A recorded change-control owner for future edits.

Until then the gate stays **FAIL** and the honest statement is: *GameTimePicks has no published terms
or privacy policy.*

## 7. FOUNDER ACTION

|  |  |
|---|---|
| **Owner** | Founder (+ adviser) |
| **Blocks** | private beta with real users; any public launch |
| **Founder time** | ~30 min for §3; adviser lead time is the real cost |
| **Cost** | £0 for §3; adviser fees vary |

**Recommended:** answer §3 now (it is free and unblocks drafting), and treat §4 as a single
consultation. Do **not** publish templated terms found online — a generic gambling ToS would assert
things about this product that are not true, which is worse than having none.

**Sequencing note:** this has the longest lead time of the four gates, so §3 should be answered first
even though support and analytics will finish sooner.
