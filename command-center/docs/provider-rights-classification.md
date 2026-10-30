# Sportsbook data on social: rights classification

**Source:** The Odds API terms, https://the-odds-api.com/terms-and-conditions.html, read 2026-10-30. Terms take effect when posted, so re-read them before relying on this. This is an engineering reading, not legal advice. The terms are governed by New South Wales law.

| Use | What the terms say | Class | Social today |
|---|---|---|---|
| Our own forecasts, with no provider data | Not provider data | `MODEL_ONLY` | Allowed, subject to founder approval |
| Values calculated from the data, shown in our product | Permitted | `MODEL_ONLY` on the site | Site only for now: see below |
| Selected lines and prices in websites, apps, dashboards | Permitted, including commercially, when the data isn't the primary product sold | n/a | Not applicable |
| Selected lines and prices in a social graphic | **Not addressed.** Social media appears nowhere in the permitted uses | `QUOTE_ON_SOCIAL` | **Unresolved: blocked** |
| The data as our own API, feed or downloadable files | Prohibited | `RAW_FEED` | Prohibited |
| Sportsbook brand names | The provider uses them for identification and factual comparison; trademarks stay with their owners. This doesn't grant us anything | n/a | Goes with the quote question |
| Attribution | Not required | n/a | No sentence needed for the provider |
| Responsible-gambling messaging | Encouraged if the service is used to promote bookmakers or gambling; compliance with local rules is ours | n/a | Separate legal question below |

**Reading of the open question.** A graphic that shows a few selected quotes on our own account isn't a standalone data product, so the redistribution ban doesn't obviously catch it. But the permitted list names websites, mobile apps and dashboards and stops there, and the provider may terminate for suspected violations. That's ambiguous, not permitted, so real-line variants stay blocked.

**Green/red direction without the quote.** Whether the model is above or below a line is a calculated value, and showing calculated values is permitted. It still reveals market information on social, and the same list doesn't name social. Treated as `QUOTE_ON_SOCIAL` until the provider answers.

**The exact question to ask The Odds API:**
> We use your paid data in our sports analytics website. May we also show selected individual lines and prices (not a dataset, not a feed) inside images on our own social media accounts, alongside our own projections, with our product being the analysis? Does the same apply to a green or red indicator of our projection against a line, with no number shown? Are sportsbook names permitted in those images?

**Separate from the provider terms, and not resolved here:**
- whether state gambling advertising rules or X's own rules require age or helpline wording on real-line graphics;
- whether sportsbooks have any rights in their names or prices beyond what the provider states.

The class is set per package by `contracts/imported-packages.mjs` (`MARKET_RIGHTS`), for NBA and NFL alike.
