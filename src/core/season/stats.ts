// 成績の集計と、打率・防御率などの計算
import type { BatLine, PitchLine } from '../sim/types';
import type { BatTotals, PitchTotals, PlayerSeason } from './types';

export const emptyBat = (): BatTotals => ({ g: 0, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, r: 0, bb: 0, hbp: 0, k: 0, sb: 0, cs: 0, sh: 0, sf: 0, gidp: 0 });
export const emptyPitch = (): PitchTotals => ({ g: 0, gs: 0, w: 0, l: 0, sv: 0, hld: 0, outs: 0, bf: 0, h: 0, hr: 0, bb: 0, hbp: 0, k: 0, r: 0, er: 0, pitches: 0 });
export const emptySeason = (): PlayerSeason => ({ bat: emptyBat(), pitch: emptyPitch() });

export function addBat(t: BatTotals, b: BatLine): void {
  t.g++;
  t.pa += b.pa; t.ab += b.ab; t.h += b.h; t.d += b.d; t.t += b.t; t.hr += b.hr; t.rbi += b.rbi; t.r += b.r;
  t.bb += b.bb; t.hbp += b.hbp; t.k += b.k; t.sb += b.sb; t.cs += b.cs; t.sh += b.sh; t.sf += b.sf; t.gidp += b.gidp;
}

export function addPitch(t: PitchTotals, p: PitchLine): void {
  t.g++;
  if (p.starter) t.gs++;
  if (p.decision === 'W') t.w++;
  if (p.decision === 'L') t.l++;
  if (p.decision === 'S') t.sv++;
  if (p.decision === 'H') t.hld++;
  t.outs += p.outs; t.bf += p.bf; t.h += p.h; t.hr += p.hr; t.bb += p.bb; t.hbp += p.hbp; t.k += p.k;
  t.r += p.r; t.er += p.er; t.pitches += p.pitches;
}

export const avg = (b: BatTotals) => (b.ab > 0 ? b.h / b.ab : 0);
export const obp = (b: BatTotals) => {
  const d = b.ab + b.bb + b.hbp + b.sf;
  return d > 0 ? (b.h + b.bb + b.hbp) / d : 0;
};
export const slg = (b: BatTotals) => (b.ab > 0 ? (b.h + b.d + 2 * b.t + 3 * b.hr) / b.ab : 0);
export const ops = (b: BatTotals) => obp(b) + slg(b);
export const era = (p: PitchTotals) => (p.outs > 0 ? (p.er * 27) / p.outs : 0);
export const whip = (p: PitchTotals) => (p.outs > 0 ? ((p.h + p.bb) * 3) / p.outs : 0);

/** 投球回の表示（例：「123 1/3」） */
export function ipLabel(outs: number): string {
  const r = outs % 3;
  return `${Math.floor(outs / 3)}${r ? ` ${r}/3` : ''}`;
}

/** 打率などの表示（例：「.287」） */
export function rate3(v: number): string {
  return v.toFixed(3).replace(/^0/, '');
}
