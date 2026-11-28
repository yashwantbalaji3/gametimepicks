# The Odds API terms: prices in Bank Builder & Moonshot V2 challenge graphics (2026-11-04)

**Decision:** founder, 2026-11-04 ("FOUNDER APPROVAL — BANK BUILDER & MOONSHOT V2 REAL ODDS AND SOCIAL GRAPHICS"):

> I authorize enabling the NBA social-odds display switch for Bank Builder and Moonshot V2 graphics only.
> The graphics may contain selected verified sportsbook odds, market lines, calculated combined prices, wagers, potential payouts and profits. These are original GameTimePicks analytical graphics, not a standalone odds feed, bulk data export or sportsbook advertisement.
> Document this limited-use interpretation against the provider's current terms. If any specific restriction or conflicting permission is identified, flag it before public distribution.

**Switch:** `app/src/lib/odds/display-authorization.mjs`, field `nba.challengeGraphicsPrices` (surface `challengeGraphics`). The engine's guard is `socialPricesAuthorized()` in `app/src/lib/challenge-lanes/price-display.mjs`.

## Terms reviewed

Source: the-odds-api.com/terms-and-conditions.html, "Last updated: 31 August 2026". The Program Director re-read it on 2026-11-04.

Relevant provisions, paraphrased; see the page for the exact text:

| Provision | What it says | How the challenge graphics stand |
|---|---|---|
| Permitted use | Displaying the data in a UI, website or mobile app, including commercial use, is permitted, and so is calculating and displaying values derived from it. The provider encourages use in "user-facing applications". | A challenge image is a user-facing analytical graphic. It shows a handful of selected prices plus values we derive from them (combined price, payout, profit). |
| Prohibited | Reselling, repackaging or redistributing the data as a standalone data product, including through an API, data feed, downloadable files or any format meant as a raw-data source for others. | Four images a day, a few legs each, is not a raw-data source. The data is not the product being sold. |
| Trademarks | Bookmaker names are used for identification and factual comparison only, never to imply sponsorship. | Graphics name the book in small text. No book logos, no promo codes, no affiliate links. |
| Responsible gambling | Users promoting bookmakers are encouraged to show responsible-gambling messaging and to follow local advertising rules. | We do not promote a bookmaker. A short "21+ · Gamble responsibly" line is still recommended on priced graphics (US audience). |
| Attribution | Not required. | None added. |

## Interpretation (limited use)

Permitted under this decision: rendered PNG challenge graphics and their captions, showing for the lane's own legs:
- the selected verified odds and line;
- the book name;
- the capture time;
- the combined price, tracked stake, potential payout and profit.

The site shows the same values through the existing encrypted display path (`siteDisplay`, 2026-10-29).

## Flags (restrictions or conflicts found)

1. **The existing `socialDisplay` switch was NOT turned on.**
   - It also opens the public social JSON feed (`/data/social/nba/v1/*.json`), a downloadable public data feed. That falls squarely under the prohibited "data feed, downloadable files".
   - A separate, narrower switch (`challengeGraphicsPrices`) was added instead. `socialDisplay` and `socialFeedPrices` stay false.
2. **Social media images are not named in the terms.**
   - They are covered here as a "user-facing application" display of a few derived values. That is the founder's interpretation, recorded above.
   - The provider can revoke a key on suspected redistribution. If the volume or format of priced images ever grows toward a feed (for example, a daily full-slate odds board), re-review it first.
3. **Private storage.** No price JSON, CSV or private snapshot may be committed or published. Price records stay under `GTP_PRIVATE_DATA_DIR`; only the credit ledger is committed.
4. **Same-game legs.** A leg product for same-game legs is an estimate, not a book's offer. Lanes exclude same-game combinations, as the founder decided.
5. **X platform rules** (outside the provider terms; from secondary sources): organic posts with no affiliate links or promo codes appear permitted. Paid gambling promotion needs X approval. None is planned.

No post is authorized by this document. Publishing still needs the founder's approval of each exact package.
