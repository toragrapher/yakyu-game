// 一軍・二軍の登録と入れ替え
import { FIRST_TEAM_SIZE } from '../../config/league';
import { ROSTER_MOVES } from '../../config/season';
import { overall } from '../ratings';
import type { Player } from '../types';
import { addDays } from './dates';
import { era, ops } from './stats';
import type { World } from './types';

/** 成績も加味した評価（AIの入れ替え判断用） */
export function rosterValue(w: World, p: Player): number {
  let v = overall(p) - p.fatigue * 0.05;
  const first = w.season.stats.first[p.id];
  const farm = w.season.stats.farm[p.id];
  if (p.mainPos === 'P') {
    // 一軍の成績を優先し、なければ二軍の成績（少し割り引く）
    const s = first && first.pitch.outs >= 30 ? { t: first.pitch, k: 1 } : farm ? { t: farm.pitch, k: 0.6 } : null;
    if (s && s.t.outs > 0) {
      const trust = Math.min(1, s.t.outs / 3 / ROSTER_MOVES.fullIp);
      v += (3.6 - era(s.t)) * ROSTER_MOVES.eraWeight * trust * s.k;
    }
  } else {
    const s = first && first.bat.pa >= 50 ? { t: first.bat, k: 1 } : farm ? { t: farm.bat, k: 0.6 } : null;
    if (s && s.t.pa > 0) {
      const trust = Math.min(1, s.t.pa / ROSTER_MOVES.fullPa);
      v += ((ops(s.t) - 0.7) / 0.1) * ROSTER_MOVES.opsWeight * trust * s.k;
    }
  }
  return v;
}

export function teamPlayers(w: World, teamId: number): Player[] {
  return w.players.filter((p) => p.teamId === teamId && !p.retired);
}

/** 一軍に登録できるか（できないときは理由を返す） */
export function canPromote(w: World, p: Player, date: string): string | null {
  const ids = w.season.firstTeam[p.teamId!] ?? [];
  if (ids.includes(p.id)) return 'すでに一軍です';
  if (p.contract !== 'roster') return '育成選手は一軍に登録できません';
  if (ids.length >= FIRST_TEAM_SIZE) return `一軍は${FIRST_TEAM_SIZE}人までです`;
  const after = w.season.recallAfter[p.id];
  if (after && date < after) return `${after.slice(5).replace('-', '/')}まで一軍に戻せません`;
  return null;
}

/** 二軍に落とせるか */
export function canDemote(w: World, p: Player): string | null {
  const ids = w.season.firstTeam[p.teamId!] ?? [];
  if (!ids.includes(p.id)) return 'すでに二軍です';
  const regs = ids.map((id) => w.players.find((x) => x.id === id)!);
  if (p.mainPos === 'C' && regs.filter((x) => x.mainPos === 'C').length <= 2) return '一軍の捕手は2人以上必要です';
  if (p.mainPos === 'P' && regs.filter((x) => x.mainPos === 'P').length <= 10) return '一軍の投手は10人以上必要です';
  if (p.mainPos !== 'P' && regs.filter((x) => x.mainPos !== 'P').length <= 10) return '一軍の野手は10人以上必要です';
  return null;
}

export function promote(w: World, p: Player): void {
  w.season.firstTeam[p.teamId!].push(p.id);
  p.level = 'first';
}

export function demote(w: World, p: Player, date: string): void {
  const ids = w.season.firstTeam[p.teamId!];
  ids.splice(ids.indexOf(p.id), 1);
  p.level = 'farm';
  w.season.recallAfter[p.id] = addDays(date, ROSTER_MOVES.recallDays);
}

/** 入れ替えの区分：先発投手・中継ぎ（抑え含む）・野手 */
function moveGroup(p: Player): 'SP' | 'RP' | 'F' {
  if (p.mainPos !== 'P') return 'F';
  return p.role === 'SP' ? 'SP' : 'RP';
}

/** AIの入れ替え：二軍のほうが評価の高い選手がいれば、同じ区分（先発・中継ぎ・野手）で入れ替える */
export function reviewRoster(w: World, teamId: number, date: string): { up: Player; down: Player }[] {
  const all = teamPlayers(w, teamId);
  const ids = new Set(w.season.firstTeam[teamId]);
  const moves: { up: Player; down: Player }[] = [];
  for (const g of ['SP', 'RP', 'F'] as const) {
    const firsts = all.filter((p) => ids.has(p.id) && moveGroup(p) === g).sort((a, b) => rosterValue(w, a) - rosterValue(w, b));
    const farms = all
      .filter((p) => !ids.has(p.id) && p.contract === 'roster' && moveGroup(p) === g && !(w.season.recallAfter[p.id] && date < w.season.recallAfter[p.id]))
      .sort((a, b) => rosterValue(w, b) - rosterValue(w, a));
    let fi = 0;
    group: for (const up of farms) {
      if (moves.length >= ROSTER_MOVES.maxSwaps) break;
      // 落とす相手：評価の低い順。捕手は捕手どうしでしか入れ替えない（2人を下回らないように）
      while (fi < firsts.length) {
        const down = firsts[fi];
        if (rosterValue(w, up) <= rosterValue(w, down) + ROSTER_MOVES.margin) break group;
        const catcherOk = down.mainPos !== 'C' || up.mainPos === 'C' || firsts.filter((x) => x.mainPos === 'C').length > 2;
        fi++;
        if (!catcherOk) continue;
        demote(w, down, date);
        promote(w, up);
        ids.delete(down.id);
        ids.add(up.id);
        moves.push({ up, down });
        break;
      }
    }
  }
  return moves;
}
