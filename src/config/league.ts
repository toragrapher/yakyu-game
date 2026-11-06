// リーグ設定と登録ルール（design.md 3）

/** リーグ名（0番目・1番目） */
export const LEAGUE_NAMES: readonly [string, string] = ['オーシャンリーグ', 'マウンテンリーグ'];

/** 各リーグの球団数の初期値（既存12＋自球団。自球団はオーシャンリーグに入る） */
export const DEFAULT_TEAM_COUNTS: readonly [number, number] = [7, 6];
/** 試合数の初期値 */
export const DEFAULT_GAMES = 143;

/** 交流戦の方式 */
export type InterleagueMode = 'period' | 'spread' | 'none';

/** 交流戦の初期値：期間集中型、1球団あたり18試合（相手リーグの球団数が6のとき、1カード3試合） */
export const DEFAULT_INTERLEAGUE_MODE: InterleagueMode = 'period';
export const DEFAULT_INTERLEAGUE_GAMES = 18;
/** 交流戦1カードの試合数の上限 */
export const MAX_GAMES_PER_CARD = 3;

/** 球団数の選択範囲（リーグごと） */
export const MIN_TEAMS_PER_LEAGUE = 4;
export const MAX_TEAMS_PER_LEAGUE = 12;

/** 日程：開幕は3月の最終金曜日。火〜木と金〜日の2カードで1週間、月曜は休み */
export const OPENING_MONTH = 3;
/** 試合数が「自動」のとき、レギュラーシーズンをこの日までに終える（月-日）。初期設定の7＋6球団で142試合が入る日付（仮置き） */
export const SEASON_END = '10-08';
/** 期間集中型の交流戦を始める時期（リーグ戦全体のうち、この割合を終えた後） */
export const INTERLEAGUE_START_RATIO = 0.3;

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
