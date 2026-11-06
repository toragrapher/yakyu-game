// 画面全体の状態（今遊んでいる世界と、表示中の画面）
import type { LockerState } from '../core/locker';
import type { World } from '../core/season/types';
import type { GameResult, GameTeam } from '../core/sim/types';

export type ScreenName = 'home' | 'records' | 'locker' | 'reinforce' | 'dev' | 'found';

export const app = {
  world: null as World | null,
  /** 今遊んでいるセーブ枠（1〜3） */
  slot: 1,
  /** セーブ枠の一覧（タイトル画面用。読み込み前は null） */
  saves: null as ({ slot: number; savedAt: string; label: string } | null)[] | null,
  screen: 'home' as ScreenName,
  /** 直近の自球団の試合（詳しい結果を表示する用。セーブしない） */
  lastGame: null as { result: GameResult; away: GameTeam; home: GameTeam; label?: string } | null,
  /** 進行中（シーズン終了まで など）なら true */
  busy: false,
  /** ロッカールームの未確定の変更（確定・リセットまで残す） */
  locker: null as LockerState | null,
  progress: 0,
  refresh: () => {},
};

/** 開発用の画面を出すか（アドレスの最後に ?dev を付けたときだけ） */
export const DEV_MODE = new URLSearchParams(location.search).has('dev');
