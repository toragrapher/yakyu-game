// ペナントの進行に関する設定（提案・仮置き）

/** 疲労（0〜100） */
export const FATIGUE = {
  /** 投手：1球ごとに増える疲労 */
  perPitch: 0.5,
  /** 投手：1日ごとに回復する量 */
  pitcherRecoveryPerDay: 11,
  /** 野手：先発出場1試合ごとに増える疲労（捕手は catcher） */
  fielderPerGame: 6,
  catcherPerGame: 9,
  /** 野手：1日ごとに回復する量 */
  fielderRecoveryPerDay: 4.5,
  /** 野手：この疲労を超えたら休ませる（AIの判断） */
  fielderRestAt: 55,
  /** 先発投手：この疲労以下なら先発できる */
  starterReadyAt: 20,
  /** 中継ぎ：この疲労以下なら登板できる */
  relieverReadyAt: 35,
  max: 100,
};

/** 調子（1〜5）の波 */
export const CONDITION = {
  /** 1日ごとに調子が変わる確率 */
  changePerDay: 0.22,
  /** 変わるとき、普通（3）に近づく確率（残りは離れる） */
  towardNormal: 0.6,
};

/** 一軍・二軍の入れ替え（AI） */
export const ROSTER_MOVES = {
  /** 何日ごとに見直すか */
  intervalDays: 7,
  /** 1回の見直しで入れ替える最大人数 */
  maxSwaps: 2,
  /** 二軍の選手のほうが、これだけ評価が上なら入れ替える */
  margin: 3,
  /** 二軍に落とした選手は、この日数は一軍に戻せない（NPBの再登録制限） */
  recallDays: 10,
  /** 成績による評価の上乗せ：打者は OPS が .700 から 0.1 上がるごとに */
  opsWeight: 5,
  /** 投手は防御率が 3.60 から 1 下がるごとに */
  eraWeight: 3,
  /** 成績を信用し始める打席数・投球回 */
  fullPa: 120,
  fullIp: 40,
};

/** 二軍の試合は常にDHあり */
export const FARM_DH = true;

/** 試合結果を残す数（自球団） */
export const KEEP_RECENT_GAMES = 10;
/** ホーム画面の「選手の様子」で疲れていると知らせる疲労 */
export const TIRED_NOTICE = 60;
