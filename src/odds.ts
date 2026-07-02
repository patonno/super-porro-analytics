export interface MarketOdds {
  teamAWin: number;
  draw: number;
  teamBWin: number;
}

export interface ToQualifyOdds {
  teamAQualify: number;
  teamBQualify: number;
}

// Internal store for live odds fetched from Polymarket API
let livePolymarketOdds: Record<string, number> = {};

let liveMatchOdds: Record<string, { teamA: string, teamB: string, priceA: number, priceB: number }> = {};

export function setPolymarketMatchOdds(pmMatchOdds: Record<string, { teamA: string, teamB: string, priceA: number, priceB: number }>) {
  liveMatchOdds = pmMatchOdds;
}

const PM_TO_APP: Record<string, string> = {
  "Spain": "Espana",
  "New Zealand": "N. Zelanda",
  "Switzerland": "Suiza",
  "England": "Inglaterra",
  "France": "Francia",
  "South Korea": "Corea del Sur",
  "Haiti": "Haiti",
  "Brazil": "Brasil",
  "Jordan": "Jordania",
  "Curaçao": "Curazao",
  "Argentina": "Argentina",
  "Germany": "Alemania",
  "Colombia": "Colombia",
  "Iran": "Iran",
  "Portugal": "Portugal",
  "Ghana": "Ghana",
  "Netherlands": "Paises Bajos",
  "Algeria": "Argelia",
  "Bosnia-Herzegovina": "Bosnia y Herz.",
  "Bosnia and Herzegovina": "Bosnia y Herz.",
  "Italy": "Italia",
  "USA": "Est. Unidos",
  "United States": "Est. Unidos",
  "Canada": "Canada",
  "Turkiye": "Turquia",
  "Uruguay": "Uruguay",
  "Mexico": "Mexico",
  "Paraguay": "Paraguay",
  "Scotland": "Escocia",
  "Peru": "Peru",
  "Japan": "Japon",
  "Norway": "Noruega",
  "Tunisia": "Tunez",
  "Ecuador": "Ecuador",
  "Uzbekistan": "Uzbekistan",
  "Morocco": "Marruecos",
  "Panama": "Panama",
  "Iraq": "Irak",
  "South Africa": "Sudafrica",
  "Senegal": "Senegal",
  "Ivory Coast": "C. de Marfil",
  "Côte d'Ivoire": "C. de Marfil",
  "Congo DR": "RD Congo",
  "DR Congo": "RD Congo",
  "Cape Verde": "Cabo Verde",
  "Cabo Verde": "Cabo Verde",
  "Czechia": "Rep. Checa",
  "Qatar": "Catar",
  "Belgium": "Belgica",
  "Australia": "Australia",
  "Saudi Arabia": "Arabia Saudi",
  "Austria": "Austria",
  "Croatia": "Croacia",
  "Egypt": "Egipto",
  "Sweden": "Suecia",
};

/**
 * Initializes the Polymarket odds mapping
 */
export function setPolymarketOdds(pmOdds: Record<string, number>) {
  for (const [pmName, prob] of Object.entries(pmOdds)) {
    const appName = PM_TO_APP[pmName];
    if (appName) {
      livePolymarketOdds[appName] = prob;
    }
  }
}

// Fallback baseline for teams with unknown odds (assume 0.001 probability of winning it all)
const getProb = (team: string) => livePolymarketOdds[team] || 0.001;

/**
 * Calculates "To Qualify" or "To Advance" probabilities for elimination matches,
 * which cannot end in a draw, based on exact match odds or Polymarket World Cup Winner probabilities.
 */
export function getToQualifyChance(teamA: string, teamB: string): ToQualifyOdds {
  // Check if we have explicit match odds
  for (const match of Object.values(liveMatchOdds)) {
    const tA = PM_TO_APP[match.teamA];
    const tB = PM_TO_APP[match.teamB];
    if (tA === teamA && tB === teamB) {
      return {
        teamAQualify: Math.round(match.priceA * 100),
        teamBQualify: Math.round(match.priceB * 100)
      };
    }
    if (tA === teamB && tB === teamA) {
      return {
        teamAQualify: Math.round(match.priceB * 100),
        teamBQualify: Math.round(match.priceA * 100)
      };
    }
  }

  // Fallback to BT model using winner odds
  const pA = getProb(teamA);
  const pB = getProb(teamB);
  
  const sum = pA + pB;
  // If both have 0 or very small equal chance, default to 50/50
  const chanceA = sum > 0 ? pA / sum : 0.5;
  
  const teamAQualify = Math.round(chanceA * 100);
  const teamBQualify = 100 - teamAQualify;
  
  return {
    teamAQualify,
    teamBQualify
  };
}

/**
 * Calculates regular-time win, draw, loss probabilities.
 */
export function getPredictionMarketOdds(teamA: string, teamB: string): MarketOdds {
  const qual = getToQualifyChance(teamA, teamB);
  const chanceA = qual.teamAQualify / 100;
  
  // Draw probability peaks at 26% when teams are equal, decays as strength difference increases
  const diff = Math.abs(chanceA - 0.5);
  let pDraw = 0.26 * (1 - 4 * (diff * diff));
  if (pDraw < 0) pDraw = 0;
  
  // Re-scale win probabilities with remaining probability after draw
  const remaining = 1 - pDraw;
  const finalPA = chanceA * remaining;
  
  // Convert to percentages that sum to exactly 100
  let teamAWinPct = Math.round(finalPA * 100);
  let drawPct = Math.round(pDraw * 100);
  let teamBWinPct = 100 - teamAWinPct - drawPct;
  
  // Prevent rounding edge cases from causing negative percentages
  if (teamBWinPct < 0) {
    teamBWinPct = 0;
  }
  
  return {
    teamAWin: teamAWinPct,
    draw: drawPct,
    teamBWin: teamBWinPct
  };
}
