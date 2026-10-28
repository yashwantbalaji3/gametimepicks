# NBA game posts — dry-run demonstration

Data: origin/main d9688ac257 · run 2026-10-28T19:54:46.664Z · throwaway ledger (approvals here are demo stand-ins, not yours) · nothing sent to X.

| Tip (ET) | Game | Scheduled (ET) | Gate result | Images | Caption length | Would cost |
|---|---|---|---|---|---|---|
| 7:00 PM | MIA @ ATL | 6:15 PM | DRY_RUN | 2 | 238/280 | $0.045 |
| 7:00 PM | WSH @ CLE | 6:15 PM | DRY_RUN | 2 | 230/280 | $0.045 |
| 7:00 PM | CHA @ DET | 6:15 PM | DRY_RUN | 2 | 254/280 | $0.045 |
| 7:00 PM | PHI @ IND | 6:15 PM | DRY_RUN | 2 | 226/280 | $0.045 |
| 7:30 PM | ORL @ TOR | 6:45 PM | DRY_RUN | 2 | 243/280 | $0.045 |
| 8:00 PM | NY @ CHI | 7:15 PM | DRY_RUN | 2 | 223/280 | $0.045 |
| 8:00 PM | HOU @ MIL | 7:15 PM | DRY_RUN | 2 | 243/280 | $0.045 |
| 8:00 PM | GS @ MIN | 7:15 PM | DRY_RUN | 2 | 246/280 | $0.045 |
| 8:00 PM | DEN @ NO | 7:15 PM | DRY_RUN | 2 | 254/280 | $0.045 |
| 9:00 PM | SA @ UTAH | 8:15 PM | DRY_RUN | 2 | 248/280 | $0.045 |
| 9:30 PM | OKC @ DAL | 8:45 PM | DRY_RUN | 2 | 241/280 | $0.045 |
| 10:30 PM | LAL @ LAC | 9:45 PM | DRY_RUN | 2 | 250/280 | $0.045 |

## Exactly what would be sent (first game)

```json
[
  {
    "body": "multipart: media=<2026-10-28-NBA-pregame-401909881-v2-16530c848995.png, 1062589 bytes, sha256 16530c848995…>, media_category=tweet_image",
    "method": "POST",
    "url": "https://api.x.com/2/media/upload"
  },
  {
    "body": "multipart: media=<2026-10-28-NBA-players-401909881-v2-a7935f5db5a4.png, 877508 bytes, sha256 a7935f5db5a4…>, media_category=tweet_image",
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
      "text": "🏀 Miami Heat vs Atlanta Hawks tonight\n\nOur predicted winner: the Hawks.\n\nPlayers to watch, by our model's projections:\n🔥 Bam Adebayo: 14.3 PTS | 8.8 REB | 3.5 AST\n🔥 Jalen Johnson: 14.2 PTS | 6.5 REB | 3.7 AST\n\nFull projections below 👇"
    },
    "method": "POST",
    "url": "https://api.x.com/2/tweets"
  }
]
```
