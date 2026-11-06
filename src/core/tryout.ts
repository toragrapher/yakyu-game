// 初年度のストーブリーグの合同トライアウト：自由契約の候補から、足りない選手を獲る
// あわせて、開幕に必要な人数（一軍と二軍の試合が組める人数）を確かめる
import { MIN_SALARY_IKUSEI, MIN_SALARY_ROSTER } from '../config/budget';
import { OPENING_MIN, ROSTER_LIMIT } from '../config/league';
import { overall, potentialOverall } from './ratings';
import type { World } from './season/types';
import type { Player } from './types';

type Group = 'P' | 'C' | 'F';
const groupOf = (p: Player): Group => (p.mainPos === 'P' ? 'P' : p.mainPos === 'C' ? 'C' : 'F');
export const GROUP_LABEL: Record<Group, string> = { P: '投手', C: '捕手', F: '捕手以外の野手' };

const mine = (w: World) => w.players.filter((p) => p.teamId === w.userTeamId && !p.retired);

/** 合同トライアウトを開いているか（初年度の戦力の整理の間だけ） */
export function tryoutOpen(w: World): boolean {
  return !!w.tryout && !!w.offseason?.firstYear && w.offseason.phase === 'roster';
}

/** まだ獲っていない候補 */
export function tryoutCandidates(w: World): Player[] {
  if (!w.tryout) return [];
  const pool = new Set(w.tryout.pool);
  return w.players.filter((p) => pool.has(p.id) && p.teamId == null && !p.retired);
}

/** 合同トライアウトで獲った選手 */
export function tryoutSigned(w: World): Player[] {
  if (!w.tryout) return [];
  const signed = new Set(w.tryout.signed);
  return w.players.filter((p) => signed.has(p.id) && p.teamId === w.userTeamId);
}

/** 獲る（支配下か育成か）。できないときは理由 */
export function signTryout(w: World, id: number, contract: 'roster' | 'ikusei'): string | null {
  if (!tryoutOpen(w)) return '今は合同トライアウトの期間ではありません';
  const p = tryoutCandidates(w).find((x) => x.id === id);
  if (!p) return '候補にいない選手です';
  if (contract === 'roster' && mine(w).filter((x) => x.contract === 'roster').length >= ROSTER_LIMIT) return `支配下は${ROSTER_LIMIT}人までです`;
  p.teamId = w.userTeamId;
  p.contract = contract;
  p.level = 'farm';
  p.salary = contract === 'ikusei' ? MIN_SALARY_IKUSEI : Math.max(p.salary, MIN_SALARY_ROSTER);
  w.tryout!.signed.push(id);
  return null;
}

/** 獲ったのを取り消す（戦力の整理を終えるまで） */
export function unsignTryout(w: World, id: number): void {
  if (!tryoutOpen(w)) return;
  const i = w.tryout!.signed.indexOf(id);
  if (i < 0) return;
  w.tryout!.signed.splice(i, 1);
  const p = w.players.find((x) => x.id === id)!;
  p.teamId = null;
}

/** 開幕に必要な人数のうち、足りないもの（足りていれば空） */
export function openingShortfall(w: World): { label: string; have: number; need: number; group?: Group; rosterOnly: boolean }[] {
  const ps = mine(w);
  const roster = ps.filter((p) => p.contract === 'roster');
  const out: { label: string; have: number; need: number; group?: Group; rosterOnly: boolean }[] = [];
  const count = (list: Player[], g: Group) => list.filter((p) => groupOf(p) === g).length;
  if (roster.length < OPENING_MIN.roster.total) out.push({ label: '支配下', have: roster.length, need: OPENING_MIN.roster.total, rosterOnly: true });
  for (const g of ['P', 'C', 'F'] as const) {
    const have = count(roster, g);
    if (have < OPENING_MIN.roster[g]) out.push({ label: `支配下の${GROUP_LABEL[g]}`, have, need: OPENING_MIN.roster[g], group: g, rosterOnly: true });
  }
  for (const g of ['P', 'C', 'F'] as const) {
    const have = count(ps, g);
    if (have < OPENING_MIN.all[g]) out.push({ label: `${GROUP_LABEL[g]}（支配下＋育成）`, have, need: OPENING_MIN.all[g], group: g, rosterOnly: false });
  }
  return out;
}

/** 開幕に必要な人数の一覧（画面の表示用：今の人数と必要な人数） */
export function openingCounts(w: World): { label: string; have: number; need: number }[] {
  const ps = mine(w);
  const roster = ps.filter((p) => p.contract === 'roster');
  const c = (list: Player[], g: Group) => list.filter((p) => groupOf(p) === g).length;
  return [
    { label: '支配下', have: roster.length, need: OPENING_MIN.roster.total },
    ...(['P', 'C', 'F'] as const).map((g) => ({ label: GROUP_LABEL[g], have: c(ps, g), need: OPENING_MIN.all[g] })),
  ];
}

/** 開幕に必要な人数に足りない分を、評価の高い順に自動で獲る */
export function autoFillTryout(w: World): void {
  const value = (p: Player) => Math.max(overall(p), potentialOverall(p) - 8);
  for (let guard = 0; guard < 200; guard++) {
    const short = openingShortfall(w);
    if (!short.length) return;
    const s = short[0];
    const rosterFull = mine(w).filter((x) => x.contract === 'roster').length >= ROSTER_LIMIT;
    const cands = tryoutCandidates(w).filter((p) => !s.group || groupOf(p) === s.group).sort((a, b) => value(b) - value(a));
    if (!cands.length) return;
    // 支配下に空きがあれば支配下で、なければ育成で獲る
    const contract = s.rosterOnly || !rosterFull ? 'roster' : 'ikusei';
    if (signTryout(w, cands[0].id, contract)) return;
  }
}

/** 戦力の整理を終えるとき：獲らなかった候補はいなくなる（引退扱い） */
export function closeTryout(w: World): void {
  if (!w.tryout) return;
  for (const p of tryoutCandidates(w)) p.retired = true;
  w.tryout = undefined;
}
