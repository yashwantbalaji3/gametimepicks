# X publishing evaluation (OPEN — no provider selected)

**Status:** research open. In Phase 1 the publisher is `mock` only. No account, API app or subscription has been
created or paid for. **The founder chooses at CP2, after the friend-interview evidence below.**

## Decision rule

Choose the cheapest mechanism that is **(a)** an OAuth API app or a documented connector, **(b)** shown with
receipts to publish unattended, and **(c)** shown with billing evidence. "Free" counts only with that evidence.

Not eligible under any circumstances:

- browser or computer-use automation of x.com (X's automation rules prohibit non-API website scripting);
- session tokens or cookies;
- undocumented endpoints.

## Facts checked 2026-10-27

| Source | Fact | Label |
|---|---|---|
| docs.x.com pricing | Post create $0.015; with URL $0.200; post read $0.005/resource; no free tier; prepaid credits; per-cycle spend cap; $20 credit after first card + purchase; first auto-recharge matched up to $50 | VERIFIED-DOC |
| x.ai "Grok Bot and X" + docs.x.ai tag-on-x | The X plugin searches posts, reads timelines, mentions, trends and bookmarks. **No posting capability is documented.** `@bot` posts only a receipt reply. Paid Grok Bot users get starter X API credits | VERIFIED-DOC |
| docs.x.ai overview | Bots have a cloud browser and terminal ("computer use for everything else") | VERIFIED-DOC: this is the likely "free posting" path, and it is the prohibited one |
| Blotato, OpenTweet (2026-08/09) | The native connector cannot post. Posting goes through third-party publishing MCPs (Blotato about $29/month, Postiz, Composio, OpenTweet) that hold write-scoped X credentials | 3RD-PARTY |
| help.x.com automation rules | Non-API automation is prohibited; spam and trending-topic automation are prohibited; API bots carry the "Automated" label | Search summary (direct fetch 403) |

## Candidates (none selected)

| Candidate | Incremental cost | Unattended? | Evidence still needed |
|---|---|---|---|
| `x-api` (official, pay-per-use) | about $1.35/month at 90 posts without URLs; $18 with URLs | Yes, with OAuth user context | Media upload price (not listed); console spend cap works; receipt |
| `scheduler:<vendor>` (Blotato / Postiz / Buffer…) | Subscription, or self-hosted with your own API app | Varies by tier | Vendor's X write scope, terms, how X API cost is covered |
| `grok-connector` | Starter credits only | **Not documented** | A documented write scope from xAI |
| `manual-handoff` | $0 | No (about 30 s per post) | — |

## Friend-interview questions (spec §9, plus these)

1. Grok Bot, the Grok API, a custom agent, or Grok inside X?
2. Claude Code session, Claude API/SDK worker, or another platform?
3. Does it publish automatically, or prepare a draft that you send?
4. X OAuth API app, scheduler, third-party connector, or **browser / computer-use automation**?
5. Images or video, or text only? Any restrictions on posts with URLs?
6. Which paid plans, credits, promotions or prepaid balances are involved?
7. Several unattended posts with receipts? Show the service name, permissions, and the **Developer Console
   Usage/Billing page** (never tokens).
8. The "via <app>" label under a post, or the list at X › Settings › Security › Connected apps.
9. Compliant with X's automation rules? Any locks, re-authorisation or broken sessions, and over how many weeks?
10. Could the same setup serve a dedicated GameTimePicks account?

## Evidence log

| Date | Evidence | From | Verdict |
|---|---|---|---|
| — | (awaiting the interview) | | |

**Selected provider:** _none_ (CP2).
