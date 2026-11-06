// 総合評価とランク表示
import { BATTER_WEIGHTS, PITCHER_WEIGHTS, RANK_THRESHOLDS } from '../config/ratings';
import type { BatAbilities, FieldPos, PitchAbilities, PitcherRole, Player, Rank } from './types';

export function rankOf(value: number): Rank {
  for (const [rank, min] of RANK_THRESHOLDS) {
    if (value >= min) return rank;
  }
  return 'G';
}

export function batterOverall(b: BatAbilities, pos: FieldPos): number {
  const [w1, w2, w3, w4] = BATTER_WEIGHTS[pos];
  return b.contact * w1 + b.power * w2 + b.speed * w3 + b.defense * w4;
}

export function pitcherOverall(p: PitchAbilities, role: PitcherRole): number {
  const [w1, w2, w3, w4] = PITCHER_WEIGHTS[role];
  return p.velocity * w1 + p.control * w2 + p.breaking * w3 + p.stamina * w4;
}

/** 現在の総合評価（即戦力） */
export function overall(p: Player): number {
  if (p.mainPos === 'P') return pitcherOverall(p.pitch!, p.role!);
  return batterOverall(p.bat, p.mainPos);
}

/** 能力上限から見た総合評価（将来性） */
export function potentialOverall(p: Player): number {
  if (p.mainPos === 'P') return pitcherOverall(p.pitchCap!, p.role!);
  return batterOverall(p.batCap, p.mainPos);
}
