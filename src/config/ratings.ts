// 総合評価の重み（提案）と、S〜Gランクの境目
import type { FieldPos, PitcherRole, Rank } from '../core/types';

/** 野手の重み：巧打・長打・走塁・守備（合計1） */
export const BATTER_WEIGHTS: Record<FieldPos, [number, number, number, number]> = {
  C: [0.25, 0.2, 0.1, 0.45],
  '1B': [0.35, 0.45, 0.1, 0.1],
  '2B': [0.3, 0.2, 0.2, 0.3],
  '3B': [0.3, 0.35, 0.1, 0.25],
  SS: [0.25, 0.15, 0.2, 0.4],
  OF: [0.3, 0.3, 0.2, 0.2],
};

/** 投手の重み：速球・制球・変化球・体力（合計1） */
export const PITCHER_WEIGHTS: Record<PitcherRole, [number, number, number, number]> = {
  SP: [0.28, 0.25, 0.25, 0.22],
  RP: [0.36, 0.28, 0.28, 0.08],
  CL: [0.4, 0.28, 0.27, 0.05],
};

/** ランクの下限（内部値） */
export const RANK_THRESHOLDS: readonly [Rank, number][] = [
  ['S', 90],
  ['A', 80],
  ['B', 70],
  ['C', 60],
  ['D', 50],
  ['E', 40],
  ['F', 30],
  ['G', 0],
];
