// 球団と、その所属選手の生成
import { IKUSEI_TEMPLATE, ROSTER_TEMPLATE } from '../../config/generate';
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
  return { teams, players };
}
