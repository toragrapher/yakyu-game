// 打順・守備・投手陣の自動編成（AIと、ユーザーの初期設定に使う）
import { pitcherOverall } from '../ratings';
import type { FieldPos, Player, Tactics, Team } from '../types';
import type { GameTeam, LineupSlot } from './types';

/** 本職以外を守るときの最低限の適性 */
const DEFAULT_FIT: Record<FieldPos, number> = { C: 10, '1B': 55, '2B': 25, '3B': 30, SS: 15, OF: 40 };
/** 守備の重さ（ポジションごと） */
const DEF_WEIGHT: Record<FieldPos, number> = { C: 0.5, SS: 0.45, '2B': 0.35, '3B': 0.25, OF: 0.25, '1B': 0.1 };
/** 守備位置を決める順番（難しいポジションから） */
const FILL_ORDER: FieldPos[] = ['C', 'SS', '2B', '3B', 'OF', 'OF', 'OF', '1B'];

export function fitAt(p: Player, pos: FieldPos): number {
  return p.posFit[pos] ?? DEFAULT_FIT[pos];
}

/** その守備位置での守備力（適性で割り引く） */
export function defenseAt(p: Player, pos: FieldPos): number {
  return p.bat.defense * (0.4 + 0.6 * (fitAt(p, pos) / 100));
}

const offense = (p: Player) => p.bat.contact * 0.5 + p.bat.power * 0.4 + p.bat.speed * 0.1;
const valueAt = (p: Player, pos: FieldPos) => offense(p) * (1 - DEF_WEIGHT[pos]) + defenseAt(p, pos) * DEF_WEIGHT[pos];

/** 9人（またはDHなしの8人＋投手）の打順を組む */
export function battingOrder(hitters: { player: Player; pos: LineupSlot['pos'] }[]): LineupSlot[] {
  const pool = hitters.filter((h) => h.pos !== 'P');
  const pitcher = hitters.find((h) => h.pos === 'P');
  const take = (score: (p: Player) => number) => {
    let best = 0;
    for (let i = 1; i < pool.length; i++) if (score(pool[i].player) > score(pool[best].player)) best = i;
    return pool.splice(best, 1)[0];
  };
  const order: (LineupSlot | undefined)[] = new Array(9);
  order[3] = take((p) => p.bat.power + p.bat.contact * 0.4); // 4番
  order[2] = take((p) => p.bat.contact + p.bat.power * 0.8); // 3番
  order[0] = take((p) => p.bat.contact + p.bat.speed * 0.8); // 1番
  order[4] = take((p) => p.bat.power + p.bat.contact * 0.5); // 5番
  order[1] = take((p) => p.bat.contact + p.bat.speed * 0.3); // 2番
  const restSlots = pitcher ? [5, 6, 7] : [5, 6, 7, 8];
  for (const s of restSlots) order[s] = take((p) => offense(p));
  if (pitcher) order[8] = pitcher;
  return order as LineupSlot[];
}

/** 野手の中から守備位置を決める */
export function assignDefense(fielders: Player[]): { player: Player; pos: FieldPos }[] {
  const left = fielders.slice();
  const result: { player: Player; pos: FieldPos }[] = [];
  for (const pos of FILL_ORDER) {
    if (left.length === 0) break;
    let best = 0;
    for (let i = 1; i < left.length; i++) if (valueAt(left[i], pos) > valueAt(left[best], pos)) best = i;
    result.push({ player: left.splice(best, 1)[0], pos });
  }
  return result;
}

const pOverall = (p: Player) => (p.pitch ? pitcherOverall(p.pitch, p.role ?? 'RP') : 0);

export interface BuildOptions {
  dh: boolean;
  starter?: Player;
  tactics?: Tactics;
  /** 打順の指定（DHありの9人）。DHなしの試合では DH を外して9番に投手を入れる */
  lineup?: { player: Player; pos: LineupSlot['pos'] }[];
  /** 抑えの指定 */
  closer?: Player | null;
  /** 勝ちパターン（7回・8回）の指定 */
  setup?: Player[];
}

/** 選手一覧から1試合の編成を自動で作る */
export function buildGameTeam(team: Team, players: Player[], opts: BuildOptions): GameTeam {
  const pitchers = players.filter((p) => p.mainPos === 'P');
  const fielders = players.filter((p) => p.mainPos !== 'P');
  const starters = pitchers.filter((p) => p.role === 'SP').sort((a, b) => pOverall(b) - pOverall(a));
  const starter = opts.starter ?? starters[0] ?? pitchers[0];

  let lineup: LineupSlot[];
  const used = new Set<number>();
  if (opts.lineup && opts.lineup.length === 9) {
    lineup = opts.lineup.map((s) => ({ player: s.player, pos: s.pos }));
    if (!opts.dh) {
      lineup = lineup.filter((s) => s.pos !== 'DH');
      lineup.push({ player: starter, pos: 'P' });
    }
    for (const s of lineup) used.add(s.player.id);
  } else {
    const defense = assignDefense(fielders);
    for (const d of defense) used.add(d.player.id);
    const hitters: { player: Player; pos: LineupSlot['pos'] }[] = defense.map((d) => ({ player: d.player, pos: d.pos }));
    if (opts.dh) {
      const dh = fielders.filter((p) => !used.has(p.id)).sort((a, b) => offense(b) - offense(a))[0];
      if (dh) {
        hitters.push({ player: dh, pos: 'DH' });
        used.add(dh.id);
      }
    } else {
      hitters.push({ player: starter, pos: 'P' });
    }
    lineup = battingOrder(hitters);
  }
  const bench = fielders.filter((p) => !used.has(p.id)).sort((a, b) => offense(b) - offense(a));

  const relievers = pitchers.filter((p) => p.id !== starter.id && p.role !== 'SP').sort((a, b) => pOverall(b) - pOverall(a));
  const inPen = (p: Player | null | undefined) => !!p && pitchers.includes(p) && p.id !== starter.id;
  const closer = opts.closer !== undefined && inPen(opts.closer) ? opts.closer! : (relievers.find((p) => p.role === 'CL') ?? relievers[0] ?? null);
  const rest = relievers.filter((p) => p !== closer);
  const setupPick = (opts.setup ?? []).filter((p) => inPen(p) && p !== closer);
  const setup = setupPick.length > 0 ? setupPick.slice(0, 2) : rest.slice(0, 2);
  const bullpen = rest.filter((p) => !setup.includes(p));
  // 先発以外の先発投手も、ロングリリーフとして最後に置く
  const otherStarters = starters.filter((p) => p.id !== starter.id);
  return {
    team,
    lineup,
    bench,
    starter,
    setup,
    closer,
    bullpen: [...bullpen, ...otherStarters],
    tactics: opts.tactics ?? { offense: 'normal', pitching: 'normal' },
  };
}
