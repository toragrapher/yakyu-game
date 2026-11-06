// 年俸・予算の設定（仮置き。design.md 7.0 / 7.1 / 8）

/** 最低年俸（万円）：未確認のため仮置き */
export const MIN_SALARY_ROSTER = 440;
export const MIN_SALARY_IKUSEI = 240;

/** 日本人選手の最高年俸（万円） */
export const MAX_SALARY = 60000;

/** 年俸の目安：最低年俸 ＋ 係数 × exp((総合評価 − 基準) ÷ 伸び) */
export const SALARY_BASE = 1000;
export const SALARY_PIVOT = 50;
export const SALARY_SCALE = 8.5;
/** プロ1〜3年目は相場より低い（年数ごとの倍率） */
export const ROOKIE_SALARY_FACTOR: readonly number[] = [0.35, 0.5, 0.7];
