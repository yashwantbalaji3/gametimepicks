# EPL Availability — Provider Matrix (Phase I)

**Date:** 2026-09-26
**Scope:** English Premier League player availability — injuries, suspensions, administrative absence, confirmed XI.
**Status:** decision-support. **Nothing was purchased, no subscription was taken, and every number below was measured tonight at zero cost.**

---

## 0. The headline

**A free, official source already publishes what we were missing.** The Premier League's own Fantasy
Premier League API carries a typed availability state, a reason, a play probability and a
**timestamp** for every player in the league, with stable Opta codes. It needs no key and no account.

The question is therefore no longer "who do we buy from". It is "what does it cost to join their ids
to ours", and that is measured below too: **44% resolve exactly with zero ambiguity, 56% need a
reviewed crosswalk.**

One thing remains genuinely unknown and is stated as such: **whether a confirmed XI is published
before kickoff** could not be tested tonight, because the next EPL fixture is 2026-10-10.

---

## 1. Why the current answer is "we do not know", not "everyone is fit"

ESPN exposes an injuries shape for EPL and it returns **nothing**. The important part is the control:

| endpoint | league | team | `count` |
|---|---|---|---|
| `sports.core.api.espn.com/v2/sports/soccer/leagues/eng.1/teams/360/injuries` | EPL | Man Utd | **0** |
| `sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/2/injuries` | NFL | Buffalo | **58** |

Same host, same path shape, same query. The endpoint is not broken and we are not calling it wrongly
— ESPN simply does not publish EPL injuries. Checked the site API too: Man Utd, Liverpool, Arsenal
and Chelsea each return `injuries: 0`.

**So an empty exclusion set from ESPN means "unmeasured", and treating it as "available" would be
inventing health from absence.** That is the defect this lane exists to close.

---

## 2. The matrix

Measured 2026-09-26. "—" means the source does not offer it; **UNKNOWN** means we could not test it
tonight and are not guessing.

| | **FPL (official)** | **ESPN** | **api-football** |
|---|---|---|---|
| Injuries | **71 players** (`status: i`) | **0** — absent | current season **gated** on Free |
| Suspensions | **4** (`status: s`, e.g. "Suspended until 19 Oct") | — | gated |
| Administrative absence | **105** (`status: u`, e.g. "Has joined Al Hilal permanently") | — | gated |
| Doubtful, with probability | **26** (`status: d`, `chance_of_playing_next_round: 75`) | — | gated |
| Reason text | **206 players** carry `news` | — | — |
| Confirmed starting XI | — | **11 per side**, with athlete ids | Pro only ($19/mo) |
| Bench | — | **9 per side** | Pro only |
| Lineup timing | n/a | **UNKNOWN** (see §4) | ~1h pre-kickoff (recorded) |
| Stable player ids | **667/667 carry an Opta code** (`p154561`) + FPL id | ESPN athlete id | api-football id |
| Stable club ids | 20 teams, `team` + `team_code` | ESPN team id | api-football id |
| Capture timestamps | **206/206 `news_added`**, µs precision, 2026-07-23 → 2026-09-26 | fixture dates only | — |
| Historical snapshots | **none** — it is a live snapshot | match-by-match | **2022-2024 only** on Free |
| Refresh cadence | continuous; newest entry tonight 05:30Z | per fixture | daily |
| Rate limits | none published; no key | none published | **100 req/day** on Free |
| Cost | **£0** | **£0** | £0 gated / **$19/mo** for current season |
| Terms risk | Premier League's own public API; **unreviewed for redistribution** | as already used across the site | ⚠ **open founder question** (below) |
| Integration effort | **medium** — an id crosswalk (§3) | low — already our EPL id space | medium |
| Confidence | **high**, measured | high, measured | recorded, not re-measured tonight |
| Recommended role | **availability truth** | **confirmed XI + bench** | not needed for this lane |

### What each status code actually means, from the live feed

```
a  461   available
i   71   injured        "Back injury - Unknown return date"
d   26   doubtful       "Groin injury - 75% chance of playing"   chance_of_playing_next_round: 75
u  105   unavailable    "Has joined Al Hilal permanently"
s    4   suspended      "Suspended until 19 Oct"
```

**101 players carry a hard unavailability state** — exactly the exclusion set ESPN returns zero for.

---

## 3. The one real cost: identity

FPL is keyed by its own id and an Opta code. Our EPL corpus is keyed by **ESPN** ids — 60,742 player
rows and a committed 2026-27 squad list of 20 clubs, 606 players. ESPN does not expose Opta codes, so
there is no direct bridge.

Measured, joining FPL → our committed squads by normalised name **constrained to the same club**:

| | players |
|---|---|
| exact name + club match | **292** |
| ambiguous (name collides within a club) | **0** |
| unresolved | **375** |

The unresolved are almost all FPL's display shortening — `Raya` for *David Raya Martín*, `Gabriel`,
`White`, `Merino`. **Zero ambiguity is the important number**: when a name does match inside a club it
is unique, so a crosswalk can be built without guessing.

⚠ **This must not become runtime name-matching.** A reviewed, committed `espnId ↔ fplId` crosswalk,
built once with unresolved entries left explicitly unresolved, is a different thing from inferring
identity per request — and the unresolved must stay `IDENTITY_UNRESOLVED` rather than defaulting to
available.

---

## 4. What is still UNKNOWN, and why it is not guessed

**Does a confirmed XI appear before kickoff?** ESPN's match summary carries `rosters` with 11 starters
and 9 bench per side, each with an athlete id, position and jersey — verified on a completed fixture
(event 401879276, Bournemouth v Liverpool). Whether those rosters are populated *before* the whistle
could not be tested: **the next EPL fixture is 2026-10-10**, a two-week international break.

Until that is measured, a pregame confirmed-XI product cannot be promised, and an XI read after
kickoff is a leakage risk rather than a forecast input. The test is one free call on 2026-10-10.

---

## 5. Recommendation

**Two free sources, each doing the thing it is good at, and no purchase.**

1. **FPL for availability.** Official, free, keyless, typed, timestamped, complete across injuries,
   suspensions and administrative absence. `news_added` gives the capture ordering the leakage rule
   needs, and capturing it on a schedule builds the historical series the feed does not itself offer.
2. **ESPN for confirmed XI and bench**, already in our id space — *subject to the timing test in §4.*
3. **api-football: not needed for this lane.** Its value was the historical player corpus, not
   availability; its current season is gated and buying $19/mo would purchase what FPL gives away.

### Before any of it renders publicly — founder gate, already outstanding

`api-sports` terms were flagged as an open question when raw payloads were found committed to this
**public** repository (they are now gitignored). FPL is a different provider and raises the same
question in its own right: it is a free public API, and redistributing a derived availability column
on a public site is a **terms question, not an engineering one**. Nothing from either source should
render publicly until that is answered.

Capturing to the internal archive is a separate, lower-risk step and is where this lane should start.

---

## 6. Suggested next actions, in order

1. **Capture FPL to the internal archive on a schedule** — free, keyless, timestamped; builds the
   historical series nobody currently holds. Internal only.
2. **Build the reviewed `espnId ↔ fplId` crosswalk** — 292 resolve exactly, 375 need review, and
   unresolved stays unresolved.
3. **On 2026-10-10, make one free call** to settle whether ESPN publishes an EPL XI before kickoff.
4. **Then, and only with a terms answer**, decide whether availability renders publicly.

None of steps 1-3 costs anything or needs a decision. Step 4 does.
