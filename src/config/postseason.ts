// ポストシーズンの設定（提案・仮置き）

/** 名前（実在の大会名は使わない） */
export const POSTSEASON_NAMES = {
  /** リーグ内の短期決戦 */
  league: 'プレーオフ',
  first: 'ファーストステージ',
  second: 'セカンドステージ',
  final: 'ファイナルステージ',
  /** 両リーグの勝者による優勝決定戦 */
  championship: '王座決定シリーズ',
};

/** 1位と戦う前の段階：何勝で勝ち抜けか、最大何試合か */
export const EARLY_STAGE = { winsNeeded: 2, maxGames: 3 };
/** 1位と戦う段階：アドバンテージありのとき（1位に1勝を与える）と、なしのとき */
export const FINAL_STAGE_ADVANTAGE = { winsNeeded: 4, maxGames: 6, advantage: 1 };
export const FINAL_STAGE_PLAIN = { winsNeeded: 4, maxGames: 7, advantage: 0 };
/** 優勝決定シリーズ：4勝で優勝。引き分けがあれば第8戦まで、それでも決まらなければ決まるまで */
export const CHAMPIONSHIP = { winsNeeded: 4, maxGames: 8 };
/** 優勝決定シリーズのホーム：第1・2・6・7戦が上位球団のホーム（2-3-2） */
export const CHAMPIONSHIP_HOME_PATTERN = [0, 0, 1, 1, 1, 0, 0, 0];

/** レギュラーシーズン終了から、ポストシーズン開始までの日数 */
export const DAYS_BEFORE_POSTSEASON = 3;
/** ステージの間の休み */
export const DAYS_BETWEEN_STAGES = 1;
