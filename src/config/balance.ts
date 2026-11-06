// 試合シミュレーションの調整用の数値（提案）。
import type { OrderFit } from '../core/types';

// 打高・打低の強さはここで変える。変えたら必ず `npm run balance` を回す。

/** 能力の基準値：この値の打者と投手が対戦すると、下の基準確率どおりになる */
export const PIVOT = 67;

/** 1打席の結果の基準確率（リーグ平均の打者と投手） */
export const BASE_RATES = {
  K: 0.185, // 三振
  BB: 0.08, // 四球
  HBP: 0.008, // 死球
  S: 0.16, // 単打
  D: 0.043, // 二塁打
  T: 0.004, // 三塁打
  HR: 0.023, // 本塁打
  // 残りが凡打
};

/** 打高・打低の全体係数（1より大きいと増える） */
export const GLOBAL = {
  hit: 1.0, // 単打・二塁打・三塁打
  hr: 1.0, // 本塁打
  k: 1.0, // 三振
  bb: 1.0, // 四球
};

/**
 * 能力が基準値より10上がるごとに、確率を何倍にするか（e の何乗か）。
 * 例：HR の power 0.32 → 長打が10高いと本塁打は約1.38倍。
 */
export const ELASTICITY = {
  K: { contact: -0.18, power: 0.06, velocity: 0.16, breaking: 0.1 },
  BB: { contact: 0.05, power: 0.08, control: -0.25 },
  HBP: { control: -0.15 },
  S: { contact: 0.13, speed: 0.04, velocity: -0.04, breaking: -0.07, defense: -0.05 },
  D: { contact: 0.08, power: 0.1, speed: 0.03, breaking: -0.07, defense: -0.04 },
  T: { power: 0.05, speed: 0.3, defense: -0.04 },
  HR: { contact: 0.03, power: 0.32, velocity: -0.06, breaking: -0.06, control: -0.05 },
};

/** 調子（1〜5）が1段階ずれるごとに、能力を何ポイント上下させるか */
export const CONDITION_POINTS = 2;
/** 打順適性が合わないときに巧打・長打から引くポイント */
export const ORDER_MISFIT_POINTS = 3;
/** 打順適性ごとの「合う打順」（0＝1番） */
export const ORDER_FIT_SLOTS: Record<OrderFit, readonly number[]> = {
  leadoff: [0, 1, 8],
  second: [0, 1, 2],
  cleanup: [2, 3, 4],
  middle: [2, 3, 4, 5, 6],
  lower: [5, 6, 7, 8],
};

/** 疲労（0〜100）1あたりに能力から引くポイント */
export const FATIGUE_POINTS = 0.1;

/** 左右の相性（同じ側どうし：右投手対右打者など）。打者側の確率の倍率（e の何乗か） */
export const PLATOON_SAME_SIDE = { hit: -0.06, hr: -0.08, k: 0.08 };

/** 采配方針と相性のよい選手への上乗せ（能力ポイント） */
export const TACTIC_FIT = {
  slugging: { threshold: 70, power: 3 }, // 打て打て：長打の高い選手
  speed: { threshold: 70, speed: 3 }, // 機動力重視：走塁の高い選手
  small: { threshold: 65, contact: 2 }, // スモール：巧打の高い選手
  defense: { team: 3 }, // 守り勝つ：チームの守備
};

/** 盗塁 */
export const STEAL = {
  minSpeed: 45, // これ未満の走者は走らない
  attemptBase: 0.055, // 二塁が空いている一塁走者が、1打席の前に走る確率（走塁が基準値のとき）
  attemptElasticity: 0.5, // 走塁10ごと
  thirdFactor: 0.12, // 三盗は二盗の何倍走るか
  successBase: 0.7,
  successPerSpeed: 0.006, // 走塁1ごとの成功率の増減
  successPerCatcher: -0.004, // 捕手の守備1ごと
  speedTactic: 1.7, // 機動力重視のときの企図の倍率
  smallTactic: 1.2,
  sluggingTactic: 0.7,
};

/** 送りバント */
export const BUNT = {
  success: 0.85,
  smallTactic: 0.55, // スモールのとき、条件を満たした打席で送る確率
  normal: 0.15,
  pitcher: 0.85, // 投手の打席
  maxPower: 55, // 長打がこれ以下の打者だけが送る（投手を除く）
};

/** 凡打の内訳と進塁 */
export const IN_PLAY = {
  groundBase: 0.5, // 凡打のうちゴロの割合
  groundPerPower: -0.005, // 長打1ごと
  doublePlay: 0.3, // 一塁走者あり・2アウト未満のゴロで併殺になる確率
  doublePlayPerSpeed: -0.004, // 打者の走塁1ごと
  doublePlayPerDefense: 0.003, // チーム守備1ごと
  error: 0.016, // 凡打が失策になる確率
  errorElasticity: -0.25, // チーム守備10ごと
  sacFly: 0.55, // 三塁走者が犠飛で還る確率（フライ・2アウト未満）
  groundScore: 0.5, // 三塁走者がゴロの間に還る確率（2アウト未満）
  advanceOnOut: 0.4, // 二塁走者が凡打で三塁へ進む確率
};

/** ヒットでの進塁（基準）。走者の走塁1ごとに perSpeed ずつ増減 */
export const ADVANCE = {
  singleSecondScores: 0.62, // 単打で二塁走者が還る
  singleFirstToThird: 0.28, // 単打で一塁走者が三塁まで
  doubleFirstScores: 0.42, // 二塁打で一塁走者が還る
  perSpeed: 0.008,
};

/** 投球数（打席の結果ごとの平均） */
export const PITCHES = { K: 4.8, BB: 5.6, HBP: 3.0, inPlay: 3.4, bunt: 2.0, sd: 1.3 };

/** 継投 */
export const PITCHING = {
  starterLimitBase: 62, // 先発の球数の目安 ＝ base ＋ 体力 × perStamina
  starterLimitPerStamina: 0.58,
  relieverLimitBase: 14,
  relieverLimitPerStamina: 0.3,
  quickHook: -12, // 継投は早め
  longStart: 10, // 先発引っ張り
  fatigueStart: 0.75, // 目安の何割を超えると球威が落ち始めるか
  fatiguePointsPerPitch: 0.3, // 超えた1球ごとに能力から引くポイント
  shelledRuns: 6, // この失点で降板
  earlyShelledRuns: 4, // 4回までにこの失点で降板
  maxInnings: 12, // 延長は12回まで（引き分けあり）
  pinchHitInning: 7, // DHなしで、この回以降は投手の打席に代打を送る
  /** 先発の勝利投手の条件（アウト数） */
  starterWinOuts: 15,
};

/** 球場の補正（本塁打・二塁打・単打の倍率） */
export const PARK = {
  size: { small: { hr: 1.15, d: 0.97 }, normal: { hr: 1.0, d: 1.0 }, large: { hr: 0.86, d: 1.06 } },
  fence: { low: { hr: 1.07, d: 0.97 }, normal: { hr: 1.0, d: 1.0 }, high: { hr: 0.9, d: 1.08 } },
  terrace: { hr: 1.12 },
  artificialTurf: { s: 1.03, d: 1.02 },
};

/** 天候の補正 */
export const WEATHER = {
  /** 月ごとの気温の目安（3〜10月）。寒冷地・温暖地はずらす */
  monthTemp: { 3: 10, 4: 15, 5: 20, 6: 23, 7: 28, 8: 29, 9: 25, 10: 18 } as Record<number, number>,
  coldShift: -4,
  warmShift: 2,
  nightShift: -3,
  tempSd: 3,
  domeTemp: 22,
  hrPerDegree: 0.006, // 気温1度ごとの本塁打の増減（20度基準）
  maxWind: 7, // 風速の上限（m/秒、海沿いは1.5倍）
  seasideFactor: 1.5,
  hrPerWind: 0.035, // 追い風1m/秒ごとの本塁打の増加（向かい風は減少）
};
