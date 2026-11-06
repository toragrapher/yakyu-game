// 自球団のお金（design.md 7.0）：初年度の支給、ドラフト契約金・キャンプ費用の支払い、決算とスポンサー収益
import {
  DRAFT_COST_ESTIMATE, INITIAL_GRANT_RATE, OPERATING_COST, RAISE_ESTIMATE_RATE, SPONSOR_BASE, SPONSOR_CHAMPION,
  SPONSOR_LEAGUE_WIN, SPONSOR_PER_STAR, SPONSOR_PER_TITLE, SPONSOR_POSTSEASON, SPONSOR_RANK_BONUS, SPONSOR_STAR_OVERALL,
} from '../config/budget';
import { overall } from './ratings';
import { standingsTable } from './season/standings';
import type { Award, Finance, World } from './season/types';

/** 自球団の支配下・育成の年俸総額（万円） */
export function payroll(w: World): number {
  return w.players.filter((p) => p.teamId === w.userTeamId && !p.retired).reduce((s, p) => s + p.salary, 0);
}

/** 初年度の支給額（必要資金 × 1.1） */
export function initialGrant(w: World): number {
  const pr = payroll(w);
  return Math.round((pr + DRAFT_COST_ESTIMATE + pr * RAISE_ESTIMATE_RATE + OPERATING_COST) * INITIAL_GRANT_RATE);
}

/** お金の記録を始める（自球団があるときだけ） */
export function initFinance(w: World): void {
  if (!w.teams.some((t) => t.id === w.userTeamId) || w.finance) return;
  const grant = initialGrant(w);
  w.finance = { balance: grant, ledger: [{ year: w.season.year, label: 'オーナーからの初年度資金', amount: grant }] };
}

/** 入出金を記録する（amount は入金がプラス、支払いがマイナス） */
export function pay(w: World, label: string, amount: number): void {
  const f = w.finance;
  if (!f) return;
  f.balance += amount;
  f.ledger.push({ year: w.season.year, label, amount });
}

/** 入出金を、同じ年・同じ項目の記録にまとめて足す（ホームゲームの収支など、回数の多いもの） */
export function payAccum(w: World, label: string, amount: number): void {
  const f = w.finance;
  if (!f) return;
  f.balance += amount;
  const e = f.ledger.find((x) => x.year === w.season.year && x.label === label);
  if (e) e.amount += amount;
  else f.ledger.push({ year: w.season.year, label, amount });
}

/** 自球団がこのシーズンに消化した一軍の試合数（レギュラーシーズン） */
function teamGamesPlayed(w: World): number {
  const st = w.season.standings.first[w.userTeamId];
  return st ? st.w + st.l + st.t : 0;
}

/**
 * 年俸の日割り：選手ごとに（所属して消化した試合数 ÷ シーズン試合数）× 年俸。
 * シーズン途中で入った選手は、入ったときに消化していた試合数（joinedAt）から数える。
 * upToEnd なら、シーズン最後まで在籍した場合の見込み額
 */
export function proratedPayroll(w: World, upToEnd = false): number {
  const total = w.season.schedule.games;
  const played = upToEnd ? total : teamGamesPlayed(w);
  const joined = w.season.joinedAt ?? {};
  let sum = 0;
  for (const p of w.players) {
    if (p.teamId !== w.userTeamId || p.retired) continue;
    const games = Math.max(0, played - (joined[p.id] ?? 0));
    sum += (p.salary * games) / total;
  }
  return Math.round(sum);
}

/** シーズン途中に入団した選手を記録する（獲得・トレードなど。契約金はその場で払い、年俸は日割りで期末に払う） */
export function registerJoin(w: World, playerId: number, teamId: number): void {
  const st = w.season.standings.first[teamId];
  (w.season.joinedAt ??= {})[playerId] = st ? st.w + st.l + st.t : 0;
}

/**
 * これから払う支出の見込み：シーズン中は今年の年俸（日割りでシーズン最後までの見込み）と運営費、
 * オフシーズンは来年の年俸総額と運営費
 */
export function pendingCosts(w: World): number {
  if (w.offseason) return payroll(w) + OPERATING_COST;
  return proratedPayroll(w, true) + OPERATING_COST;
}

/** 使える資金 ＝ 残高 − これから払う年俸と運営費の見込み */
export function availableFunds(w: World): number {
  if (!w.finance) return Infinity;
  return w.finance.balance - pendingCosts(w);
}

export function canAfford(w: World, cost: number): boolean {
  return availableFunds(w) >= cost;
}

/** スポンサー収益の内訳 */
export function sponsorIncome(w: World, awards: Award[], teamId = w.userTeamId): { label: string; amount: number }[] {
  const me = w.teams.find((t) => t.id === teamId);
  if (!me) return [];
  const rank = standingsTable(w, 'first', me.league).findIndex((r) => r.teamId === me.id);
  const ps = w.season.postseason;
  const items = [
    { label: 'スポンサー収益（基本）', amount: SPONSOR_BASE },
    { label: `順位（${rank + 1}位）`, amount: SPONSOR_RANK_BONUS[Math.min(rank, SPONSOR_RANK_BONUS.length - 1)] },
  ];
  if (ps?.seeds[me.league].includes(me.id)) items.push({ label: 'ポストシーズン進出', amount: SPONSOR_POSTSEASON });
  if (ps?.leagueWinners[me.league] === me.id) items.push({ label: 'リーグ優勝', amount: SPONSOR_LEAGUE_WIN });
  if (ps?.championId === me.id) items.push({ label: '日本一', amount: SPONSOR_CHAMPION });
  const titles = new Set(awards.filter((a) => a.teamId === me.id).map((a) => a.playerId)).size;
  if (titles) items.push({ label: `タイトル獲得選手（${titles}人）`, amount: titles * SPONSOR_PER_TITLE });
  const stars = w.players.filter((p) => p.teamId === me.id && !p.retired && overall(p) >= SPONSOR_STAR_OVERALL).length;
  if (stars) items.push({ label: `スター選手（総合${SPONSOR_STAR_OVERALL}以上 ${stars}人）`, amount: stars * SPONSOR_PER_STAR });
  return items;
}

/** 決算：年俸と運営費を払い、スポンサー収益を受け取る */
export function settleYear(w: World, awards: Award[]): void {
  if (!w.finance) return;
  pay(w, '選手の年俸（所属した試合数で日割り）', -proratedPayroll(w));
  pay(w, '運営費', -OPERATING_COST);
  for (const x of sponsorIncome(w, awards)) pay(w, x.label, x.amount);
}

export type { Finance };
