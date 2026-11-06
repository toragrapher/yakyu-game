// キャンプ地（仮置き）。ランクが高いほど費用がかかり、効果も大きい
import type { BatAbilities, PitchAbilities } from '../core/types';

export type CampRank = 'S' | 'A' | 'B' | 'C';
export type AbilityKey = keyof BatAbilities | keyof PitchAbilities;

/** ランクごとの費用（万円）と効果の倍率 */
export const CAMP_RANKS: Record<CampRank, { cost: number; mult: number }> = {
  S: { cost: 60000, mult: 2.0 },
  A: { cost: 35000, mult: 1.5 },
  B: { cost: 15000, mult: 1.0 },
  C: { cost: 5000, mult: 0.5 },
};

export interface CampSite {
  id: string;
  name: string;
  rank: CampRank;
  /** 伸びやすい能力。'all' は全能力に少しずつ */
  focus: AbilityKey[] | 'all';
  note: string;
}

const ALL: AbilityKey[] = ['contact', 'power', 'speed', 'defense', 'velocity', 'control', 'breaking', 'stamina'];

export const CAMP_SITES: readonly CampSite[] = [
  { id: 'okinawa-park', name: '沖縄・総合ボールパーク', rank: 'S', focus: ALL, note: '最新の設備がそろい、すべての能力が伸びる' },
  { id: 'miyazaki-pitch', name: '宮崎・投手アカデミー', rank: 'A', focus: ['velocity', 'breaking', 'control'], note: 'ブルペンが充実。投手の速球・変化球・制球' },
  { id: 'kochi-bat', name: '高知・打撃センター', rank: 'A', focus: ['contact', 'power'], note: '打撃練習場が多い。巧打・長打' },
  { id: 'okinawa-island', name: '沖縄・離島球場', rank: 'B', focus: ['speed', 'defense', 'stamina'], note: '温暖で走り込める。走塁・守備・体力' },
  { id: 'kagoshima', name: '鹿児島・市民球場', rank: 'B', focus: 'all', note: 'バランス型。全能力に少しずつ' },
  { id: 'home-farm', name: '地元の二軍球場', rank: 'C', focus: 'all', note: '費用は安いが、効果は小さい' },
];

/** 伸びの基準：Bランク・若手で +0〜2 */
export const CAMP_BASE_GAIN = 2;
/** 「全能力に少しずつ」のときの倍率 */
export const CAMP_ALL_FACTOR = 0.5;
/** 年齢ごとの倍率（若手ほど伸びる） */
export const CAMP_AGE_FACTOR: readonly [number, number][] = [
  [23, 1.2], [27, 1.0], [31, 0.7], [99, 0.4],
];
/** AI球団が選ぶランク */
export const AI_CAMP_RANKS: CampRank[] = ['A', 'B'];
