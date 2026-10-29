# Top 5 social boards: audit, pipeline, format decision (2026-10-29)

Branch `claude/cc-top5`, local only. Nothing was pushed, deployed or sent to X. Design `gtp-social-top5@1.0` is **not approved**.

## 1. Official boards per sport (origin/main `047c7f686b`, 2026-10-29 16:59Z)

| Sport | Market | Official published board? | Where / why not |
|---|---|---|---|
| NFL (weekly) | Anytime TD | **Yes** | `app/public/data/nfl/weekly-boards/2-08.json`, rendered verbatim at `/nfl/week/2-08` (FULL_WEEK, 14 games) |
| NFL (weekly) | Receiving yards | **Yes** (published Top 10; we show its first 5) | same file |
| NFL (weekly) | Receptions | **Yes** (published Top 10; first 5) | same file |
| NFL (weekly) | Rushing yards | No: ESTIMATE (`SHADOW_ELIGIBLE — failed bar(s): calOk`) | unavailable |
| NFL (weekly) | Passing yards | No: ESTIMATE (`SECOND_LOOK_REJECTED`, ECE 0.055 vs 0.05) | unavailable |
| NFL (daily) | 3 families | Yes, `results/top-boards/<date>.json` (frozen) | not posted: NFL gets the weekly post. The per-prop `top5-board` posts are no longer proposed |
| NBA | any | **No** | Top Boards are `PRIVATE_RESEARCH` (`data/internal/research/nba/top-boards`); capability `HISTORICAL_ONLY`. Never read |
| MLB | any | **No** | Props are market context (every market demoted); season over (`mlb/season-state.json` OFF_SEASON) |
| UFC | any | **No** | `SCAFFOLD_ONLY`, no independent model |
| EPL | any | **No** | Match forecasts + scorer head publish, but no frozen Top Board |
| Ligue 1 | any | **No** | Match forecasts only, no player markets |

Week numbering: ESPN's `week 8` is Oct 29 – Nov 2 (TNF CAR @ GB). Week 9 boards aren't published yet, so the prototypes use week 8.

## 2. What was built

- **Kinds:**
  - `top5-weekly`: one per NFL week, id `top5-week|NFL|2026-W08|v<n>`;
  - `top5-daily`: one per sport per daily slate, id `top5-day|<SPORT>|<date>|v<n>`.
- **Versions:** the version comes from the ledger. The same shown content and template keep the same version on every rebuild and on any ledger copy; changed content gets the next version.
- **Base id:** the base (without `|v<n>`) is the post. Supersession, "already decided", the one live approval and the once-only send claim `xlive|top5-week|NFL|2026-W08|<attempt>` all key on it. So a week is sent at most once, whatever its version.
- **Schedule:** 2 h before the earliest eligible game of the slate or NFL week. It is configurable with `GTP_CC_TOP5_DAILY_LEAD_MIN` / `GTP_CC_TOP5_WEEKLY_LEAD_MIN` and recorded on the package. It is computed on instants, and event-local times are converted DST-safely. Week 8: Thu 6:15 PM ET.
- **Holds:**
  - the first game has started;
  - the board isn't published;
  - coverage is short of the full week;
  - a shown row is excluded (OUT, DOUBTFUL, …);
  - the published order contradicts its own key;
  - at re-check (approval, "Check before posting", the send gate), the shown content or the first start changed.
- **Never** re-ranked, back-filled, or taken from private, ESTIMATE or shadow data. No odds or lines.
- **Evidence:** each source path, commit and sha256, the content key, and an `appeared` record of every row shown.
- **Design approvals per template:**
  - `DESIGNS` lists `gtp-social@2.3.2` and `gtp-social-top5@1.0`, each bound to its own asset manifest.
  - The ledger record and claim are the same as before, so existing approvals keep working.
  - `state().design` keeps its fields and adds `templates[]`.
  - The Review page shows one approve button per unapproved template.

## 3. Format: A (one combined image) vs B (one image per board, up to 4)

X allows at most **4 images per post**. Sources: X API v2 Create Post, `media.media_ids` with 1–4 items (docs.x.com/x-api/posts/create-post), and our publisher's `MAX_IMAGES = 4`, which already uploads `mediaSet` in order.

| | A: combined | B: one board per image |
|---|---|---|
| Feed, 390 px phone | The whole image is visible, with names at about 9.8 px | Grid tiles are centre-cropped. The market title and ranks 1–3 are placed in the crop band; names at about 7.8 px |
| Opened full-screen | Names at about 12.3 px; the smallest text is 20 px at 1080 | Names at about **19.5 px** (1.6×); the smallest text is 22 px |
| Scales to 4 markets / other sports | No: 3 panels fill 1350 px | Yes: up to 4 images, in a fixed priority order. More are stated as "N of M boards shown" |
| X cost (assumed $0.015 per upload) | $0.03 | $0.06 for 3 images |

**Recommendation: B.**
- Each board is about 1.6× more readable when opened.
- One methodology per image.
- It holds a 4th market without shrinking.
- The cost is a tap in the feed and $0.03 more per post.

A is a real alternative for exactly 3 markets.

The X grid layout in the mock is an approximation: 1 image at its own ratio; 2–4 images in a 16:9 grid. Check it on a phone.

Files in `docs/assets/top5/`:
- `option-b-2026-W08-board-{1,2,3}-*.png` and `option-a-2026-W08-combined-1-*.png` (full size, 1080×1350);
- `x-preview-option-{a,b}.{html,png}` (feed mock at 390 px);
- `x-open-option-{a,b}.{html,png}` (tapped open);
- `prototypes.json` (measurements).

Regenerate them with `node command-center/scripts/top5-prototypes.mjs`.

## 4. Open questions for the founder

1. Approve design `gtp-social-top5@1.0`, and choose format B (recommended) or A.
2. The NFL weekly board publishes a Top 10 for receptions and receiving yards. The post shows its first 5, labelled "Top 5". Is that acceptable, or should it show the full Top 10?
3. Should a site link be added? Captions carry no URL (validator rule; link posts cost more on the X API).
4. Should the Results-graphic template (`gtp-social-results@1.0`) join `DESIGNS` now?
5. NBA, MLB, EPL, UFC and Ligue 1 daily posts stay unavailable until a board is published publicly. NBA needs a decision to publish its Top Boards; that decision belongs to the site, not to the Command Center.
