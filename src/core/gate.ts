// ファンと観客動員、ホームゲームの収支（design.md 7.2・7.3）
import {
  CORE_ATTEND_RATE, CORE_LOSS, CORE_PRICE_ELASTICITY, CORE_WIN, FAN_PENALTY, FORM_BASE, FORM_PER_STREAK, FORM_PER_WINPCT,
  GAME_COST, GOODS_FOOD_PER_FAN, INITIAL_CORE_FANS, INITIAL_FAN_SD, INITIAL_LIGHT_FANS, LIGHT_ATTEND_RATE, LIGHT_LOSS,
  LIGHT_PRICE_ELASTICITY, LIGHT_STREAK, LIGHT_TO_CORE, LIGHT_WIN, CORE_DECAY, SEATS, VISITOR_RATE, WEEKDAY_FACTOR,
  WEEKEND_FACTOR, type SeatKey,
} from '../config/gate';
import type { Rng } from './rng';
import { winPct } from './season/standings';
import type { Fans, GateResult, GateTotals, World } from './season/types';

export const defaultPrices = (): Record<SeatKey, number> =>
  Object.fromEntries(SEATS.map((s) => [s.key, s.price])) as Record<SeatKey, number>;

const emptySeats = (): Record<SeatKey, number> => ({ S: 0, A: 0, B: 0, OH: 0, OV: 0 });

/** ファンを用意する（全球団） */
export function initFans(w: World, rng: Rng): void {
  w.fans ??= {};
  for (const t of w.teams) {
    if (w.fans[t.id]) continue;
    const k = Math.max(0.6, 1 + rng.normal(0, INITIAL_FAN_SD));
    w.fans[t.id] = { core: Math.round(INITIAL_CORE_FANS * k), light: Math.round(INITIAL_LIGHT_FANS * k) };
  }
  w.ticketPrices ??= defaultPrices();
}

export function fansOf(w: World, teamId: number): Fans {
  return w.fans?.[teamId] ?? { core: INITIAL_CORE_FANS, light: INITIAL_LIGHT_FANS };
}

/** チケットの値段を変えられるか（年に1回、シーズンが始まる前だけ） */
export function canChangePrices(w: World): boolean {
  return !!w.offseason || w.season.dayIndex === 0;
}

/** その球団の値段（自球団は設定した値段、AI球団は初期値） */
function pricesOf(w: World, teamId: number): Record<SeatKey, number> {
  return teamId === w.userTeamId && w.ticketPrices ? w.ticketPrices : defaultPrices();
}

/** チームの調子（勝率と連勝・連敗） */
function form(w: World, teamId: number): number {
  const st = w.season.standings.first[teamId];
  const pct = st && st.w + st.l > 0 ? winPct(st) : 0.5;
  const streak = w.season.streak?.[teamId] ?? 0;
  return Math.max(0.4, FORM_BASE + FORM_PER_WINPCT * pct + FORM_PER_STREAK * Math.max(-5, Math.min(5, streak)));
}

/** ホームゲーム1試合の観客と収支 */
export function computeGate(w: World, rng: Rng, homeId: number, awayId: number, date: string): GateResult {
  const fans = fansOf(w, homeId);
  const prices = pricesOf(w, homeId);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = day === 0 || day === 5 || day === 6 ? WEEKEND_FACTOR : WEEKDAY_FACTOR;
  const f = form(w, homeId);
  const seats = emptySeats();
  const soldOut: SeatKey[] = [];
  let ticket = 0;
  for (const s of SEATS) {
    let n: number;
    if (s.key === 'OV') {
      const opp = fansOf(w, awayId);
      n = (opp.core + opp.light) * VISITOR_RATE * Math.pow(s.price / prices[s.key], LIGHT_PRICE_ELASTICITY) * weekend;
    } else {
      const core = fans.core * CORE_ATTEND_RATE * Math.pow(s.price / prices[s.key], CORE_PRICE_ELASTICITY);
      const light = fans.light * LIGHT_ATTEND_RATE * f * weekend * Math.pow(s.price / prices[s.key], LIGHT_PRICE_ELASTICITY);
      n = (core + light) * s.share;
    }
    n = Math.round(n * (0.92 + rng.next() * 0.16));
    if (n >= s.capacity) {
      n = s.capacity;
      soldOut.push(s.key);
    }
    seats[s.key] = n;
    ticket += n * prices[s.key];
  }
  const attendance = Object.values(seats).reduce((a, b) => a + b, 0);
  const t = Math.round(ticket / 10000);
  const goods = Math.round((attendance * GOODS_FOOD_PER_FAN) / 10000);
  return { attendance, seats, soldOut, ticket: t, goods, cost: GAME_COST, net: t + goods - GAME_COST };
}

/** シーズンの合計に足す */
export function addGate(w: World, teamId: number, g: GateResult): void {
  const all = (w.season.gate ??= {});
  const t: GateTotals = (all[teamId] ??= { games: 0, attendance: 0, seats: emptySeats(), ticket: 0, goods: 0, cost: 0 });
  t.games++;
  t.attendance += g.attendance;
  for (const k of Object.keys(g.seats) as SeatKey[]) t.seats[k] += g.seats[k];
  t.ticket += g.ticket;
  t.goods += g.goods;
  t.cost += g.cost;
}

/** 勝敗によるファンの増減（増えた人数を返す） */
export function updateFans(w: World, teamId: number, result: 'W' | 'L' | 'T'): number {
  const fans = (w.fans ??= {})[teamId] ?? (w.fans[teamId] = { core: INITIAL_CORE_FANS, light: INITIAL_LIGHT_FANS });
  const streaks = (w.season.streak ??= {});
  const prev = streaks[teamId] ?? 0;
  const next = result === 'T' ? 0 : result === 'W' ? (prev > 0 ? prev + 1 : 1) : prev < 0 ? prev - 1 : -1;
  streaks[teamId] = next;
  if (result === 'T') return 0;
  const run = Math.min(5, Math.abs(next) - 1);
  const before = fans.core + fans.light;
  if (result === 'W') {
    fans.light = Math.round(fans.light * (1 + LIGHT_WIN + LIGHT_STREAK * run));
    fans.core = Math.round(fans.core * (1 + CORE_WIN));
  } else {
    fans.light = Math.round(fans.light * (1 - LIGHT_LOSS - LIGHT_STREAK * run));
    fans.core = Math.round(fans.core * (1 - CORE_LOSS));
  }
  return fans.core + fans.light - before;
}

/** 年度を締めるとき：ライト層の一部がコア層に移り、コア層は少し自然に離れる */
export function yearEndFans(w: World): void {
  for (const f of Object.values(w.fans ?? {})) {
    const move = Math.round(f.light * LIGHT_TO_CORE);
    f.light -= move;
    f.core = Math.round((f.core + move) * (1 - CORE_DECAY));
  }
}

export type FanPenaltyKind = 'release' | 'ikusei' | 'contractBreak';

/** 選手の扱いでコア層が離れる（自球団のオフシーズン）。離れた人数を返す */
export function fanPenalty(w: World, kind: FanPenaltyKind, info: { proYears: number; attachment: number; releasesThisYear: number }): number {
  const fans = w.fans?.[w.userTeamId];
  if (!fans) return 0;
  let rate = 0;
  if (kind === 'release') {
    if (info.releasesThisYear > FAN_PENALTY.freeReleases) rate += FAN_PENALTY.perExtraRelease;
    if (info.proYears >= FAN_PENALTY.veteranYears || info.attachment >= FAN_PENALTY.lovedAttachment) rate += FAN_PENALTY.perVeteran;
  } else if (kind === 'ikusei') {
    rate += info.proYears <= FAN_PENALTY.youngYears ? FAN_PENALTY.perYoungIkusei : FAN_PENALTY.perIkusei;
  } else {
    rate += FAN_PENALTY.perContractBreak;
  }
  const lost = Math.round(fans.core * rate);
  fans.core -= lost;
  return lost;
}
