// ドラフトの設定（提案・仮置き）
import type { Career } from '../core/types';

/** 候補の人数（球団数 × この数） */
export const CANDIDATES_PER_TEAM = 12;

/** 経歴ごとの割合と年齢 */
export const CAREER_MIX: readonly { career: Career; weight: number; age: [number, number] }[] = [
  { career: 'highSchool', weight: 45, age: [18, 18] },
  { career: 'college', weight: 35, age: [22, 22] },
  { career: 'industrial', weight: 20, age: [23, 26] },
];

/** 候補の素材の良さ（能力上限の補正）と、その出やすさ */
export const PROSPECT_TIERS: readonly { capShift: number; weight: number }[] = [
  { capShift: 8, weight: 3 }, // 超目玉
  { capShift: 2, weight: 10 }, // 上位候補
  { capShift: -3, weight: 25 },
  { capShift: -8, weight: 35 },
  { capShift: -14, weight: 27 }, // 育成候補
];

/** ポジションの割合（投手が多め） */
export const DRAFT_POSITION_WEIGHTS: readonly [string, number][] = [
  ['P:SP', 30], ['P:RP', 18], ['C', 8], ['1B', 4], ['2B', 6], ['3B', 5], ['SS', 8], ['OF', 21],
];

/** スカウト：1か月の視察回数（同じ月に同じ選手は1回まで）と、能力の幅（ポイント）。視察するほど狭くなる */
export const SCOUT_VISITS_PER_MONTH = 3;
export const SCOUT_BASE_WIDTH = 28;
export const SCOUT_MIN_WIDTH = 4;
/** 視察1回で幅が何割になるか */
export const SCOUT_NARROW_RATE = 0.6;
/** 地域ごとのスカウト力（第2段階で使う。今は全地域1.0） */
export const REGION_SCOUT_POWER = 1.0;

/** 指名の上限（支配下）と、育成の上限 */
export const MAX_REGULAR_PICKS = 10;
export const MAX_IKUSEI_PICKS = 6;
/** AI球団の指名数（支配下は最小〜最大、育成は最大） */
export const AI_REGULAR_PICKS: [number, number] = [5, 8];
export const AI_IKUSEI_PICKS_MAX = 4;
/** AIの見る目のぶれ（評価に足す乱数の大きさ） */
export const AI_EVAL_NOISE = 6;

/** 契約金と年俸（万円）。指名の巡ごと、最後の値はそれ以降すべて */
export const SIGNING_BONUS = [10000, 7000, 5000, 4000, 3000, 2500];
export const ROOKIE_SALARY = [1600, 1300, 1100, 1000, 900, 800];
export const IKUSEI_BONUS = 300;
export const IKUSEI_SALARY = 300;
