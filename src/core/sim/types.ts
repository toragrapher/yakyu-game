// 試合シミュレーションで使うデータの形
import type { FieldPos, Player, Tactics, Team } from '../types';

export type LineupPos = FieldPos | 'DH' | 'P' | 'PH'; // PH＝投手の打順に入った代打

export interface LineupSlot {
  player: Player;
  pos: LineupPos;
}

/** 1試合に出るチームの編成 */
export interface GameTeam {
  team: Team;
  /** 打順（9人）。DHなしの試合では投手が 'P' で入る */
  lineup: LineupSlot[];
  /** 控え野手（代打用） */
  bench: Player[];
  starter: Player;
  /** 勝ちパターン（7回・8回の順） */
  setup: Player[];
  closer: Player | null;
  /** その他の中継ぎ（よい順） */
  bullpen: Player[];
  tactics: Tactics;
}

export type WindDir = 'none' | 'out' | 'in' | 'cross'; // 無風／追い風（打者に）／向かい風／横風

export interface Weather {
  dome: boolean;
  temp: number; // 気温（度）
  windDir: WindDir;
  wind: number; // 風速（m/秒）
}

/** 打者の1試合の成績 */
export interface BatLine {
  playerId: number;
  pos: LineupPos;
  order: number; // 打順（1〜9）
  pa: number;
  ab: number;
  h: number;
  d: number;
  t: number;
  hr: number;
  rbi: number;
  r: number;
  bb: number;
  hbp: number;
  k: number;
  sb: number;
  cs: number;
  sh: number;
  sf: number;
  gidp: number;
}

/** 投手の1試合の成績 */
export interface PitchLine {
  playerId: number;
  outs: number;
  bf: number; // 対戦打者
  h: number;
  hr: number;
  bb: number;
  hbp: number;
  k: number;
  r: number;
  er: number;
  pitches: number;
  starter: boolean;
  /** 登板したときの自軍のリード（マイナスはビハインド） */
  enterLead: number;
  /** 降板したときの自軍のリード */
  exitLead: number;
  decision: 'W' | 'L' | 'S' | 'H' | null;
}

export interface GameResult {
  awayId: number;
  homeId: number;
  /** [ビジター, ホーム] */
  score: [number, number];
  hits: [number, number];
  errors: [number, number];
  /** 回ごとの得点。ホームの9回裏をしなかったときは null */
  line: [number[], (number | null)[]];
  tie: boolean;
  batting: [BatLine[], BatLine[]];
  pitching: [PitchLine[], PitchLine[]];
  win: number | null;
  loss: number | null;
  save: number | null;
  weather: Weather;
  dh: boolean;
  /** 勝因・敗因 */
  summary: string[];
}

export interface GameOptions {
  dh: boolean;
  /** 月（3〜10）。気温に使う */
  month: number;
  night: boolean;
}
