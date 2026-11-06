// ペナントの状態（セーブするデータ）
import type { SeatKey } from '../../config/gate';
import type { LineupPos } from '../sim/types';
import type { LeagueConfig, Player, Schedule, Tactics, Team } from '../types';

export type LevelKey = 'first' | 'farm';

/** 打撃の通算 */
export interface BatTotals {
  g: number; pa: number; ab: number; h: number; d: number; t: number; hr: number; rbi: number; r: number;
  bb: number; hbp: number; k: number; sb: number; cs: number; sh: number; sf: number; gidp: number;
}

/** 投球の通算 */
export interface PitchTotals {
  g: number; gs: number; w: number; l: number; sv: number; hld: number;
  /** 救援での勝利（ホールドポイントの計算に使う） */
  rw: number;
  outs: number; bf: number;
  h: number; hr: number; bb: number; hbp: number; k: number; r: number; er: number; pitches: number;
}

export interface PlayerSeason {
  bat: BatTotals;
  pitch: PitchTotals;
}

export interface Standing {
  w: number;
  l: number;
  t: number;
  rs: number; // 得点
  ra: number; // 失点
}

/** 球団ごとの采配の設定（null は自動） */
export interface TeamSettings {
  lineup: { playerId: number; pos: LineupPos }[] | null;
  rotation: number[] | null;
  closer: number | null;
  setup: number[] | null;
  tactics: Tactics;
  /** 一軍・二軍の入れ替えを自動で行う */
  autoRoster: boolean;
}

/** ホームゲーム1試合の観客と収支（お金は万円） */
export interface GateResult {
  attendance: number;
  seats: Record<SeatKey, number>;
  soldOut: SeatKey[];
  ticket: number;
  goods: number;
  cost: number;
  net: number;
}

/** 1シーズンのホームゲームの合計 */
export interface GateTotals {
  games: number;
  attendance: number;
  seats: Record<SeatKey, number>;
  ticket: number;
  goods: number;
  cost: number;
}

export interface Fans {
  core: number;
  light: number;
}

/** 自球団の試合結果の要約（画面表示用） */
export interface GameLog {
  date: string;
  level: LevelKey;
  opponentId: number;
  home: boolean;
  runsFor: number;
  runsAgainst: number;
  result: 'W' | 'L' | 'T';
  win: string | null;
  loss: string | null;
  save: string | null;
  summary: string[];
  weather: string;
  /** ホームゲームなら観客と収支 */
  gate?: GateResult;
  /** この試合でのファンの増減（コア＋ライト） */
  fanDelta?: number;
}

/** ポストシーズンの1試合 */
export interface PostGame {
  date: string;
  awayId: number;
  homeId: number;
  score: [number, number];
  /** 勝った球団（引き分けは null） */
  winnerId: number | null;
  win: string | null;
  loss: string | null;
  save: string | null;
  summary: string[];
}

/** ポストシーズンの1つのシリーズ */
export interface Series {
  /** 'L0'・'L1'（リーグ内）、'C'（優勝決定） */
  key: 'L0' | 'L1' | 'C';
  name: string;
  /** [上位, 下位] */
  teams: [number, number];
  /** 勝ち数（アドバンテージを含む） */
  wins: [number, number];
  advantage: number;
  winsNeeded: number;
  maxGames: number;
  games: PostGame[];
  winnerId: number | null;
}

export interface PostseasonState {
  /** リーグごとの進出球団（順位順）。L0・L1 */
  seeds: [number[], number[]];
  /** リーグごとに、次に勝ち上がりの相手になる順位の位置 */
  ladder: [number, number];
  /** リーグの勝者（決まったら） */
  leagueWinners: [number | null, number | null];
  series: Series[];
  /** 最後に試合をした日（次の試合の日付の計算に使う） */
  date: string;
  championId: number | null;
  finished: boolean;
}

export interface SeasonState {
  year: number;
  schedule: Schedule;
  /** 次に行う日（schedule.days の番号） */
  dayIndex: number;
  stats: Record<LevelKey, Record<number, PlayerSeason>>;
  standings: Record<LevelKey, Record<number, Standing>>;
  /** 一軍に登録している選手（球団ID → 選手ID） */
  firstTeam: Record<number, number[]>;
  settings: Record<number, TeamSettings>;
  /** ローテーションの次の番号（"球団ID:first" など） */
  rotationIdx: Record<string, number>;
  /** 投手が最後に投げた日（日付） */
  lastPitched: Record<number, string>;
  /** 直近の登板の球数（[前日, 2日前]）。その日の試合の前に使う */
  recentPitches: Record<number, [number, number]>;
  /** その日に投げた球数（翌日に recentPitches へ移す） */
  todayPitches: Record<number, number>;
  /** 二軍に落とした選手が一軍に戻れる日 */
  recallAfter: Record<number, string>;
  /** 最後に入れ替えを見直した日 */
  lastRosterReview: Record<number, string>;
  /** 自球団の直近の試合 */
  recentGames: GameLog[];
  news: { date: string; text: string }[];
  finished: boolean;
  /** ポストシーズン（レギュラーシーズン後に始める） */
  postseason: PostseasonState | null;
  /** ホームゲームの観客と収支の合計（球団ごと） */
  gate?: Record<number, GateTotals>;
  /** 連勝（プラス）・連敗（マイナス）。球団ごと */
  streak?: Record<number, number>;
  /** シーズン途中で入団した選手が、入団したときにその球団が消化していた試合数（年俸の日割り用） */
  joinedAt?: Record<number, number>;
}

/** ドラフトの候補ごとのスカウト情報 */
export interface ScoutInfo {
  visits: number;
  /** 能力ごとの「本当の値が幅のどこにあるか」（0〜1。幅を作るときに使う） */
  offsets: Record<string, number>;
}

export interface DraftPick {
  round: number; // 1〜。育成は ikusei=true
  ikusei: boolean;
  teamId: number;
  playerId: number;
  bonus: number; // 契約金（万円）
  salary: number;
}

/** ドラフトの1位のくじ（自球団が競合したとき、ユーザーが引く） */
export interface DraftLottery {
  playerId: number;
  /** くじを選ぶ順の球団 */
  teams: number[];
  /** 当たりのくじの番号（0始まり） */
  winning: number;
  /** 球団ごとに選んだくじの番号 */
  choices: Record<number, number>;
}

/** 画面で演出するための出来事（入札の発表、抽選の結果） */
export type DraftEvent =
  | { kind: 'bids'; bids: { teamId: number; playerId: number }[] }
  | { kind: 'lottery'; playerId: number; teams: number[]; winnerId: number; winning: number; choices: Record<number, number>; user: boolean };

export interface DraftState {
  year: number;
  /** 球団設立の年の、最初のドラフト */
  firstYear?: boolean;
  /** 自球団が引くくじ（引くまで1位指名は止まる） */
  lottery?: DraftLottery | null;
  /** まだ画面で見せていない出来事 */
  events?: DraftEvent[];
  phase: 'scouting' | 'round1' | 'regular' | 'ikusei' | 'done';
  candidates: Player[];
  scout: Record<number, ScoutInfo>;
  /** 月ごとの視察の記録（"2027-05" → 視察した候補のID） */
  visitLog: Record<string, number[]>;
  picks: DraftPick[];
  /** 1位指名で、まだ交渉権が決まっていない球団 */
  round1Pending: number[];
  /** 抽選などの経過（画面表示用） */
  log: string[];
  /** 2位以降・育成の順番と、今の位置 */
  order: number[];
  turn: number;
  round: number;
  /** 指名を終えた球団（支配下・育成それぞれ） */
  passed: number[];
  /** AI球団の指名数の目標 [支配下, 育成] */
  aiTargets: Record<number, [number, number]>;
}

/** 表彰 */
export interface Award {
  league: 0 | 1;
  title: string;
  playerId: number;
  playerName: string;
  teamId: number;
  value: string;
}

/** 年ごとの記録 */
export interface YearRecord {
  year: number;
  /** リーグごとの順位（球団IDの順） */
  standings: [number[], number[]];
  championId: number | null;
  leagueWinners: [number | null, number | null];
  awards: Award[];
  /** 自球団の成績 */
  user: { w: number; l: number; t: number; rank: number } | null;
}

/** 契約更改の1人分 */
export interface ContractTalk {
  playerId: number;
  /** 今の年俸と希望額（万円） */
  current: number;
  wish: number;
  /** 断られた回数 */
  refused: number;
  status: 'pending' | 'agreed' | 'left';
  /** 合意した年俸 */
  salary: number | null;
}

/** オフシーズンの進み具合 */
export interface OffseasonState {
  year: number;
  /** 球団設立の年（ドラフト → 戦力の整理 → キャンプ → 開幕。契約更改はない） */
  firstYear?: boolean;
  phase: 'draft' | 'contracts' | 'roster' | 'camp';
  awards: Award[];
  /** 引退した選手（名前と年齢・成績の要約） */
  retired: { name: string; teamId: number; age: number; note: string }[];
  contracts: Record<number, ContractTalk>;
  /** 自由契約にした選手 */
  released: { name: string; teamId: number }[];
  /** 選手の扱いで離れたコア層のファン */
  fanLoss?: { text: string; lost: number }[];
}

/** 自球団のお金 */
export interface Finance {
  balance: number;
  ledger: { year: number; label: string; amount: number }[];
}

export interface World {
  seed: number;
  rngState: number;
  config: LeagueConfig;
  teams: Team[];
  players: Player[];
  /** 使用済みの選手名（同名防止） */
  usedNames: string[];
  nextPlayerId: number;
  userTeamId: number;
  /** 開発用の「すぐ始める」で作った世界（自球団を選び直せる） */
  quickStart?: boolean;
  season: SeasonState;
  /** ドラフト（ポストシーズンの後） */
  draft?: DraftState | null;
  /** オフシーズン（年度を締めてから、翌年の開幕まで） */
  offseason?: OffseasonState | null;
  /** 年ごとの記録 */
  history?: YearRecord[];
  /** 自球団のお金 */
  finance?: Finance;
  /** 初年度のストーブリーグの合同トライアウト（候補の選手ID。獲った選手もここに残し、戦力の整理を終えるまで取り消せる） */
  tryout?: { pool: number[]; signed: number[] };
  /** 球団ごとのファン */
  fans?: Record<number, Fans>;
  /** 自球団のチケットの値段（円） */
  ticketPrices?: Record<SeatKey, number>;
}
