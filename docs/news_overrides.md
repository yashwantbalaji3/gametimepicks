# Manual News Overrides — Operator Guide

> **TL;DR**
> When verifiable NBA news drops (injury, trade, lineup change, rest), add
> a JSON entry to `pipeline/manual_overrides/news_signals.json`, run the
> pipeline, commit, push. The board updates with the signal attached and a
> link back to your source.

---

## Why this exists

Phase 7B-1 is the **free-only stack**. We don't pay $200/mo for the X API,
$250+/mo for SportsData.io news, or any other news provider. Instead the
operator (you) is the news layer. This is more compliant, more honest, and
keeps signal quality high — every signal has a real human-verified source URL
attached.

The pipeline reads this file on every run, filters expired entries, and
attaches matching signals to each lean. Signals appear on the prop card with
the source label and a "manual review" badge.

What we explicitly **don't** do:

- Scrape X/Twitter, Reddit, Discord, or any social platform
- Auto-ingest from any third-party news service
- Invent player statuses (questionable, probable, out, traded, etc.)
- Use signal data we cannot back with a source URL

If no signal exists for a player, the UI says "No active manual signals" —
not "Player Y is healthy."

---

## File location

```
pipeline/manual_overrides/news_signals.json
```

This file is committed to git. The full edit history is your audit trail —
useful both for personal review (am I biased toward signals that confirm
bets I wanted to make?) and for portfolio review (recruiters can see exactly
how the operator handled news over time).

---

## Schema

Top-level structure:

```json
{
  "_comment": "Optional human-readable note for future you",
  "signals": [
    /* zero or more signal objects */
  ]
}
```

Each signal object:

| Field                | Type     | Required | Notes                                                                                      |
| -------------------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| `id`                 | string   | yes      | Unique identifier. Convention: `YYYY-MM-DD-player-shortdesc` (e.g. `2026-05-04-embiid-shoulder-out`) |
| `createdAt`          | string   | yes      | ISO 8601 with timezone, e.g. `"2026-05-04T14:32:00-04:00"`                                 |
| `expiresAt`          | string   | yes      | ISO 8601 with timezone. Pipeline filters expired signals automatically                     |
| `manuallyConfirmed`  | bool     | no       | Defaults to `true`. Always `true` for manual layer                                         |
| `sourceName`         | string   | yes      | Human-readable, e.g. `"Shams Charania"`, `"Official NBA Injury Report"`                    |
| `sourceType`         | enum     | yes      | One of: `"official"`, `"reporter"`, `"provider"`, `"manual"`                               |
| `sourceUrl`          | string   | no       | Direct link to the source post / report. Strongly recommended.                             |
| `sourceReliability`  | float    | no       | 0..1, defaults to 0.85. Use 0.95 for official reports, 0.6 for unverified rumors          |
| `playerName`         | string   | yes      | Exact match against `lean.playerName`. Use `""` for team-wide signals                      |
| `team`               | string   | yes      | Team abbreviation, e.g. `"PHI"`, `"BOS"`                                                   |
| `gameId`             | string?  | no       | Specific game id if known; `null` to apply to any game                                     |
| `updateType`         | enum     | yes      | One of: `injury`, `trade`, `lineup`, `minutes`, `rest`, `transaction`, `coaching`, `personal`, `other` |
| `note`               | string   | yes      | One-sentence human-readable description                                                    |
| `confidence`         | float    | no       | 0..1, defaults to 0.7. How sure are you this signal is accurate?                          |
| `impact`             | enum     | yes      | `"low"`, `"medium"`, `"high"`. Drives badge color                                          |
| `modelAction`        | enum     | yes      | See "Model actions" below                                                                  |

### Model actions

Listed in priority order. If a lean has multiple signals with competing
actions, the highest-priority one wins.

| Action                     | Effect on the lean                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `remove_from_board`        | Confidence forced to Low. Signal shown. Use for confirmed scratches.                            |
| `manual_review_required`   | Confidence forced to Low. Signal shown. Use when situation is fluid (e.g. game-time decision). |
| `flag_risk`                | Confidence capped at Medium. Signal shown. Use for ambiguous news.                              |
| `reduce_minutes`           | Currently informational only. Phase 7B-2 will adjust projection.                                |
| `increase_usage`           | Currently informational only. Phase 7B-2 will adjust projection.                                |
| `none`                     | Signal shown but no model adjustment. Use for context only.                                     |

---

## Workflow — step by step

### 1. You see verifiable NBA news

Sources you can use:

- ✅ Official NBA Injury Report PDF (linked from nba.com)
- ✅ Official team Twitter/X posts (link to the post)
- ✅ Established beat reporters (Shams, Wojnarowski, Stein, Charania,
   team-specific reporters)
- ✅ Players' own verified social posts
- ✅ Press conference transcripts from team or league sources

Sources you should **not** use:

- ❌ Random Twitter/X accounts without team/league context
- ❌ Reddit rumors without a primary source
- ❌ Aggregator sites without their own original sourcing
- ❌ Anything you can't open in a browser and verify

### 2. Verify the source

- Click the link. Read it. Make sure it's actually the team or reporter
  you think it is.
- Note the timestamp.
- Decide what changes for the player (out? probable? minutes restriction?
  back from injury?).

### 3. Add an entry

Open `pipeline/manual_overrides/news_signals.json` in your editor. Append a
new object to the `signals` array. Example:

```json
{
  "id": "2026-05-04-embiid-shoulder-out",
  "createdAt": "2026-05-04T14:32:00-04:00",
  "expiresAt": "2026-05-04T23:59:59-04:00",
  "manuallyConfirmed": true,
  "sourceName": "Shams Charania",
  "sourceType": "reporter",
  "sourceUrl": "https://x.com/ShamsCharania/status/1234567890",
  "sourceReliability": 0.95,
  "playerName": "Joel Embiid",
  "team": "PHI",
  "gameId": null,
  "updateType": "injury",
  "note": "Embiid ruled out for tonight's game vs BOS — shoulder soreness.",
  "confidence": 0.9,
  "impact": "high",
  "modelAction": "remove_from_board"
}
```

### 4. Set a sensible expiry

- **Game-day signals** (out, scratched): `expiresAt` = end of that game day
  in your timezone, e.g. `"2026-05-04T23:59:59-04:00"`.
- **Multi-game injuries** (out 2-3 weeks): set the expiry to the expected
  return date. Update later if the timeline shifts.
- **Minutes restrictions** (Embiid on a back-to-back rest plan): expire at
  end of the relevant game.
- **Trades / transactions**: longer — until you're confident the change is
  reflected in everyone's data.

Expired signals are filtered automatically. They stay in the file as
historical record (audit trail).

### 5. Re-run the pipeline

```bash
bash scripts/run_pipeline.sh
```

This regenerates `boards/<date>.json` files with your signal attached.

### 6. Verify the output

- Check `app/public/data/boards/<today>.json` — your signal should appear in
  the relevant lean's `newsSignals[]` array.
- Check the validation log: `pipeline/validation/leans_log.jsonl` — each
  affected lean has the signal id in its `newsSignalIds` field.

### 7. Commit and push

```bash
git add pipeline/manual_overrides/news_signals.json app/public/data/
git commit -m "news: Embiid out vs BOS (shoulder)"
git push
```

Vercel redeploys. The live site reflects the override within a minute.

---

## Pitfalls to avoid

### Don't write yourself into a corner

If you only add signals when they support a bet you wanted to make, the
system becomes a confirmation-bias amplifier. Make a habit of adding
signals for **every** material piece of news, even ones that hurt your
bias.

### Don't forget to set expiry

If you set `expiresAt` too far in the future, an injury signal lingers
after the player returns and silently degrades your model. The pipeline
log warns you about old active signals — pay attention.

### Don't use Twitter/X embeds as primary sources

Always link to the actual post URL. If the account deletes the post or
locks the timeline, your future audit becomes harder. Take a screenshot
locally if it's a critical signal — store it outside the repo.

### Don't claim "manual" for something you didn't verify yourself

`sourceType: "manual"` should literally mean: you, the human operator, saw
the source and decided it warranted a signal. If you forwarded something
from a Discord without checking, that's not manual. Skip it.

---

## Phase 7B-2 preview

When real Odds API integration lands in Phase 7B-2:

- Signals with `modelAction: reduce_minutes` will start adjusting the
  projection by 15-25%.
- Signals with `modelAction: increase_usage` will adjust the same way in
  the opposite direction (carefully — usage rate ≠ minutes).
- A `risk_flags` array on each lean will surface news-driven flags
  visually.
- The validation log will track the news state at generation time so we
  can later answer questions like "did the model do better when we
  flagged news risk?"

Phase 7B-1 lays the foundation. The signals are recorded today even
though the model isn't yet reactive to them — that record is what makes
Phase 7B-2 measurable.
