# Live Odds & Line Movement — Decision Package (Phase H)

**Date:** 2026-09-26 · **corrected 2026-09-26**
**Scope:** NFL. Every other sport key is out of scope of the authorization this rests on.
**Status:** decided — see [`AMENDMENT 3`](receipts/ODDS_AUTHORIZATION_NFL_2026.md). No live-odds call
has been made yet.

---

## ⚠ CORRECTION — this package originally cited the wrong receipt

The version the founder decided on read **`ODDS_AUTHORIZATION_P171.md`** and reported a 3,000-credit
ceiling with **2,606 remaining**. P171 was superseded on 2026-09-10 by
`ODDS_AUTHORIZATION_NFL_2026.md`, which says so in its own header — and P171's expiry is
program-scoped and lapsed, so it does not even parse. I read a document that governs nothing.

The operative position, and the two things the original missed:

| | credits |
|---|---|
| Effective cumulative ceiling (`NFL_2026`, amendment 2) | **1,160** |
| Spent (shared NFL ledger) | **394** |
| **Remaining** | **766** — not 2,606 |
| **Already committed each week** by the configured prop-sweep cadence | **333** |

So the season has roughly **two weeks** of runway inside the allowance, and Phase H's 93 credits is
about **28% of one week's burn** rather than 3.5% of a large reserve. The recommendation below does
not change — game-level live odds remain cheap and player props remain unaffordable — but the
headroom is smaller than stated and the thing it trades against is the rest of the season's pregame
cadence.

Two lessons worth keeping: a superseded receipt does not announce itself at the point of use, and
**one shared ledger serves two allowances**, so `cumulativeCredits` alone never told anyone which
ceiling was binding.

---

## 0. The question, and the two answers it needs

Phase H asks whether GameTimePicks can show a **current sportsbook line beside the frozen pregame
one**, so a reader can see that a line moved and by how much. That needs two separate yeses:

1. **CAN the provider serve it, at a useful cadence, at an acceptable credit cost?** — an engineering
   question, answered below **entirely from evidence already in this repository**. No probe was run.
2. **MAY we spend on it?** — a founder question. The answer today is **no**, and not because of cost.

This package was produced without making a single paid call.

---

## 1. Capability — YES, and we have already observed it

The Odds API keeps serving an event **after it has started**, with an in-play line.

We did not have to test for this. It is in the repository as a defect we already fixed:

> the 2026-09-10 capture carried Rays @ Braves with a **2.5 total at 17:43Z**, first pitch **16:15Z**

A 2.5 total is not a pregame MLB number — fourteen genuine pregame totals in the same capture ran 7
to 9.5. The feed even labelled it: `commenceTime` was 16:16:28Z, before the capture instant.

That capture is why [`app/src/lib/mlb/team-market-capture.mjs`](../app/src/lib/mlb/team-market-capture.mjs)
exists, and why it carries this warning:

> ⚠ An odds feed's event list is not a pregame list.

**So the capability is proven and the separation logic already exists.** `pregameGamesOnly()` splits
started events from pregame ones and refuses anything it cannot prove was captured before the start —
which is exactly the primitive H2 needs, already written, already tested, and already load-bearing.

**What is NOT established:** whether in-play *player-prop* markets are offered at a useful depth. Every
prop request in our ledger is pre-start, so we have no observation either way. One 3-credit bulk call
during a live game would settle the team-market side conclusively; the prop side would cost ~3.4
credits per game probed.

---

## 2. Cost — measured from our own receipts, not estimated

`data/internal/research/odds/nfl/p171-ledger.json`, 265 requests, 394 credits:

| request kind | calls | credits | per call | what it covers |
|---|---|---|---|---|
| free index (`/sports`, `/events`) | 143 | **0** | 0.00 | 2,090 events listed |
| bulk team markets (h2h + spreads + totals) | 53 | 159 | **3.00** | 1,849 events — *the whole slate per call* |
| per-event player props (5 families) | 69 | 235 | **3.41** | one event per call |

The pricing rule this confirms: **credits = markets × regions, per call — not per event.** A bulk call
covering fifteen games costs the same three credits as one covering one. Per-event prop calls do not
get that leverage, and 3.41 rather than 5.00 is because not every book posts every family.

### What a live cadence would actually cost

A Sunday slate runs roughly 13:00Z → 04:00Z, about **15 hours**.

**Game-level lines (bulk, 3 credits/refresh — covers every live game at once):**

| cadence | refreshes | credits / Sunday | credits / month (4 Sundays) |
|---|---|---|---|
| every 30 min | 30 | **90** | 360 |
| every 15 min | 60 | **180** | 720 |
| every 5 min | 180 | **540** | 2,160 |

**Player-prop lines (per-event, ~3.4 credits × 15 games = ~51 credits/refresh):**

| cadence | refreshes | credits / Sunday |
|---|---|---|
| every 30 min | 30 | **1,530** |
| every 15 min | 60 | **3,060** |
| every 5 min | 180 | **9,180** |

### Against what we have

| | |
|---|---|
| ~~P171 cumulative ceiling~~ (superseded, see the correction above) | ~~3,000 credits~~ |
| **Operative ceiling** (`NFL_2026`, effective) | **1,160 credits** |
| Used to date | **394** |
| **Remaining under authorization** | **766** |
| Committed per week by the existing prop cadence | **333** |
| Provider balance remaining | 10,987 (measured 2026-09-25T17:39Z) |

**Game-level live odds are affordable.** A 30-minute cadence costs 90 credits per Sunday — about 12%
of the remaining 766, and roughly a quarter of one week's existing burn. The provider balance
(10,987) is not the binding constraint; the self-imposed season ceiling is.

**Live player-prop odds are not.** One Sunday at a 15-minute cadence costs **3,060 credits** — four
times the entire remaining authorization, and more than twice the whole season ceiling. Even a 30-minute
cadence spends 1,530 in a day. This is a per-event endpoint with no bulk leverage, and fifteen
concurrent games is the worst case for it.

---

## 3. Authorization — this is the actual blocker, and it is not about money

[`docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md`](receipts/ODDS_AUTHORIZATION_NFL_2026.md) — the
receipt that actually governs — carries this in its operative terms:

> | Cadence | the scheduled `nfl-event-window.yml` captures, **pre-kickoff only** |

and amendment 2 leaves it untouched: "the same five prop keys, **pre-start only**". The superseded
P171 said the same thing in its own words ("evidence-driven pre-start refreshes"), so the constraint
is not an artifact of reading the wrong file — but the row above is the one with code behind it.

In-play capture is not a smaller version of a pre-start refresh — it is a different purpose,
producing a different artifact, making a different claim on the page.

**So even the cheap option is a founder gate**, and it would be one at zero credits. The 90-credit
30-minute cadence is well inside the numeric ceiling and still outside the stated scope.

---

## 4. What the product would gain, stated honestly

A frozen pregame line beside a current one, with the direction and size of the move and both
timestamps. That is a **factual, checkable** addition of the same kind as the live stat: no model, no
edge claim, no prediction.

It is genuinely useful — a reader who saw 45.5 before kickoff and sees 51.5 now learns something real
about what the market did — and it is also the smallest live-odds product that can exist. It does not
need player props to be worth shipping.

**What it must never become:** H2's separation is not a style preference. Three things stay apart —

```
FROZEN PREGAME GAMETIME FORECAST     ours, immutable
CURRENT LIVE EVENT STATE             the provider's facts
CURRENT SPORTSBOOK MARKET            a third thing, separately owned and separately stamped
```

A current line must never be rendered in the slot where "the line you were shown before kickoff" is
claimed. That is the defect [`pregameGamesOnly()`](../app/src/lib/mlb/team-market-capture.mjs) was
written to prevent, and the frozen-block provenance rule in the live-prop producer is the same rule
again. Any live-odds work inherits both.

Also out of scope unless separately asked for: no averaging books into a synthetic movement, and no
"best line" product.

---

## 5. Options, with a recommendation

**A · Game-level live line movement, 30-minute cadence — 90 credits/Sunday, ~360/month.**
Team markets only (h2h, spreads, totals), bulk endpoint, live games only, stopping when a game goes
final. Fits in the remaining 2,606 with room for eleven more Sundays. Needs a scope extension, not a
ceiling increase.

**B · Game-level at 15 minutes — 180 credits/Sunday, ~720/month.** Noticeably fresher; still fits.

**C · Player-prop live odds — 3,060 credits per Sunday at 15 minutes.** Needs both a scope extension
and a materially larger ceiling. Not recommended now: it is nine times the cost of option B for a
market whose in-play depth we have not observed, and the live *stat* already answers the question most
readers have about a prop.

**D · Do nothing.** The live stat and the frozen line already ship. Nothing is broken by waiting.

**Recommendation: A**, with one cheap precondition — a single **3-credit bulk probe during a live
game** to confirm NFL in-play team markets are actually served with a moving line, before building
anything. If that probe comes back pregame-only, the whole lane closes for 3 credits.

---

## 6. The exact decision needed

1. Extend the P171 authorization's permitted purposes to include **in-play team-market capture** for
   NFL — a scope change; the existing 3,000-credit ceiling already covers option A or B.
2. Approve the one 3-credit confirmation probe.
3. Say whether live player-prop odds (option C) should be costed properly or dropped for now.

Until then no live-odds call will be made, and Phase H stays at this document.
