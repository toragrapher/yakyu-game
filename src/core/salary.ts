// 年俸の目安
import {
  MAX_SALARY, MIN_SALARY_IKUSEI, MIN_SALARY_ROSTER, ROOKIE_SALARY_FACTOR,
  SALARY_BASE, SALARY_PIVOT, SALARY_SCALE,
} from '../config/budget';
import { overall } from './ratings';
import type { Player } from './types';

/** 能力と在籍年数から見た年俸の相場（万円、10万円単位） */
export function salaryFor(p: Player): number {
  if (p.contract === 'ikusei') return MIN_SALARY_IKUSEI;
  let s = MIN_SALARY_ROSTER + SALARY_BASE * Math.exp((overall(p) - SALARY_PIVOT) / SALARY_SCALE);
  if (p.proYears < ROOKIE_SALARY_FACTOR.length) s *= ROOKIE_SALARY_FACTOR[p.proYears];
  s = Math.max(MIN_SALARY_ROSTER, Math.min(MAX_SALARY, s));
  return Math.round(s / 10) * 10;
}
