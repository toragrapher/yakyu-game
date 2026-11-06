// 契約更改の設定（提案・仮置き）

export const CONTRACT = {
  /** 成績の倍率：打者は OPS が .700 から 0.1 上がるごとに +opsWeight×0.1 */
  opsWeight: 1.5,
  /** 投手は防御率が 3.60 から 1 下がるごとに +eraWeight */
  eraWeight: 0.12,
  /** セーブ・ホールドポイント（半分）1つごと */
  reliefWeight: 0.006,
  perfMin: 0.7,
  perfMax: 1.6,
  /** 一軍の出場が少ない選手の倍率 */
  noPlayFactor: 0.85,
  minPa: 100,
  minIp: 20,
  /** 希望額は今の年俸の何倍の範囲か */
  wishMinRatio: 0.7,
  wishMaxRatio: 2.5,
  wishMaxAdd: 1000,
  /** 減額制限：1億円以下は25%、1億円超は40%まで */
  bigSalary: 10000,
  cutLimit: 0.25,
  bigCutLimit: 0.4,
  /** 提示額÷希望額がこれ以下だと必ず断る */
  refuseBelow: 0.8,
  /** 性格と愛着による合意のしやすさ */
  moneyPenalty: 0.15,
  loyalBonus: 0.15,
  attachmentWeight: 0.004,
  attachmentDown: 5,
  attachmentUp: 3,
  /** この回数断られたら退団（自由契約） */
  maxRefusals: 3,
};
