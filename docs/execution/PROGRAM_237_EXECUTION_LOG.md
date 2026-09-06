# Program 237 · Sport hubs and daily product completion

Start `c73327585` · baseline ET 2026-09-06 02:02 / UTC 06:02Z.
P236's two SHAs resolved: `9537811b5` is the implementation commit CI validated; `75f8c5f04` is that
plus a docs-only resume-state commit, and both are ancestors of this tip. Production had since moved
to `4babf583` from overnight bot work, which is integrated here.
Protected money unchanged: `affe6b21071f2b3be96bb2774eb347c3` / `cb80473f88f3cb5f67208fa568925295`.
Two stashes and untracked `vp/` preserved.

## Phase A — one shape for four sport pages

### What was actually there

A shared `SportHubNav` already existed (P208): sticky, IntersectionObserver-driven, filtering to
anchors the page rendered. It was not the gap. The gap was the registry behind it — four sports with
four vocabularies in four orders:

| | opened with | then |
|---|---|---|
| mlb | Overview | Today's board, Simulations, Suggested cards, How it works |
| epl | Overview | Fixtures, Record, Schedule |
| ufc | Overview | Fight card |
| nfl | This week | Endzone Vault, Markets, Results, Coverage |

A reader who learned one hub learned nothing about the next, and no two sports put the games in the
same place. So the registry was normalised rather than replaced, and the existing nav reused — the
first version of this work added a second nav component, which would have been exactly the
conflicting navigation the charter asks to remove.

Every hub now runs **events → products → simulations → picks → results**. The noun changes where the
sport requires it (Games / Fixtures / Bouts); nothing else does. Anchor ids are unchanged because
they are in shipped URLs.

### What renders now

    /mlb   MLB · Sat, Sep 5 · 15 scheduled · 15 with a report · 15 with a supported read
           ATH @ SEA — "ATH · OVER 7.5 · SEA +1.5"   model forecast · simulation
    /nfl   NFL · Preseason archive · Fri, Aug 14 – Sat, Aug 29 · 0 with a supported read
    /epl   Premier League · Matchweek 3 · updated Sep 5, 6:29 PM ET
           Everton v Manchester United — "Manchester United · 38%"   model forecast · match result
    /ufc   UFC Fight Night: Hooker vs. Parnasse · 14 bouts · 11 with a supported read · 0 reports

### Two invented values, from one careless cast

`PublicGameDetail.date` is a calendar day, not an instant. The first adapter cast it to `T00:00:00Z`
and rendered the result — so every MLB row read **"8:00 PM ET"** (midnight UTC is the evening before
in New York) and named the **previous day**. Fifteen rows, two fabricated fields, and it looked
entirely plausible.

The real first pitch is on the artifacts (`fullGameSim.firstPitch`). Where it is absent — every NFL
row — the row now shows a date and says nothing about a time. A test asserts that MLB rows carry more
than one distinct time, because a single repeated time is a cast rather than a schedule.

### NFL is an archive and now says so

Every NFL artifact runs 2026-08-14 to 2026-08-29 with no prediction, no simulation, no market
snapshot and no projections; `dataStatus` reads "Lines pending for this game." The first version
labelled that **"This week"**, which would have been the page inventing a current slate out of
preseason. It reads "Preseason archive" with the real span, and its empty state names the cause: the
paid NFL acquisition allowance has lapsed and renewal is a founder decision.

### Reads are labelled by kind, never merged

`predictionLine` is the model speaking. `gameCenter` is `method: "market_implied"` from the odds
feed. They render under different kinds and are never combined — a de-vigged book number relabelled
as model confidence is the misreading the field exists to prevent. UFC carries `unmodelledReason`
through verbatim, so a bout the model declines to call shows the reason rather than a number.

### Mobile is not the desktop table

Below `md` each row is a card with the same information priority; at `md` and above it is a table
that scrolls inside its own container. The action is a real `<Link>`, not a row-click handler — a
whole-row handler cannot be tabbed to, cannot be middle-clicked, and swallows anything nested.

### Guards

21 new tests, 7 mutation-probed (date cast back to midnight UTC, started rows mixed into upcoming,
counts collapsed to one number, market number labelled as a model read, NFL archive called "this
week", UFC bouts given links that do not exist, no-start rows sorted to 1970) — every break produced
failures.

An existing repo guard caught a defect of mine: it checks each registry anchor appears in its own
page's source with scroll margin, and my `id={\`${model.sport}-games\`}` was computed inside a shared
component, invisible to a source scan. The same computed-value blindness that has defeated guards
here before. Each page now owns its section element with a literal id.

Gate: SUCCESS 199s · 5385 unit · 447 rendered.

### A sticky bar over the page title, found by looking

The section strip is `position: sticky`. Placed immediately before the heading it overlapped the
`<h1>` by 29px **at rest** — measured in the browser at scrollY 0, before any scrolling:

    nav   top 170  bottom 217
    h1    top 189  bottom 229     overlap: true

No DOM assertion about either element on its own would have found this. It needed a real browser and
a look at the rendered page, which is why the charter asks for one.

The header is now split: title and period ABOVE the sticky strip, events below it. That is also
exactly the order the charter specifies — header and period controls, then the game summary — so the
fix and the requirement turned out to be the same change. Re-measured: `overlap: false`, heading at
184–218, strip at 418–464, and document order verified in all four built exports.

### Verified by clicking, not by grep

`/mlb` at 375×812: fifteen cards, distinct real first pitches (9:40, 9:10, 8:10 PM ET), each with the
model's own line and a "View record" link. Followed `/games/mlb/ath-vs-sea-2026-09-05/` — the report
opens with its 10,000-run precomputed simulation. `/epl` and `/ufc` at desktop width: strip, then
title, then the table.

### A guard of mine that was measuring markup

The first built-export assertion used `/\d+ scheduled/` and failed against the real page, because
React writes `15<!-- --> scheduled` — text nodes separated by comment markers. Asserting on raw HTML
is how a guard here passes or fails for reasons that have nothing to do with the page. It now strips
comments, scripts and tags first and asserts on rendered text, and pins the three counts as three
separate numbers so "scheduled" can never quietly become "simulated".

3 built-export guards, all mutation-probed (strip before heading, counts collapsed to one, UFC given
a per-bout link) — every break produced a failure.

Gate: SUCCESS 198s · 5379 unit · 456 rendered.
