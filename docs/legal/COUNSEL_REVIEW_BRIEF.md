# Counsel review brief — GameTimePicks Terms of Use and Privacy Notice

FOR REVIEW · NOT LEGAL ADVICE. Prepared 2026-09-10 for a qualified adviser. Everything the drafts say
about data handling is checked against the code by automated guards; the adviser's job is the law.

## What the site is (repository facts)

- A static, paper-only, **research-and-education** sports-analytics site at gametimepicks.yashwantbalaji.com.
- No wagers, deposits, funds, accounts, logins, payments, ads, or sportsbook links or affiliations.
- No cookies. Visitor analytics are **off**; if switched on they are first-party, cookieless,
  day-granularity counts of a fixed list of interactions, with no IP, device identifier, referrer, or
  session id stored (90-day retention proposed).
- The browser stores reading preferences, followed teams, and a pick slip in local storage, plus one
  session value recording how the visitor arrived.
- Images load from MLB (mlbstatic.com), ESPN (espncdn.com), and NBA (nba.com) servers; hosting is Vercel.
- Support is a mailto link to a Gmail inbox; writing to it shares the sender's address with the operator.

## Founder decisions (2026-09-10)

US-only audience · 18+ · research and education · operator named "GameTime Picks" **as a placeholder** ·
governing state **not yet named**.

## Please review

1. `docs/legal/terms-draft.md` — content hash `a2ea6dbcd25754e373b33dae06d0b0e1d3f8982b5a25a16857de85677a5060b8`
2. `docs/legal/privacy-draft.md` — content hash `2c0d6b1ad8cdaccdd656e2f6ba5e04a591e929a892ab25c8d69f1602027f9564`
3. The live `/responsible-use` page (states 18+ and US, not betting advice, 1-800-GAMBLER).

## Questions for the adviser (packet Part B, verbatim scope)

6. Does publishing paper betting analysis constitute regulated gambling advertising or affiliate activity
   in the US (or in specific states), given no bets are taken and no operator is linked?
7. Is an age gate legally required, and if so what form satisfies it? **Specifically: is 18+ adequate,
   given most US states set the sports-betting age at 21?**
8. What responsible-gambling signposting is mandatory versus advisable?
9. What disclaimer language limits liability for a published record users might act on?
10. What privacy notice is required for cookieless, day-granularity, PII-free counts — is consent needed
    under any US state regime, or are they out of scope as non-personal data?
11. Are there advertising-standards implications in publishing a win/loss record at all?

## How approval is recorded

The approval goes into `app/src/lib/legal/content-manifest.mjs` for each section: reviewer name and
role, approval date, packet version, the content hash above, and an effective date. The page publishes
only when that hash equals the text as it stands and no placeholder or undecided field remains — any
edit after approval changes the hash and locks the page again until re-reviewed.
