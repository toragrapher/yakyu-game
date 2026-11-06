// 1打席の結果を確率で決める
import { BASE_RATES, ELASTICITY, GLOBAL, PIVOT, PLATOON_SAME_SIDE, SOFT_CAP } from '../../config/balance';
import type { Rng } from '../rng';
import type { Bats, Throws } from '../types';

export type PAResult = 'K' | 'BB' | 'HBP' | 'S' | 'D' | 'T' | 'HR' | 'OUT';

/** 補正込みの打者の能力 */
export interface BatterEff {
  contact: number;
  power: number;
  speed: number;
  bats: Bats;
}

/** 補正込みの投手の能力 */
export interface PitcherEff {
  velocity: number;
  control: number;
  breaking: number;
  throws: Throws;
}

/** 球場と天候による倍率 */
export interface ParkEff {
  hr: number;
  d: number;
  s: number;
}

type Values = Record<string, number>;

/** 高すぎる能力の効き方を弱める */
function soft(key: string, v: number): number {
  const c = SOFT_CAP[key];
  if (!c || v <= c.start) return v;
  return c.start + (v - c.start) * c.factor;
}

function mult(el: Values, v: Values): number {
  let x = 0;
  for (const k in el) x += el[k] * ((soft(k, v[k]) - PIVOT) / 10);
  return Math.exp(x * GLOBAL.spread);
}

const ORDER: PAResult[] = ['K', 'BB', 'HBP', 'S', 'D', 'T', 'HR', 'OUT'];

/** 各結果の確率（合計1）。検証やテストでも使う */
export function paProbabilities(b: BatterEff, p: PitcherEff, defense: number, park: ParkEff): number[] {
  const v: Values = {
    contact: b.contact, power: b.power, speed: b.speed,
    velocity: p.velocity, control: p.control, breaking: p.breaking, defense,
  };
  const sameSide = b.bats !== 'S' && b.bats === p.throws;
  const pl = sameSide ? PLATOON_SAME_SIDE : { hit: 0, hr: 0, k: 0 };
  const w = [
    BASE_RATES.K * GLOBAL.k * mult(ELASTICITY.K, v) * Math.exp(pl.k),
    BASE_RATES.BB * GLOBAL.bb * mult(ELASTICITY.BB, v),
    BASE_RATES.HBP * mult(ELASTICITY.HBP, v),
    BASE_RATES.S * GLOBAL.hit * mult(ELASTICITY.S, v) * Math.exp(pl.hit) * park.s,
    BASE_RATES.D * GLOBAL.hit * mult(ELASTICITY.D, v) * Math.exp(pl.hit) * park.d,
    BASE_RATES.T * GLOBAL.hit * mult(ELASTICITY.T, v) * Math.exp(pl.hit),
    BASE_RATES.HR * GLOBAL.hr * mult(ELASTICITY.HR, v) * Math.exp(pl.hr) * park.hr,
  ];
  const sum = w.reduce((a, c) => a + c, 0);
  // 凡打は基準値のときの残り。打者・投手の能力で上の結果が増えると、相対的に減る
  const out = Math.max(0.05, 1 - (BASE_RATES.K + BASE_RATES.BB + BASE_RATES.HBP + BASE_RATES.S + BASE_RATES.D + BASE_RATES.T + BASE_RATES.HR));
  const total = sum + out;
  return [...w.map((x) => x / total), out / total];
}

export function resolvePA(rng: Rng, b: BatterEff, p: PitcherEff, defense: number, park: ParkEff): PAResult {
  const probs = paProbabilities(b, p, defense, park);
  let r = rng.next();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r < 0) return ORDER[i];
  }
  return 'OUT';
}
