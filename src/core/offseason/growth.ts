// 成長と衰え（年に1回、年度を締めるときに計算する。design.md 4.3）
import { PEAK_AGES } from '../../config/generate';
import {
  COACH_FACTOR, DECLINE_BASE, DECLINE_FACTOR, DECLINE_PER_YEAR, FACILITY_FACTOR, FARM_WEIGHT, FULL_IP_RELIEVER,
  FULL_IP_STARTER, FULL_PA, GAIN_AT_PEAK, GAIN_BEFORE_PEAK, GROWTH_NOISE, PEAK_SD, PERF_MAX, PERF_MIN, PLAY_MAX,
  PLAY_MIN, STEADY_FACTOR,
} from '../../config/growth';
import type { Rng } from '../rng';
import { era, ops } from '../season/stats';
import type { World } from '../season/types';
import type { Player } from '../types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 出場機会（0.5〜1.3） */
export function playFactor(w: World, p: Player): number {
  const f = w.season.stats.first[p.id];
  const m = w.season.stats.farm[p.id];
  let share: number;
  if (p.mainPos === 'P') {
    const ip = ((f?.pitch.outs ?? 0) + FARM_WEIGHT * (m?.pitch.outs ?? 0)) / 3;
    share = ip / (p.role === 'SP' ? FULL_IP_STARTER : FULL_IP_RELIEVER);
  } else {
    share = ((f?.bat.pa ?? 0) + FARM_WEIGHT * (m?.bat.pa ?? 0)) / FULL_PA;
  }
  return PLAY_MIN + (PLAY_MAX - PLAY_MIN) * clamp(share, 0, 1);
}

/** 活躍（0.85〜1.2）。打者は OPS、投手は防御率。出場が少なければ1に近づける */
export function perfFactor(w: World, p: Player): number {
  const f = w.season.stats.first[p.id] ?? w.season.stats.farm[p.id];
  if (!f) return 1;
  if (p.mainPos === 'P') {
    const ip = f.pitch.outs / 3;
    if (ip < 10) return 1;
    const trust = Math.min(1, ip / 60);
    return clamp(1 + (3.6 - era(f.pitch)) * 0.07 * trust, PERF_MIN, PERF_MAX);
  }
  if (f.bat.pa < 50) return 1;
  const trust = Math.min(1, f.bat.pa / 300);
  return clamp(1 + (ops(f.bat) - 0.7) * 1.0 * trust, PERF_MIN, PERF_MAX);
}

/** 1つの能力の1年の変化量 */
export function abilityDelta(rng: Rng, p: Player, key: string, play: number, perf: number): number {
  const [peakStart, peakEnd] = PEAK_AGES[p.growthType];
  const steady = p.growthType === 'steady' ? STEADY_FACTOR : 1;
  const noise = Math.max(0, 1 + rng.normal(0, GROWTH_NOISE));
  if (p.age < peakStart) return GAIN_BEFORE_PEAK * steady * play * perf * COACH_FACTOR * FACILITY_FACTOR * noise;
  if (p.age <= peakEnd) return rng.normal(GAIN_AT_PEAK, PEAK_SD) * (play >= 1 ? 1 : 0.8);
  const years = p.age - peakEnd;
  return -(DECLINE_BASE + DECLINE_PER_YEAR * (years - 1)) * (DECLINE_FACTOR[key] ?? 1) * steady * noise;
}

/** 年度を締めるときの成長と衰え。年齢とプロ年数も1つ増やす */
export function applyGrowth(w: World, rng: Rng, players: Player[]): void {
  for (const p of players) {
    const play = playFactor(w, p);
    const perf = perfFactor(w, p);
    const apply = (cur: Record<string, number>, cap: Record<string, number>, keys: string[]) => {
      for (const k of keys) {
        const d = abilityDelta(rng, p, k, play, perf);
        const next = cur[k] + d;
        // 伸びるときは能力上限まで、衰えるときは下限1まで
        cur[k] = Math.round(clamp(d > 0 ? Math.min(next, Math.max(cur[k], cap[k])) : next, 1, 100));
      }
    };
    if (p.pitch && p.pitchCap) apply(p.pitch as unknown as Record<string, number>, p.pitchCap as unknown as Record<string, number>, ['velocity', 'control', 'breaking', 'stamina']);
    else apply(p.bat as unknown as Record<string, number>, p.batCap as unknown as Record<string, number>, ['contact', 'power', 'speed', 'defense']);
    p.age++;
    p.proYears++;
  }
}
