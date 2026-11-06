// 一軍メンバーの選び方と、投手の登板間隔（AIと検証ツール用）
import { FIRST_TEAM_PITCHERS, FIRST_TEAM_SIZE, ROTATION_SIZE } from '../../config/league';
import { batterOverall, pitcherOverall } from '../ratings';
import type { FieldPos, Player } from '../types';

const pOv = (p: Player) => (p.pitch ? pitcherOverall(p.pitch, p.role ?? 'RP') : 0);
const fOv = (p: Player) => batterOverall(p.bat, p.mainPos as FieldPos);

export interface FirstTeam {
  rotation: Player[];
  relievers: Player[];
  fielders: Player[];
}

/** 支配下選手から一軍を選ぶ（投手13人：先発6＋中継ぎ7、野手16人：捕手2人以上） */
export function selectFirstTeam(players: Player[]): FirstTeam {
  const roster = players.filter((p) => p.contract === 'roster' && !p.retired);
  const pitchers = roster.filter((p) => p.mainPos === 'P');
  const sps = pitchers.filter((p) => p.role === 'SP').sort((a, b) => pOv(b) - pOv(a));
  const rotation = sps.slice(0, ROTATION_SIZE);
  const rest = pitchers.filter((p) => !rotation.includes(p)).sort((a, b) => pitcherOverall(b.pitch!, 'RP') - pitcherOverall(a.pitch!, 'RP'));
  const relievers = rest.slice(0, FIRST_TEAM_PITCHERS - rotation.length);

  const fieldersAll = roster.filter((p) => p.mainPos !== 'P').sort((a, b) => fOv(b) - fOv(a));
  const catchers = fieldersAll.filter((p) => p.mainPos === 'C').slice(0, 2);
  const fielders = [...catchers];
  for (const p of fieldersAll) {
    if (fielders.length >= FIRST_TEAM_SIZE - FIRST_TEAM_PITCHERS) break;
    if (!fielders.includes(p)) fielders.push(p);
  }
  return { rotation, relievers, fielders };
}

/** 中継ぎが今日投げられるか（直近の登板記録から判断） */
export function relieverAvailable(recent: number[]): boolean {
  // recent[0]＝前日の球数、recent[1]＝2日前の球数（登板なしは0）
  const [d1 = 0, d2 = 0] = recent;
  if (d1 >= 30) return false; // 前日に30球以上
  if (d1 > 0 && d2 > 0) return false; // 2連投の翌日は休み
  return true;
}
