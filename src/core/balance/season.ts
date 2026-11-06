// 検証用の簡易シーズン（総当たりの日程で1シーズン回し、成績をまとめる）
import { DEFAULT_GAMES, DEFAULT_TEAM_COUNTS, QUALIFY_IP_PER_GAME, QUALIFY_PA_PER_GAME } from '../../config/league';
import { generateAiTeams } from '../generate/team';
import { NameRegistry } from '../names';
import { Rng } from '../rng';
import { relieverAvailable, selectFirstTeam, type FirstTeam } from '../season/firstTeam';
import { simulateGame } from '../sim/game';
import { buildGameTeam } from '../sim/lineup';
import type { Team } from '../types';

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
  hrKing: number;
  eraTitle: number;
}

export interface BalanceSeason {
  teams: TeamSeason[];
  leaders: LeagueLeaders[];
  leagueAvg: number;
  leagueEra: number;
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
  pa: number;
  ab: number;
  h: number;
  hr: number;
  outs: number;
  er: number;
  league: 0 | 1;
}

export function runBalanceSeason(seed: number, counts: readonly [number, number] = DEFAULT_TEAM_COUNTS, games = DEFAULT_GAMES): BalanceSeason {
  const rng = new Rng(seed);
  const { teams, players } = generateAiTeams(rng, new NameRegistry(), [counts[0], counts[1]]);
  const teamById = new Map<number, Team>(teams.map((t) => [t.id, t]));
  const first = new Map<number, FirstTeam>();
  for (const t of teams) first.set(t.id, selectFirstTeam(players.filter((p) => p.teamId === t.id)));

  const rotIdx = new Map<number, number>(teams.map((t) => [t.id, 0]));
  const recent = new Map<number, number[]>(); // 投手ID → 直近の球数
  const played = new Map<number, number>(teams.map((t) => [t.id, 0]));
  const tAgg = new Map<number, { ab: number; h: number; hr: number; runs: number; sb: number; er: number; outs: number; k: number; bb: number; pa: number; e: number; w: number; tb: number; ob: number }>();
  for (const t of teams) tAgg.set(t.id, { ab: 0, h: 0, hr: 0, runs: 0, sb: 0, er: 0, outs: 0, k: 0, bb: 0, pa: 0, e: 0, w: 0, tb: 0, ob: 0 });
  const pAgg = new Map<number, PlayerAgg>();

  const cycle = roundRobinDays(teams.map((t) => t.id));
  // 総当たりを繰り返し、全球団が指定の試合数以上になるまで行う（成績は試合数で換算する）
  const gamesPerCycle = teams.length - 1;
  const totalDays = Math.ceil(games / gamesPerCycle) * cycle.length;
  for (let dayNo = 0; dayNo < totalDays; dayNo++) {
    const day = cycle[dayNo % cycle.length];
    const flip = Math.floor(dayNo / cycle.length) % 2 === 1;
    const month = 3 + Math.min(7, Math.floor((dayNo / totalDays) * 7.5));
    const pitchedToday = new Map<number, number>();
    for (const [x, y] of day) {
      const [awayId, homeId] = flip ? [y, x] : [x, y];
      const make = (id: number) => {
        const ft = first.get(id)!;
        const starter = ft.rotation[rotIdx.get(id)! % ft.rotation.length];
        rotIdx.set(id, rotIdx.get(id)! + 1);
        const pen = ft.relievers.filter((p) => relieverAvailable(recent.get(p.id) ?? []));
        return buildGameTeam(teamById.get(id)!, [...ft.fielders, starter, ...pen], { dh: true, starter });
      };
      const away = make(awayId);
      const home = make(homeId);
      const r = simulateGame(rng, away, home, { dh: true, month, night: true });
      ([awayId, homeId] as const).forEach((id, s) => {
        played.set(id, played.get(id)! + 1);
        const a = tAgg.get(id)!;
        const league = teamById.get(id)!.league;
        a.runs += r.score[s];
        a.e += r.errors[s];
        if (r.score[s] > r.score[1 - s]) a.w++;
        for (const b of r.batting[s]) {
          a.ab += b.ab; a.h += b.h; a.hr += b.hr; a.sb += b.sb; a.k += b.k; a.bb += b.bb; a.pa += b.pa;
          a.tb += b.h + b.d + 2 * b.t + 3 * b.hr; a.ob += b.h + b.bb + b.hbp;
          const pa = pAgg.get(b.playerId) ?? { pa: 0, ab: 0, h: 0, hr: 0, outs: 0, er: 0, league };
          pa.pa += b.pa; pa.ab += b.ab; pa.h += b.h; pa.hr += b.hr;
          pAgg.set(b.playerId, pa);
        }
        for (const p of r.pitching[s]) {
          a.er += p.er; a.outs += p.outs;
          const pa = pAgg.get(p.playerId) ?? { pa: 0, ab: 0, h: 0, hr: 0, outs: 0, er: 0, league };
          pa.outs += p.outs; pa.er += p.er;
          pAgg.set(p.playerId, pa);
          pitchedToday.set(p.playerId, p.pitches);
        }
      });
    }
    // 投手の直近の球数を1日ずらす
    for (const t of teams) {
      const ft = first.get(t.id)!;
      for (const p of [...ft.rotation, ...ft.relievers]) {
        const prev = recent.get(p.id) ?? [];
        recent.set(p.id, [pitchedToday.get(p.id) ?? 0, prev[0] ?? 0]);
      }
    }
  }

  const teamSeasons: TeamSeason[] = teams.map((t) => {
    const a = tAgg.get(t.id)!;
    const g = played.get(t.id)!;
    const k = games / g;
    return {
      teamId: t.id, league: t.league, games: g,
      avg: a.h / a.ab, hr: a.hr * k, runs: a.runs * k, sb: a.sb * k, era: (a.er * 27) / a.outs,
      k: a.k / a.pa, bb: a.bb / a.pa, errors: a.e * k, wins: a.w,
      obp: a.ob / a.pa, slg: a.tb / a.ab, paPerGame: a.pa / g,
    };
  });

  const leaders: LeagueLeaders[] = ([0, 1] as const).map((lg) => {
    const ps = [...pAgg.values()].filter((p) => p.league === lg);
    const qb = ps.filter((p) => p.pa >= games * QUALIFY_PA_PER_GAME);
    const qp = ps.filter((p) => p.outs / 3 >= games * QUALIFY_IP_PER_GAME);
    return {
      league: lg,
      battingTitle: Math.max(0, ...qb.map((p) => p.h / p.ab)),
      hrKing: Math.max(0, ...ps.map((p) => p.hr)),
      eraTitle: qp.length ? Math.min(...qp.map((p) => (p.er * 27) / p.outs)) : NaN,
    };
  });

  let h = 0, ab = 0, er = 0, outs = 0;
  for (const a of tAgg.values()) { h += a.h; ab += a.ab; er += a.er; outs += a.outs; }
  return { teams: teamSeasons, leaders, leagueAvg: h / ab, leagueEra: (er * 27) / outs };
}
