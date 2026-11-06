// ファン・観客動員・ホームゲームの収支の設定（仮置き。design.md 7.2・7.3）

export type SeatKey = 'S' | 'A' | 'B' | 'OH' | 'OV';

export interface SeatDef {
  key: SeatKey;
  name: string;
  capacity: number;
  /** 初期の値段（円） */
  price: number;
  /** ホーム側の観客がこの席を選ぶ割合（ビジター席は0） */
  share: number;
}

/** 席種（design.md 7.2。初期の値段は阪神の2026年の価格を参考にした提案値） */
export const SEATS: readonly SeatDef[] = [
  { key: 'S', name: 'S席', capacity: 2000, price: 6500, share: 0.08 },
  { key: 'A', name: '内野A席', capacity: 10000, price: 3800, share: 0.32 },
  { key: 'B', name: '内野B席', capacity: 10000, price: 2800, share: 0.32 },
  { key: 'OH', name: '外野ホーム席', capacity: 8000, price: 2000, share: 0.28 },
  { key: 'OV', name: '外野ビジター席', capacity: 3000, price: 2000, share: 0 },
];

/** ファンの初期値（人）とばらつき */
export const INITIAL_CORE_FANS = 120000;
export const INITIAL_LIGHT_FANS = 400000;
export const INITIAL_FAN_SD = 0.15;

/** 1試合に来る割合：コア層・ライト層 */
export const CORE_ATTEND_RATE = 0.08;
export const LIGHT_ATTEND_RATE = 0.03;
/** 値段への反応（値上げでどれだけ来なくなるか）：コア層は小さく、ライト層は大きく */
export const CORE_PRICE_ELASTICITY = 0.3;
export const LIGHT_PRICE_ELASTICITY = 1.4;
/** チームの調子：勝率0.5で1、勝率による増減と、連勝・連敗1試合あたりの増減 */
export const FORM_BASE = 0.7;
export const FORM_PER_WINPCT = 0.6;
export const FORM_PER_STREAK = 0.02;
/** 曜日による増減（金・土・日は多い） */
export const WEEKEND_FACTOR = 1.25;
export const WEEKDAY_FACTOR = 0.9;
/** ビジター席：相手球団のファン（コア＋ライト）の何割が来るか */
export const VISITOR_RATE = 0.004;

/** グッズ・飲食：観客1人あたり（円） */
export const GOODS_FOOD_PER_FAN = 1000;
/** 試合運営コスト：1試合（万円）。球場使用料・警備・スタッフなどを含む */
export const GAME_COST = 5500;

/** 勝敗によるファンの増減（1試合あたりの割合） */
export const LIGHT_WIN = 0.003;
export const LIGHT_LOSS = 0.0025;
export const LIGHT_STREAK = 0.001; // 連勝・連敗1試合ごとの上乗せ（最大5試合分）
export const CORE_WIN = 0.0002;
export const CORE_LOSS = 0.0001;
/** 年度を締めるとき：ライト層からコア層に移る割合と、コア層が自然に離れる割合 */
export const LIGHT_TO_CORE = 0.05;
export const CORE_DECAY = 0.03;

/** 選手の扱いでコア層が離れる（割合） */
export const FAN_PENALTY = {
  /** 戦力外通告（自由契約）は1年にこの人数まで影響なし */
  freeReleases: 8,
  /** それを超えた1人ごと */
  perExtraRelease: 0.004,
  /** 引退勧告にあたる扱い（在籍年数 veteranYears 年以上、または愛着 lovedAttachment 以上の選手を自由契約） */
  veteranYears: 10,
  lovedAttachment: 70,
  perVeteran: 0.01,
  /** 育成落ち：プロ youngYears 年以内なら大きく */
  youngYears: 3,
  perYoungIkusei: 0.008,
  perIkusei: 0.003,
  /** 契約更改の決裂（退団） */
  perContractBreak: 0.003,
};
