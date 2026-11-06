// 選手生成の設定（提案・仮置き）
import type { GrowthType, MainPos, PitcherRole } from '../core/types';

/** 1球団の支配下選手の内訳（合計68人。上限70人に2人の余裕） */
export const ROSTER_TEMPLATE: readonly { pos: MainPos; role?: PitcherRole; count: number }[] = [
  { pos: 'P', role: 'SP', count: 14 },
  { pos: 'P', role: 'RP', count: 18 },
  { pos: 'P', role: 'CL', count: 2 },
  { pos: 'C', count: 5 },
  { pos: '1B', count: 3 },
  { pos: '2B', count: 4 },
  { pos: '3B', count: 3 },
  { pos: 'SS', count: 4 },
  { pos: 'OF', count: 15 },
];

/** 1球団の育成選手の内訳 */
export const IKUSEI_TEMPLATE: readonly { pos: MainPos; role?: PitcherRole; count: number }[] = [
  { pos: 'P', role: 'RP', count: 4 },
  { pos: 'C', count: 1 },
  { pos: 'SS', count: 1 },
  { pos: 'OF', count: 2 },
];

/** 成長タイプの出やすさ */
export const GROWTH_TYPE_WEIGHTS: readonly [GrowthType, number][] = [
  ['superEarly', 8],
  ['early', 15],
  ['normal', 40],
  ['late', 15],
  ['veryLate', 7],
  ['steady', 15],
];

/** 成長タイプごとのピーク年齢（design.md 4.3） */
export const PEAK_AGES: Record<GrowthType, [number, number]> = {
  superEarly: [21, 24],
  early: [23, 27],
  normal: [26, 30],
  late: [28, 32],
  veryLate: [30, 34],
  steady: [25, 33],
};

/** 既存選手の年齢の出やすさ（18〜38歳） */
export const AGE_WEIGHTS: readonly [number, number][] = [
  [18, 5], [19, 6], [20, 7], [21, 8], [22, 9], [23, 10], [24, 10], [25, 10], [26, 10],
  [27, 9], [28, 9], [29, 8], [30, 7], [31, 6], [32, 5], [33, 4], [34, 3], [35, 2],
  [36, 1.5], [37, 1], [38, 0.5],
];

/** 能力上限（その選手が届きうる最高値）の平均と散らばり */
export const CAP_MEAN = 60;
export const CAP_SD = 10;
/** 能力ごとの個人差（同じ選手の中での得手不得手） */
export const ABILITY_SPREAD_SD = 7;
/** ピーク前、1年あたり上限からどれだけ低いか */
export const GAP_PER_YEAR_BEFORE_PEAK = 3.5;
/** ピーク後、1年あたりどれだけ衰えているか */
export const DECLINE_PER_YEAR_AFTER_PEAK = 2.5;
/** 育成選手の能力上限の下げ幅 */
export const IKUSEI_CAP_PENALTY = 10;

/** 能力の下限・上限 */
export const ABILITY_MIN = 1;
export const ABILITY_MAX = 100;

/**
 * AI球団どうしの戦力差をどれだけ縮めるか（0＝そのまま、1＝完全にそろえる）。
 * 一軍の平均能力をリーグ平均に近づける。
 */
export const TEAM_PARITY = 0.95;
