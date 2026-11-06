// 成長・衰え・引退の設定（提案・仮置き。design.md 4.3）

/** ピーク前の1年の伸び（平均。生成のときの伸びと合わせる） */
export const GAIN_BEFORE_PEAK = 3.5;
/** ピーク中の1年の変化（平均と散らばり） */
export const GAIN_AT_PEAK = 0;
export const PEAK_SD = 1.2;
/** ピーク後の1年の衰え（平均）と、ピークを過ぎた年数ごとの上乗せ */
export const DECLINE_BASE = 2.5;
export const DECLINE_PER_YEAR = 0.4;
/** 能力ごとの衰えやすさ（走塁・体力は早く、巧打・制球はゆっくり） */
export const DECLINE_FACTOR: Record<string, number> = {
  contact: 0.8, power: 1.0, speed: 1.3, defense: 1.1,
  velocity: 1.1, control: 0.7, breaking: 0.9, stamina: 1.3,
};
/** 「安定」型の伸びと衰えの倍率 */
export const STEADY_FACTOR = 0.6;
/** 1年の伸びのぶれ（倍率の標準偏差） */
export const GROWTH_NOISE = 0.35;

/** 出場機会：0.5（出場なし）〜1.3（主力）。一軍は1、二軍は0.5として数える */
export const PLAY_MIN = 0.5;
export const PLAY_MAX = 1.3;
export const FARM_WEIGHT = 0.5;
/** 「主力」とみなす打席・投球回 */
export const FULL_PA = 500;
export const FULL_IP_STARTER = 140;
export const FULL_IP_RELIEVER = 55;

/** 活躍：0.85〜1.2（打者は OPS、投手は防御率で） */
export const PERF_MIN = 0.85;
export const PERF_MAX = 1.2;

/** コーチと施設の効果（第1段階は1.0） */
export const COACH_FACTOR = 1.0;
export const FACILITY_FACTOR = 1.0;

/** 引退：総合の値が低い（年齢ごとの下限）または、総合の下がり方が大きい */
export const RETIRE_LOW_OVERALL: readonly [number, number][] = [
  // [この年齢以上で, 総合がこの値未満なら引退]
  [36, 55],
  [33, 48],
  [28, 42],
];
export const RETIRE_DROP_AGE = 30;
/** 前の年からの総合の下落率（0.08＝8%） */
export const RETIRE_DROP_RATE = 0.08;
/** この年齢で必ず引退 */
export const RETIRE_MAX_AGE = 42;

/** AI球団：育成は何年で自由契約にするか */
export const IKUSEI_YEARS = 3;
/** AI球団：支配下の人数（この人数まで育成から昇格させる） */
export const AI_ROSTER_TARGET = 68;
