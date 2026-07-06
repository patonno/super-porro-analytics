import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  User, 
  Search, 
  Calendar, 
  RefreshCw, 
  XCircle, 
  ChevronRight,
  Award,
  Users,
  Compass,
  ArrowRight,
  TrendingUp,
  Sparkles,
  AlertCircle,
  Eye,
  CheckCircle2,
  ChevronDown
} from "lucide-react";
import { Entry, RealData, ParticipantScore, Groups } from "./types";
import { GD, flagUrl, KNOCKOUT_SCHEDULE, BRACKET_R32_TO_R16, BRACKET_R16_TO_QF, BRACKET_QF_TO_SF } from "./data";
import { scorePublicEntry, getEntryQualifiers, normalizeTeamList, deriveBracketRound } from "./utils";
import { getPredictionMarketOdds, getToQualifyChance, setPolymarketOdds, setPolymarketMatchOdds } from "./odds";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

// Helper to parse date string like "12/06 19:00" to sortable number
const parseScheduleToNumber = (sched: string): number => {
  if (!sched || sched === "TBD") return 9999999999;
  const parts = sched.split(" ");
  if (parts.length < 2) return 9999999999;
  const [datePart, timePart] = parts;
  const [day, month] = datePart.split("/");
  const [hour, minute] = timePart.split(":");
  return (
    parseInt(month || "0") * 1000000 +
    parseInt(day || "0") * 10000 +
    parseInt(hour || "0") * 100 +
    parseInt(minute || "0")
  );
};



// Helper to get predictions array for a knockout stage
const getPredictionSetForRound = (entry: Entry | null, roundId: string): string[] => {
  if (!entry) return [];
  const cleanRoundId = roundId.toLowerCase();
  
  if (cleanRoundId === "r32") {
    const uObj = entry.knockout?.r16 || {};
    return Array.isArray(uObj) ? uObj : Object.values(uObj);
  } else if (cleanRoundId === "r16") {
    const uObj = entry.knockout?.r8 || {};
    return Array.isArray(uObj) ? uObj : Object.values(uObj);
  } else if (cleanRoundId === "r8" || cleanRoundId === "qf") {
    const uObj = entry.knockout?.r4 || {};
    return Array.isArray(uObj) ? uObj : Object.values(uObj);
  } else if (cleanRoundId === "r4" || cleanRoundId === "sf") {
    const uObj = entry.knockout?.r2 || {};
    return Array.isArray(uObj) ? uObj : Object.values(uObj);
  } else if (cleanRoundId === "r2" || cleanRoundId === "final") {
    const uObj = entry.knockout?.r2 || {};
    return Array.isArray(uObj) ? uObj : Object.values(uObj);
  }
  return [];
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [porras, setPorras] = useState<Entry[]>([]);
  const [realResults, setRealResults] = useState<RealData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchSearchQuery, setMatchSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<Entry | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // For the Head-to-Head Comparison rival selection
  const [compareUser, setCompareUser] = useState<Entry[] | any>(null);

  // Selected upcoming match for scenario analysis
  const [selectedUpcomingMatchId, setSelectedUpcomingMatchId] = useState<string | null>(null);
  
  // Custom views for Predictions & Head-to-Head Duel
  const [comparisonTab, setComparisonTab] = useState<"groups" | "knockout">("groups");
  const [knockoutStageTab, setKnockoutStageTab] = useState<"r32" | "r16" | "r8" | "r4" | "final">("r32");
  const [hasInitializedDefaults, setHasInitializedDefaults] = useState(false);

  // Stage Simulation States
  const [simRival, setSimRival] = useState<Entry | null>(null);
  const [simScenario, setSimScenario] = useState<"optimal" | "probable">("optimal");
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);
  const [isSimPlaying, setIsSimPlaying] = useState(true);
  const [simSteps, setSimSteps] = useState<any[]>([]);
  const [simCurrentStep, setSimCurrentStep] = useState(0);

  // Helper to get knockout teams for stages after R32
  const getKnockoutTeams = (entry: Entry | null, ukoKey: "r16" | "r8" | "r4" | "r2"): string[] => {
    if (!entry || !entry.knockout) return [];
    return normalizeTeamList(entry.knockout[ukoKey]);
  };

  // Helper to get dynamic R32 teams from group stage predictions
  const getR32Teams = (entry: Entry | null): string[] => {
    if (!entry) return [];
    const quals = getEntryQualifiers(entry.grupos || {});
    const userR16: string[] = [];
    quals.forEach((p) => {
      if (p.a) userR16.push(p.a);
      if (p.b) userR16.push(p.b);
    });
    return userR16.filter(Boolean);
  };

  // Fetch all live data from server API (I need this to commit agane)
  const fetchData = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    try {
      const res = await fetch("/api/league-data");
      const data = await res.json();
      if (data.success) {
        if (data.polymarketOdds) {
          setPolymarketOdds(data.polymarketOdds);
        }
        if (data.pmMatchOdds) {
          setPolymarketMatchOdds(data.pmMatchOdds);
        }
        setPorras(data.porras || []);
        const patchedRealResults = data.realResults
          ? {
              ...data.realResults,
              knockout: {
                ...data.realResults.knockout,
                r8: data.realResults.knockout?.r8
                  ? data.realResults.knockout.r8.includes("Argentina")
                    ? data.realResults.knockout.r8
                    : [...data.realResults.knockout.r8, "Argentina"]
                  : ["Argentina"],
              },
            }
          : null;
        setRealResults(patchedRealResults);
        setError(null);
      } else {
        throw new Error(data.error || "Failed to load league data");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching league data");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Scored participants
  const scoredParticipants = useMemo((): ParticipantScore[] => {
    if (!porras.length) return [];
    
    const activeGrupos = realResults?.grupos || {};
    const activeKnockout = realResults?.knockout || {};

    return porras.map((entry) => {
      const scoring = scorePublicEntry(entry, activeKnockout, activeGrupos);
      return {
        nombre: entry.nombre,
        pts: scoring.pts,
        bk: scoring.bk,
        paid: true
      };
    }).sort((a, b) => b.pts - a.pts || a.nombre.localeCompare(b.nombre));
  }, [porras, realResults]);

  // Find Roberto P. index and score
  const robertoScore = useMemo(() => {
    const index = scoredParticipants.findIndex(p => p.nombre.toLowerCase().includes("roberto p"));
    if (index === -1) return null;
    return {
      rank: index + 1,
      data: scoredParticipants[index],
      entry: porras.find(e => e.nombre.toLowerCase().includes("roberto p")) || null
    };
  }, [scoredParticipants, porras]);

  // Calculate the average points for each phase of the cup across all participants
  const stageAverages = useMemo(() => {
    if (!scoredParticipants.length) return null;
    const count = scoredParticipants.length;
    let totalGrupos = 0;
    let totalR16 = 0;
    let totalR8 = 0;
    let totalR4 = 0;
    let totalR2 = 0;
    let totalFinal = 0;
    let totalPichi = 0;

    for (const p of scoredParticipants) {
      totalGrupos += p.bk?.grupos || 0;
      totalR16 += p.bk?.r16 || 0;
      totalR8 += p.bk?.r8 || 0;
      totalR4 += p.bk?.r4 || 0;
      totalR2 += p.bk?.r2 || 0;
      totalFinal += p.bk?.final || 0;
      totalPichi += p.bk?.pichi || 0;
    }

    return {
      grupos: Math.round((totalGrupos / count) * 10) / 10,
      r16: Math.round((totalR16 / count) * 10) / 10,
      r8: Math.round((totalR8 / count) * 10) / 10,
      r4: Math.round((totalR4 / count) * 10) / 10,
      r2: Math.round((totalR2 / count) * 10) / 10,
      final: Math.round((totalFinal / count) * 10) / 10,
      pichi: Math.round((totalPichi / count) * 10) / 10,
    };
  }, [scoredParticipants]);

  // Set default comparison user & stage once league data is loaded
  useEffect(() => {
    if (porras.length && scoredParticipants.length && !hasInitializedDefaults) {
      // 1. Determine compare user: Leader, or closest rival if I am the leader
      const isRobertoLeader = scoredParticipants[0]?.nombre.toLowerCase().includes("roberto p");
      let defaultRival: ParticipantScore | null = null;
      if (isRobertoLeader) {
        // Roberto P is leader, so default is closest rival (index 1)
        defaultRival = scoredParticipants[1] || null;
      } else {
        // Someone else is leader, so default is the leader (index 0)
        defaultRival = scoredParticipants[0] || null;
      }

      if (defaultRival) {
        const entry = porras.find(e => e.nombre === defaultRival.nombre);
        if (entry) {
          setCompareUser(entry);
          setSimRival(entry);
        }
      }

      // 2. Determine current stage to set as default view
      if (realResults) {
        const ko = realResults.knockout || {};
        const finalObj = ko.final || {} as { champ?: string; sub?: string; third?: string };
        const pichiObj = ko.pichi || {} as { world?: string; esp?: string };
        const hasFinalResults = !!(finalObj.champ || finalObj.sub || finalObj.third || pichiObj.world || pichiObj.esp);
        const numR16 = Array.isArray(ko.r16) ? ko.r16.filter(Boolean).length : 0;
        const numR8 = Array.isArray(ko.r8) ? ko.r8.filter(Boolean).length : 0;
        const numR4 = Array.isArray(ko.r4) ? ko.r4.filter(Boolean).length : 0;
        const numR2 = Array.isArray(ko.r2) ? ko.r2.filter(Boolean).length : 0;

        if (numR16 >= 32) {
          // We have entered the knockout stages
          setComparisonTab("knockout");
          
          if (hasFinalResults) {
            setKnockoutStageTab("final");
          } else if (numR8 < 16) {
            // Currently playing Round of 32, qualifying for Round of 16
            setKnockoutStageTab("r16");
          } else if (numR4 < 8) {
            // Currently playing Round of 16, qualifying for Quarterfinals
            setKnockoutStageTab("r8");
          } else if (numR2 < 4) {
            // Currently playing Quarterfinals, qualifying for Semis
            setKnockoutStageTab("r4");
          } else {
            // All matches played up to Semis, showing finals & scorers
            setKnockoutStageTab("final");
          }
        } else {
          // Still in group stage
          setComparisonTab("groups");
        }
      }

      setHasInitializedDefaults(true);
    }
  }, [porras, scoredParticipants, realResults, hasInitializedDefaults]);

  // Group stage progress
  const groupProgress = useMemo(() => {
    if (!realResults?.grupos) return { played: 0, total: 72, percent: 0 };
    let played = 0;
    Object.keys(GD).forEach((g) => {
      GD[g].forEach((_, i) => {
        const sc = realResults.grupos[`${g}-${i}`];
        if (sc && sc.h !== "" && sc.h !== undefined && sc.a !== "" && sc.a !== undefined) {
          played++;
        }
      });
    });
    return {
      played,
      total: 72,
      percent: Math.round((played / 72) * 100)
    };
  }, [realResults]);

  // Helper to calculate score of a single prediction vs real
  const getPointsForMatch = (pred: { h: string; a: string } | undefined, actual: { h: string; a: string } | undefined) => {
    if (!pred || !actual || actual.h === "" || actual.a === "" || actual.h === undefined || actual.a === undefined) {
      return null; // Pending
    }
    const rh = parseInt(actual.h);
    const ra = parseInt(actual.a);
    const uh = parseInt(pred.h);
    const ua = parseInt(pred.a);
    if (isNaN(rh) || isNaN(ra) || isNaN(uh) || isNaN(ua)) return 0;
    
    if (rh === uh && ra === ua) return 5;
    
    const rr = rh > ra ? "H" : rh < ra ? "A" : "E";
    const ur = uh > ua ? "H" : uh < ua ? "A" : "E";
    if (rr === ur) return 2;
    
    return 0;
  };

  // Filtered match list for integrated table
  const filteredMatches = useMemo(() => {
    const list: { g: string; m: [string, string]; matchId: string }[] = [];
    Object.keys(GD).forEach((g) => {
      GD[g].forEach((m, i) => {
        const matchId = `${g}-${i}`;
        if (
          m[0].toLowerCase().includes(matchSearchQuery.toLowerCase()) ||
          m[1].toLowerCase().includes(matchSearchQuery.toLowerCase()) ||
          g.toLowerCase().includes(matchSearchQuery.toLowerCase())
        ) {
          list.push({ g, m, matchId });
        }
      });
    });
    return list;
  }, [matchSearchQuery]);

  // Compute upcoming matches list
  const upcomingMatches = useMemo(() => {
    // 1. Group Stage matches
    const groupList: { type: "group"; g: string; m: [string, string]; matchId: string; dateStr: string; sortKey: number }[] = [];
    Object.keys(GD).forEach((g) => {
      GD[g].forEach((m, i) => {
        const matchId = `${g}-${i}`;
        const realScore = realResults?.grupos?.[matchId];
        const isPlayed = realScore && realScore.h !== "" && realScore.a !== "" && realScore.h !== undefined && realScore.a !== undefined;
        if (!isPlayed) {
          const dateStr = "TBD";
          const sortKey = parseScheduleToNumber(dateStr);
          groupList.push({ type: "group", g, m, matchId, dateStr, sortKey });
        }
      });
    });

    if (groupList.length > 0) {
      return groupList.sort((a, b) => a.sortKey - b.sortKey);
    }

    // 2. Elimination Stage matches (since group stage is 100% completed!)
    type ElimMatch = { type: "elim"; g: string; m: [string, string]; matchId: string; dateStr: string; sortKey: number };
    const elimList: ElimMatch[] = [];
    
    // Helper: derive round matchups from bracket progression
    const deriveRound = (
      prevMatchups: { matchId: string; teams: [string, string] }[],
      advancedTeams: string[],
      bracket: Record<string, number>,
      roundLabel: string,
      matchIdPrefix: string,
      numMatches: number
    ): ElimMatch[] => {
      const pairs = deriveBracketRound(prevMatchups, advancedTeams, bracket, numMatches);
      return pairs.map(([t1, t2], i) => {
        const matchId = `${matchIdPrefix}-${i}`;
        const dStr = KNOCKOUT_SCHEDULE[matchId] || "TBD";
        return {
          type: "elim",
          g: roundLabel,
          m: [t1, t2],
          matchId,
          dateStr: dStr,
          sortKey: parseScheduleToNumber(dStr)
        };
      });
    };
    
    // Determine which elimination round is currently active
    const r16Real = normalizeTeamList(realResults?.knockout?.r16); // 32 teams in Round of 32 (16avos)
    const r8 = normalizeTeamList(realResults?.knockout?.r8);     // 16 teams in Round of 16 (octavos)
    const r4 = normalizeTeamList(realResults?.knockout?.r4);     // 8 teams in Cuartos (Quarterfinals)
    const r2 = normalizeTeamList(realResults?.knockout?.r2);     // 4 teams in Semis (Semifinals)
    
    // R32 matchups derived from group results (always needed for bracket progression)
    const r32Matchups = getEntryQualifiers(realResults?.grupos || {});
    
    if (r8.length < 16) {
      // Round of 32 is active
      r32Matchups.forEach(({ m, a, b }) => {
        const isPlayed = r8.includes(a) || r8.includes(b);
        if (!isPlayed) {
          const dStr = KNOCKOUT_SCHEDULE[m] || "TBD";
          elimList.push({
            type: "elim", g: "R32", m: [a, b], matchId: m,
            dateStr: dStr, sortKey: parseScheduleToNumber(dStr)
          });
        }
      });
    } else {
      // Derive R16 matchups from R32 bracket
      const r16Matchups = deriveRound(
        r32Matchups.map(({ m, a, b }) => ({ matchId: m, teams: [a, b] as [string, string] })),
        r8, BRACKET_R32_TO_R16, "R16", "R16", 8
      );
      
      if (r4.length < 8) {
        // Round of 16 is active
        r16Matchups.forEach(m => {
          const isPlayed = r4.includes(m.m[0]) || r4.includes(m.m[1]);
          if (!isPlayed) elimList.push(m);
        });
      } else {
        // Derive QF matchups from R16 bracket
        const qfMatchups = deriveRound(
          r16Matchups.map(m => ({ matchId: m.matchId, teams: m.m })),
          r4, BRACKET_R16_TO_QF, "QF", "QF", 4
        );
        
        if (r2.length < 4) {
          // Quarterfinals are active
          qfMatchups.forEach(m => {
            const isPlayed = r2.includes(m.m[0]) || r2.includes(m.m[1]);
            if (!isPlayed) elimList.push(m);
          });
        } else {
          // Derive SF matchups from QF bracket
          const sfMatchups = deriveRound(
            qfMatchups.map(m => ({ matchId: m.matchId, teams: m.m })),
            r2, BRACKET_QF_TO_SF, "SF", "SF", 2
          );
          
          // Semifinals are active
          const finalObj = realResults?.knockout?.final || { champ: "", sub: "" };
          sfMatchups.forEach(m => {
            const isPlayed = finalObj.champ === m.m[0] || finalObj.champ === m.m[1]
                          || finalObj.sub === m.m[0] || finalObj.sub === m.m[1];
            if (!isPlayed) elimList.push(m);
          });
        }
      }
    }

    return elimList.sort((a, b) => a.sortKey - b.sortKey);
  }, [realResults]);

  // Set default selected upcoming match ID
  useEffect(() => {
    if (upcomingMatches.length) {
      // If the selected match is not in the upcoming list, update it to the first upcoming
      if (!selectedUpcomingMatchId || !upcomingMatches.some(m => m.matchId === selectedUpcomingMatchId)) {
        setSelectedUpcomingMatchId(upcomingMatches[0].matchId);
      }
    } else {
      setSelectedUpcomingMatchId(null);
    }
  }, [upcomingMatches, selectedUpcomingMatchId]);

  // Compute competitors: Leader, Above, Below
  const competitors = useMemo(() => {
    if (!scoredParticipants.length || !robertoScore) return { leader: null, above: null, below: null };
    const isRobertoFirst = scoredParticipants[0]?.nombre.toLowerCase().includes("roberto p");
    const leader = isRobertoFirst ? (scoredParticipants[1] || null) : (scoredParticipants[0] || null);
    
    const rIdx = robertoScore.rank - 1; // 0-indexed
    const above = rIdx > 0 ? scoredParticipants[rIdx - 1] : null;
    const below = rIdx < scoredParticipants.length - 1 ? scoredParticipants[rIdx + 1] : null;
    
    return { leader, above, below };
  }, [scoredParticipants, robertoScore]);

  // Determine if an upcoming match is HOT or COLD
  const getMatchHotness = (
    matchId: string,
    type: string,
    g: string,
    m: [string, string]
  ): "HOT" | "COLD" | "NORMAL" => {
    if (!robertoScore) return "NORMAL";
    
    const activeComps = [competitors.leader, competitors.above, competitors.below].filter(Boolean);
    if (activeComps.length === 0) return "NORMAL";
    
    if (type === "group") {
      const robPredict = robertoScore.entry?.grupos?.[matchId];
      if (!robPredict) return "NORMAL";
      
      const getOutcomeSign = (pred: any) => {
        if (!pred) return null;
        const h = parseInt(pred.h);
        const a = parseInt(pred.a);
        if (isNaN(h) || isNaN(a)) return null;
        return h > a ? "H" : h < a ? "A" : "D";
      };
      
      const robOutcome = getOutcomeSign(robPredict);
      if (!robOutcome) return "NORMAL";
      
      let allSameOutcomeAndScore = true;
      let anyDifferentOutcome = false;
      
      for (const comp of activeComps) {
        const compEntry = porras.find(p => p.nombre === comp.nombre);
        const compPredict = compEntry?.grupos?.[matchId];
        if (compPredict) {
          const compOutcome = getOutcomeSign(compPredict);
          if (compOutcome !== robOutcome) {
            anyDifferentOutcome = true;
          }
          if (compPredict.h !== robPredict.h || compPredict.a !== robPredict.a) {
            allSameOutcomeAndScore = false;
          }
        } else {
          allSameOutcomeAndScore = false;
          anyDifferentOutcome = true;
        }
      }
      
      if (anyDifferentOutcome) {
        return "HOT";
      }
      if (allSameOutcomeAndScore) {
        return "COLD";
      }
      return "NORMAL";
    } else {
      // Elimination stage
      const robSet = getPredictionSetForRound(robertoScore.entry, g);
      const robPicks = m.filter(t => robSet.includes(t));
      
      let allSamePicks = true;
      let anyDifferentPicks = false;
      
      for (const comp of activeComps) {
        const compEntry = porras.find(p => p.nombre === comp.nombre);
        const compSet = getPredictionSetForRound(compEntry || null, g);
        const compPicks = m.filter(t => compSet.includes(t));
        
        const same = robPicks.length === compPicks.length && 
                     robPicks.every(t => compPicks.includes(t));
        if (!same) {
          anyDifferentPicks = true;
          allSamePicks = false;
        }
      }
      
      if (anyDifferentPicks) {
        return "HOT";
      }
      if (allSamePicks) {
        return "COLD";
      }
      return "NORMAL";
    }
  };

  // Detailed analysis of selected match
  const selectedMatchAnalysis = useMemo(() => {
    if (!selectedUpcomingMatchId || !robertoScore) return null;
    
    const selectedMatch = upcomingMatches.find(m => m.matchId === selectedUpcomingMatchId);
    if (!selectedMatch) return null;

    const matchId = selectedUpcomingMatchId;
    const isElim = selectedMatch.type === "elim";

    if (!isElim) {
      const parts = selectedUpcomingMatchId.split("-");
      const group = parts[0];
      const matchIdx = parseInt(parts[1]);
      const teams = GD[group]?.[matchIdx];
      if (!teams) return null;
      
      const robPredict = robertoScore.entry?.grupos?.[matchId];
      const leaderEntry = competitors.leader ? porras.find(p => p.nombre === competitors.leader.nombre) : null;
      const aboveEntry = competitors.above ? porras.find(p => p.nombre === competitors.above.nombre) : null;
      const belowEntry = competitors.below ? porras.find(p => p.nombre === competitors.below.nombre) : null;
      
      const leaderPredict = leaderEntry?.grupos?.[matchId];
      const abovePredict = aboveEntry?.grupos?.[matchId];
      const belowPredict = belowEntry?.grupos?.[matchId];
      
      const list: any[] = [];
      for (let rh = 0; rh <= 4; rh++) {
        for (let ra = 0; ra <= 4; ra++) {
          const actual = { h: rh.toString(), a: ra.toString() };
          const robPts = getPointsForMatch(robPredict, actual) ?? 0;
          const leaderPts = leaderPredict ? (getPointsForMatch(leaderPredict, actual) ?? 0) : null;
          const abovePts = abovePredict ? (getPointsForMatch(abovePredict, actual) ?? 0) : null;
          const belowPts = belowPredict ? (getPointsForMatch(belowPredict, actual) ?? 0) : null;
          
          list.push({
            rh,
            ra,
            robPts,
            leaderPts,
            abovePts,
            belowPts,
            gainVsLeader: leaderPts !== null ? robPts - leaderPts : 0,
            gainVsAbove: abovePts !== null ? robPts - abovePts : 0,
            gainVsBelow: belowPts !== null ? robPts - belowPts : 0
          });
        }
      }

      const analyzeCompetitorGains = (compPredict: typeof robPredict, compName: string | undefined, compPtsKey: "gainVsLeader" | "gainVsAbove" | "gainVsBelow") => {
        if (!compPredict || !compName) return null;
        
        const winningScenarios = list.filter(s => s[compPtsKey] > 0);
        const gainsByOutcome = {
          H: { playable: false, maxGain: 0, bestScores: [] as string[] },
          D: { playable: false, maxGain: 0, bestScores: [] as string[] },
          A: { playable: false, maxGain: 0, bestScores: [] as string[] }
        };
        
        winningScenarios.forEach(s => {
          const outKey = s.rh > s.ra ? "H" : s.rh === s.ra ? "D" : "A";
          gainsByOutcome[outKey].playable = true;
          if (s[compPtsKey] > gainsByOutcome[outKey].maxGain) {
            gainsByOutcome[outKey].maxGain = s[compPtsKey];
            gainsByOutcome[outKey].bestScores = [`${s.rh}-${s.ra}`];
          } else if (s[compPtsKey] === gainsByOutcome[outKey].maxGain) {
            if (!gainsByOutcome[outKey].bestScores.includes(`${s.rh}-${s.ra}`)) {
              gainsByOutcome[outKey].bestScores.push(`${s.rh}-${s.ra}`);
            }
          }
        });
        
        return {
          compName,
          predictStr: `${compPredict.h}-${compPredict.a}`,
          winningScenarios: winningScenarios.sort((a, b) => b[compPtsKey] - a[compPtsKey] || (b.robPts - a.robPts)),
          gainsByOutcome
        };
      };

      const leaderAnalysis = analyzeCompetitorGains(leaderPredict, competitors.leader?.nombre, "gainVsLeader");
      const aboveAnalysis = analyzeCompetitorGains(abovePredict, competitors.above?.nombre, "gainVsAbove");
      const belowAnalysis = analyzeCompetitorGains(belowPredict, competitors.below?.nombre, "gainVsBelow");

      const odds = getPredictionMarketOdds(teams[0], teams[1]);

      return {
        type: "group" as const,
        g: group,
        matchId,
        teams,
        dateStr: "TBD",
        robPredict,
        competitors: {
          leader: leaderAnalysis,
          above: aboveAnalysis,
          below: belowAnalysis
        },
        list,
        odds
      };
    } else {
      const teams = selectedMatch.m;
      const roundId = selectedMatch.g; // "R32", "R16", "QF", "SF"
      const ptValue = 5;

      const robSet = getPredictionSetForRound(robertoScore.entry, roundId);
      const leaderEntry = competitors.leader ? porras.find(p => p.nombre === competitors.leader.nombre) : null;
      const aboveEntry = competitors.above ? porras.find(p => p.nombre === competitors.above.nombre) : null;
      const belowEntry = competitors.below ? porras.find(p => p.nombre === competitors.below.nombre) : null;

      const leaderSet = getPredictionSetForRound(leaderEntry || null, roundId);
      const aboveSet = getPredictionSetForRound(aboveEntry || null, roundId);
      const belowSet = getPredictionSetForRound(belowEntry || null, roundId);

      const robPicks = [teams[0], teams[1]].filter(t => robSet.includes(t));
      const leaderPicks = [teams[0], teams[1]].filter(t => leaderSet.includes(t));
      const abovePicks = [teams[0], teams[1]].filter(t => aboveSet.includes(t));
      const belowPicks = [teams[0], teams[1]].filter(t => belowSet.includes(t));

      const formatPickStr = (picks: string[]) => {
        if (picks.length === 2) return "Both";
        if (picks.length === 1) return picks[0];
        return "None";
      };

      const outcomeA = {
        winner: teams[0],
        robPts: robSet.includes(teams[0]) ? ptValue : 0,
        leaderPts: leaderSet.includes(teams[0]) ? ptValue : 0,
        abovePts: aboveSet.includes(teams[0]) ? ptValue : 0,
        belowPts: belowSet.includes(teams[0]) ? ptValue : 0
      };

      const outcomeB = {
        winner: teams[1],
        robPts: robSet.includes(teams[1]) ? ptValue : 0,
        leaderPts: leaderSet.includes(teams[1]) ? ptValue : 0,
        abovePts: aboveSet.includes(teams[1]) ? ptValue : 0,
        belowPts: belowSet.includes(teams[1]) ? ptValue : 0
      };

      const odds = getPredictionMarketOdds(teams[0], teams[1]);
      const qualifyOdds = getToQualifyChance(teams[0], teams[1]);

      return {
        type: "elim" as const,
        matchId,
        teams,
        roundId,
        dateStr: selectedMatch.dateStr,
        ptValue,
        predictions: {
          rob: formatPickStr(robPicks),
          leader: formatPickStr(leaderPicks),
          above: formatPickStr(abovePicks),
          below: formatPickStr(belowPicks)
        },
        competitors: {
          leader: competitors.leader ? {
            compName: competitors.leader.nombre,
            predictStr: formatPickStr(leaderPicks)
          } : null,
          above: competitors.above ? {
            compName: competitors.above.nombre,
            predictStr: formatPickStr(abovePicks)
          } : null,
          below: competitors.below ? {
            compName: competitors.below.nombre,
            predictStr: formatPickStr(belowPicks)
          } : null
        },
        outcomes: {
          A: {
            ...outcomeA,
            gainVsLeader: outcomeA.robPts - outcomeA.leaderPts,
            gainVsAbove: outcomeA.robPts - outcomeA.abovePts,
            gainVsBelow: outcomeA.robPts - outcomeA.belowPts
          },
          B: {
            ...outcomeB,
            gainVsLeader: outcomeB.robPts - outcomeB.leaderPts,
            gainVsAbove: outcomeB.robPts - outcomeB.abovePts,
            gainVsBelow: outcomeB.robPts - outcomeB.belowPts
          }
        },
        odds,
        qualifyOdds
      };
    }
  }, [selectedUpcomingMatchId, upcomingMatches, robertoScore, competitors, porras]);

  // Start the stage simulation
  const startSimulation = () => {
    if (!robertoScore || !simRival) return;
    
    const initialRobertoPts = robertoScore.data.pts;
    const initialRivalPts = scoredParticipants.find(p => p.nombre === simRival.nombre)?.pts ?? 0;
    
    const steps = [{
      step: 0,
      matchName: "Start",
      matchLabel: "Initial Standings",
      simOutcomeLabel: "Before simulation",
      Roberto: initialRobertoPts,
      Rival: initialRivalPts,
      robPtsGained: 0,
      rivPtsGained: 0,
      teamA: "",
      teamB: "",
      winner: "",
      loser: ""
    }];

    // Helper to check if a team was picked to advance
    const hasUserPickedTeam = (entry: Entry, roundId: string, team: string): boolean => {
      if (roundId === "R32") {
        return getKnockoutTeams(entry, "r16").includes(team);
      } else if (roundId === "R16") {
        return getKnockoutTeams(entry, "r8").includes(team);
      } else if (roundId === "QF") {
        return getKnockoutTeams(entry, "r4").includes(team);
      } else if (roundId === "SF") {
        const finalObj = entry.knockout?.final;
        const champ = finalObj?.champ;
        const sub = finalObj?.sub;
        const finalTeams = [champ, sub].filter(Boolean) as string[];
        const r2Teams = getKnockoutTeams(entry, "r2");
        return finalTeams.includes(team) || r2Teams.includes(team);
      }
      return false;
    };

    upcomingMatches.forEach((match, idx) => {
      let robPts = 0;
      let rivPts = 0;
      let simOutcomeLabel = "";
      let winner = "";
      let loser = "";

      if (match.type === "group") {
        const robPred = robertoScore.entry?.grupos?.[match.matchId];
        const rivPred = simRival?.grupos?.[match.matchId];

        if (simScenario === "optimal") {
          let maxDiff = -Infinity;
          let bestScore = { h: "0", a: "0" };
          for (let rh = 0; rh <= 4; rh++) {
            for (let ra = 0; ra <= 4; ra++) {
              const actual = { h: rh.toString(), a: ra.toString() };
              const rPts = getPointsForMatch(robPred, actual) ?? 0;
              const vPts = getPointsForMatch(rivPred, actual) ?? 0;
              const diff = rPts - vPts;
              if (diff > maxDiff) {
                maxDiff = diff;
                bestScore = actual;
              } else if (diff === maxDiff) {
                const curBestRob = getPointsForMatch(robPred, bestScore) ?? 0;
                if (rPts > curBestRob) {
                  bestScore = actual;
                }
              }
            }
          }
          robPts = getPointsForMatch(robPred, bestScore) ?? 0;
          rivPts = getPointsForMatch(rivPred, bestScore) ?? 0;
          simOutcomeLabel = `${match.m[0]} ${bestScore.h}-${bestScore.a} ${match.m[1]}`;

          const scoreH = parseInt(bestScore.h);
          const scoreA = parseInt(bestScore.a);
          if (scoreH > scoreA) {
            winner = match.m[0];
            loser = match.m[1];
          } else if (scoreA > scoreH) {
            winner = match.m[1];
            loser = match.m[0];
          }
        } else {
          // probable
          const odds = getPredictionMarketOdds(match.m[0], match.m[1]);
          let simScore = { h: "1", a: "1" };
          if (odds.teamAWin > odds.draw && odds.teamAWin > odds.teamBWin) {
            simScore = { h: "1", a: "0" };
          } else if (odds.teamBWin > odds.draw && odds.teamBWin > odds.teamAWin) {
            simScore = { h: "0", a: "1" };
          }
          robPts = getPointsForMatch(robPred, simScore) ?? 0;
          rivPts = getPointsForMatch(rivPred, simScore) ?? 0;
          simOutcomeLabel = `${match.m[0]} ${simScore.h}-${simScore.a} ${match.m[1]}`;

          const scoreH = parseInt(simScore.h);
          const scoreA = parseInt(simScore.a);
          if (scoreH > scoreA) {
            winner = match.m[0];
            loser = match.m[1];
          } else if (scoreA > scoreH) {
            winner = match.m[1];
            loser = match.m[0];
          }
        }
      } else {
        // elim
        const ptsPerTeam = match.g === "SF" ? 10 : 5;
        const robPtsA = hasUserPickedTeam(robertoScore.entry, match.g, match.m[0]) ? ptsPerTeam : 0;
        const rivPtsA = hasUserPickedTeam(simRival, match.g, match.m[0]) ? ptsPerTeam : 0;
        const robPtsB = hasUserPickedTeam(robertoScore.entry, match.g, match.m[1]) ? ptsPerTeam : 0;
        const rivPtsB = hasUserPickedTeam(simRival, match.g, match.m[1]) ? ptsPerTeam : 0;

        if (simScenario === "optimal") {
          const gainA = robPtsA - rivPtsA;
          const gainB = robPtsB - rivPtsB;
          if (gainA > gainB) {
            robPts = robPtsA;
            rivPts = rivPtsA;
            simOutcomeLabel = `${match.m[0]} advances`;
            winner = match.m[0];
            loser = match.m[1];
          } else if (gainB > gainA) {
            robPts = robPtsB;
            rivPts = rivPtsB;
            simOutcomeLabel = `${match.m[1]} advances`;
            winner = match.m[1];
            loser = match.m[0];
          } else {
            if (robPtsA >= robPtsB) {
              robPts = robPtsA;
              rivPts = rivPtsA;
              simOutcomeLabel = `${match.m[0]} advances`;
              winner = match.m[0];
              loser = match.m[1];
            } else {
              robPts = robPtsB;
              rivPts = rivPtsB;
              simOutcomeLabel = `${match.m[1]} advances`;
              winner = match.m[1];
              loser = match.m[0];
            }
          }
        } else {
          // probable
          const qualOdds = getToQualifyChance(match.m[0], match.m[1]);
          if (qualOdds.teamAQualify >= qualOdds.teamBQualify) {
            robPts = robPtsA;
            rivPts = rivPtsA;
            simOutcomeLabel = `${match.m[0]} advances`;
            winner = match.m[0];
            loser = match.m[1];
          } else {
            robPts = robPtsB;
            rivPts = rivPtsB;
            simOutcomeLabel = `${match.m[1]} advances`;
            winner = match.m[1];
            loser = match.m[0];
          }
        }
      }

      const prevTotal = steps[steps.length - 1];
      steps.push({
        step: idx + 1,
        matchName: `${match.m[0].slice(0, 3)} v ${match.m[1].slice(0, 3)}`,
        matchLabel: `${match.m[0]} vs ${match.m[1]}`,
        simOutcomeLabel,
        Roberto: prevTotal.Roberto + robPts,
        Rival: prevTotal.Rival + rivPts,
        robPtsGained: robPts,
        rivPtsGained: rivPts,
        teamA: match.m[0],
        teamB: match.m[1],
        winner,
        loser
      });
    });

    setSimSteps(steps);
    setSimCurrentStep(0);
    setIsSimPlaying(true);
    setIsSimModalOpen(true);
  };

  // Interval timer for smoother transition drawings
  useEffect(() => {
    let timer: any;
    if (isSimModalOpen && isSimPlaying && simSteps.length > 0 && simCurrentStep < simSteps.length - 1) {
      timer = setTimeout(() => {
        setSimCurrentStep(prev => prev + 1);
      }, 1200);
    }
    return () => clearTimeout(timer);
  }, [isSimModalOpen, isSimPlaying, simSteps, simCurrentStep]);

  const nextImportantMatch = useMemo(() => {
    if (!robertoScore || !porras.length || !upcomingMatches.length) return null;
    
    const isRobertoFirst = scoredParticipants[0]?.nombre.toLowerCase().includes("roberto p");
    const leader = isRobertoFirst ? (scoredParticipants[1] || null) : (scoredParticipants[0] || null);
    if (!leader) return null;

    const leaderEntry = porras.find(p => p.nombre === leader.nombre);
    if (!leaderEntry) return null;

    for (const match of upcomingMatches) {
      const matchId = match.matchId;
      const type = match.type;
      
      if (type === "group") {
        const robPredict = robertoScore.entry?.grupos?.[matchId];
        const leaderPredict = leaderEntry.grupos?.[matchId];
        if (robPredict && leaderPredict) {
          if (robPredict.h !== leaderPredict.h || robPredict.a !== leaderPredict.a) {
            const robPtsIfRobCorrect = 5;
            const leaderPtsIfRobCorrect = getPointsForMatch(leaderPredict, robPredict) ?? 0;
            const gainIfRobCorrect = robPtsIfRobCorrect - leaderPtsIfRobCorrect;

            const leaderPtsIfLeaderCorrect = 5;
            const robPtsIfLeaderCorrect = getPointsForMatch(robPredict, leaderPredict) ?? 0;
            const gainIfLeaderCorrect = robPtsIfLeaderCorrect - leaderPtsIfLeaderCorrect;

            const scenarios: { condition: string; gain: number; isPositive: boolean }[] = [];

            if (gainIfRobCorrect > 0) {
              scenarios.push({
                condition: `If the actual score is exactly your prediction (${robPredict.h}-${robPredict.a})`,
                gain: gainIfRobCorrect,
                isPositive: true
              });
            }

            if (gainIfLeaderCorrect < 0) {
              scenarios.push({
                condition: `If the actual score is exactly ${leader.nombre}'s prediction (${leaderPredict.h}-${leaderPredict.a})`,
                gain: gainIfLeaderCorrect,
                isPositive: false
              });
            }

            return {
              match,
              leaderName: leader.nombre,
              scenarios
            };
          }
        }
      } else {
        const robSet = getPredictionSetForRound(robertoScore.entry, match.g);
        const leaderSet = getPredictionSetForRound(leaderEntry, match.g);
        const robPicks = match.m.filter(t => robSet.includes(t));
        const leaderPicks = match.m.filter(t => leaderSet.includes(t));
        
        const same = robPicks.length === leaderPicks.length && robPicks.every(t => leaderPicks.includes(t));
        if (!same) {
          const scenarios: { condition: string; gain: number; isPositive: boolean }[] = [];
          
          const teamA = match.m[0];
          const robPtsA = robSet.includes(teamA) ? 5 : 0;
          const leaderPtsA = leaderSet.includes(teamA) ? 5 : 0;
          const gainA = robPtsA - leaderPtsA;

          if (gainA !== 0) {
            scenarios.push({
              condition: `If ${teamA} qualifies`,
              gain: gainA,
              isPositive: gainA > 0
            });
          }

          const teamB = match.m[1];
          const robPtsB = robSet.includes(teamB) ? 5 : 0;
          const leaderPtsB = leaderSet.includes(teamB) ? 5 : 0;
          const gainB = robPtsB - leaderPtsB;

          if (gainB !== 0) {
            scenarios.push({
              condition: `If ${teamB} qualifies`,
              gain: gainB,
              isPositive: gainB > 0
            });
          }

          return {
            match,
            leaderName: leader.nombre,
            scenarios
          };
        }
      }
    }
    return null;
  }, [upcomingMatches, robertoScore, scoredParticipants, porras]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0b132b] text-white">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="mb-4"
        >
          <RefreshCw size={40} className="text-[#c9a84c]" />
        </motion.div>
        <p className="text-lg font-display tracking-wide font-medium">Loading live standings...</p>
        <p className="text-sm text-gray-400 mt-2 font-mono">Syncing database values</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0b132b] text-white p-4">
        <XCircle size={50} className="text-red-500 mb-4 animate-bounce" />
        <h2 className="text-xl font-display font-bold mb-2">Database Loading Error</h2>
        <p className="text-center text-gray-300 max-w-md bg-gray-900/50 p-3 rounded-lg border border-red-500/20 font-mono text-xs">
          {error}
        </p>
        <button 
          onClick={() => fetchData()}
          className="mt-6 px-5 py-2.5 bg-[#c9a84c] text-slate-950 font-display font-semibold rounded-lg hover:bg-amber-400 transition"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const isRobertoFirst = scoredParticipants[0]?.nombre.toLowerCase().includes("roberto p");
  const leaderPts = isRobertoFirst
    ? (scoredParticipants[1]?.pts || 0)
    : (scoredParticipants[0]?.pts || 0);
  const myPts = robertoScore?.data.pts || 0;
  const pointsDiff = myPts - leaderPts;

  let gapTitle = "You are tied";
  let gapValue = "0";
  let gapColorClass = "text-blue-400";
  let gapIcon = "🤝";

  if (isRobertoFirst) {
    if (pointsDiff > 0) {
      gapTitle = "You are ahead";
      gapValue = `+${pointsDiff}`;
      gapColorClass = "text-emerald-400";
      gapIcon = "👑";
    } else {
      gapTitle = "Tied for 1st";
      gapValue = "0";
      gapColorClass = "text-blue-400";
      gapIcon = "🤝";
    }
  } else {
    if (pointsDiff < 0) {
      gapTitle = "You are down";
      gapValue = `-${Math.abs(pointsDiff)}`;
      gapColorClass = "text-rose-400";
      gapIcon = "🏹";
    } else if (pointsDiff > 0) {
      gapTitle = "You are up";
      gapValue = `+${pointsDiff}`;
      gapColorClass = "text-emerald-400";
      gapIcon = "👑";
    }
  }

  // Custom Recharts tick component for rendering team flags
  const renderCustomTick = (props: any) => {
    const { x, y, payload } = props;
    const step = simSteps[payload.index];
    if (!step) return null;
    
    if (step.step === 0) {
      return (
        <text x={x} y={y + 18} textAnchor="middle" fill="#94a3b8" fontSize={9} className="font-mono">
          Start
        </text>
      );
    }

    const flagA = flagUrl(step.teamA);
    const flagB = flagUrl(step.teamB);

    const isWinnerA = step.winner === step.teamA;
    const isLoserA = step.loser === step.teamA;
    const isWinnerB = step.winner === step.teamB;
    const isLoserB = step.loser === step.teamB;

    return (
      <g transform={`translate(${x}, ${y})`}>
        {/* Team A */}
        <g transform="translate(-12, 3)">
          <rect 
            x={0} 
            y={0} 
            width={24} 
            height={14} 
            rx={3} 
            fill={isWinnerA ? "#064e3b" : isLoserA ? "#4c0519" : "#1e293b"} 
            stroke={isWinnerA ? "#10b981" : isLoserA ? "#f43f5e" : "#334155"} 
            strokeWidth={isWinnerA || isLoserA ? 1.5 : 1}
          />
          {flagA ? (
            <image 
              href={flagA} 
              x={1.5} 
              y={1.5} 
              width={21} 
              height={11} 
              preserveAspectRatio="none"
            />
          ) : (
            <text 
              x={12} 
              y={10} 
              fill={isWinnerA ? "#a7f3d0" : isLoserA ? "#fecdd3" : "#94a3b8"} 
              fontSize={7} 
              fontFamily="monospace" 
              textAnchor="middle"
              fontWeight="bold"
            >
              {step.teamA?.slice(0, 3).toUpperCase()}
            </text>
          )}
        </g>

        {/* Team B */}
        <g transform="translate(-12, 20)">
          <rect 
            x={0} 
            y={0} 
            width={24} 
            height={14} 
            rx={3} 
            fill={isWinnerB ? "#064e3b" : isLoserB ? "#4c0519" : "#1e293b"} 
            stroke={isWinnerB ? "#10b981" : isLoserB ? "#f43f5e" : "#334155"} 
            strokeWidth={isWinnerB || isLoserB ? 1.5 : 1}
          />
          {flagB ? (
            <image 
              href={flagB} 
              x={1.5} 
              y={1.5} 
              width={21} 
              height={11} 
              preserveAspectRatio="none"
            />
          ) : (
            <text 
              x={12} 
              y={10} 
              fill={isWinnerB ? "#a7f3d0" : isLoserB ? "#fecdd3" : "#94a3b8"} 
              fontSize={7} 
              fontFamily="monospace" 
              textAnchor="middle"
              fontWeight="bold"
            >
              {step.teamB?.slice(0, 3).toUpperCase()}
            </text>
          )}
        </g>
      </g>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none pb-16">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/85 backdrop-blur-md border-b border-slate-700/60 px-4 py-3 md:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800/80 border border-slate-700 rounded-lg text-lg shadow-lg shadow-blue-500/5 flex items-center justify-center select-none">
              🥬
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-display font-bold tracking-tight">
                <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Super Porro</span>
                <span className="line-through text-slate-500 font-normal text-xs md:text-sm mx-2">Mediobanca</span>
                <span className="text-blue-400 font-semibold">BMPS Analytics</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">Lo si fa per i sordi</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button 
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="p-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 active:scale-95 transition text-blue-400 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
              <span className="hidden sm:inline font-mono text-[10px] font-bold">Sync</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Single Tab Layout */}
      <main className="max-w-5xl mx-auto w-full px-4 md:px-8 mt-6 space-y-6">
        
        {/* Row 1: Leader - gap to leader - average */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Metric 1: Leader */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
            <div className="mb-2">
              <span className="text-slate-400 text-[10px] font-mono tracking-wider uppercase">Current Leader</span>
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-white truncate">
                {scoredParticipants[0]?.nombre || "Unranked"}
              </h3>
              <p className="text-xl font-mono font-bold text-emerald-400 mt-0.5">
                {scoredParticipants[0]?.pts || 0} <span className="text-[11px] text-slate-400 font-normal font-sans">pts</span>
              </p>
            </div>
          </div>

          {/* Metric 2: Gap to Leader (Middle Box) */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
            <div className="mb-2">
              <span className="text-slate-400 text-[10px] font-mono tracking-wider uppercase">
                {isRobertoFirst ? "Leader's Margin" : "Gap to Leader"}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-white truncate">
                {gapTitle}
              </h3>
              <p className={`text-xl font-mono font-bold ${gapColorClass} mt-0.5`}>
                {gapValue} <span className="text-[11px] text-slate-400 font-normal font-sans">pts</span>
              </p>
            </div>
          </div>

          {/* Metric 3: Average (Right Box) */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
            <div className="mb-2">
              <span className="text-slate-400 text-[10px] font-mono tracking-wider uppercase">Group Average</span>
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-white">All Competitors</h3>
              <p className="text-xl font-mono font-bold text-blue-400 mt-0.5">
                {Math.round(scoredParticipants.reduce((sum, p) => sum + p.pts, 0) / (scoredParticipants.length || 1))}{" "}
                <span className="text-[11px] text-slate-400 font-normal font-sans">pts</span>
              </p>
            </div>
          </div>
        </div>

        {/* Next important match right above the Roberto P. box */}
        {robertoScore && nextImportantMatch && (
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 relative overflow-hidden">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-700/40">
              <div className="flex flex-col gap-1">
                <span className="text-slate-400 text-[10px] font-mono uppercase tracking-wider block">Next Important Match</span>
                <div className="flex items-center gap-2 mt-1">
                  {nextImportantMatch.match.dateStr && nextImportantMatch.match.dateStr !== "TBD" && (
                    <span className="text-[10px] text-slate-300 font-mono bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-800">
                      {nextImportantMatch.match.dateStr}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <img src={flagUrl(nextImportantMatch.match.m[0])} alt="" referrerPolicy="no-referrer" className="w-4 h-3 rounded shadow-sm shrink-0" />
                    <span className="truncate max-w-[80px] sm:max-w-[120px]">{nextImportantMatch.match.m[0]}</span>
                    <span className="text-[10px] text-slate-500 font-normal">v</span>
                    <img src={flagUrl(nextImportantMatch.match.m[1])} alt="" referrerPolicy="no-referrer" className="w-4 h-3 rounded shadow-sm shrink-0" />
                    <span className="truncate max-w-[80px] sm:max-w-[120px]">{nextImportantMatch.match.m[1]}</span>
                  </div>
                </div>
              </div>
              
              <div className="text-[10px] text-slate-400 font-mono bg-slate-950/20 px-2.5 py-1 rounded border border-slate-800/60 w-fit self-start sm:self-auto">
                <span className="text-[8px] text-slate-500 block uppercase tracking-wider mb-0.5">Rival Leader</span>
                <span className="text-yellow-400 font-bold">{nextImportantMatch.leaderName}</span>
              </div>
            </div>
            
            <div className="mt-3 space-y-1">
              {nextImportantMatch.scenarios.map((scenario, idx) => {
                const isRobertoInLead = robertoScore && robertoScore.rank === 1;
                const valueA = scenario.isPositive 
                  ? (isRobertoInLead ? "pull ahead" : "recoup") 
                  : (isRobertoInLead ? "shrink lead" : "fall behind");
                const valueB = Math.abs(scenario.gain);
                const colorClass = scenario.isPositive ? "text-emerald-400 font-bold font-sans text-sm sm:text-base" : "text-rose-500 font-bold font-sans text-sm sm:text-base";
                
                return (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-slate-700/20 last:border-0 gap-2">
                    <span className="text-slate-400 font-mono flex items-center gap-1.5 text-[11px] sm:text-xs">
                      <span className={scenario.isPositive ? "text-emerald-400" : "text-rose-400"}>
                        {scenario.isPositive ? "▲" : "▼"}
                      </span>
                      {scenario.condition}
                    </span>
                    <span className="text-slate-200 font-sans text-xs sm:text-sm font-medium">
                      You could <span className={colorClass}>{valueA}</span> by <span className={colorClass}>{valueB}</span> points.
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Row 2: Roberto P. Profile & Analysis (Merged Box) */}
        {robertoScore && (
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-500/15 text-blue-400 border-l border-b border-blue-500/20 px-2.5 py-0.5 font-mono text-[8px] font-bold rounded-bl-lg tracking-wider uppercase">
              Profile & Analysis
            </div>

            {/* Profile Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-700/40">
              <div className="flex items-center gap-3">
                <img 
                  src="https://flagcdn.com/w80/it.png" 
                  alt="Italy flag" 
                  referrerPolicy="no-referrer" 
                  className="w-10 h-10 rounded-full object-cover border border-slate-700/60 shadow-md shadow-emerald-500/5" 
                />
                <div>
                  <h3 className="font-display font-bold text-white text-base">Roberto P.</h3>
                  <p className="text-xs text-slate-400 font-mono">Mediobanca Predictor League</p>
                </div>
              </div>

              <div className="flex gap-4 bg-slate-950/40 p-2 px-3 rounded-lg border border-slate-700/60">
                <div className="text-center pr-3 border-r border-slate-800">
                  <span className="text-slate-500 text-[8px] block uppercase font-mono tracking-wider">Rank</span>
                  <span className="text-base font-display font-bold text-emerald-400 font-mono">#{robertoScore.rank}</span>
                </div>
                <div className="text-center">
                  <span className="text-slate-500 text-[8px] block uppercase font-mono tracking-wider">Total Points</span>
                  <span className="text-base font-display font-bold text-blue-400 font-mono">{robertoScore.data.pts}</span>
                </div>
              </div>
            </div>

            {/* Analysis Content */}
            <div className="mt-4">
              {/* Tightened horizontal progress bars */}
              <div className="space-y-2 w-full">
                {[
                  { label: "Group Stage", score: robertoScore.data.bk.grupos, key: "grupos", color: "bg-emerald-500", max: 360 },
                  { label: "R32 Qualification", score: robertoScore.data.bk.r16, key: "r16", color: "bg-blue-500", max: 160 },
                  { label: "Round of 16", score: robertoScore.data.bk.r8, key: "r8", color: "bg-purple-500", max: 80 },
                  { label: "Quarterfinals", score: robertoScore.data.bk.r4, key: "r4", color: "bg-pink-500", max: 40 },
                  { label: "Semifinals", score: robertoScore.data.bk.r2, key: "r2", color: "bg-orange-500", max: 20 },
                  { label: "Final / Medals", score: robertoScore.data.bk.final, key: "final", color: "bg-yellow-500", max: 45 },
                  { label: "Top Scorer / Spain", score: robertoScore.data.bk.pichi, key: "pichi", color: "bg-blue-400", max: 12 }
                ].map((bar) => {
                  const percent = Math.max(1, Math.min(100, (bar.score / bar.max) * 100));
                  const avgScore = stageAverages ? (stageAverages as any)[bar.key] || 0 : 0;
                  const avgPercent = Math.max(1, Math.min(100, (avgScore / bar.max) * 100));

                  return (
                    <div key={bar.label} className="text-[11px] group relative">
                      <div className="flex justify-between font-mono text-[10px] mb-0.5">
                        <span className="text-slate-400">{bar.label}</span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-bold text-slate-200">{bar.score}</span>
                          <span className="text-slate-600">/</span>
                          <span className="text-slate-500">{bar.max} pts</span>
                          <span className="text-[9px] text-slate-400 bg-slate-900/40 px-1 py-0.2 rounded border border-slate-700/30">
                            Avg: <span className="text-blue-400 font-bold">{avgScore}</span>
                          </span>
                        </div>
                      </div>
                      <div className="relative h-2 bg-slate-950/60 rounded-full mt-1 overflow-visible">
                        {/* Fill */}
                        <div className={`h-full ${bar.color} rounded-full`} style={{ width: `${percent}%` }} />
                        
                        {/* Average Marker Tick */}
                        <div 
                          className="absolute top-1/2 -translate-y-1/2 w-[3px] h-3.5 bg-sky-400 rounded-[1px] border border-slate-950/80 shadow shadow-black/50 z-10 cursor-help"
                          style={{ left: `calc(${avgPercent}% - 1.5px)` }}
                        >
                          {/* Mini Tooltip */}
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-950 text-sky-300 text-[8px] px-1.5 py-0.5 rounded border border-sky-500/20 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-mono z-50 shadow-lg">
                            Group Avg: {avgScore} pts
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Row 3: Upcoming Matches & Scenario Analysis */}
        {robertoScore && upcomingMatches.length > 0 && (
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 space-y-4">
            <div className="border-b border-slate-700/40 pb-3">
              <h3 className="font-display font-bold text-xs text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-emerald-400 animate-pulse" />
                Upcoming Match Analytics & Scenarios
              </h3>
              <p className="text-[9px] text-slate-500 font-mono">Select a match to unlock winning scenarios vs leader and closest rivals</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 bg-slate-950/45 px-3 py-1 rounded-lg border border-slate-800/80 font-mono text-[8.5px] w-fit mx-auto">
              <span className="flex items-center gap-1 text-orange-400 font-semibold">
                <span>🔥 HOT MATCH:</span>
                <span className="text-slate-400 font-normal">Predictions differ from rivals</span>
              </span>
              <span className="text-slate-700">|</span>
              <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                <span>❄️ COLD MATCH:</span>
                <span className="text-slate-400 font-normal">Same prediction as rivals</span>
              </span>
            </div>

            {/* Horizontal Scroll / Grid of Upcoming Matches */}
            <div className="flex gap-2 overflow-x-auto pt-4 pb-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
              {upcomingMatches.map(({ type, g, m, matchId, dateStr }) => {
                const isSelected = selectedUpcomingMatchId === matchId;
                
                let pickBadge = null;
                if (type === "group") {
                  const robPred = robertoScore.entry?.grupos?.[matchId];
                  if (robPred && robPred.h !== "") {
                    pickBadge = (
                      <div className="mt-1.5 text-[9px] font-mono text-emerald-400/90 flex items-center gap-1 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10">
                        <span className="text-[7px] text-slate-500 uppercase tracking-wider font-sans">You:</span>
                        <span className="font-bold">{robPred.h}-{robPred.a}</span>
                      </div>
                    );
                  }
                } else {
                  const robSet = getPredictionSetForRound(robertoScore.entry, g);
                  const myPicks = m.filter(t => robSet.includes(t));
                  if (myPicks.length > 0) {
                    pickBadge = (
                      <div className="mt-1.5 text-[9px] font-mono text-emerald-400/90 flex items-center gap-1 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10 max-w-[130px]">
                        <span className="text-[7px] text-slate-500 uppercase tracking-wider font-sans">Pick:</span>
                        <span className="font-bold truncate text-[8px]">{myPicks.join(" & ")}</span>
                      </div>
                    );
                  }
                }

                const isElim = type === "elim";
                const cardOdds = getPredictionMarketOdds(m[0], m[1]);
                const cardQualifyOdds = isElim ? getToQualifyChance(m[0], m[1]) : null;
                const hotness = getMatchHotness(matchId, type, g, m);

                return (
                  <button
                    key={matchId}
                    onClick={() => setSelectedUpcomingMatchId(matchId)}
                    className={`relative flex-shrink-0 flex flex-col items-center p-2.5 rounded-lg border text-left transition cursor-pointer min-w-[155px] ${
                      isSelected
                        ? "bg-blue-500/15 border-blue-500/50 text-white shadow-md shadow-blue-500/5"
                        : "bg-slate-900/30 border-slate-700/60 hover:bg-slate-950/40 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {/* Absolute Positioned Outside Tags */}
                    {hotness === "HOT" && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-slate-900 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded text-[6.5px] font-bold uppercase tracking-wider shadow-sm shadow-orange-500/10 z-10 whitespace-nowrap">
                        🔥 HOT MATCH
                      </span>
                    )}
                    {hotness === "COLD" && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-slate-900 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded text-[6.5px] font-bold uppercase tracking-wider shadow-sm shadow-cyan-500/10 z-10 whitespace-nowrap">
                        ❄️ COLD
                      </span>
                    )}

                    <div className="flex items-center justify-between w-full text-[8px] font-mono mb-1.5">
                      <div className="flex flex-col text-[7.5px] leading-tight text-slate-500">
                        <span>{type === "group" ? `Group ${g}` : g === "R32" ? "R32 Match" : g === "R16" ? "R16 Match" : g === "QF" ? "QF Match" : "SF Match"}</span>
                      </div>
                      {dateStr && dateStr !== "TBD" && (
                        <span className="text-[7.5px] text-slate-300 font-mono bg-slate-950/40 px-1 py-0.5 rounded border border-slate-800">
                          {dateStr}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold w-full">
                      <img src={flagUrl(m[0])} alt="" referrerPolicy="no-referrer" className="w-4 h-3 rounded shadow-sm shrink-0" />
                      <span className="truncate max-w-[50px]">{m[0]}</span>
                      <span className="text-[8px] text-slate-500 font-normal">v</span>
                      <img src={flagUrl(m[1])} alt="" referrerPolicy="no-referrer" className="w-4 h-3 rounded shadow-sm shrink-0" />
                      <span className="truncate max-w-[50px]">{m[1]}</span>
                    </div>
                    <div className="w-full flex justify-between items-center mt-1">
                      {pickBadge || <div className="h-4" />}
                    </div>
                    {/* Tiny probability bar */}
                    <div className="w-full mt-2 pt-1.5 border-t border-slate-800/40 space-y-1">
                      {isElim && cardQualifyOdds ? (
                        <>
                          <div className="flex justify-between text-[7px] text-slate-500 font-mono leading-none">
                            <span>{cardQualifyOdds.teamAQualify}% to adv</span>
                            <span>{cardQualifyOdds.teamBQualify}% to adv</span>
                          </div>
                          <div className="w-full h-1 bg-slate-950 rounded overflow-hidden flex">
                            <div className="h-full bg-emerald-500/80" style={{ width: `${cardQualifyOdds.teamAQualify}%` }} />
                            <div className="h-full bg-blue-500/80" style={{ width: `${cardQualifyOdds.teamBQualify}%` }} />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between text-[7px] text-slate-500 font-mono leading-none">
                            <span>{cardOdds.teamAWin}%</span>
                            <span>{cardOdds.draw}% draw</span>
                            <span>{cardOdds.teamBWin}%</span>
                          </div>
                          <div className="w-full h-1 bg-slate-950 rounded overflow-hidden flex">
                            <div className="h-full bg-emerald-500/80" style={{ width: `${cardOdds.teamAWin}%` }} />
                            <div className="h-full bg-slate-500/60" style={{ width: `${cardOdds.draw}%` }} />
                            <div className="h-full bg-blue-500/80" style={{ width: `${cardOdds.teamBWin}%` }} />
                          </div>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Match Analysis Board */}
            {selectedMatchAnalysis && (() => {
              const selectedHotness = getMatchHotness(
                selectedMatchAnalysis.matchId,
                selectedMatchAnalysis.type,
                selectedMatchAnalysis.type === "group" ? selectedMatchAnalysis.g : selectedMatchAnalysis.roundId,
                selectedMatchAnalysis.teams
              );
              return selectedMatchAnalysis.type === "group" ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 bg-slate-950/20 p-3.5 rounded-xl border border-slate-700/30">
                  {/* Left Side: Predictions & Context */}
                  <div className="lg:col-span-4 space-y-2.5">
                    <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg space-y-3.5 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                        <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider font-bold">Group Stage • Group {selectedMatchAnalysis.g}</span>
                        <span className="text-[7px] font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Polymarket Consensus</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img src={flagUrl(selectedMatchAnalysis.teams[0])} alt="" referrerPolicy="no-referrer" className="w-5 h-3.5 rounded shadow-sm" />
                          <span className="text-xs font-bold text-white truncate max-w-[80px]" title={selectedMatchAnalysis.teams[0]}>{selectedMatchAnalysis.teams[0]}</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono font-bold">vs</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate max-w-[80px]" title={selectedMatchAnalysis.teams[1]}>{selectedMatchAnalysis.teams[1]}</span>
                          <img src={flagUrl(selectedMatchAnalysis.teams[1])} alt="" referrerPolicy="no-referrer" className="w-5 h-3.5 rounded shadow-sm" />
                        </div>
                      </div>

                      {/* Consolidated Odds Bar */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between text-[9px] font-mono leading-none">
                          <span className="text-slate-300 font-semibold">
                            {selectedMatchAnalysis.teams[0]}: <span className="text-emerald-400">{selectedMatchAnalysis.odds.teamAWin}%</span>
                          </span>
                          <span className="text-slate-400 text-[8px]">
                            Draw: {selectedMatchAnalysis.odds.draw}%
                          </span>
                          <span className="text-slate-300 font-semibold text-right">
                            {selectedMatchAnalysis.teams[1]}: <span className="text-blue-400">{selectedMatchAnalysis.odds.teamBWin}%</span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden flex">
                          <div className="h-full bg-emerald-500/80" style={{ width: `${selectedMatchAnalysis.odds.teamAWin}%` }} />
                          <div className="h-full bg-slate-600/70" style={{ width: `${selectedMatchAnalysis.odds.draw}%` }} />
                          <div className="h-full bg-blue-500/80" style={{ width: `${selectedMatchAnalysis.odds.teamBWin}%` }} />
                        </div>
                      </div>


                    </div>

                    {/* Predictions List - 2x2 Grid */}
                    <div className="space-y-1.5">
                      <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block px-1">Predictions for this match</span>
                      
                      <div className="grid grid-cols-2 gap-1.5">
                        {/* Roberto (You) */}
                        <div className="flex items-center justify-between p-1.5 rounded bg-emerald-500/5 border border-emerald-500/15">
                          <div className="flex items-center gap-1 min-w-0">
                            <img 
                              src="https://flagcdn.com/w40/it.png" 
                              alt="" 
                              referrerPolicy="no-referrer" 
                              className="w-3.5 h-3.5 rounded-full object-cover border border-slate-700/50 shrink-0" 
                            />
                            <span className="text-[9px] font-bold text-slate-200 truncate">Roberto</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-emerald-400 shrink-0">
                            {selectedMatchAnalysis.robPredict ? `${selectedMatchAnalysis.robPredict.h}-${selectedMatchAnalysis.robPredict.a}` : "—"}
                          </span>
                        </div>

                        {/* Leader */}
                        {selectedMatchAnalysis.competitors.leader ? (
                          <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/80">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[9px] shrink-0">🥇</span>
                              <span className="text-[9px] text-slate-300 truncate" title={selectedMatchAnalysis.competitors.leader.compName}>Leader</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-yellow-400 shrink-0">
                              {selectedMatchAnalysis.competitors.leader.predictStr}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center p-1.5 rounded bg-slate-900/20 border border-slate-800/40 text-[8px] text-slate-500 font-mono">
                            No Leader
                          </div>
                        )}

                        {/* Competitor Above */}
                        {selectedMatchAnalysis.competitors.above ? (
                          <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/80">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[8.5px] text-blue-500 shrink-0">▲</span>
                              <span className="text-[9px] text-slate-300 truncate" title={selectedMatchAnalysis.competitors.above.compName}>Above</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-blue-400 shrink-0">
                              {selectedMatchAnalysis.competitors.above.predictStr}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center p-1.5 rounded bg-slate-900/20 border border-slate-800/40 text-[8px] text-slate-500 font-mono">
                            No Rival Above
                          </div>
                        )}

                        {/* Competitor Below */}
                        {selectedMatchAnalysis.competitors.below ? (
                          <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/80">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[8.5px] text-slate-500 shrink-0">▼</span>
                              <span className="text-[9px] text-slate-300 truncate" title={selectedMatchAnalysis.competitors.below.compName}>Below</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                              {selectedMatchAnalysis.competitors.below.predictStr}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center p-1.5 rounded bg-slate-900/20 border border-slate-800/40 text-[8px] text-slate-500 font-mono">
                            No Rival Below
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Scenario Simulator */}
                  <div className="lg:col-span-8 flex flex-col justify-start space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block">How to gain points over key competitors</span>
                        {selectedHotness === "HOT" && (
                          <span className="bg-orange-500/10 text-orange-400 border border-orange-500/25 px-1.5 py-0.5 rounded font-bold text-[7px] uppercase tracking-wider">
                            🔥 HOT MATCH
                          </span>
                        )}
                        {selectedHotness === "COLD" && (
                          <span className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 px-1.5 py-0.5 rounded font-bold text-[7px] uppercase tracking-wider">
                            ❄️ COLD
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Scenario Vs Leader */}
                        {selectedMatchAnalysis.competitors.leader && (
                          <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between h-full">
                            <div>
                              <span className="text-[8px] font-mono text-yellow-500 block uppercase tracking-wider mb-1">Vs Leader ({selectedMatchAnalysis.competitors.leader.compName})</span>
                              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                                {selectedMatchAnalysis.competitors.leader.winningScenarios.length > 0 ? (
                                  <>
                                    There are <strong className="text-white">{selectedMatchAnalysis.competitors.leader.winningScenarios.length}</strong> possible scorelines where you outscore the Leader.
                                  </>
                                ) : (
                                  <>
                                    No possible scoreline allows you to gain points over the leader.
                                  </>
                                )}
                              </p>
                            </div>
                            
                            {selectedMatchAnalysis.competitors.leader.winningScenarios.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-slate-800/60 space-y-1.5">
                                <span className="text-[8px] font-mono text-slate-500 block uppercase">Best Path Outcomes:</span>
                                {(Object.entries(selectedMatchAnalysis.competitors.leader.gainsByOutcome) as [string, any][])
                                  .filter(([_, out]) => out.playable)
                                  .map(([key, out]) => (
                                    <div key={key} className="flex justify-between items-center text-[10px] font-mono">
                                      <span className="text-slate-400">{key === "H" ? "Home Win" : key === "D" ? "Draw" : "Away Win"}:</span>
                                      <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded text-[9px]">
                                        +{out.maxGain} pts ({out.bestScores.slice(0, 2).join(", ")})
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Scenario Vs Competitor Above */}
                        {selectedMatchAnalysis.competitors.above ? (
                          <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between h-full">
                            <div>
                              <span className="text-[8px] font-mono text-blue-400 block uppercase tracking-wider mb-1">Vs {selectedMatchAnalysis.competitors.above.compName} (Above)</span>
                              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                                {selectedMatchAnalysis.competitors.above.winningScenarios.length > 0 ? (
                                  <>
                                    There are <strong className="text-white">{selectedMatchAnalysis.competitors.above.winningScenarios.length}</strong> scorelines where you gain ground on them.
                                  </>
                                ) : (
                                  <>
                                    No scoreline allows you to outscore them.
                                  </>
                                )}
                              </p>
                            </div>
                            
                            {selectedMatchAnalysis.competitors.above.winningScenarios.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-slate-800/60 space-y-1.5">
                                <span className="text-[8px] font-mono text-slate-500 block uppercase">Best Path Outcomes:</span>
                                {(Object.entries(selectedMatchAnalysis.competitors.above.gainsByOutcome) as [string, any][])
                                  .filter(([_, out]) => out.playable)
                                  .map(([key, out]) => (
                                    <div key={key} className="flex justify-between items-center text-[10px] font-mono">
                                      <span className="text-slate-400">{key === "H" ? "Home Win" : key === "D" ? "Draw" : "Away Win"}:</span>
                                      <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded text-[9px]">
                                        +{out.maxGain} pts ({out.bestScores.slice(0, 2).join(", ")})
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-slate-900/20 border border-slate-800/40 rounded-lg p-3 flex flex-col justify-center items-center text-center text-slate-500">
                            <Award size={16} className="text-yellow-500/40 mb-1" />
                            <span className="text-[9px] font-mono">You are in #1 place! No competitors are above you.</span>
                          </div>
                        )}

                        {/* Scenario Vs Competitor Below */}
                        {selectedMatchAnalysis.competitors.below ? (
                          <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between h-full">
                            <div>
                              <span className="text-[8px] font-mono text-slate-400 block uppercase tracking-wider mb-1">Vs {selectedMatchAnalysis.competitors.below.compName} (Below)</span>
                              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                                {selectedMatchAnalysis.competitors.below.winningScenarios.length > 0 ? (
                                  <>
                                    There are <strong className="text-white">{selectedMatchAnalysis.competitors.below.winningScenarios.length}</strong> scorelines where you increase your lead over them.
                                  </>
                                ) : (
                                  <>
                                    No scoreline allows you to outscore them.
                                  </>
                                )}
                              </p>
                            </div>
                            
                            {selectedMatchAnalysis.competitors.below.winningScenarios.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-slate-800/60 space-y-1.5">
                                <span className="text-[8px] font-mono text-slate-500 block uppercase">Best Path Outcomes:</span>
                                {(Object.entries(selectedMatchAnalysis.competitors.below.gainsByOutcome) as [string, any][])
                                  .filter(([_, out]) => out.playable)
                                  .map(([key, out]) => (
                                    <div key={key} className="flex justify-between items-center text-[10px] font-mono">
                                      <span className="text-slate-400">{key === "H" ? "Home Win" : key === "D" ? "Draw" : "Away Win"}:</span>
                                      <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded text-[9px]">
                                        +{out.maxGain} pts ({out.bestScores.slice(0, 2).join(", ")})
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-slate-900/20 border border-slate-800/40 rounded-lg p-3 flex flex-col justify-center items-center text-center text-slate-500">
                            <span className="text-[9px] font-mono">No competitors are below you in the standings.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 bg-slate-950/20 p-3.5 rounded-xl border border-slate-700/30">
                  {/* Left Side: Predictions & Context (Elimination) */}
                  <div className="lg:col-span-4 space-y-2.5">
                    <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg space-y-3.5 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                        <span className="text-[8px] font-mono text-blue-400 uppercase tracking-wider font-bold">Knockout Stage • {selectedMatchAnalysis.roundId}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[7px] font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Polymarket Consensus</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img src={flagUrl(selectedMatchAnalysis.teams[0])} alt="" referrerPolicy="no-referrer" className="w-5 h-3.5 rounded shadow-sm" />
                          <span className="text-xs font-bold text-white truncate max-w-[80px]" title={selectedMatchAnalysis.teams[0]}>{selectedMatchAnalysis.teams[0]}</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono font-bold">vs</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate max-w-[80px]" title={selectedMatchAnalysis.teams[1]}>{selectedMatchAnalysis.teams[1]}</span>
                          <img src={flagUrl(selectedMatchAnalysis.teams[1])} alt="" referrerPolicy="no-referrer" className="w-5 h-3.5 rounded shadow-sm" />
                        </div>
                      </div>

                      {/* Consolidated Odds Bar */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between text-[9px] font-mono leading-none">
                          <span className="text-slate-300 font-semibold">
                            {selectedMatchAnalysis.teams[0]}: <span className="text-emerald-400 font-bold">{selectedMatchAnalysis.qualifyOdds.teamAQualify}%</span>
                          </span>
                          <span className="text-[7.5px] text-slate-500 font-mono">To Advance / Qualify</span>
                          <span className="text-slate-300 font-semibold text-right">
                            {selectedMatchAnalysis.teams[1]}: <span className="text-blue-400 font-bold">{selectedMatchAnalysis.qualifyOdds.teamBQualify}%</span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden flex">
                          <div className="h-full bg-emerald-500/80" style={{ width: `${selectedMatchAnalysis.qualifyOdds.teamAQualify}%` }} />
                          <div className="h-full bg-blue-500/80" style={{ width: `${selectedMatchAnalysis.qualifyOdds.teamBQualify}%` }} />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800/40 flex flex-col items-center gap-0.5">
                        <div className="text-[8px] text-slate-500 font-mono text-center">
                          🏆 Stage: <span className="font-bold text-slate-400">{selectedMatchAnalysis.roundId === "R32" ? "Round of 32" : selectedMatchAnalysis.roundId === "R16" ? "Round of 16" : selectedMatchAnalysis.roundId === "QF" ? "Quarterfinal" : "Semifinal"}</span>
                        </div>
                        {selectedMatchAnalysis.dateStr && selectedMatchAnalysis.dateStr !== "TBD" && (
                          <div className="text-[8px] text-slate-500 font-mono text-center">
                            📅 Kickoff: <span className="font-bold text-slate-400">{selectedMatchAnalysis.dateStr}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Predictions List - 2x2 Grid */}
                    <div className="space-y-1.5">
                      <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block px-1">Predicted to reach next stage</span>
                      
                      <div className="grid grid-cols-2 gap-1.5">
                        {/* Roberto (You) */}
                        <div className="flex items-center justify-between p-1.5 rounded bg-emerald-500/5 border border-emerald-500/15">
                          <div className="flex items-center gap-1 min-w-0">
                            <img 
                              src="https://flagcdn.com/w40/it.png" 
                              alt="" 
                              referrerPolicy="no-referrer" 
                              className="w-3.5 h-3.5 rounded-full object-cover border border-slate-700/50 shrink-0" 
                            />
                            <span className="text-[9px] font-bold text-slate-200 truncate">Roberto</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-emerald-400 shrink-0 truncate max-w-[60px]" title={selectedMatchAnalysis.predictions.rob}>
                            {selectedMatchAnalysis.predictions.rob}
                          </span>
                        </div>

                        {/* Leader */}
                        {selectedMatchAnalysis.competitors.leader ? (
                          <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/80">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[9px] shrink-0">🥇</span>
                              <span className="text-[9px] text-slate-300 truncate" title={selectedMatchAnalysis.competitors.leader.compName}>Leader</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-yellow-400 shrink-0 truncate max-w-[60px]" title={selectedMatchAnalysis.competitors.leader.predictStr}>
                              {selectedMatchAnalysis.competitors.leader.predictStr}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center p-1.5 rounded bg-slate-900/20 border border-slate-800/40 text-[8px] text-slate-500 font-mono">
                            No Leader
                          </div>
                        )}

                        {/* Competitor Above */}
                        {selectedMatchAnalysis.competitors.above ? (
                          <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/80">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[8.5px] text-blue-500 shrink-0">▲</span>
                              <span className="text-[9px] text-slate-300 truncate" title={selectedMatchAnalysis.competitors.above.compName}>Above</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-blue-400 shrink-0 truncate max-w-[60px]" title={selectedMatchAnalysis.competitors.above.predictStr}>
                              {selectedMatchAnalysis.competitors.above.predictStr}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center p-1.5 rounded bg-slate-900/20 border border-slate-800/40 text-[8px] text-slate-500 font-mono">
                            No Rival Above
                          </div>
                        )}

                        {/* Competitor Below */}
                        {selectedMatchAnalysis.competitors.below ? (
                          <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/80">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[8.5px] text-slate-500 shrink-0">▼</span>
                              <span className="text-[9px] text-slate-300 truncate" title={selectedMatchAnalysis.competitors.below.compName}>Below</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0 truncate max-w-[60px]" title={selectedMatchAnalysis.competitors.below.predictStr}>
                              {selectedMatchAnalysis.competitors.below.predictStr}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center p-1.5 rounded bg-slate-900/20 border border-slate-800/40 text-[8px] text-slate-500 font-mono">
                            No Rival Below
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Scenario Simulator (Elimination) */}
                  <div className="lg:col-span-8 flex flex-col justify-start space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block">Knockout Stage Scenario Outcomes ({selectedMatchAnalysis.ptValue} pts each)</span>
                        {selectedHotness === "HOT" && (
                          <span className="bg-orange-500/10 text-orange-400 border border-orange-500/25 px-1.5 py-0.5 rounded font-bold text-[7px] uppercase tracking-wider">
                            🔥 HOT MATCH
                          </span>
                        )}
                        {selectedHotness === "COLD" && (
                          <span className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 px-1.5 py-0.5 rounded font-bold text-[7px] uppercase tracking-wider">
                            ❄️ COLD
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Outcome A: Team 0 wins */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3.5 space-y-3">
                          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                            <img src={flagUrl(selectedMatchAnalysis.teams[0])} alt="" referrerPolicy="no-referrer" className="w-5 h-3.5 rounded shadow-sm" />
                            <span className="text-[11px] font-bold text-white">If <span className="text-blue-400">{selectedMatchAnalysis.teams[0]}</span> Advances</span>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-mono">
                              <span className="text-slate-400">Roberto P. Points:</span>
                              <span className={selectedMatchAnalysis.outcomes.A.robPts > 0 ? "text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[9px]" : "text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded text-[9px]"}>
                                +{selectedMatchAnalysis.outcomes.A.robPts} pts
                              </span>
                            </div>

                            {/* Gap outcomes */}
                            {selectedMatchAnalysis.competitors.leader && (
                              <div className="flex justify-between items-center text-[10px] font-mono">
                                <span className="text-slate-400">Vs Leader ({selectedMatchAnalysis.competitors.leader.compName}):</span>
                                <span className={selectedMatchAnalysis.outcomes.A.gainVsLeader > 0 ? "text-emerald-400 font-bold" : selectedMatchAnalysis.outcomes.A.gainVsLeader < 0 ? "text-rose-400 font-bold" : "text-slate-400 font-bold"}>
                                  {selectedMatchAnalysis.outcomes.A.gainVsLeader > 0 ? `+${selectedMatchAnalysis.outcomes.A.gainVsLeader} gain` : selectedMatchAnalysis.outcomes.A.gainVsLeader < 0 ? `${selectedMatchAnalysis.outcomes.A.gainVsLeader} loss` : "0 (No change)"}
                                </span>
                              </div>
                            )}

                            {selectedMatchAnalysis.competitors.above && (
                              <div className="flex justify-between items-center text-[10px] font-mono">
                                <span className="text-slate-400">Vs Above ({selectedMatchAnalysis.competitors.above.compName}):</span>
                                <span className={selectedMatchAnalysis.outcomes.A.gainVsAbove > 0 ? "text-emerald-400 font-bold" : selectedMatchAnalysis.outcomes.A.gainVsAbove < 0 ? "text-rose-400 font-bold" : "text-slate-400 font-bold"}>
                                  {selectedMatchAnalysis.outcomes.A.gainVsAbove > 0 ? `+${selectedMatchAnalysis.outcomes.A.gainVsAbove} gain` : selectedMatchAnalysis.outcomes.A.gainVsAbove < 0 ? `${selectedMatchAnalysis.outcomes.A.gainVsAbove} loss` : "0 (No change)"}
                                </span>
                              </div>
                            )}

                            {selectedMatchAnalysis.competitors.below && (
                              <div className="flex justify-between items-center text-[10px] font-mono">
                                <span className="text-slate-400 font-sans">Vs Below ({selectedMatchAnalysis.competitors.below.compName}):</span>
                                <span className={selectedMatchAnalysis.outcomes.A.gainVsBelow > 0 ? "text-emerald-400 font-bold" : selectedMatchAnalysis.outcomes.A.gainVsBelow < 0 ? "text-rose-400 font-bold" : "text-slate-400 font-bold"}>
                                  {selectedMatchAnalysis.outcomes.A.gainVsBelow > 0 ? `+${selectedMatchAnalysis.outcomes.A.gainVsBelow} gain` : selectedMatchAnalysis.outcomes.A.gainVsBelow < 0 ? `${selectedMatchAnalysis.outcomes.A.gainVsBelow} loss` : "0 (No change)"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Outcome B: Team 1 wins */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3.5 space-y-3">
                          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                            <img src={flagUrl(selectedMatchAnalysis.teams[1])} alt="" referrerPolicy="no-referrer" className="w-5 h-3.5 rounded shadow-sm" />
                            <span className="text-[11px] font-bold text-white">If <span className="text-blue-400">{selectedMatchAnalysis.teams[1]}</span> Advances</span>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-mono">
                              <span className="text-slate-400 font-sans font-sans">Roberto P. Points:</span>
                              <span className={selectedMatchAnalysis.outcomes.B.robPts > 0 ? "text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[9px]" : "text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded text-[9px]"}>
                                +{selectedMatchAnalysis.outcomes.B.robPts} pts
                              </span>
                            </div>

                            {/* Gap outcomes */}
                            {selectedMatchAnalysis.competitors.leader && (
                              <div className="flex justify-between items-center text-[10px] font-mono">
                                <span className="text-slate-400">Vs Leader ({selectedMatchAnalysis.competitors.leader.compName}):</span>
                                <span className={selectedMatchAnalysis.outcomes.B.gainVsLeader > 0 ? "text-emerald-400 font-bold" : selectedMatchAnalysis.outcomes.B.gainVsLeader < 0 ? "text-rose-400 font-bold" : "text-slate-400 font-bold"}>
                                  {selectedMatchAnalysis.outcomes.B.gainVsLeader > 0 ? `+${selectedMatchAnalysis.outcomes.B.gainVsLeader} gain` : selectedMatchAnalysis.outcomes.B.gainVsLeader < 0 ? `${selectedMatchAnalysis.outcomes.B.gainVsLeader} loss` : "0 (No change)"}
                                </span>
                              </div>
                            )}

                            {selectedMatchAnalysis.competitors.above && (
                              <div className="flex justify-between items-center text-[10px] font-mono">
                                <span className="text-slate-400">Vs Above ({selectedMatchAnalysis.competitors.above.compName}):</span>
                                <span className={selectedMatchAnalysis.outcomes.B.gainVsAbove > 0 ? "text-emerald-400 font-bold" : selectedMatchAnalysis.outcomes.B.gainVsAbove < 0 ? "text-rose-400 font-bold" : "text-slate-400 font-bold"}>
                                  {selectedMatchAnalysis.outcomes.B.gainVsAbove > 0 ? `+${selectedMatchAnalysis.outcomes.B.gainVsAbove} gain` : selectedMatchAnalysis.outcomes.B.gainVsAbove < 0 ? `${selectedMatchAnalysis.outcomes.B.gainVsAbove} loss` : "0 (No change)"}
                                </span>
                              </div>
                            )}

                            {selectedMatchAnalysis.competitors.below && (
                              <div className="flex justify-between items-center text-[10px] font-mono">
                                <span className="text-slate-400">Vs Below ({selectedMatchAnalysis.competitors.below.compName}):</span>
                                <span className={selectedMatchAnalysis.outcomes.B.gainVsBelow > 0 ? "text-emerald-400 font-bold" : selectedMatchAnalysis.outcomes.B.gainVsBelow < 0 ? "text-rose-400 font-bold" : "text-slate-400 font-bold"}>
                                  {selectedMatchAnalysis.outcomes.B.gainVsBelow > 0 ? `+${selectedMatchAnalysis.outcomes.B.gainVsBelow} gain` : selectedMatchAnalysis.outcomes.B.gainVsBelow < 0 ? `${selectedMatchAnalysis.outcomes.B.gainVsBelow} loss` : "0 (No change)"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Stage Simulation Controls */}
            <div className="border-t border-slate-700/40 pt-4 mt-4">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/30 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex flex-col gap-1 text-left w-full md:w-auto">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wide font-mono">
                    <TrendingUp size={14} className="text-emerald-400" />
                    Stage Simulation Engine
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Project remaining matches of current stage to see predicted standings and leads in real-time
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto md:justify-end">
                  {/* Select Rival */}
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-slate-400 font-sans">against</span>
                    <select 
                      value={simRival?.nombre || ""}
                      onChange={(e) => {
                        const rival = porras.find(p => p.nombre === e.target.value);
                        setSimRival(rival || null);
                      }}
                      className="bg-slate-950 border border-slate-700/60 text-white text-[11px] font-mono py-1.5 px-3 rounded-lg focus:outline-none focus:border-blue-400 transition cursor-pointer"
                    >
                      <option value="">-- Select competitor --</option>
                      {porras
                        .filter(p => !p.nombre.toLowerCase().includes("roberto p"))
                        .map(p => (
                          <option key={p.id} value={p.nombre}>{p.nombre}</option>
                        ))}
                    </select>
                  </div>

                  {/* Scenario Picker */}
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-slate-400 font-sans">using</span>
                    <div className="inline-flex bg-slate-950 rounded-lg p-0.5 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setSimScenario("optimal")}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          simScenario === "optimal"
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Optimal
                      </button>
                      <button
                        type="button"
                        onClick={() => setSimScenario("probable")}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          simScenario === "probable"
                            ? "bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Probable
                      </button>
                    </div>
                    <span className="text-slate-400 font-sans">scenario</span>
                  </div>

                  {/* Run Button */}
                  <button
                    onClick={startSimulation}
                    disabled={!simRival}
                    className="w-full md:w-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 hover:text-slate-900 font-bold text-xs py-2 px-4 rounded-lg shadow-lg shadow-emerald-500/10 transition flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    <RefreshCw size={13} className="animate-spin-slow" />
                    Run Stage Simulation
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Row 4: Full Leaderboard (made slimmer) */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div>
              <h3 className="font-display font-bold text-xs text-blue-400 uppercase tracking-wider">
                Full Leaderboard
              </h3>
              <p className="text-[9px] text-slate-500 font-mono">Standings of all {scoredParticipants.length} players</p>
            </div>

            {/* Compact Search bar */}
            <div className="relative w-full sm:w-56">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search competitor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/60 rounded-lg py-1 pl-7 pr-3 text-[11px] font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 transition"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-700/50 rounded-lg max-h-[280px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-800">
                <tr className="text-slate-400 text-[8px] uppercase font-mono tracking-wider border-b border-slate-700">
                  <th className="py-1.5 px-3 text-center w-12">Pos</th>
                  <th className="py-1.5 px-3">Participant</th>
                  <th className="py-1.5 px-3 text-center">Groups</th>
                  <th className="py-1.5 px-3 text-center">R.32</th>
                  <th className="py-1.5 px-3 text-center">R.16</th>
                  <th className="py-1.5 px-3 text-center">QF</th>
                  <th className="py-1.5 px-3 text-center">SF</th>
                  <th className="py-1.5 px-3 text-center">Final</th>
                  <th className="py-1.5 px-3 text-center">Scorer</th>
                  <th className="py-1.5 px-3 text-center bg-blue-500/5 text-blue-400 font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/20">
                {scoredParticipants
                  .filter(p => p.nombre.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((p, idx) => {
                    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
                    const isRoberto = p.nombre.toLowerCase().includes("roberto p");
                    const matchingEntry = porras.find(e => e.nombre === p.nombre);
                    
                    return (
                      <tr 
                        key={p.nombre}
                        className={`hover:bg-slate-700/10 transition cursor-pointer ${
                          isRoberto ? "bg-blue-500/10 text-blue-300 font-bold" : "text-slate-300"
                        }`}
                        onClick={() => matchingEntry && setSelectedUser(matchingEntry)}
                      >
                        <td className="py-1.5 px-3 text-center font-mono font-bold text-slate-300">
                          {medal}
                        </td>
                        <td className="py-1.5 px-3 font-medium flex items-center justify-between">
                          <span className={isRoberto ? "text-blue-400 font-bold" : ""}>
                            {p.nombre}
                          </span>
                          <span className="text-[8px] text-blue-400/60 font-mono font-medium hover:text-blue-400 transition">View →</span>
                        </td>
                        <td className="py-1.5 px-3 text-center font-mono text-slate-400">{p.bk.grupos}</td>
                        <td className="py-1.5 px-3 text-center font-mono text-slate-400">{p.bk.r16}</td>
                        <td className="py-1.5 px-3 text-center font-mono text-slate-400">{p.bk.r8}</td>
                        <td className="py-1.5 px-3 text-center font-mono text-slate-400">{p.bk.r4}</td>
                        <td className="py-1.5 px-3 text-center font-mono text-slate-400">{p.bk.r2}</td>
                        <td className="py-1.5 px-3 text-center font-mono text-slate-400">{p.bk.final}</td>
                        <td className="py-1.5 px-3 text-center font-mono text-slate-400">{p.bk.pichi}</td>
                        <td className="py-1.5 px-3 text-center font-mono font-bold bg-blue-500/5 text-emerald-400">{p.pts}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Row 5: Integrated Predictions & Head-to-Head Table */}
        {robertoScore && (
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 border-b border-slate-700/40 pb-3">
              <div>
                <h3 className="font-display font-bold text-xs text-blue-400 uppercase tracking-wider">
                  Predictions & Head-to-Head Duel
                </h3>
                <p className="text-[9px] text-slate-500 font-mono">Compare predictions and check calculated points side-by-side</p>
              </div>

              {/* Controls (Rival Dropdown + Match search) */}
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-slate-400 uppercase">Rival:</span>
                  <select 
                    value={compareUser?.nombre || ""}
                    onChange={(e) => {
                      const rival = porras.find(p => p.nombre === e.target.value);
                      setCompareUser(rival || null);
                    }}
                    className="bg-slate-950 border border-slate-700/60 text-white text-[11px] font-mono py-1 px-2 rounded-md focus:outline-none focus:border-blue-400"
                  >
                    <option value="">-- Select competitor --</option>
                    {porras
                      .filter(p => !p.nombre.toLowerCase().includes("roberto p"))
                      .map(p => (
                        <option key={p.id} value={p.nombre}>{p.nombre}</option>
                      ))}
                  </select>
                </div>

                {comparisonTab === "groups" && (
                  <div className="relative flex-1 sm:w-44">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Filter by team/group..."
                      value={matchSearchQuery}
                      onChange={(e) => setMatchSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/60 rounded-md py-1 pl-7 pr-2 text-[10px] font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Stage Selector Tabs */}
            <div className="flex flex-wrap gap-2 mb-4 bg-slate-900/50 p-1 rounded-lg border border-slate-700/40">
              <button
                onClick={() => setComparisonTab("groups")}
                className={`flex-1 min-w-[120px] text-center py-1.5 rounded-md text-[11px] font-medium transition cursor-pointer border ${
                  comparisonTab === "groups"
                    ? "bg-blue-500/15 text-blue-400 border-blue-500/30 shadow-sm font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                ⚽ Group Stage Matches
              </button>
              <button
                onClick={() => setComparisonTab("knockout")}
                className={`flex-1 min-w-[120px] text-center py-1.5 rounded-md text-[11px] font-medium transition cursor-pointer border ${
                  comparisonTab === "knockout"
                    ? "bg-blue-500/15 text-blue-400 border-blue-500/30 shadow-sm font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                🏆 Elimination Rounds Selections
              </button>
            </div>

            {comparisonTab === "groups" ? (
              <div className="overflow-x-auto border border-slate-700/50 rounded-lg max-h-[380px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="sticky top-0 z-10 bg-slate-800 text-[8px] uppercase font-mono text-slate-400 tracking-wider border-b border-slate-700">
                    <tr>
                      <th className="py-2 px-3 text-center w-12">Gp</th>
                      <th className="py-2 px-3">Match</th>
                      <th className="py-2 px-3 text-center bg-emerald-500/5 text-emerald-400">Roberto P. Pred</th>
                      <th className="py-2 px-3 text-center bg-blue-500/5 text-blue-400">
                        {compareUser ? `${compareUser.nombre} Pred` : "Rival Pred"}
                      </th>
                      <th className="py-2 px-3 text-center">Real Result</th>
                      <th className="py-2 px-3 text-center w-40 bg-slate-900/40">H2H Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/20">
                    {filteredMatches.map(({ g, m, matchId }) => {
                      const realScore = realResults?.grupos[matchId];
                      const robPredict = robertoScore.entry?.grupos[matchId];
                      const rivalPredict = compareUser?.grupos[matchId];

                      const robPts = getPointsForMatch(robPredict, realScore);
                      const rivPts = getPointsForMatch(rivalPredict, realScore);

                      const isPlayed = realScore && realScore.h !== "" && realScore.a !== "";

                      // Head-to-Head outcome cell content
                      let h2hOutcomeNode = null;
                      if (!isPlayed) {
                        h2hOutcomeNode = <span className="text-slate-500 italic font-mono text-[9px]">Pending Match</span>;
                      } else if (robPts !== null && rivPts !== null) {
                        if (robPts > rivPts) {
                          h2hOutcomeNode = (
                            <span className="px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded text-[9px] font-bold">
                              RP won (+{robPts} vs +{rivPts})
                            </span>
                          );
                        } else if (robPts < rivPts) {
                          h2hOutcomeNode = (
                            <span className="px-1.5 py-0.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded text-[9px] font-bold">
                              Rival won (+{rivPts} vs +{robPts})
                            </span>
                          );
                        } else {
                          h2hOutcomeNode = (
                            <span className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 rounded text-[9px] font-mono">
                              Tie (+{robPts} each)
                            </span>
                          );
                        }
                      }

                      return (
                        <tr key={matchId} className="hover:bg-slate-700/10 transition">
                          <td className="py-1.5 px-3 text-center font-mono font-bold text-slate-500">
                            {g}
                          </td>
                          <td className="py-1.5 px-3 font-medium text-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="truncate max-w-[90px]">{m[0]}</span>
                              <span className="text-[9px] text-slate-500 font-normal">vs</span>
                              <span className="truncate max-w-[90px]">{m[1]}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-3 text-center font-mono font-bold text-emerald-400 bg-emerald-500/5">
                            {robPredict && robPredict.h !== "" ? `${robPredict.h}-${robPredict.a}` : "—"}
                            {robPts !== null && <span className="text-[8px] text-slate-400 font-normal block">({robPts} pts)</span>}
                          </td>
                          <td className="py-1.5 px-3 text-center font-mono font-bold text-blue-400 bg-blue-500/5">
                            {rivalPredict && rivalPredict.h !== "" ? `${rivalPredict.h}-${rivalPredict.a}` : "—"}
                            {rivPts !== null && <span className="text-[8px] text-slate-400 font-normal block">({rivPts} pts)</span>}
                          </td>
                          <td className={`py-1.5 px-3 text-center font-mono font-bold ${isPlayed ? "text-white" : "text-slate-600"}`}>
                            {isPlayed ? `${realScore.h}-${realScore.a}` : "Pending"}
                          </td>
                          <td className="py-1.5 px-3 text-center bg-slate-900/20">
                            {h2hOutcomeNode}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Knockout Round Pills */}
                <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-700/20">
                  {[
                    { id: "r32", label: "R32 (Round of 32)" },
                    { id: "r16", label: "R16 (Round of 16)" },
                    { id: "r8", label: "QF (Quarterfinals)" },
                    { id: "r4", label: "SF (Semifinals)" },
                    { id: "final", label: "Finals & Scorers" }
                  ].map((round) => (
                    <button
                      key={round.id}
                      onClick={() => setKnockoutStageTab(round.id as any)}
                      className={`px-3 py-1 rounded-full text-[10px] font-mono transition cursor-pointer border ${
                        knockoutStageTab === round.id
                          ? "bg-blue-600/15 border-blue-500/40 text-blue-400 font-bold"
                          : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {round.label}
                    </button>
                  ))}
                </div>

                {knockoutStageTab !== "final" ? (() => {
                  let realTeams: string[] = [];
                  let robTeams: string[] = [];
                  let rivalTeams: string[] = [];
                  let ptValue = 5;
                  let stageName = "";

                  if (knockoutStageTab === "r32") {
                    realTeams = normalizeTeamList(realResults?.knockout?.r16);
                    robTeams = getR32Teams(robertoScore.entry);
                    rivalTeams = compareUser ? getR32Teams(compareUser) : [];
                    stageName = "Round of 32 (1/16)";
                  } else if (knockoutStageTab === "r16") {
                    realTeams = normalizeTeamList(realResults?.knockout?.r8);
                    robTeams = getKnockoutTeams(robertoScore.entry, "r16");
                    rivalTeams = compareUser ? getKnockoutTeams(compareUser, "r16") : [];
                    stageName = "Round of 16 (1/8)";
                  } else if (knockoutStageTab === "r8") {
                    realTeams = normalizeTeamList(realResults?.knockout?.r4);
                    robTeams = getKnockoutTeams(robertoScore.entry, "r8");
                    rivalTeams = compareUser ? getKnockoutTeams(compareUser, "r8") : [];
                    stageName = "Quarterfinals (1/4)";
                  } else if (knockoutStageTab === "r4") {
                    realTeams = normalizeTeamList(realResults?.knockout?.r2);
                    robTeams = getKnockoutTeams(robertoScore.entry, "r4");
                    rivalTeams = compareUser ? getKnockoutTeams(compareUser, "r4") : [];
                    stageName = "Semifinals (1/2)";
                  }

                  // Filter out empty entries
                  realTeams = realTeams.filter(Boolean);
                  robTeams = robTeams.filter(Boolean);
                  rivalTeams = rivalTeams.filter(Boolean);

                  const sortedRobTeams = [...robTeams].sort((a, b) => a.localeCompare(b));
                  const sortedRivalTeams = [...rivalTeams].sort((a, b) => a.localeCompare(b));

                   const isTeamEliminatedAtStage = (team: string, stage: string) => {
                    if (!realResults?.knockout) return false;
                    const ko = realResults.knockout;

                    const r16Real = normalizeTeamList(ko.r16); // 32 teams in Round of 32 (1/16)
                    const r8Real = normalizeTeamList(ko.r8);   // 16 teams in Round of 16 (1/8)
                    const r4Real = normalizeTeamList(ko.r4);   // 8 teams in Quarterfinals (1/4)
                    const r2Real = normalizeTeamList(ko.r2);   // 4 teams in Semifinals (1/2)

                    // 1. Stage "r32" (Checking elimination during Round of 32)
                    if (stage === "r32") {
                      if (r16Real.length < 32) {
                        return false; 
                      }
                      if (!r16Real.includes(team)) {
                        return true;
                      }
                      const matchups = getEntryQualifiers(realResults.grupos || {});
                      const match = matchups.find(m => m.a === team || m.b === team);
                      if (match) {
                        const opponent = match.a === team ? match.b : match.a;
                        if (r8Real.includes(opponent)) {
                          return true;
                        }
                        if (r8Real.includes(team)) {
                          return false;
                        }
                      }
                      return false;
                    }

                    // 2. Stage "r16" (Checking elimination during Round of 16)
                    if (stage === "r16") {
                      if (r8Real.length < 16) {
                        return isTeamEliminatedAtStage(team, "r32");
                      }
                      if (!r8Real.includes(team)) {
                        return true;
                      }
                      const r32Matches = getEntryQualifiers(realResults.grupos || {});
                      const prevR16 = r32Matches.map(({ m, a, b }) => ({ matchId: m, teams: [a, b] as [string, string] }));
                      const r16Pairs = deriveBracketRound(prevR16, r8Real, BRACKET_R32_TO_R16, 8);
                      for (const [t1, t2] of r16Pairs) {
                        if (t1 === team || t2 === team) {
                          const opponent = t1 === team ? t2 : t1;
                          if (opponent && r4Real.includes(opponent)) {
                            return true;
                          }
                          if (r4Real.includes(team)) {
                            return false;
                          }
                        }
                      }
                      return false;
                    }

                    // 3. Stage "r8" (Checking elimination during Quarterfinals)
                    if (stage === "r8") {
                      if (r4Real.length < 8) {
                        return isTeamEliminatedAtStage(team, "r16");
                      }
                      if (!r4Real.includes(team)) {
                        return true;
                      }
                      const r32Matches = getEntryQualifiers(realResults.grupos || {});
                      const prevR16 = r32Matches.map(({ m, a, b }) => ({ matchId: m, teams: [a, b] as [string, string] }));
                      const r16Pairs = deriveBracketRound(prevR16, r8Real, BRACKET_R32_TO_R16, 8);
                      const prevQF = r16Pairs.map((teams, i) => ({ matchId: `R16-${i}`, teams }));
                      const qfPairs = deriveBracketRound(prevQF, r4Real, BRACKET_R16_TO_QF, 4);
                      for (const [t1, t2] of qfPairs) {
                        if (t1 === team || t2 === team) {
                          const opponent = t1 === team ? t2 : t1;
                          if (opponent && r2Real.includes(opponent)) {
                            return true;
                          }
                          if (r2Real.includes(team)) {
                            return false;
                          }
                        }
                      }
                      return false;
                    }

                    // 4. Stage "r4" (Checking elimination during Semifinals)
                    if (stage === "r4") {
                      if (r2Real.length < 4) {
                        return isTeamEliminatedAtStage(team, "r8");
                      }
                      if (!r2Real.includes(team)) {
                        return true;
                      }
                      const finalObj = ko.final || { champ: "", sub: "" };
                      const r32Matches = getEntryQualifiers(realResults.grupos || {});
                      const prevR16 = r32Matches.map(({ m, a, b }) => ({ matchId: m, teams: [a, b] as [string, string] }));
                      const r16Pairs = deriveBracketRound(prevR16, r8Real, BRACKET_R32_TO_R16, 8);
                      const prevQF = r16Pairs.map((teams, i) => ({ matchId: `R16-${i}`, teams }));
                      const qfPairs = deriveBracketRound(prevQF, r4Real, BRACKET_R16_TO_QF, 4);
                      const prevSF = qfPairs.map((teams, i) => ({ matchId: `QF-${i}`, teams }));
                      const sfPairs = deriveBracketRound(prevSF, r2Real, BRACKET_QF_TO_SF, 2);
                      let foundSFMatch = false;
                      for (const [t1, t2] of sfPairs) {
                        if (t1 === team || t2 === team) {
                          foundSFMatch = true;
                          const opponent = t1 === team ? t2 : t1;
                          const hasLost = (finalObj.champ === opponent || finalObj.sub === opponent);
                          if (hasLost) {
                            return true;
                          }
                          const hasWon = (finalObj.champ === team || finalObj.sub === team);
                          if (hasWon) {
                            return false;
                          }
                        }
                      }
                      return false;
                    }

                    return false;
                  };

                  return (
                    <div className="space-y-4">
                      {/* Real qualified reference bar */}
                      <div className="bg-slate-900/40 border border-slate-700/50 p-3 rounded-lg">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wide block mb-2">
                          🎯 Real Qualified Teams for {stageName} ({realTeams.length} total)
                        </span>
                        {realTeams.length === 0 ? (
                          <span className="text-xs text-slate-500 italic font-mono">No real results registered yet for this stage.</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {realTeams.map((team) => (
                              <span 
                                key={team} 
                                className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-[10px] font-medium rounded-full text-slate-200"
                              >
                                {team}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Roberto P. */}
                        <div className="bg-slate-950/20 border border-slate-700/50 rounded-xl p-3 flex flex-col">
                          <div className="flex justify-between items-center mb-2.5 border-b border-slate-800 pb-1.5">
                            <strong className="text-xs text-white font-display">Roberto P.'s Predictions</strong>
                            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                              Score: {robTeams.filter((t) => realTeams.includes(t)).length * ptValue} pts
                            </span>
                          </div>

                          {sortedRobTeams.length === 0 ? (
                            <span className="text-xs text-slate-500 italic py-4 text-center">No predictions registered</span>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {sortedRobTeams.map((team) => {
                                const isCorrect = realTeams.includes(team);
                                const isEliminated = isTeamEliminatedAtStage(team, knockoutStageTab);
                                return (
                                  <div 
                                    key={team} 
                                    className={`p-2 rounded-lg border flex items-center justify-between text-[11px] font-mono transition ${
                                      isCorrect 
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold"
                                        : isEliminated
                                          ? "bg-rose-500/10 border-rose-500/20 text-rose-400 font-medium"
                                          : "bg-slate-900/40 border-slate-700/40 text-slate-300"
                                    }`}
                                  >
                                    <span className="truncate">{team}</span>
                                    {(isCorrect || isEliminated) && (
                                      <span className="text-[9px] font-bold">
                                        {isCorrect ? `✔ +${ptValue}` : "✘ 0"}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Rival */}
                        <div className="bg-slate-950/20 border border-slate-700/50 rounded-xl p-3 flex flex-col">
                          <div className="flex justify-between items-center mb-2.5 border-b border-slate-800 pb-1.5">
                            <strong className="text-xs text-white font-display">
                              {compareUser ? `${compareUser.nombre}'s Predictions` : "Rival's Predictions"}
                            </strong>
                            <span className="text-[10px] font-mono text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                              Score: {rivalTeams.filter((t) => realTeams.includes(t)).length * ptValue} pts
                            </span>
                          </div>

                          {!compareUser ? (
                            <span className="text-xs text-slate-500 italic py-4 text-center">Please select a rival competitor above</span>
                          ) : sortedRivalTeams.length === 0 ? (
                            <span className="text-xs text-slate-500 italic py-4 text-center">No predictions registered</span>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {sortedRivalTeams.map((team) => {
                                const isCorrect = realTeams.includes(team);
                                const isEliminated = isTeamEliminatedAtStage(team, knockoutStageTab);
                                return (
                                  <div 
                                    key={team} 
                                    className={`p-2 rounded-lg border flex items-center justify-between text-[11px] font-mono transition ${
                                      isCorrect 
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold"
                                        : isEliminated
                                          ? "bg-rose-500/10 border-rose-500/20 text-rose-400 font-medium"
                                          : "bg-slate-900/40 border-slate-700/40 text-slate-300"
                                    }`}
                                  >
                                    <span className="truncate">{team}</span>
                                    {(isCorrect || isEliminated) && (
                                      <span className="text-[9px] font-bold">
                                        {isCorrect ? `✔ +${ptValue}` : "✘ 0"}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })() : (() => {
                  const rf = realResults?.knockout?.final || { champ: "", sub: "", third: "" };
                  const rp = realResults?.knockout?.pichi || { world: "", esp: "" };

                  const robF = robertoScore.entry?.knockout?.final || { champ: "", sub: "", third: "" };
                  const robP = robertoScore.entry?.pichichi || { world: "", esp: "" };

                  const rivF = compareUser?.knockout?.final || { champ: "", sub: "", third: "" };
                  const rivP = compareUser?.pichichi || { world: "", esp: "" };

                  const getFinalsAndScorersBreakdown = (entry: Entry | null) => {
                    if (!entry) return { champPts: 0, subPts: 0, thirdPts: 0, worldPts: 0, espPts: 0, total: 0 };
                    
                    const uf = entry.knockout?.final || { champ: "", sub: "", third: "" };
                    const up = entry.pichichi || { world: "", esp: "" };

                    let champPts = 0;
                    let subPts = 0;
                    let thirdPts = 0;
                    let worldPts = 0;
                    let espPts = 0;

                    // Finals logic
                    if (rf.champ && [uf.champ, uf.sub].includes(rf.champ)) {
                      if (uf.champ === rf.champ) champPts += 10;
                      if (uf.sub === rf.champ) subPts += 10;
                    }
                    if (rf.sub && [uf.champ, uf.sub].includes(rf.sub)) {
                      if (uf.champ === rf.sub) champPts += 10;
                      if (uf.sub === rf.sub) subPts += 10;
                    }
                    if (rf.champ && uf.champ === rf.champ) {
                      champPts += 20;
                    }
                    if (rf.third && uf.third === rf.third) {
                      thirdPts = 5;
                    }

                    // Pichichi logic
                    if (rp.world && up.world && rp.world.toLowerCase().trim() === up.world.toLowerCase().trim()) {
                      worldPts = 7;
                    }
                    if (rp.esp && up.esp && rp.esp.toLowerCase().trim() === up.esp.toLowerCase().trim()) {
                      espPts = 5;
                    }

                    const total = champPts + subPts + thirdPts + worldPts + espPts;
                    return { champPts, subPts, thirdPts, worldPts, espPts, total };
                  };

                  const robBreakdown = getFinalsAndScorersBreakdown(robertoScore.entry);
                  const rivBreakdown = getFinalsAndScorersBreakdown(compareUser);

                  const categories = [
                    { 
                      label: "🏆 Champion", 
                      real: rf.champ, 
                      robPred: robF.champ, 
                      robPts: robBreakdown.champPts, 
                      rivPred: rivF.champ, 
                      rivPts: rivBreakdown.champPts,
                      bonusDesc: "20 pts if correct champ, 10 pts if finalist" 
                    },
                    { 
                      label: "🥈 Runner-up", 
                      real: rf.sub, 
                      robPred: robF.sub, 
                      robPts: robBreakdown.subPts, 
                      rivPred: rivF.sub, 
                      rivPts: rivBreakdown.subPts,
                      bonusDesc: "10 pts if finalist" 
                    },
                    { 
                      label: "🥉 3rd Place", 
                      real: rf.third, 
                      robPred: robF.third, 
                      robPts: robBreakdown.thirdPts, 
                      rivPred: rivF.third, 
                      rivPts: rivBreakdown.thirdPts,
                      bonusDesc: "5 pts if correct" 
                    },
                    { 
                      label: "🌎 Golden Boot (World)", 
                      real: rp.world, 
                      robPred: robP.world, 
                      robPts: robBreakdown.worldPts, 
                      rivPred: rivP.world, 
                      rivPts: rivBreakdown.worldPts,
                      bonusDesc: "7 pts if correct" 
                    },
                    { 
                      label: "🇪🇸 Spain Top Scorer", 
                      real: rp.esp, 
                      robPred: robP.esp, 
                      robPts: robBreakdown.espPts, 
                      rivPred: rivP.esp, 
                      rivPts: rivBreakdown.espPts,
                      bonusDesc: "5 pts if correct" 
                    }
                  ];

                  return (
                    <div className="space-y-4">
                      <div className="overflow-x-auto border border-slate-700/50 rounded-lg">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="bg-slate-800 text-slate-400 text-[8px] uppercase font-mono tracking-wider border-b border-slate-700">
                              <th className="py-2.5 px-3">Category</th>
                              <th className="py-2.5 px-3">Real Result</th>
                              <th className="py-2.5 px-3 text-center bg-emerald-500/5 text-emerald-400">Roberto P. Prediction</th>
                              <th className="py-2.5 px-3 text-center bg-blue-500/5 text-blue-400">
                                {compareUser ? `${compareUser.nombre} Prediction` : "Rival Prediction"}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/20 font-mono">
                            {categories.map((cat, idx) => {
                              const hasResult = cat.real !== "" && cat.real !== undefined;
                              return (
                                <tr key={idx} className="hover:bg-slate-700/10 transition">
                                  <td className="py-3 px-3">
                                    <div className="font-semibold text-slate-200">{cat.label}</div>
                                    <div className="text-[8px] text-slate-500 font-normal mt-0.5">{cat.bonusDesc}</div>
                                  </td>
                                  <td className={`py-3 px-3 font-bold ${hasResult ? "text-slate-200" : "text-slate-500 italic"}`}>
                                    {hasResult ? cat.real : "Pending"}
                                  </td>
                                  <td className="py-3 px-3 text-center bg-emerald-500/5 text-slate-200">
                                    <div className={`font-bold ${hasResult && cat.robPts > 0 ? "text-emerald-400" : ""}`}>
                                      {cat.robPred || "—"}
                                    </div>
                                    {hasResult && (
                                      <div className="text-[9px] text-slate-400 mt-0.5">({cat.robPts} pts)</div>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-center bg-blue-500/5 text-slate-200">
                                    {!compareUser ? (
                                      <span className="text-slate-500 italic">No Rival Selected</span>
                                    ) : (
                                      <>
                                        <div className={`font-bold ${hasResult && cat.rivPts > 0 ? "text-blue-400" : ""}`}>
                                          {cat.rivPred || "—"}
                                        </div>
                                        {hasResult && (
                                          <div className="text-[9px] text-slate-400 mt-0.5">({cat.rivPts} pts)</div>
                                        )}
                                      </>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Summary points row */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-mono">Roberto P. Total Finals/Scorers Pts:</span>
                          <strong className="text-emerald-400 font-mono text-sm">{robBreakdown.total} pts</strong>
                        </div>
                        <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-mono">{compareUser ? compareUser.nombre : "Rival"} Total Finals/Scorers Pts:</span>
                          <strong className="text-blue-400 font-mono text-sm">{compareUser ? rivBreakdown.total : 0} pts</strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

      </main>

      {/* MODAL: DETAILED PROFILE FOR ANY MEMBER */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-[#000000]/85 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-700/80 rounded-xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
          >
            {/* Modal header */}
            <div className="p-4 border-b border-slate-700/60 flex justify-between items-center bg-slate-950/40">
              <div>
                <h3 className="font-display font-bold text-base text-white">{selectedUser.nombre}</h3>
                <p className="text-[10px] text-slate-400 font-mono">Viewing complete predictor sheet</p>
              </div>
              <button 
                onClick={() => setSelectedUser(null)}
                className="p-1 text-slate-400 hover:text-white transition"
              >
                <XCircle size={18} />
              </button>
            </div>

            {/* Modal scrollable body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Category Standings details */}
              <div>
                <h4 className="font-display font-bold text-[10px] text-blue-400 uppercase tracking-wider mb-2">
                  Points & Standings
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-center">
                  <div className="p-2 bg-slate-950/40 rounded-lg border border-slate-700/50">
                    <span className="text-slate-500 text-[8px] block uppercase">Group Points</span>
                    <strong className="text-sm text-white mt-0.5 block">
                      {scorePublicEntry(selectedUser, realResults?.knockout || {}, realResults?.grupos || {}).bk.grupos}
                    </strong>
                  </div>
                  <div className="p-2 bg-slate-950/40 rounded-lg border border-slate-700/50">
                    <span className="text-slate-500 text-[8px] block uppercase">R32 Points</span>
                    <strong className="text-sm text-white mt-0.5 block">
                      {scorePublicEntry(selectedUser, realResults?.knockout || {}, realResults?.grupos || {}).bk.r16}
                    </strong>
                  </div>
                  <div className="p-2 bg-slate-950/40 rounded-lg border border-slate-700/50">
                    <span className="text-slate-500 text-[8px] block uppercase">Advanced K.O.</span>
                    <strong className="text-sm text-white mt-0.5 block">
                      {(() => {
                        const s = scorePublicEntry(selectedUser, realResults?.knockout || {}, realResults?.grupos || {}).bk;
                        return s.r8 + s.r4 + s.r2 + s.final;
                      })()}
                    </strong>
                  </div>
                  <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <span className="text-blue-400 text-[8px] block uppercase">Total Points</span>
                    <strong className="text-sm text-blue-400 mt-0.5 block font-bold">
                      {scorePublicEntry(selectedUser, realResults?.knockout || {}, realResults?.grupos || {}).pts} pts
                    </strong>
                  </div>
                </div>
              </div>

              {/* Group Stage Predictions */}
              <div>
                <h4 className="font-display font-bold text-[10px] text-slate-300 uppercase tracking-wider mb-2">
                  Group Stage Predictions
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                  {Object.keys(GD).map((g) => {
                    return GD[g].map((m, i) => {
                      const matchId = `${g}-${i}`;
                      const pScore = selectedUser.grupos[matchId] || { h: "", a: "" };
                      const realScore = realResults?.grupos[matchId];
                      return (
                        <div key={matchId} className="p-2 bg-slate-950/20 rounded-lg border border-slate-700/40 flex items-center justify-between font-mono text-[10px]">
                          <span className="text-slate-500 font-bold">{g}</span>
                          <span className="text-slate-300 truncate max-w-[100px]">{m[0]} - {m[1]}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-blue-400">{pScore.h !== "" ? `${pScore.h}-${pScore.a}` : "—"}</span>
                            {realScore && realScore.h !== "" && (
                              <span className="text-[9px] text-slate-500 font-normal">({realScore.h}-{realScore.a})</span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })}
                </div>
              </div>

              {/* Scorers */}
              <div>
                <h4 className="font-display font-bold text-[10px] text-slate-300 uppercase tracking-wider mb-2">
                  Top Scorers
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2 bg-slate-950/40 rounded-lg border border-slate-700/50">
                    <span className="text-[8px] text-slate-500 font-mono block uppercase">World Cup Top Scorer</span>
                    <strong className="font-display text-blue-400 mt-0.5 block">
                      {selectedUser.pichichi?.world || "Not specified"}
                    </strong>
                  </div>
                  <div className="p-2 bg-slate-950/40 rounded-lg border border-slate-700/50">
                    <span className="text-[8px] text-slate-500 font-mono block uppercase">Spain Top Scorer</span>
                    <strong className="font-display text-emerald-400 mt-0.5 block">
                      {selectedUser.pichichi?.esp || "Not specified"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-3 border-t border-slate-700/60 flex justify-end bg-slate-950/40">
              <button 
                onClick={() => setSelectedUser(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold rounded-lg transition text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Stage Simulation Modal */}
      {isSimModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-700/80 max-w-4xl w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Modal header */}
            <div className="p-4 bg-slate-950/40 border-b border-slate-700/60 flex justify-between items-center">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Stage Simulation Live Run
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  Roberto P. vs <strong className="text-blue-400">{simRival?.nombre}</strong> • Scenario: <strong className="text-emerald-400 uppercase">{simScenario}</strong>
                </span>
              </div>
              <button 
                onClick={() => setIsSimModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm p-1 hover:bg-slate-800 rounded transition cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left & Center: Chart & Current Stats */}
              <div className="md:col-span-2 flex flex-col gap-4">
                <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4 flex flex-col justify-between min-h-[350px]">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 block">
                    Points Accumulation Trend
                  </span>
                  
                  {/* Recharts Chart */}
                  <div className="flex-1 flex items-center justify-center min-h-[280px]">
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart
                        data={simSteps.slice(0, simCurrentStep + 1)}
                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
                        <XAxis 
                          dataKey="matchName" 
                          stroke="#64748b" 
                          fontSize={9}
                          tickLine={false}
                          axisLine={{ stroke: '#334155' }}
                          tick={renderCustomTick}
                          height={45}
                        />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={9}
                          tickLine={false}
                          axisLine={{ stroke: '#334155' }}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                          labelStyle={{ color: '#94a3b8', fontSize: '10px', fontFamily: 'monospace' }}
                          itemStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
                        />
                        <Legend 
                          verticalAlign="top" 
                          height={30} 
                          wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }}
                        />
                        <Line 
                          name="Roberto P." 
                          type="monotone" 
                          dataKey="Roberto" 
                          stroke="#10b981" 
                          strokeWidth={2.5} 
                          dot={{ r: 3.5, fill: '#10b981', strokeWidth: 0 }} 
                          activeDot={{ r: 5, fill: '#34d399' }} 
                        />
                        <Line 
                          name={simRival?.nombre || "Rival"} 
                          type="monotone" 
                          dataKey="Rival" 
                          stroke="#3b82f6" 
                          strokeWidth={2.5} 
                          dot={{ r: 3.5, fill: '#3b82f6', strokeWidth: 0 }} 
                          activeDot={{ r: 5, fill: '#60a5fa' }} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Live Head-to-Head Stats Banner */}
                {simSteps[simCurrentStep] && (() => {
                  const curr = simSteps[simCurrentStep];
                  const diff = curr.Roberto - curr.Rival;
                  const isFinished = simCurrentStep === simSteps.length - 1;
                  
                  return (
                    <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
                      <div>
                        <span className="text-[9px] text-slate-500 font-mono block uppercase">Roberto P. Points</span>
                        <strong className="text-xl font-display text-emerald-400 mt-1 block">
                          {curr.Roberto}
                        </strong>
                        <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">
                          {curr.step > 0 ? `+${curr.robPtsGained} last match` : "starting"}
                        </span>
                      </div>
                      <div className="border-x border-slate-800 flex flex-col justify-center">
                        <span className="text-[9px] text-slate-500 font-mono block uppercase">Net Lead Change</span>
                        <strong className={`text-sm mt-1 block font-mono ${
                          diff > 0 ? "text-emerald-400 font-bold" : diff < 0 ? "text-rose-400 font-bold" : "text-slate-400"
                        }`}>
                          {diff > 0 ? `+${diff} Lead` : diff < 0 ? `${diff} Deficit` : "Tie"}
                        </strong>
                        <span className="text-[8px] text-slate-500 font-mono mt-0.5 block truncate">
                          {isFinished ? "Final projection" : `Match ${curr.step} of ${simSteps.length - 1}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 font-mono block uppercase">{simRival?.nombre} Points</span>
                        <strong className="text-xl font-display text-blue-400 mt-1 block">
                          {curr.Rival}
                        </strong>
                        <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">
                          {curr.step > 0 ? `+${curr.rivPtsGained} last match` : "starting"}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Right: Timeline list */}
              <div className="flex flex-col gap-4">
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col overflow-hidden max-h-[440px]">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-3 block border-b border-slate-800 pb-2 font-bold">
                    Match-by-Match Logs
                  </span>
                  
                  <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                    {simSteps.map((stepData) => {
                      const isStart = stepData.step === 0;
                      const isCompleted = stepData.step <= simCurrentStep;
                      const isActive = stepData.step === simCurrentStep + 1;
                      
                      if (isStart) {
                        return (
                          <div key="start" className={`p-2 rounded-lg border text-xs font-mono flex items-center justify-between ${
                            isCompleted ? "bg-slate-900/60 border-slate-800/80 text-slate-300" : "bg-slate-950 border-slate-950 text-slate-600"
                          }`}>
                            <span className="font-semibold text-slate-400">Starting Standings</span>
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-400 font-bold">{stepData.Roberto}</span>
                              <span className="text-slate-600">vs</span>
                              <span className="text-blue-400 font-bold">{stepData.Rival}</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={stepData.step} 
                          className={`p-2 rounded-lg border text-xs font-mono transition-all ${
                            isActive
                              ? "bg-emerald-500/10 border-emerald-500/50 text-white shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500/30"
                              : isCompleted
                              ? "bg-slate-900/40 border-slate-800 text-slate-300"
                              : "bg-slate-950/20 border-slate-900/40 text-slate-600"
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold truncate max-w-[150px]" title={stepData.matchLabel}>
                              {stepData.matchLabel}
                            </span>
                            <span className={`text-[8px] font-bold px-1 rounded uppercase tracking-wider ${
                              isActive 
                                ? "bg-emerald-500 text-slate-950 animate-pulse" 
                                : isCompleted 
                                ? "bg-slate-800 text-slate-400" 
                                : "bg-slate-900/50 text-slate-600"
                            }`}>
                              {isActive ? "Running" : isCompleted ? "Done" : "Pending"}
                            </span>
                          </div>

                          {isCompleted && (
                            <div className="flex justify-between items-center text-[10px] bg-slate-950/40 px-1.5 py-1 rounded mt-1.5 gap-2">
                              <span className="text-slate-400 text-[9px] font-sans italic truncate">
                                Outcome: <strong className="text-slate-200 not-italic font-mono">{stepData.simOutcomeLabel}</strong>
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={stepData.robPtsGained > 0 ? "text-emerald-400 font-bold" : "text-slate-500"}>
                                  +{stepData.robPtsGained}
                                </span>
                                <span className="text-slate-600">/</span>
                                <span className={stepData.rivPtsGained > 0 ? "text-blue-400 font-bold" : "text-slate-500"}>
                                  +{stepData.rivPtsGained}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer controls */}
            <div className="p-3 border-t border-slate-700/60 flex justify-between items-center bg-slate-950/40">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSimPlaying(!isSimPlaying)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold rounded-lg transition text-slate-200 cursor-pointer flex items-center gap-1"
                >
                  {isSimPlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() => {
                    setSimCurrentStep(0);
                    setIsSimPlaying(true);
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold rounded-lg transition text-slate-200 cursor-pointer"
                >
                  Restart
                </button>
              </div>

              <button 
                onClick={() => setIsSimModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold rounded-lg transition text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
      <Analytics />
      <SpeedInsights />
    </div>
  );
}
