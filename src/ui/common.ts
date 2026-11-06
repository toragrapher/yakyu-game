// 画面で共通に使う部品
import { rankOf } from '../core/ratings';
import type { Player, Team } from '../core/types';
import { POS_LABEL, ROLE_LABEL } from '../core/labels';

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const rankBadge = (v: number) => `<span class="rank rank-${rankOf(v)}">${rankOf(v)}</span>`;

const COND: Record<number, [string, string]> = {
  5: ['絶好調', '⬆'], 4: ['好調', '↗'], 3: ['普通', '➡'], 2: ['不調', '↘'], 1: ['絶不調', '⬇'],
};
export function conditionIcon(p: Player): string {
  const [label, icon] = COND[p.condition] ?? COND[3];
  return `<span class="cond cond-${p.condition}" title="${label}">${icon}</span>`;
}
export function conditionLabel(p: Player): string {
  return COND[p.condition]?.[0] ?? '普通';
}

/** 疲労の表示（小さな棒） */
export function fatigueBar(p: Player): string {
  const v = Math.round(p.fatigue);
  const cls = v >= 60 ? 'hi' : v >= 30 ? 'mid' : 'lo';
  return `<span class="fat"><span class="fat-${cls}" style="width:${Math.min(100, v)}%"></span></span>`;
}

export function posShort(p: Player): string {
  return p.mainPos === 'P' ? ROLE_LABEL[p.role!] : POS_LABEL[p.mainPos];
}

export function abilityLine(p: Player): string {
  if (p.pitch) {
    const a = p.pitch;
    return `速${rankBadge(a.velocity)}制${rankBadge(a.control)}変${rankBadge(a.breaking)}体${rankBadge(a.stamina)}`;
  }
  const b = p.bat;
  return `巧${rankBadge(b.contact)}長${rankBadge(b.power)}走${rankBadge(b.speed)}守${rankBadge(b.defense)}`;
}

export function teamChip(t: Team | undefined): string {
  if (!t) return '?';
  return `<span class="chip" style="background:${t.colorMain};color:#fff">${esc(t.shortName)}</span>`;
}
