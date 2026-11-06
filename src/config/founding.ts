// 球団設立と初期メンバーの集め方（仮置き）

/** エクスパンションドラフト：既存球団がプロテクトする人数（支配下） */
export const EXPANSION_PROTECT = 28;
/** 初期メンバーの人数（どの方式でも、最初のドラフト前はちょうどこの人数・育成0人で始める） */
export const INITIAL_MEMBERS = 30;
/** 1球団から指名できる人数の上限（球団数が少ないときは自動で増やす） */
export const EXPANSION_MAX_PER_TEAM = 3;

/** トライアウト：自由契約の選手の候補数と、特別ドラフトの新人の候補数 */
export const TRYOUT_POOL = 120;
export const ROOKIE_POOL = 60;
/** トライアウト＋新人で獲れる、特別ドラフトの新人の上限（合計は INITIAL_MEMBERS 人） */
export const ROOKIE_MAX = 28;
/** 自由契約の選手：年齢と、能力上限の補正 */
export const TRYOUT_AGE: [number, number] = [26, 37];
export const TRYOUT_CAP_SHIFT = -14;
/** 特別ドラフトの新人：年齢と、能力上限の補正（将来性は高め、今はまだ低い） */
export const ROOKIE_AGE: [number, number] = [18, 24];
export const ROOKIE_CAP_SHIFT = 4;

/** エクスパンションで選手を取られたAI球団が、人数を埋める若手の能力上限の補正 */
export const FILLER_CAP_SHIFT = -1;

/** 初年度のストーブリーグの合同トライアウト：自由契約の候補の数（年齢・能力はトライアウトと同じ作り方） */
export const JOINT_TRYOUT_POOL = 120;

/** ポジションごとに、1球団の基本人数より何人まで多く獲れるか */
export const SLOT_SLACK = 3;

/** おまかせ：能力をリーグ平均にどれだけ近づけるか（1＝平均と同じ戦力） */
export const OMAKASE_PARITY = 1.0;

/** 新球団の略称の最大文字数 */
export const SHORT_NAME_MAX = 4;
