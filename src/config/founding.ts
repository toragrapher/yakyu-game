// 球団設立と初期メンバーの集め方（仮置き）

/** エクスパンションドラフト：既存球団がプロテクトする人数（支配下） */
export const EXPANSION_PROTECT = 28;
/** エクスパンションドラフトで指名できる人数の合計 */
export const EXPANSION_PICKS = 30;
/** 1球団から指名できる人数の上限（球団数が少ないときは自動で増やす） */
export const EXPANSION_MAX_PER_TEAM = 3;

/** トライアウト：自由契約の選手の候補数と、特別ドラフトの新人の候補数 */
export const TRYOUT_POOL = 120;
export const ROOKIE_POOL = 60;
/** トライアウトで獲れる自由契約選手の上限と、特別ドラフトの新人の上限 */
export const TRYOUT_MAX = 40;
export const ROOKIE_MAX = 28;
/** 自由契約の選手：年齢と、能力上限の補正 */
export const TRYOUT_AGE: [number, number] = [26, 37];
export const TRYOUT_CAP_SHIFT = -14;
/** 特別ドラフトの新人：年齢と、能力上限の補正（将来性は高め、今はまだ低い） */
export const ROOKIE_AGE: [number, number] = [18, 24];
export const ROOKIE_CAP_SHIFT = 4;

/** 足りない人数を埋める選手の能力上限の補正（指名・獲得しきれなかった分） */
export const FILLER_CAP_SHIFT = -1;
/** エクスパンションで新球団の残りを埋める選手の補正（指名が30人と少ないので、やや高め） */
export const EXPANSION_FILLER_CAP_SHIFT = 4;

/** ポジションごとに、1球団の基本人数より何人まで多く獲れるか */
export const SLOT_SLACK = 3;

/** おまかせ：能力をリーグ平均にどれだけ近づけるか（1＝平均と同じ戦力） */
export const OMAKASE_PARITY = 1.0;

/** 新球団の略称の最大文字数 */
export const SHORT_NAME_MAX = 4;
