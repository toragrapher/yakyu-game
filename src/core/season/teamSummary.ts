// ホーム画面などで使う、自球団の要約（連勝・最近の勝敗・予告先発・成績上位）
import { QUALIFY_IP_PER_GAME, QUALIFY_PA_PER_GAME } from '../../config/league';
import { FATIGUE } from '../../config/season';
import type { Player } from '../types';
import { daysBetween } from './dates';
import { levelPlayers, rotationOf } from './gameTeam';
import { avg, era, holdPoints } from './stats';
import type { GameLog, World } from './types';

/** 一軍の試合の記録（新しい順） */
export function firstTeamLogs(w: World): GameLog[] {
  return w.season.recentGames.filter((g) => g.level === 'first');
}

/** 連勝・連敗（例：{ kind: 'W', count: 3 }）。引き分けは数えない */
export function streak(w: World): { kind: 'W' | 'L'; count: number } | null {
  const logs = firstTeamLogs(w).filter((g) => g.result !== 'T');
  if (logs.length === 0) return null;
  const kind = logs[0].result as 'W' | 'L';
  let count = 0;
  for (const g of logs) {
    if (g.result !== kind) break;
    count++;
  }
  return { kind, count };
}

/** 次の試合の予告先発（試合の前に疲れがどれだけ取れるかも見込む） */
export function probableStarter(w: World, teamId: number, gameDate: string): Player | null {
  const players = levelPlayers(w, teamId, 'first');
  const rot = rotationOf(w, teamId, 'first', players);
  if (rot.length === 0) return null;
  const prev = w.season.dayIndex > 0 ? w.season.schedule.days[w.season.dayIndex - 1].date : gameDate;
  const gap = Math.max(0, daysBetween(prev, gameDate));
  const ready = (p: Player) => Math.max(0, p.fatigue - FATIGUE.pitcherRecoveryPerDay * gap) <= FATIGUE.starterReadyAt;
  const start = w.season.rotationIdx[`${teamId}:first`] ?? 0;
  for (let i = 0; i < rot.length; i++) {
    const p = rot[(start + i) % rot.length];
    if (ready(p)) return p;
  }
  return rot.slice().sort((a, b) => a.fatigue - b.fatigue)[0];
}

export interface Leader {
  label: string;
  player: Player;
  value: string;
}

/** チーム内の成績上位（一軍） */
export function teamLeaders(w: World, teamId: number): Leader[] {
  const stats = w.season.stats.first;
  const st = w.season.standings.first[teamId];
  const games = st.w + st.l + st.t;
  const mine = w.players.filter((p) => p.teamId === teamId && stats[p.id]);
  const out: Leader[] = [];
  /** list の中で一番の選手（low なら小さいほうが上）。記録が0なら出さない */
  const best = (list: Player[], key: (p: Player) => number, fmt: (v: number) => string, label: string, low = false) => {
    if (list.length === 0) return;
    const p = list.slice().sort((a, b) => (low ? key(a) - key(b) : key(b) - key(a)))[0];
    if (!low && key(p) <= 0) return;
    out.push({ label, player: p, value: fmt(key(p)) });
  };
  const r3 = (v: number) => v.toFixed(3).replace(/^0/, '');
  // 打率・防御率は規定に届いた選手から（いなければ打席・投球回の多い選手から）
  const qb = mine.filter((p) => stats[p.id].bat.pa >= Math.max(1, games * QUALIFY_PA_PER_GAME));
  const batPool = qb.length ? qb : mine.filter((p) => stats[p.id].bat.pa >= Math.max(1, games * 2));
  best(batPool, (p) => avg(stats[p.id].bat), r3, '打率');
  best(mine, (p) => stats[p.id].bat.hr, (v) => `${v}本`, '本塁打');
  best(mine, (p) => stats[p.id].bat.rbi, (v) => `${v}打点`, '打点');
  best(mine, (p) => stats[p.id].bat.sb, (v) => `${v}盗塁`, '盗塁');
  best(mine, (p) => stats[p.id].pitch.w, (v) => `${v}勝`, '勝利');
  const qp = mine.filter((p) => stats[p.id].pitch.outs / 3 >= Math.max(1, games * QUALIFY_IP_PER_GAME));
  const pitPool = qp.length ? qp : mine.filter((p) => stats[p.id].pitch.outs / 3 >= Math.max(1, games * 0.5));
  best(pitPool, (p) => era(stats[p.id].pitch), (v) => v.toFixed(2), '防御率', true);
  best(mine, (p) => stats[p.id].pitch.sv, (v) => `${v}S`, 'セーブ');
  best(mine, (p) => holdPoints(stats[p.id].pitch), (v) => `${v}HP`, 'HP');
  return out;
}
