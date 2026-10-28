# NBA game posts (gtp-social@2.3) — dry-run demonstration

Data: origin/main 64bb64a8ca · run 2026-10-28T20:56:19.525Z · throwaway ledger (approvals here are demo stand-ins, not yours) · nothing sent to X.

| Tip (ET) | Game | Scheduled (ET) | Gate result | Images | Caption length | Would cost |
|---|---|---|---|---|---|---|
| 7:00 PM | MIA @ ATL | 6:15 PM | DRY_RUN | 2 | 214/280 | $0.045 |
| 7:00 PM | WSH @ CLE | 6:15 PM | DRY_RUN | 2 | 214/280 | $0.045 |
| 7:00 PM | CHA @ DET | 6:15 PM | DRY_RUN | 2 | 228/280 | $0.045 |
| 7:00 PM | PHI @ IND | 6:15 PM | DRY_RUN | 2 | 201/280 | $0.045 |
| 7:30 PM | ORL @ TOR | 6:45 PM | DRY_RUN | 2 | 217/280 | $0.045 |
| 8:00 PM | NY @ CHI | 7:15 PM | DRY_RUN | 2 | 199/280 | $0.045 |
| 8:00 PM | HOU @ MIL | 7:15 PM | DRY_RUN | 2 | 216/280 | $0.045 |
| 8:00 PM | GS @ MIN | 7:15 PM | DRY_RUN | 2 | 216/280 | $0.045 |
| 8:00 PM | DEN @ NO | 7:15 PM | DRY_RUN | 2 | 227/280 | $0.045 |
| 9:00 PM | SA @ UTAH | 8:15 PM | DRY_RUN | 2 | 228/280 | $0.045 |
| 9:30 PM | OKC @ DAL | 8:45 PM | DRY_RUN | 2 | 218/280 | $0.045 |
| 10:30 PM | LAL @ LAC | 9:45 PM | DRY_RUN | 2 | 226/280 | $0.045 |

## Exactly what would be sent (first game)

```json
[
  {
    "body": "multipart: media=<2026-10-28-NBA-pregame-401909881-v2-b184dd0e5c07.png, 1040332 bytes, sha256 b184dd0e5c07…>, media_category=tweet_image",
    "method": "POST",
    "url": "https://api.x.com/2/media/upload"
  },
  {
    "body": "multipart: media=<2026-10-28-NBA-players-401909881-v2-b0d856f3197c.png, 872614 bytes, sha256 b0d856f3197c…>, media_category=tweet_image",
    "method": "POST",
    "url": "https://api.x.com/2/media/upload"
  },
  {
    "body": {
      "media": {
        "media_ids": [
          "<media 1>",
          "<media 2>"
        ]
      },
      "text": "🏀 Miami Heat vs Atlanta Hawks tonight!\n\nOur model picks Atlanta to win.\n\nTwo players to watch:\n🔥 Bam Adebayo: 14.3 PTS | 8.8 REB | 3.5 AST\n🔥 Jalen Johnson: 14.2 PTS | 6.5 REB | 3.7 AST\n\nFull predictions below 👇"
    },
    "method": "POST",
    "url": "https://api.x.com/2/tweets"
  }
]
```
