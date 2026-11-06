// 球団と、その所属選手の生成
import { ABILITY_MAX, ABILITY_MIN, IKUSEI_TEMPLATE, ROSTER_TEMPLATE, TEAM_PARITY } from '../../config/generate';
import { batterOverall, pitcherOverall } from '../ratings';
import { salaryFor } from '../salary';
import { selectFirstTeam } from '../season/firstTeam';
import { CITY_CANDIDATES, COLOR_CANDIDATES, NICKNAME_CANDIDATES, STADIUM_SUFFIXES } from '../../config/teams';
import type { NameRegistry } from '../names';
import type { Rng } from '../rng';
import type { Logo, Player, Stadium, Team } from '../types';
import { generatePlayer } from './player';

export function generateStadium(rng: Rng, city: string, seaside: boolean): Stadium {
  const dome = rng.chance(0.4);
  const suffix = dome ? 'ドーム' : rng.pick(STADIUM_SUFFIXES.filter((s) => s !== 'ドーム'));
  return {
    name: `${city}${suffix}`,
    size: rng.weighted([['small', 3], ['normal', 5], ['large', 3]] as const),
    fence: rng.weighted([['low', 2], ['normal', 5], ['high', 2]] as const),
    terrace: rng.chance(0.2),
    dome,
    turf: dome ? 'artificial' : rng.chance(0.5) ? 'natural' : 'artificial',
    seaside: !dome && seaside,
  };
}

/** AI球団を1つ作る（名前の重複は呼び出し側で避ける） */
export function generateTeam(
  rng: Rng,
  id: number,
  league: 0 | 1,
  city: (typeof CITY_CANDIDATES)[number],
  nickname: string,
  colors: [string, string],
): Team {
  const logo: Logo = {
    shape: rng.pick(['shield', 'circle', 'emblem', 'diamond'] as const),
    motif: rng.pick(['animal', 'star', 'wave', 'bat', 'none'] as const),
    text: city.city.slice(0, 1),
    main: colors[0],
    sub: colors[1],
  };
  return {
    id,
    name: `${city.city}${nickname}`,
    shortName: city.city.slice(0, 2),
    homePref: city.pref,
    stadium: generateStadium(rng, city.city, city.seaside),
    logo,
    colorMain: colors[0],
    colorSub: colors[1],
    league,
    isUser: false,
  };
}

/** 球団の所属選手（支配下＋育成）を作る */
export function generateRoster(
  rng: Rng,
  names: NameRegistry,
  teamId: number,
  nextId: () => number,
): Player[] {
  const players: Player[] = [];
  for (const t of ROSTER_TEMPLATE) {
    for (let i = 0; i < t.count; i++) {
      players.push(generatePlayer(rng, names, nextId(), { pos: t.pos, role: t.role, teamId }));
    }
  }
  for (const t of IKUSEI_TEMPLATE) {
    for (let i = 0; i < t.count; i++) {
      // 育成選手は若手が中心
      players.push(generatePlayer(rng, names, nextId(), { pos: t.pos, role: t.role, teamId, contract: 'ikusei', age: rng.int(18, 24) }));
    }
  }
  return players;
}

export interface GeneratedLeague {
  teams: Team[];
  players: Player[];
  names: NameRegistry;
}

/** 既存のAI球団（リーグごとの球団数を指定）と選手をまとめて作る */
export function generateAiTeams(rng: Rng, names: NameRegistry, counts: [number, number]): { teams: Team[]; players: Player[] } {
  const total = counts[0] + counts[1];
  const cities = rng.shuffle(CITY_CANDIDATES).slice(0, total);
  const nicknames = rng.shuffle(NICKNAME_CANDIDATES);
  const colors = rng.shuffle(COLOR_CANDIDATES);
  const teams: Team[] = [];
  const players: Player[] = [];
  let pid = 1;
  for (let i = 0; i < total; i++) {
    const league: 0 | 1 = i < counts[0] ? 0 : 1;
    const team = generateTeam(rng, i + 1, league, cities[i], nicknames[i % nicknames.length], colors[i % colors.length]);
    teams.push(team);
    players.push(...generateRoster(rng, names, team.id, () => pid++));
  }
  equalizeTeams(teams, players, TEAM_PARITY);
  return { teams, players };
}

const clampAbility = (v: number) => Math.max(ABILITY_MIN, Math.min(ABILITY_MAX, Math.round(v)));

/** 一軍の平均能力（野手・投手別）をリーグ平均に近づけ、AI球団どうしの戦力差を縮める */
export function equalizeTeams(teams: Team[], players: Player[], parity: number): void {
  if (parity <= 0) return;
  const strength = new Map<number, { bat: number; pit: number }>();
  for (const t of teams) {
    const ft = selectFirstTeam(players.filter((p) => p.teamId === t.id));
    const bat = ft.fielders.slice(0, 10).reduce((s, p) => s + batterOverall(p.bat, p.mainPos as Exclude<Player['mainPos'], 'P'>), 0) / 10;
    const ps = [...ft.rotation, ...ft.relievers];
    const pit = ps.reduce((s, p) => s + pitcherOverall(p.pitch!, p.role!), 0) / ps.length;
    strength.set(t.id, { bat, pit });
  }
  const vals = [...strength.values()];
  const meanBat = vals.reduce((s, v) => s + v.bat, 0) / vals.length;
  const meanPit = vals.reduce((s, v) => s + v.pit, 0) / vals.length;
  for (const p of players) {
    const st = p.teamId != null ? strength.get(p.teamId) : undefined;
    if (!st) continue;
    if (p.pitch && p.pitchCap) {
      const d = (meanPit - st.pit) * parity;
      for (const k of ['velocity', 'control', 'breaking', 'stamina'] as const) {
        p.pitch[k] = clampAbility(p.pitch[k] + d);
        p.pitchCap[k] = Math.max(p.pitch[k], clampAbility(p.pitchCap[k] + d));
      }
    } else {
      const d = (meanBat - st.bat) * parity;
      for (const k of ['contact', 'power', 'speed', 'defense'] as const) {
        p.bat[k] = clampAbility(p.bat[k] + d);
        p.batCap[k] = Math.max(p.bat[k], clampAbility(p.batCap[k] + d));
      }
    }
    p.salary = salaryFor(p);
  }
}
