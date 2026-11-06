// 画面全体の状態（今遊んでいる世界と、表示中の画面）
import type { World } from '../core/season/types';
import type { GameResult, GameTeam } from '../core/sim/types';

export type ScreenName = 'home' | 'standings' | 'stats' | 'manage' | 'dev';

export const app = {
  world: null as World | null,
  screen: 'home' as ScreenName,
  /** 直近の自球団の試合（詳しい結果を表示する用。セーブしない） */
  lastGame: null as { result: GameResult; away: GameTeam; home: GameTeam } | null,
  /** 進行中（シーズン終了まで など）なら true */
  busy: false,
  progress: 0,
  refresh: () => {},
};
