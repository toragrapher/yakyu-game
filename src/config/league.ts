// リーグ設定と登録ルール（design.md 3）

/** リーグ名（0番目・1番目） */
export const LEAGUE_NAMES: readonly [string, string] = ['オーシャンリーグ', 'マウンテンリーグ'];

/** 各リーグの球団数の初期値（既存12＋自球団。自球団はオーシャンリーグに入る） */
export const DEFAULT_TEAM_COUNTS: readonly [number, number] = [7, 6];
/** 試合数の初期値 */
export const DEFAULT_GAMES = 143;

/** 支配下登録の上限 */
export const ROSTER_LIMIT = 70;
/** 一軍の出場選手登録の人数（未確認のため仮置き） */
export const FIRST_TEAM_SIZE = 29;
/** そのうち投手の人数の目安 */
export const FIRST_TEAM_PITCHERS = 13;
/** 先発ローテーションの人数 */
export const ROTATION_SIZE = 6;
/** 一軍の外国人選手の上限 */
export const FOREIGN_FIRST_TEAM_LIMIT = 4;

/** 規定打席（試合数×3.1）と規定投球回（試合数×1.0） */
export const QUALIFY_PA_PER_GAME = 3.1;
export const QUALIFY_IP_PER_GAME = 1.0;
