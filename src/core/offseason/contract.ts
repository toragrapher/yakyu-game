// 契約更改：希望額、提示、合意・決裂
import { MAX_SALARY, MIN_SALARY_IKUSEI, MIN_SALARY_ROSTER } from '../../config/budget';
import { CONTRACT } from '../../config/contract';
import type { Rng } from '../rng';
import { salaryFor } from '../salary';
import { era, holdPoints, ops } from '../season/stats';
import type { ContractTalk, World } from '../season/types';
import type { Player } from '../types';

const round10 = (v: number) => Math.round(v / 10) * 10;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** その年の成績による倍率（打者は OPS、投手は防御率とセーブ・ホールド） */
function performance(w: World, p: Player): number {
  const s = w.season.stats.first[p.id];
  if (!s) return CONTRACT.noPlayFactor;
  if (p.mainPos === 'P') {
    const ip = s.pitch.outs / 3;
    if (ip < CONTRACT.minIp) return CONTRACT.noPlayFactor;
    const base = 1 + (3.6 - era(s.pitch)) * CONTRACT.eraWeight;
    const relief = (s.pitch.sv + holdPoints(s.pitch) * 0.5) * CONTRACT.reliefWeight;
    return clamp(base + relief, CONTRACT.perfMin, CONTRACT.perfMax);
  }
  if (s.bat.pa < CONTRACT.minPa) return CONTRACT.noPlayFactor;
  return clamp(1 + (ops(s.bat) - 0.7) * CONTRACT.opsWeight, CONTRACT.perfMin, CONTRACT.perfMax);
}

/** 希望額（万円）：能力と在籍年数の相場 × その年の成績。今の年俸から大きく離れない */
export function computeWish(w: World, p: Player): number {
  if (p.contract === 'ikusei') return MIN_SALARY_IKUSEI;
  const market = salaryFor(p) * performance(w, p);
  const lo = p.salary * CONTRACT.wishMinRatio;
  const hi = p.salary * CONTRACT.wishMaxRatio + CONTRACT.wishMaxAdd;
  return round10(clamp(market, Math.max(MIN_SALARY_ROSTER, lo), Math.min(MAX_SALARY, hi)));
}

/** 減額の下限（NPBの減額制限：1億円以下は25%、1億円超は40%まで） */
export function minOffer(current: number): number {
  const rate = current > CONTRACT.bigSalary ? CONTRACT.bigCutLimit : CONTRACT.cutLimit;
  return Math.max(MIN_SALARY_ROSTER, round10(current * (1 - rate)));
}

/** 合意する確率 */
export function acceptChance(p: Player, offer: number, wish: number): number {
  const ratio = offer / wish;
  if (ratio >= 1) return 1;
  let c = (ratio - CONTRACT.refuseBelow) / (1 - CONTRACT.refuseBelow);
  if (p.personality === 'money') c -= CONTRACT.moneyPenalty;
  if (p.personality === 'loyal') c += CONTRACT.loyalBonus;
  c += (p.attachment - 50) * CONTRACT.attachmentWeight;
  return clamp(c, 0, 1);
}

/** 提示する。結果を返す（合意・保留・決裂して退団） */
export function offer(w: World, rng: Rng, talk: ContractTalk, amount: number): 'agreed' | 'refused' | 'left' {
  const p = w.players.find((x) => x.id === talk.playerId)!;
  if (talk.status !== 'pending') return talk.status === 'agreed' ? 'agreed' : 'left';
  const amt = Math.max(minOffer(talk.current), round10(amount));
  if (rng.chance(acceptChance(p, amt, talk.wish))) {
    talk.status = 'agreed';
    talk.salary = amt;
    p.salary = amt;
    // 希望より多くもらえれば愛着が上がる
    if (amt >= talk.wish) p.attachment = Math.min(100, p.attachment + CONTRACT.attachmentUp);
    return 'agreed';
  }
  talk.refused++;
  p.attachment = Math.max(0, p.attachment - CONTRACT.attachmentDown);
  if (talk.refused >= CONTRACT.maxRefusals) {
    talk.status = 'left';
    p.teamId = null;
    p.retired = true;
    return 'left';
  }
  return 'refused';
}
