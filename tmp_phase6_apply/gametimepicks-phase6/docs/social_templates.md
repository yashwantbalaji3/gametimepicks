# Social Launch Templates

Drafts for launch-day posts. Tone is transparent, human, data-driven, not
gambling hype, no profit promises. Edit before posting — these are
starting points, not final copy.

All copy ends with a clear responsible-use line.

---

## LinkedIn launch post

**Recommended length:** 200-280 words. LinkedIn rewards medium-length posts
that read like a small essay. Add 2-4 hashtags at the end.

```
New project I shipped: GametimePicks, an educational sports prop
analytics lab.

It compares model projections against sportsbook lines for NBA player
props (Points, Rebounds, Assists), surfaces transparent model leans with
one-sentence explanations, and tracks every result publicly.

Why I built this →

Most products in the sports analytics space sell certainty. Subscription
"lock pick" services, paid Discord servers, tout sites. The user gets
marketing-grade language and almost no information about how predictions
are produced or how the predictor has performed.

I wanted to build the version of this product that goes the other way:
shows the methodology, publishes its limitations, tracks every outcome.

What's interesting under the hood →

• Multi-source provider abstraction with registry-based failover.
  Three providers fully implemented (nba_api, The Odds API, demo);
  four scaffolded for future extensibility.
• Sample-size-gated confidence model — high confidence requires both
  edge magnitude AND a meaningful number of recent games of data.
• Static Next.js frontend with a clearly-labeled demo / live / hybrid
  data mode indicator. The site renders the same UI in any mode.
• Persistent disclaimer banner. Methodology page with the actual
  formulas. Calibration chart on the results page. No paid tier, no
  affiliate sportsbook links.

Live at: gametimepicks.yashwantbalaji.com
Code: github.com/<your-username>/gametimepicks

Not betting advice. Educational analytics. No guarantees. Use responsibly.

#SportsAnalytics #DataEngineering #NextJS #Python
```

## X / Twitter launch thread

A short thread — 4 to 6 posts. Each post stands alone for re-tweetability.

**Post 1 (the hook)**

```
shipped: GametimePicks — an educational sports prop analytics lab

it compares model projections against sportsbook lines for NBA player
props, surfaces transparent leans with reasoning, and tracks every
result publicly

🔗 gametimepicks.yashwantbalaji.com
```

**Post 2 (why)**

```
the sports analytics space is mostly paid-tipster services selling
certainty

i wanted to build the version that shows the methodology, publishes
limitations, tracks every result

transparency over performance claims
```

**Post 3 (what's interesting technically)**

```
under the hood:

– multi-source provider abstraction (nba_api + The Odds API,
  4 more scaffolded) with registry-based failover
– sample-size-gated confidence model
– static next.js + python pipeline → JSON contract
– demo/live/hybrid mode indicator
```

**Post 4 (the model)**

```
the model is intentionally explainable

projection = weighted blend of L5/L10/season + home/away
P(over) = 1 − Φ((line − projection) / σ)
edge = model probability − de-vigged implied probability

confidence requires both edge magnitude AND ≥8 games of data
```

**Post 5 (close)**

```
live: gametimepicks.yashwantbalaji.com
code: github.com/<your-username>/gametimepicks

not betting advice, educational analytics, no guarantees
```

## Instagram story text

Single-frame story, large text on a dark background matching the site's
broadcast aesthetic.

**Frame 1**

```
Just shipped:

GametimePicks
sports prop analytics lab

real NBA data + transparent model leans
gametimepicks.yashwantbalaji.com
```

**Optional frame 2 (sticker over a screenshot of the board)**

```
filter by market, confidence, edge
sort by tipoff or edge
public tracked results
```

**Optional frame 3 (responsible-use disclaimer)**

```
educational analytics
not betting advice
no guarantees
```

## Short portfolio announcement

For pinned tweet, profile bio update, or anywhere with tight character
limits.

**Tweet-length (280 chars)**

```
new portfolio project — GametimePicks. an educational sports prop
analytics lab built with real NBA data. transparent model leans,
public tracked results. not betting advice, just analytics.

gametimepicks.yashwantbalaji.com
```

**Bio-length (120 chars)**

```
Just shipped GametimePicks — sports prop analytics lab. NBA player
props, transparent model leans, public results.
```

**Headline-length (60 chars)**

```
GametimePicks — sports prop analytics lab. now live.
```

## Responsible-use disclaimer (always include some version)

Every post above ends with a version of this. Use the appropriate length
for the platform.

**Long version (LinkedIn)**

> Not betting advice. GametimePicks is an educational analytics project.
> No guarantees. Past performance does not predict future results. Use
> responsibly.

**Short version (X / IG)**

> educational analytics, not betting advice, no guarantees

**Inline version (when space is tight)**

> not betting advice — analytics project

---

## Posting cadence (suggested)

- **Day 0 — launch.** LinkedIn long post + X thread + IG story.
- **Day 1.** Pin the X thread to your profile.
- **Day 7.** Brief follow-up post sharing one insight from the first
  week of tracked results (only if there ARE tracked results — don't
  fake it).
- **Ongoing.** Weekly X / LinkedIn updates if the model produces a
  notable callout (a high-confidence lean, a calibration update). Don't
  post just to post — only when there's something to say.

## Forbidden phrases (do not use anywhere)

Audit every draft for these before posting:

- lock, locks, locked-in
- guaranteed, guaranteed profit
- free money
- smash
- can't miss
- beat the books
- premium picks
- paid picks, paid Discord
- subscription
- sure thing
- sharp action, fade the public *(tipster lingo)*
- "follow me to win"

If anything in the post sounds like it would fit on a paid-tipster site,
rewrite it.
