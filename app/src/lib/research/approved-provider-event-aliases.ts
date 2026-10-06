/**
 * The provider event aliases the founder approved for research re-admission (Yash, 2026-10-06 00:31Z, "Option A,
 * Strict 74").
 *
 * Each pair is (foreign providerEventId, the one gamePk it is). It is copied from MLB's alias receipt
 * (`data/internal/mlb/reference/provider-event-aliases.json`, schema `mlb-provider-event-aliases-1`). Every pair
 * passed MLB's six deterministic rules and was also listed, with the same clubs and start, in the provider's own daily
 * event listing for that date. A foreign row returns to research only when MLB's receipt AND this list both name that
 * exact pair (row-lineage-loader.ts `approvedReadmissions`). A new receipt can therefore never widen re-admission by
 * itself: adding a pair here is a reviewed change.
 *
 * Re-admission is research-label only. Public picks, settlement, the Forecast Ledger and published results do not read
 * this list.
 */
export const APPROVED_PROVIDER_EVENT_ALIASES: readonly (readonly [string, number])[] = [
  ["1c02a0524bf42a304b0b1cf019ea12c8", 822949], // 2026-07-28 Texas Rangers @ Tampa Bay Rays, 2 rows
  ["83b4bc6720bc5b4953002ee5327e881d", 823026], // 2026-07-28 Chicago Cubs @ St. Louis Cardinals, 256 rows
  ["8fa2b64a3a88b00af2cc037c70eaed6e", 823676], // 2026-07-28 Kansas City Royals @ Minnesota Twins, 2 rows
  ["6fb81f375a5fc10737ecb85381f1ac0b", 824569], // 2026-07-28 New York Yankees @ Chicago White Sox, 4 rows
  ["9c77a3a4edfe3bf897bbe0330b1edbb7", 824084], // 2026-08-04 Minnesota Twins @ Kansas City Royals, 273 rows
  ["c242db575b7b666cd549f31569266d89", 824403], // 2026-08-04 New York Mets @ Cleveland Guardians, 258 rows
  ["00828e81b6bef980ada2777528d99f93", 824731], // 2026-08-04 Chicago White Sox @ Boston Red Sox, 4 rows
  ["b78e7c3194121b22ad94556a6db3048c", 824888], // 2026-08-04 Miami Marlins @ Atlanta Braves, 2 rows
  ["3cf7e6e67663cb95cf7840aeb10f3020", 824482], // 2026-08-05 Athletics @ Cincinnati Reds, 268 rows
  ["b16edbe527767ab334db0995f39c8a5d", 823349], // 2026-08-07 New York Mets @ Pittsburgh Pirates, 270 rows
  ["cd7a442939785b6d6b84212d352d5f62", 823836], // 2026-08-07 Los Angeles Angels @ Miami Marlins, 270 rows
  ["254ca63a4cce98af560e2a7fa7b64551", 822701], // 2026-08-08 Cincinnati Reds @ Washington Nationals, 241 rows
  ["ac5e921307945f0cd2dcd651f4209604", 823752], // 2026-08-08 Minnesota Twins @ Milwaukee Brewers, 237 rows
  ["f55697bcdc0241e9015625a0b5281355", 824079], // 2026-08-08 Chicago Cubs @ Kansas City Royals, 271 rows
  ["af25489423425fb7619de2e178b46bc0", 822780], // 2026-08-10 Boston Red Sox @ Toronto Blue Jays, 263 rows
  ["4a90a077ddd83a66ffc796851a64a7ac", 824887], // 2026-08-10 New York Mets @ Atlanta Braves, 246 rows
  ["ecc0c12601956f4d4217883a9c7ca7ca", 823512], // 2026-08-11 Seattle Mariners @ New York Yankees, 2 rows
  ["2acdb349dc48b0b151d3ecf05b134e88", 824240], // 2026-08-11 Cleveland Guardians @ Detroit Tigers, 247 rows
  ["ef65849259f26e9d34360ce6755ee236", 822698], // 2026-08-12 Chicago Cubs @ Washington Nationals, 250 rows
  ["f6f17db1f13670f04ec571027601d33c", 823833], // 2026-08-12 Pittsburgh Pirates @ Miami Marlins, 268 rows
  ["f1e49b28e98e693eaa5d5a27c58ece19", 822942], // 2026-08-14 Baltimore Orioles @ Tampa Bay Rays, 243 rows
  ["cb69b5e66b3d1c6129ed75513c2e5de0", 824237], // 2026-08-14 Chicago White Sox @ Detroit Tigers, 270 rows
  ["2124d4bb5569819a30020e5b907ca202", 824479], // 2026-08-14 Miami Marlins @ Cincinnati Reds, 262 rows
  ["f3659cdd72f761a2763f92483ca59b6e", 824643], // 2026-08-14 St. Louis Cardinals @ Chicago Cubs, 256 rows
  ["dbbb481a063336e996454ea669238bf7", 822775], // 2026-08-15 New York Yankees @ Toronto Blue Jays, 247 rows
  ["79741766452af66a44a3ea604d9c3e43", 823588], // 2026-08-15 Washington Nationals @ New York Mets, 2 rows
  ["96401141a6a40b437d7e705946993a7b", 824400], // 2026-08-15 San Diego Padres @ Cleveland Guardians, 271 rows
  ["f7e02d88c3c8adff188802734b303bb7", 823343], // 2026-08-17 Detroit Tigers @ Pittsburgh Pirates, 240 rows
  ["d959d72a9bedf8bf352ced6c59eee454", 823427], // 2026-08-17 Miami Marlins @ Philadelphia Phillies, 269 rows
  ["e8bcfb6024c2cbac0531a6a70933b0f0", 823589], // 2026-08-17 San Diego Padres @ New York Mets, 4 rows
  ["35b8e20be878e657d78dad6bea7642dc", 824725], // 2026-08-17 Arizona Diamondbacks @ Boston Red Sox, 265 rows
  ["891013ebeed8b3769cf5a80f9ff242a1", 824394], // 2026-08-19 San Francisco Giants @ Cleveland Guardians, 2 rows
  ["a889ec328e20424c875cd7f4c5f12ac1", 823420], // 2026-08-21 St. Louis Cardinals @ Philadelphia Phillies, 269 rows
  ["c3be44cb6d56f79e2cd298812a7f7624", 823510], // 2026-08-21 Toronto Blue Jays @ New York Yankees, 257 rows
  ["c7e232240c764a7cc09ae780b3289626", 823746], // 2026-08-21 Atlanta Braves @ Milwaukee Brewers, 274 rows
  ["9a3a05b0699b94aa59ea0048eb3a31ea", 823830], // 2026-08-21 Washington Nationals @ Miami Marlins, 251 rows
  ["c12f319c29358a2c3e02be8f3377ded9", 824721], // 2026-08-21 San Francisco Giants @ Boston Red Sox, 74 rows
  ["b5df91df571dbd961d2781f345abe770", 824235], // 2026-08-24 Tampa Bay Rays @ Detroit Tigers, 253 rows
  ["587e76b251f060a951bfa47ee07cf6ac", 822773], // 2026-08-25 Kansas City Royals @ Toronto Blue Jays, 76 rows
  ["5adabe1a546de0ad6f64e2789b2b8f8d", 823585], // 2026-08-25 Milwaukee Brewers @ New York Mets, 263 rows
  ["209f31db8e00b79cd7185e2e0d10d825", 823826], // 2026-08-25 Boston Red Sox @ Miami Marlins, 273 rows
  ["d7bed76714eb2b887f979d5156f6863c", 824881], // 2026-08-25 Los Angeles Dodgers @ Atlanta Braves, 2 rows
  ["1d34c8ba40aec1ca9cadb1ff7ef37e42", 822691], // 2026-08-28 Miami Marlins @ Washington Nationals, 261 rows
  ["bb28f14c5f48561498ab3fabd1ebf47b", 824231], // 2026-08-28 Los Angeles Dodgers @ Detroit Tigers, 266 rows
  ["fab839164ecf4aec65df50e5ee9bbed3", 824396], // 2026-08-28 Kansas City Royals @ Cleveland Guardians, 240 rows
  ["6e66851b93b3cdcc4578b23ae9b93d6d", 824877], // 2026-08-28 Colorado Rockies @ Atlanta Braves, 2 rows
  ["bf03cc7b1d68cf11be4a1b5a7f3aee73", 822770], // 2026-08-29 Seattle Mariners @ Toronto Blue Jays, 6 rows
  ["36793e7e4ba4b8f8902fb3b7f99c3083", 823011], // 2026-08-29 Pittsburgh Pirates @ St. Louis Cardinals, 226 rows
  ["263ea76f8b365e6d8c84baff2fab2b70", 823582], // 2026-08-29 Houston Astros @ New York Mets, 2 rows
  ["c3af289a1433ac426961691deab41154", 823823], // 2026-09-05 Chicago Cubs @ Miami Marlins, 256 rows
  ["9bff8c9d21336a9f547bec785afbb238", 824389], // 2026-09-05 Detroit Tigers @ Cleveland Guardians, 231 rows
  ["0902d8258427af19994e87abb3519262", 823742], // 2026-09-07 Chicago Cubs @ Milwaukee Brewers, 8 rows
  ["4645b2d34e3503155b3ff308836621dc", 823820], // 2026-09-07 New York Mets @ Miami Marlins, 271 rows
  ["b4745820fda1c660f277b88a71e25596", 824062], // 2026-09-07 Arizona Diamondbacks @ Kansas City Royals, 4 rows
  ["a410afcc86bee1b6cbe7e60eafd8d50e", 824229], // 2026-09-07 Minnesota Twins @ Detroit Tigers, 244 rows
  ["22430c880f9e9118f74aacf0b720b7ee", 824715], // 2026-09-07 Los Angeles Angels @ Boston Red Sox, 2 rows
  ["0a5522c3b427e5162e8c13c1ddb05dd7", 824793], // 2026-09-07 Cleveland Guardians @ Baltimore Orioles, 263 rows
  ["2c93c46c050aa7c593f71d0b3fa569fe", 824631], // 2026-09-11 Pittsburgh Pirates @ Chicago Cubs, 265 rows
  ["a34743d79cd5b394262c790c11e888a2", 822768], // 2026-09-12 Baltimore Orioles @ Toronto Blue Jays, 223 rows
  ["119e7c7799ddcc034a09522f5abe00ba", 823170], // 2026-09-12 San Diego Padres @ San Francisco Giants, 6 rows
  ["ff08b7b349f719f151912ec3a9a09257", 823496], // 2026-09-12 New York Mets @ New York Yankees, 263 rows
  ["964e45be7256059f585689e2580e6e87", 823819], // 2026-09-12 Los Angeles Dodgers @ Miami Marlins, 2 rows
  ["c63a7d48eec7289e56b5115bf9fcb09e", 824224], // 2026-09-12 Colorado Rockies @ Detroit Tigers, 267 rows
  ["faaa421be783eb6c7c0a7508f6d200a8", 824712], // 2026-09-12 Kansas City Royals @ Boston Red Sox, 2 rows
  ["6f154c72fa0631ec5a970f84c1492463", 823575], // 2026-09-14 Baltimore Orioles @ New York Mets, 4 rows
  ["2a828119814add28306d706ccb802ac3", 824386], // 2026-09-14 Chicago White Sox @ Cleveland Guardians, 242 rows
  ["fd0c792d70a4325cb16c03c7af9a089a", 824465], // 2026-09-14 Los Angeles Dodgers @ Cincinnati Reds, 260 rows
  ["f6f64c128ccbed0075d0f180def1fb56", 824788], // 2026-09-19 Milwaukee Brewers @ Baltimore Orioles, 249 rows
  ["3e7090629723a062facffeca147d8c9d", 824221], // 2026-09-21 Washington Nationals @ Detroit Tigers, 271 rows
  ["198233ed5390fadb40e84cac794551ab", 824787], // 2026-09-21 Toronto Blue Jays @ Baltimore Orioles, 260 rows
  ["80d706190519a0e4956a64e84e72ed94", 822681], // 2026-09-25 New York Mets @ Washington Nationals, 241 rows
  ["890be5ce6e3ea3d7c6f0b76bd9a0e45a", 822760], // 2026-09-25 Cincinnati Reds @ Toronto Blue Jays, 237 rows
  ["c067c47b7d8f62f37eeeaba15f35ae55", 823813], // 2026-09-26 Atlanta Braves @ Miami Marlins, 220 rows
  ["f6f4976b029249f664cf53c32044f64a", 824219], // 2026-09-26 Pittsburgh Pirates @ Detroit Tigers, 263 rows
];

/**
 * Pass all six rules but are absent from the provider's daily listing (a once-a-day snapshot). Yash: keep them
 * excluded for now; never infer them from name or time similarity. Listed so a test can prove they stay out.
 */
export const EXCLUDED_UNCONFIRMED_PROVIDER_EVENT_ALIASES: readonly (readonly [string, number])[] = [
  ["d5f05941c82f5ea7de7ee32d879c0d59", 823431], // 2026-08-03 Washington Nationals @ Philadelphia Phillies, 258 rows
  ["74ae10226cb75552e9cb91f8488d161e", 823520], // 2026-08-03 St. Louis Cardinals @ New York Yankees, 263 rows
  ["a6d63d072ba391db5be1a628a064656c", 824638], // 2026-08-28 Cincinnati Reds @ Chicago Cubs, 235 rows
];
