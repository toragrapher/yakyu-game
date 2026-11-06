// 手動で組んだ打順が使えるかの確認
import type { LineupPos } from '../sim/types';

const NEED: Record<string, number> = { C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, OF: 3, DH: 1 };

/** 問題があれば理由を返す（なければ null） */
export function lineupProblem(lineup: { playerId: number; pos: LineupPos }[], registered: Set<number>): string | null {
  if (lineup.length !== 9) return '9人そろっていません';
  const ids = lineup.map((s) => s.playerId);
  if (new Set(ids).size !== 9) return '同じ選手が2回入っています';
  if (ids.some((id) => !registered.has(id))) return '一軍にいない選手が入っています';
  const count: Record<string, number> = {};
  for (const s of lineup) count[s.pos] = (count[s.pos] ?? 0) + 1;
  for (const [pos, n] of Object.entries(NEED)) {
    if ((count[pos] ?? 0) !== n) {
      const label = { C: '捕手', '1B': '一塁', '2B': '二塁', '3B': '三塁', SS: '遊撃', OF: '外野', DH: '指名打者' }[pos];
      return `${label}は${n}人にしてください`;
    }
  }
  return null;
}
