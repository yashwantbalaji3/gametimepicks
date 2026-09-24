# P2 · Sportsbook lines and odds for NFL player props — the end-to-end audit, and the founder gate

**Date:** 2026-09-24 · **Status:** BLOCKED at a true founder gate. **No probe was run, no credit was
spent, no provider or plan was changed, and no price was invented.** Everything below is read out of
the repository's own receipts and committed artifacts.

## 1 · The five public families, as they stand today

`app/public/data/nfl/model-status.json` and `weekly-boards/latest.json`, live Week 4:

| family | model state | rows published | market state on every row |
|---|---|---|---|
| Anytime TD | `ROLE_UNCERTAIN` (held) | 5 | `NOT_AUTHORIZED` |
| Receptions | **PUBLISHED** | 10 | `NOT_AUTHORIZED` |
| Rushing yards | **PUBLISHED** | 10 | `NOT_AUTHORIZED` |
| Receiving yards | **PUBLISHED** | 10 | `NOT_AUTHORIZED` |
| Passing yards | `ESTIMATE_BELOW_BAR` | 10 | `NOT_AUTHORIZED` |

45 of 45 rows carry `pricingState: NOT_AUTHORIZED`. **Not one NFL player-prop price exists anywhere
in the repository.**

## 2 · Why — and it is not the provider

`app/public/data/nfl/markets/latest.json` (captured 2026-09-23T23:26:45Z, 31 events, up to 11 books)
carries full game-level `h2h` / `spreads` / `totals` for every event, and:

```json
"propMarkets": { "state": "NOT_PROBED", "offeredMarkets": [], "absentMarkets": [] }
```

**`NOT_PROBED` means we have never asked.** It is not evidence that The Odds API does not serve NFL
player props, and it must never be reported as if it were. ⚠ "We looked and found nothing" ≠ "we did
not look" — the repo already learned this once and typed the states apart for exactly this reason.

The reason we have never asked is a scope decision, recorded in
`docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md` (founder, 2026-09-10):

| term | value |
|---|---|
| Scope | NFL only (`americanfootball_nfl`) |
| **Markets** | **`h2h`, `spreads`, `totals` only — props and every other market OUT OF SCOPE** |
| Endpoint | the BULK `/v4/sports/{key}/odds` route only |
| Regions | `us` (a call costs regions × markets) |
| Cumulative ceiling | **500 credits** for the 2026 regular season |
| Spent to date | **138** (`data/internal/research/odds/nfl/p171-ledger.json`) — **362 remaining** |
| Expiry | the ceiling |

**The authorization is LIVE. It simply does not cover props.** (⚠ `ODDS_AUTHORIZATION_P171.md` IS
expired and is a different document — do not read it and conclude there is no authorization.)

## 3 · ⚠ THE STATED REASON FOR EXCLUDING PROPS IS NOW PARTLY FALSE

The receipt explains Option A was chosen over Option B because:

> Player props (Option B) stay out of scope: **every NFL player family is rejected or held today**, so
> those credits would fund nothing publishable.

That was true on 2026-09-10. It is not true now. **Three families are PUBLISHED** — receptions,
rushing yards, receiving yards — and ship on the public weekly boards every week. And the held
family's own next-gate, in `model-status.json`, reads:

> `anytimeTd.nextGate`: "**An offered anytime-touchdown market** plus current role evidence."

So ATD is gated *on a market we have chosen not to request*, and three other families publish a model
number every week with a permanently empty comparison beside it. The premise that justified the
exclusion has changed; the exclusion has not been revisited.

## 4 · What is knowable WITHOUT spending a credit, and what is not

**Known from the repository:** the provider is The Odds API on a paid plan; the bulk odds route is the
only authorized endpoint; one bulk call costs `regions × markets` credits (a 3-credit `us` call for
three team markets is the observed unit); book-specific prices arrive per event for up to 11 books;
consensus is derived locally by `src/lib/sports/odds/consensus.mjs`; canonical event identity is
already solved (`canonicalEventId: nfl-<espnId>` joins the capture to the boards); capture instants
are already frozen and retained; a re-derivation path over committed captures exists and costs zero
credits.

**NOT known, and not guessable:** whether this plan returns NFL player props at all; which prop
market keys it serves; whether they are per-event-only (the expensive shape) or available on the bulk
route; the per-player identity shape the provider returns and how it joins to `nfl-athlete-<espnId>`;
historical/frozen snapshot availability for props; and the real per-slate credit cost. ⚠ The repo has
been bitten before by a per-event route costing ~20× the bulk route, and by a second market silently
doubling a call's worst-case cost — **never hardcode a credit estimate from a market count.**

Finding any of that out requires a call, and a call is outside the authorized scope. **That is the
gate.**

## 5 · Founder decision matrix

| | A · Do nothing | B · Authorize a CAPABILITY PROBE only | C · Authorize props for the published families | D · Authorize props for all five |
|---|---|---|---|---|
| What it buys | nothing changes | a factual answer to §4, from the provider | a real line + odds beside receptions / rush yds / rec yds | C, plus the market ATD's own gate names |
| Credits | 0 | a bounded handful — one or two calls, ceiling stated in advance | unknown until B answers | unknown until B answers |
| Ceiling impact | — | negligible against 362 remaining | must be re-scoped with a number B produces | as C |
| Risk | the three PUBLISHED families keep shipping a model number with no comparison, indefinitely | none beyond the stated credit cap; nothing is published from a probe | normal capture risk; identity join is the main unknown | as C |
| Unblocks ATD? | no | no (answers whether it CAN be) | no | possibly — its gate is an *offered* market |
| What I would need | — | a ceiling, and permission to call ONE non-authorized market key | a re-scoped receipt naming the market keys and a new ceiling | as C |

**Recommendation: B.** It is the only option that converts `NOT_PROBED` into a fact, it is bounded and
cheap, it publishes nothing, and it makes C/D a decision with numbers instead of a guess. A probe
answers whether §4's unknowns are even answerable before anyone commits to a capture path.

⚠ Whatever is chosen, it is a **new authorization**, not an interpretation of the existing one. The
2026-09-10 receipt says props are out of scope; that sentence cannot be reasoned around because the
premise beneath it aged.

## 6 · The capture path, if props are ever authorized

Design only — not implemented, and not to be implemented before a receipt exists:

```
provider response
  → canonical event identity   (canonicalEventId: nfl-<espnId>, already proven on the team capture)
  → canonical player identity  (nfl-athlete-<espnId>; NO name-only join, ever)
  → normalized frozen snapshot (line, over/under prices, book OR consensus — never mixed, capturedAt)
  → PredictionPresentation.market.state = FROZEN_CAPTURE
  → immutable archive for later Results comparison
```

Non-negotiable, and already enforced by `lib/prediction-presentation/contract.ts`: no default −110;
no stale odds shown as current; no current line substituted for a missing historical one; book vs
consensus explicit; `capturedAt` required for a price to exist at all; the market never becomes model
truth. **A family with no capture keeps its typed absence and says so in words.**

## 7 · What shipped in the meantime

PR #656 fixed the presentation half, which needed no provider change: the MARKET slot now reads
"Market unavailable" with one honest board note instead of "No price" on forty-five rows, and the
slot is ready to carry `line / over-under prices / book / capturedAt` the day a capture exists. The
UI contract for §6 is in place and guarded on the built export.
