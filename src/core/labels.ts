// 画面に出す日本語の表記
import { overall, potentialOverall, rankOf } from './ratings';
import type { Bats, GrowthType, MainPos, OrderFit, PitcherRole, Player, Throws } from './types';

export const POS_LABEL: Record<MainPos, string> = { P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '遊', OF: '外' };
export const ROLE_LABEL: Record<PitcherRole, string> = { SP: '先発', RP: '中継ぎ', CL: '抑え' };
export const GROWTH_LABEL: Record<GrowthType, string> = {
  superEarly: '超早熟', early: '早熟', normal: '普通', late: '晩成', veryLate: '大器晩成', steady: '安定',
};
export const ORDER_FIT_LABEL: Record<OrderFit, string> = {
  leadoff: '1番向き', second: '2番向き', cleanup: '主砲向き', middle: '中軸向き', lower: '下位向き',
};
const THROWS_LABEL: Record<Throws, string> = { R: '右', L: '左' };
const BATS_LABEL: Record<Bats, string> = { R: '右', L: '左', S: '両' };

export function handLabel(p: Player): string {
  return `${THROWS_LABEL[p.throws]}投${BATS_LABEL[p.bats]}打`;
}

export function fullName(p: Player): string {
  return `${p.familyName} ${p.givenName}`;
}

/** 例：「青柳 祐太（遊｜即C｜将A｜晩成）」 */
export function playerTag(p: Player): string {
  const pos = p.mainPos === 'P' ? ROLE_LABEL[p.role!] : POS_LABEL[p.mainPos];
  return `${fullName(p)}（${pos}｜即${rankOf(overall(p))}｜将${rankOf(potentialOverall(p))}｜${GROWTH_LABEL[p.growthType]}）`;
}

/** 年俸の表示（例：「1億2,000万円」「2,500万円」） */
export function salaryLabel(man: number): string {
  const oku = Math.floor(man / 10000);
  const rest = man % 10000;
  if (oku > 0) return rest > 0 ? `${oku}億${rest.toLocaleString()}万円` : `${oku}億円`;
  return `${rest.toLocaleString()}万円`;
}
