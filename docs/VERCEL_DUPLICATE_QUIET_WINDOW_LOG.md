# Vercel Duplicate Quiet-Window Log (2026-07-31 → 2026-08-07)

Duplicate `gametimepicks` Git connection removed by the founder **2026-07-31 ~17:30 ET
(~21:30 UTC)**. Window closes no earlier than **2026-08-07**; deletion remains a separate
founder approval after this log shows a clean week.

Per-entry contract: date/time ET · canonical latest deployment · duplicate latest deployment ·
new duplicate deployments since disconnect · domain health · notification result · anomaly/action.

| # | Date/time (ET) | Canonical latest | Duplicate latest | New dup deploys | Domain health | Notifications | Anomaly / action |
|---|---|---|---|---|---|---|---|
| 1 | 2026-07-31 ~5:50 PM | `9e17733b` built 17:13Z, serving custom domain (later docs commits `0f4c7706`/`d81d5987` correctly skip-listed) | 17:16:04Z (`8df72085`) — **pre-disconnect; nothing since** | **0** | `gametimepicks.yashwantbalaji.com` 200, fresh build-info; `gametime-picks.vercel.app` 200 identical | Discord webhook DELIVERY_PROVEN; email toggles pending founder (see email proof doc) | None. Note: even before disconnect, the in-repo skip guard had already produced zero duplicate deployments from `9e17733b` onward — disconnect + guard are now belt-and-braces |
| 2 | 2026-07-31 ~6:20 PM | `fa49ddec` (Program 088-091 code+docs) built and serving the custom domain. **Its GitHub deployment environment is plain `Production` — the suffix-free single-project naming has returned**, which is structural proof only one project remains Git-connected | still 17:16:04Z (`8df72085`) | **0** | custom domain 200, fresh build-info | Discord path green; Vercel email toggles pending founder | None — first post-disconnect push is clean. The env-name reversion is the strongest dormancy signal available from GitHub's side |

Daily checks (any session can run; no credentials):

```bash
gh api "/repos/yashwantbalaji3/gametimepicks/deployments?environment=Production%20%E2%80%93%20gametimepicks&per_page=1" --jq '.[0].created_at'
curl -sL https://gametimepicks.yashwantbalaji.com/data/build-info.json | python3 -c "import json,sys; j=json.load(sys.stdin); print(j['commit']['shortSha'], j['buildEtDate'])"
```

First command must keep returning a timestamp ≤ `2026-07-31T17:16:04Z`; second must show the
current slate day and the newest app-affecting SHA.

**End-of-window deliverable:** deletion-readiness recommendation referencing
`VERCEL_DUPLICATE_CONSOLIDATION_PLAN.md` Phase 4 prerequisites (F2 settings archive, no unique
config, clean week).
