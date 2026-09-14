/**
 * openfootball club key → the corpus club name every soccer pipeline already uses.
 *
 * The soccer pipelines (Ligue 1 forecasts and their ESPN alias table in leagues.mjs, the Dixon-Coles v2 shadow and
 * its hash-pinned dixon-coles-aliases.mjs, the league backtests) all speak the club names of the corpus they were
 * built on ("Paris SG", "Nott'm Forest", "Ath Bilbao"). Keeping those names when the results source moved to
 * openfootball means no downstream table changes — above all none of the registration-pinned ones.
 *
 * DERIVED, NOT TYPED: on 2026-09-14 every openfootball result in 2022-23 … 2026-27 was joined to the previous corpus
 * by season, score and kickoff (±36h), each club key voted for the corpus name it appeared under, and the join was
 * re-checked by exact (season, home, away) pairing: EPL 1550/1550, Ligue 1 1324/1325 (openfootball lacks 2025-26
 * Nantes v Toulouse), LaLiga 1551/1561 and Serie A 1540/1550 (each lacks ten 2024-25 results), Bundesliga 1242/1242
 * — with zero score disagreements and a median kickoff difference of 0 minutes.
 *
 * Keys come from clubKey() in openfootball.mjs. A club in the corpus window that is missing here is REFUSED by the
 * capture with its name — never guessed. Clubs seen only before 2022-23 (research history) keep their latest
 * openfootball spelling and need no entry.
 */
const t = (entries) => Object.freeze(Object.fromEntries(entries));

export const OPENFOOTBALL_CLUB_NAMES = Object.freeze({
  epl: t([
    ["arsenal", "Arsenal"], ["aston villa", "Aston Villa"], ["bournemouth", "Bournemouth"], ["brentford", "Brentford"],
    ["brighton and hove albion", "Brighton"], ["burnley", "Burnley"], ["chelsea", "Chelsea"], ["coventry city", "Coventry"],
    ["crystal palace", "Crystal Palace"], ["everton", "Everton"], ["fulham", "Fulham"], ["hull city", "Hull"],
    ["ipswich town", "Ipswich"], ["leeds united", "Leeds"], ["leicester city", "Leicester"], ["liverpool", "Liverpool"],
    ["luton town", "Luton"], ["manchester city", "Man City"], ["manchester united", "Man United"], ["newcastle united", "Newcastle"],
    ["nottingham forest", "Nott'm Forest"], ["sheffield united", "Sheffield United"], ["southampton", "Southampton"],
    ["sunderland", "Sunderland"], ["tottenham hotspur", "Tottenham"], ["west ham united", "West Ham"], ["wolverhampton wanderers", "Wolves"],
  ]),
  "ligue-1": t([
    ["aj auxerre", "Auxerre"], ["ajaccio", "Ajaccio"], ["angers sco", "Angers"], ["clermont foot 63", "Clermont"], ["es troyes", "Troyes"],
    ["estac troyes", "Troyes"], ["le havre", "Le Havre"], ["le mans", "Le Mans"], ["lens", "Lens"], ["lille osc", "Lille"],
    ["lorient", "Lorient"], ["metz", "Metz"], ["monaco", "Monaco"], ["montpellier hsc", "Montpellier"], ["nantes", "Nantes"],
    ["ogc nice", "Nice"], ["olympique lyonnais", "Lyon"], ["olympique marseille", "Marseille"], ["paris saint germain", "Paris SG"],
    ["paris", "Paris FC"], ["racing lens", "Lens"], ["saint etienne", "St Etienne"], ["stade brestois", "Brest"], ["stade reims", "Reims"],
    ["stade rennais", "Rennes"], ["strasbourg alsace", "Strasbourg"], ["strasbourg", "Strasbourg"], ["toulouse", "Toulouse"],
  ]),
  laliga: t([
    ["almeria", "Almeria"], ["athletic", "Ath Bilbao"], ["atletico madrid", "Ath Madrid"], ["barcelona", "Barcelona"], ["ca osasuna", "Osasuna"],
    ["cadiz", "Cadiz"], ["celta vigo", "Celta"], ["deportivo alaves", "Alaves"], ["deportivo coruna", "La Coruna"], ["elche", "Elche"],
    ["espanyol barcelona", "Espanol"], ["getafe", "Getafe"], ["girona", "Girona"], ["granada", "Granada"], ["las palmas", "Las Palmas"],
    ["leganes", "Leganes"], ["levante", "Levante"], ["malaga", "Malaga"], ["mallorca", "Mallorca"], ["rayo vallecano madrid", "Vallecano"],
    ["real betis balompie", "Betis"], ["real madrid", "Real Madrid"], ["real oviedo", "Oviedo"], ["real racing santander", "Santander"],
    ["real sociedad futbol", "Sociedad"], ["real valladolid", "Valladolid"], ["sevilla", "Sevilla"], ["valencia", "Valencia"], ["villarreal", "Villarreal"],
  ]),
  "serie-a": t([
    ["acf fiorentina", "Fiorentina"], ["atalanta", "Atalanta"], ["bologna", "Bologna"], ["cagliari", "Cagliari"], ["como", "Como"],
    ["cremonese", "Cremonese"], ["empoli", "Empoli"], ["frosinone", "Frosinone"], ["genoa", "Genoa"], ["hellas verona", "Verona"],
    ["internazionale milano", "Inter"], ["juventus", "Juventus"], ["lazio", "Lazio"], ["lecce", "Lecce"], ["milan", "Milan"], ["monza", "Monza"],
    ["napoli", "Napoli"], ["parma", "Parma"], ["pisa", "Pisa"], ["roma", "Roma"], ["salernitana 1919", "Salernitana"], ["sassuolo", "Sassuolo"],
    ["spezia", "Spezia"], ["torino", "Torino"], ["uc sampdoria", "Sampdoria"], ["udinese", "Udinese"], ["venezia", "Venezia"],
  ]),
  bundesliga: t([
    ["augsburg", "Augsburg"], ["bayer leverkusen", "Leverkusen"], ["bayern munchen", "Bayern Munich"], ["borussia dortmund", "Dortmund"],
    ["borussia monchengladbach", "M'gladbach"], ["darmstadt 98", "Darmstadt"], ["eintracht frankfurt", "Ein Frankfurt"], ["elversberg", "Elversberg"],
    ["freiburg", "Freiburg"], ["fsv mainz", "Mainz"], ["hamburger", "Hamburg"], ["heidenheim 1846", "Heidenheim"], ["hertha bsc", "Hertha"],
    ["holstein kiel", "Holstein Kiel"], ["koln", "FC Koln"], ["paderborn", "Paderborn"], ["rb leipzig", "RB Leipzig"], ["schalke", "Schalke 04"],
    ["st pauli 1910", "St Pauli"], ["tsg hoffenheim", "Hoffenheim"], ["union berlin", "Union Berlin"], ["vfb stuttgart", "Stuttgart"],
    ["vfl bochum 1848", "Bochum"], ["vfl wolfsburg", "Wolfsburg"], ["werder bremen", "Werder Bremen"],
  ]),
});
