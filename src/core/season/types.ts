// ペナントの状態（セーブするデータ）
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
  g: number; gs: number; w: number; l: number; sv: number; hld: number; outs: number; bf: number;
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
  season: SeasonState;
}
