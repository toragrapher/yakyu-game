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

/** 運営費（コーチ給与・スカウト費・遠征費などをまとめた1年分。万円） */
export const OPERATING_COST = 120000;
/** 初年度の支給額 ＝ 必要資金 × この倍率（design.md 7.0） */
export const INITIAL_GRANT_RATE = 1.1;
/** 初年度の必要資金に入れる、ドラフト契約金の見込み（万円）と昇給の見込み（年俸総額に対する割合） */
export const DRAFT_COST_ESTIMATE = 32000;
export const RAISE_ESTIMATE_RATE = 0.05;

/** スポンサー収益（万円）：基本額＋順位＋ポストシーズン＋スター選手 */
export const SPONSOR_BASE = 450000;
/** リーグの順位ごとの上乗せ（1位から順に。足りない順位は最後の値） */
export const SPONSOR_RANK_BONUS = [80000, 50000, 30000, 10000, 0, -30000];
export const SPONSOR_POSTSEASON = 10000;
export const SPONSOR_LEAGUE_WIN = 30000;
export const SPONSOR_CHAMPION = 50000;
/** スター選手：タイトルを取った選手1人ごと、総合がこの値以上の選手1人ごと */
export const SPONSOR_PER_TITLE = 10000;
export const SPONSOR_STAR_OVERALL = 80;
export const SPONSOR_PER_STAR = 5000;
