// Chainlink Functions script to fetch Super Bowl scores from multiple sources
// This script runs in Chainlink's decentralized oracle network (DON)
//
// Arguments:
//   args[0] = quarter ("1", "2", "3", "4" for Q1, Halftime, Q3, Final)
//   args[1] = gameId (ESPN game ID for Super Bowl LX)
//
// Returns: ABI-encoded (uint8 patriotsScore, uint8 seahawksScore, bool verified)

const quarter = args[0];
const gameId = args[1] || "401547417"; // Default to Super Bowl LX game ID

// Fetch from multiple sources in parallel
const sources = await Promise.allSettled([
  fetchESPN(gameId, quarter),
  fetchYahoo(quarter),
  fetchCBSSports(quarter),
]);

// Extract successful results
const results = sources
  .filter(s => s.status === "fulfilled" && s.value !== null)
  .map(s => s.value);

if (results.length < 2) {
  throw new Error(`Insufficient sources: only ${results.length} responded`);
}

// Check for consensus (at least 2 sources must agree)
const { patriots, seahawks, verified } = findConsensus(results);

if (!verified) {
  throw new Error("No consensus reached between sources");
}

// Encode response: (patriotsScore, seahawksScore, verified)
return Functions.encodeUint256(
  (BigInt(patriots) << 16n) | (BigInt(seahawks) << 8n) | (verified ? 1n : 0n)
);

// ============ Source Fetchers ============

async function fetchESPN(gameId, quarter) {
  try {
    const response = await Functions.makeHttpRequest({
      url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard/${gameId}`,
      timeout: 9000,
    });

    if (response.error) return null;

    const game = response.data;
    const competitors = game.competitions?.[0]?.competitors || [];

    // Find Patriots and Seahawks
    let patriots = null, seahawks = null;
    for (const team of competitors) {
      const name = team.team?.name?.toLowerCase() || "";
      if (name.includes("patriots")) {
        patriots = getQuarterScore(team, quarter);
      } else if (name.includes("seahawks")) {
        seahawks = getQuarterScore(team, quarter);
      }
    }

    if (patriots === null || seahawks === null) return null;

    return { patriots, seahawks, source: "espn" };
  } catch (e) {
    return null;
  }
}

async function fetchYahoo(quarter) {
  try {
    // Yahoo Sports API endpoint (simplified - real implementation would use their official API)
    const response = await Functions.makeHttpRequest({
      url: "https://api-secure.sports.yahoo.com/v1/editorial/s/scoreboard",
      params: {
        leagues: "nfl",
        date: "2026-02-08", // Super Bowl LX date
      },
      timeout: 9000,
    });

    if (response.error) return null;

    const games = response.data?.games || [];
    const superBowl = games.find(g =>
      g.teams?.some(t => t.name?.toLowerCase().includes("patriots")) &&
      g.teams?.some(t => t.name?.toLowerCase().includes("seahawks"))
    );

    if (!superBowl) return null;

    let patriots = null, seahawks = null;
    for (const team of superBowl.teams || []) {
      const name = team.name?.toLowerCase() || "";
      if (name.includes("patriots")) {
        patriots = getYahooQuarterScore(team, quarter);
      } else if (name.includes("seahawks")) {
        seahawks = getYahooQuarterScore(team, quarter);
      }
    }

    if (patriots === null || seahawks === null) return null;

    return { patriots, seahawks, source: "yahoo" };
  } catch (e) {
    return null;
  }
}

async function fetchCBSSports(quarter) {
  try {
    // CBS Sports API (simplified - real implementation would scrape or use official feed)
    const response = await Functions.makeHttpRequest({
      url: "https://www.cbssports.com/api/content/nfl/scoreboard",
      params: {
        date: "20260208", // Super Bowl LX date
      },
      timeout: 9000,
    });

    if (response.error) return null;

    const games = response.data?.games || [];
    const superBowl = games.find(g =>
      (g.homeTeam?.toLowerCase().includes("patriots") || g.awayTeam?.toLowerCase().includes("patriots")) &&
      (g.homeTeam?.toLowerCase().includes("seahawks") || g.awayTeam?.toLowerCase().includes("seahawks"))
    );

    if (!superBowl) return null;

    const patriots = superBowl.homeTeam?.toLowerCase().includes("patriots")
      ? getCBSQuarterScore(superBowl, "home", quarter)
      : getCBSQuarterScore(superBowl, "away", quarter);

    const seahawks = superBowl.homeTeam?.toLowerCase().includes("seahawks")
      ? getCBSQuarterScore(superBowl, "home", quarter)
      : getCBSQuarterScore(superBowl, "away", quarter);

    if (patriots === null || seahawks === null) return null;

    return { patriots, seahawks, source: "cbs" };
  } catch (e) {
    return null;
  }
}

// ============ Helper Functions ============

function getQuarterScore(team, quarter) {
  const linescores = team.linescores || [];
  const q = parseInt(quarter);

  if (q === 1) return linescores[0]?.value ?? null;
  if (q === 2) return (linescores[0]?.value ?? 0) + (linescores[1]?.value ?? 0); // Halftime = Q1 + Q2
  if (q === 3) return (linescores[0]?.value ?? 0) + (linescores[1]?.value ?? 0) + (linescores[2]?.value ?? 0);
  if (q === 4) return parseInt(team.score) || null; // Final

  return null;
}

function getYahooQuarterScore(team, quarter) {
  const q = parseInt(quarter);
  const scores = team.quarterScores || [];

  if (q === 1) return scores[0] ?? null;
  if (q === 2) return (scores[0] ?? 0) + (scores[1] ?? 0);
  if (q === 3) return (scores[0] ?? 0) + (scores[1] ?? 0) + (scores[2] ?? 0);
  if (q === 4) return team.totalScore ?? null;

  return null;
}

function getCBSQuarterScore(game, side, quarter) {
  const q = parseInt(quarter);
  const prefix = side === "home" ? "home" : "away";
  const scores = [
    game[`${prefix}Q1`],
    game[`${prefix}Q2`],
    game[`${prefix}Q3`],
    game[`${prefix}Q4`],
  ];

  if (q === 1) return scores[0] ?? null;
  if (q === 2) return (scores[0] ?? 0) + (scores[1] ?? 0);
  if (q === 3) return (scores[0] ?? 0) + (scores[1] ?? 0) + (scores[2] ?? 0);
  if (q === 4) return scores.reduce((a, b) => (a ?? 0) + (b ?? 0), 0);

  return null;
}

function findConsensus(results) {
  // Group by score combination
  const scoreMap = new Map();

  for (const r of results) {
    const key = `${r.patriots}-${r.seahawks}`;
    if (!scoreMap.has(key)) {
      scoreMap.set(key, { count: 0, patriots: r.patriots, seahawks: r.seahawks, sources: [] });
    }
    const entry = scoreMap.get(key);
    entry.count++;
    entry.sources.push(r.source);
  }

  // Find score with most agreement (minimum 2)
  let best = null;
  for (const entry of scoreMap.values()) {
    if (entry.count >= 2 && (!best || entry.count > best.count)) {
      best = entry;
    }
  }

  if (best) {
    return {
      patriots: best.patriots,
      seahawks: best.seahawks,
      verified: true,
    };
  }

  return { patriots: 0, seahawks: 0, verified: false };
}
