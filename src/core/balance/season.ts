// 検証用：本番と同じ仕組みで1シーズン回し、成績をまとめる
import {
  DEFAULT_GAMES, DEFAULT_INTERLEAGUE_GAMES, DEFAULT_INTERLEAGUE_MODE, DEFAULT_TEAM_COUNTS, QUALIFY_IP_PER_GAME, QUALIFY_PA_PER_GAME,
} from '../../config/league';
import { advanceDays, createWorld } from '../season/advance';
import type { LeagueConfig, Player } from '../types';
import type { World } from '../season/types';

export interface TeamSeason {
  teamId: number;
  league: 0 | 1;
  games: number;
  avg: number;
  hr: number;
  runs: number;
  sb: number;
  era: number;
  // 参考値
  k: number;
  bb: number;
  errors: number;
  wins: number;
  obp: number;
  slg: number;
  /** 1試合あたりの打席数 */
  paPerGame: number;
}

export interface LeagueLeaders {
  league: 0 | 1;
  battingTitle: number;
  /** 首位打者の選手ID（調査用） */
  battingTitleId: number;
  hrKing: number;
  eraTitle: number;
}

export interface BalanceSeason {
  teams: TeamSeason[];
  leaders: LeagueLeaders[];
  leagueAvg: number;
  leagueEra: number;
  /** この検証で作った選手（調査用） */
  players: Player[];
}

/** 総当たりの組み合わせ（サークル方式）。奇数のときは1球団が休み */
export function roundRobinDays(teamIds: number[]): [number, number][][] {
  const ids = teamIds.length % 2 ? [...teamIds, -1] : [...teamIds];
  const n = ids.length;
  const days: [number, number][][] = [];
  const arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    const day: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== -1 && b !== -1) day.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    days.push(day);
    arr.splice(1, 0, arr.pop()!);
  }
  return days;
}

interface PlayerAgg {
  id: number;
  pa: number;
  ab: number;
  h: number;
  hr: number;
  outs: number;
  er: number;
  league: 0 | 1;
}

/** 本番と同じ仕組み（日程・一軍二軍・疲労・調子・入れ替え）で1シーズン回し、一軍の成績をまとめる */
export function runBalanceSeason(seed: number, counts: readonly [number, number] = DEFAULT_TEAM_COUNTS, games: number | null = null): BalanceSeason {
  const config: LeagueConfig = {
    teamCounts: [counts[0], counts[1]],
    games,
    interleague: { mode: DEFAULT_INTERLEAGUE_MODE, games: DEFAULT_INTERLEAGUE_GAMES },
    dh: [true, true],
    postseason: { teams: [3, 3], advantage: true },
  };
  const w = createWorld(seed, config, 2027, -1);
  advanceDays(w, 100000);
  return seasonMetrics(w);
}

/** 終わったシーズンの一軍の成績をまとめる（143試合に換算） */
export function seasonMetrics(w: World): BalanceSeason {
  const target = DEFAULT_GAMES;
  const stats = w.season.stats.first;
  const teamOf = new Map(w.players.map((p) => [p.id, p.teamId]));
  const leagueOf = new Map(w.teams.map((t) => [t.id, t.league]));

  const tAgg = new Map<number, { ab: number; h: number; hr: number; sb: number; er: number; outs: number; k: number; bb: number; pa: number; tb: number; ob: number; obd: number }>();
  for (const t of w.teams) tAgg.set(t.id, { ab: 0, h: 0, hr: 0, sb: 0, er: 0, outs: 0, k: 0, bb: 0, pa: 0, tb: 0, ob: 0, obd: 0 });
  const pAgg: PlayerAgg[] = [];
  for (const [idStr, s] of Object.entries(stats)) {
    const id = Number(idStr);
    const tid = teamOf.get(id);
    if (tid == null) continue;
    const a = tAgg.get(tid)!;
    const b = s.bat;
    a.ab += b.ab; a.h += b.h; a.hr += b.hr; a.sb += b.sb; a.k += b.k; a.bb += b.bb; a.pa += b.pa;
    a.tb += b.h + b.d + 2 * b.t + 3 * b.hr; a.ob += b.h + b.bb + b.hbp; a.obd += b.ab + b.bb + b.hbp + b.sf;
    a.er += s.pitch.er; a.outs += s.pitch.outs;
    pAgg.push({ id, pa: b.pa, ab: b.ab, h: b.h, hr: b.hr, outs: s.pitch.outs, er: s.pitch.er, league: leagueOf.get(tid)! });
  }

  const gamesPlayed = w.season.schedule.games;
  const k = target / gamesPlayed;
  const teamSeasons: TeamSeason[] = w.teams.map((t) => {
    const a = tAgg.get(t.id)!;
    const st = w.season.standings.first[t.id];
    return {
      teamId: t.id, league: t.league, games: st.w + st.l + st.t,
      avg: a.h / a.ab, hr: a.hr * k, runs: st.rs * k, sb: a.sb * k, era: (a.er * 27) / a.outs,
      k: a.k / a.pa, bb: a.bb / a.pa, errors: 0, wins: st.w,
      obp: a.ob / a.obd, slg: a.tb / a.ab, paPerGame: a.pa / (st.w + st.l + st.t),
    };
  });

  const leaders: LeagueLeaders[] = ([0, 1] as const).map((lg) => {
    const ps = pAgg.filter((p) => p.league === lg);
    const qb = ps.filter((p) => p.pa >= gamesPlayed * QUALIFY_PA_PER_GAME);
    const qp = ps.filter((p) => p.outs / 3 >= gamesPlayed * QUALIFY_IP_PER_GAME);
    const best = qb.reduce<PlayerAgg | null>((b, p) => (!b || p.h / p.ab > b.h / b.ab ? p : b), null);
    return {
      league: lg,
      battingTitle: best ? best.h / best.ab : 0,
      battingTitleId: best?.id ?? -1,
      // 本塁打王は試合数の違いを143試合に換算
      hrKing: Math.max(0, ...ps.map((p) => p.hr)) * k,
      eraTitle: qp.length ? Math.min(...qp.map((p) => (p.er * 27) / p.outs)) : NaN,
    };
  });

  let h = 0, ab = 0, er = 0, outs = 0;
  for (const a of tAgg.values()) { h += a.h; ab += a.ab; er += a.er; outs += a.outs; }
  return { teams: teamSeasons, leaders, leagueAvg: h / ab, leagueEra: (er * 27) / outs, players: w.players };
}

/** 能力の平均（一軍の主力：各球団の野手上位9人・投手上位11人） */
export function talentLevel(w: World): { bat: number; pitch: number; age: number } {
  let bat = 0, pitch = 0, nb = 0, np = 0, age = 0, na = 0;
  for (const t of w.teams) {
    const ps = w.players.filter((p) => p.teamId === t.id && !p.retired && p.contract === 'roster');
    const fs = ps.filter((p) => p.mainPos !== 'P').map((p) => (p.bat.contact + p.bat.power + p.bat.speed + p.bat.defense) / 4).sort((a, b) => b - a).slice(0, 9);
    const pp = ps.filter((p) => p.pitch).map((p) => (p.pitch!.velocity + p.pitch!.control + p.pitch!.breaking + p.pitch!.stamina) / 4).sort((a, b) => b - a).slice(0, 11);
    bat += fs.reduce((a, b) => a + b, 0); nb += fs.length;
    pitch += pp.reduce((a, b) => a + b, 0); np += pp.length;
    for (const p of ps) { age += p.age; na++; }
  }
  return { bat: bat / nb, pitch: pitch / np, age: age / na };
}
