// 日程の作成
// 1. 対戦相手ごとの試合数を決める（全球団の試合数をそろえる）
// 2. 試合を「カード」（同じ相手と続けて行う1〜3試合）に分ける
// 3. カードを「枠」（火〜木・金〜日）に詰める。1つの枠で同じ球団が2カード入らないようにする
// 4. 枠を日付に直す（月曜は休み）
import {
  DEFAULT_GAMES, INTERLEAGUE_START_RATIO, MAX_GAMES_PER_CARD, OPENING_MONTH, SEASON_END,
} from '../../config/league';
import type { Rng } from '../rng';
import type { LeagueConfig, Schedule, ScheduleDay, ScheduledGame, Team } from '../types';

interface Card {
  a: number; // 球団ID（小さいほう）
  b: number;
  homeId: number;
  games: number;
  interleague: boolean;
}

/** 詰め方を試す回数 */
const PACK_TRIES = 20;

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** 交流戦の1組あたりの試合数 */
export function interleaguePerPair(cfg: LeagueConfig): number {
  if (cfg.interleague.mode === 'none' || cfg.interleague.games <= 0) return 0;
  const avgOther = (cfg.teamCounts[0] + cfg.teamCounts[1]) / 2;
  return Math.max(1, Math.min(MAX_GAMES_PER_CARD * 2, Math.round(cfg.interleague.games / avgOther)));
}

/** その試合数で、リーグ内の対戦数を全球団同じにできるか */
function intraFeasible(n: number, total: number): boolean {
  if (total < n - 1) return false;
  const r = total % (n - 1);
  return (r * n) % 2 === 0;
}

/** 試合数を決める（指定、または目安の値に一番近い実現できる値） */
export function resolveGames(cfg: LeagueConfig, target = cfg.games ?? DEFAULT_GAMES): { games: number; note: string | null } {
  const k = interleaguePerPair(cfg);
  const [n0, n1] = cfg.teamCounts;
  const ok = (g: number) => intraFeasible(n0, g - k * n1) && intraFeasible(n1, g - k * n0);
  for (let d = 0; d < 60; d++) {
    for (const g of d === 0 ? [target] : [target - d, target + d]) {
      if (g > 0 && ok(g)) {
        const note = g !== target && cfg.games != null ? `${target}試合では全球団の試合数をそろえられないため、${g}試合にしました` : null;
        return { games: g, note };
      }
    }
  }
  throw new Error('試合数を決められませんでした');
}

/** 試合数をカードの大きさに分ける（例：8 → 3,3,2） */
export function splitIntoCards(games: number): number[] {
  if (games <= 0) return [];
  const count = Math.ceil(games / MAX_GAMES_PER_CARD);
  const base = Math.floor(games / count);
  const extra = games % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/** リーグ内の対戦数（組ごと）を決める。余りは「どの球団も同じ数だけ多い」ように割り振る */
function intraPairGames(ids: number[], total: number): Map<string, number> {
  const n = ids.length;
  const base = Math.floor(total / (n - 1));
  const r = total % (n - 1);
  const m = new Map<string, number>();
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m.set(pairKey(ids[i], ids[j]), base);
  const add = (i: number, j: number) => {
    const k = pairKey(ids[i % n], ids[j % n]);
    m.set(k, m.get(k)! + 1);
  };
  for (let d = 1; d <= Math.floor(r / 2); d++) for (let i = 0; i < n; i++) add(i, i + d);
  if (r % 2 === 1) for (let i = 0; i < n / 2; i++) add(i, i + n / 2);
  return m;
}

/**
 * 1組の試合をカードに分け、ホームを割り振る。
 * まず同じ組の中でホームの試合数をそろえ、同じときは全体のホーム試合数（homeCount）が少ないほうをホームにする。
 */
function makeCards(rng: Rng, a: number, b: number, games: number, interleague: boolean, homeCount: Map<number, number>): Card[] {
  const sizes = splitIntoCards(games).sort((x, y) => y - x);
  const inPair = new Map<number, number>([[a, 0], [b, 0]]);
  const cards: Card[] = [];
  for (const g of sizes) {
    const pa = inPair.get(a)!;
    const pb = inPair.get(b)!;
    let homeId: number;
    if (pa !== pb) homeId = pa < pb ? a : b;
    else {
      const ha = homeCount.get(a) ?? 0;
      const hb = homeCount.get(b) ?? 0;
      homeId = ha < hb ? a : hb < ha ? b : rng.chance(0.5) ? a : b;
    }
    inPair.set(homeId, inPair.get(homeId)! + g);
    homeCount.set(homeId, (homeCount.get(homeId) ?? 0) + g);
    cards.push({ a: Math.min(a, b), b: Math.max(a, b), homeId, games: g, interleague });
  }
  return rng.shuffle(cards);
}

/** ホームの試合数の差が小さくなるよう、カードのホームとビジターを入れ替える */
function balanceHomes(cards: Card[]): void {
  const home = new Map<number, number>();
  const total = new Map<number, number>();
  for (const c of cards) {
    home.set(c.homeId, (home.get(c.homeId) ?? 0) + c.games);
    for (const t of [c.a, c.b]) total.set(t, (total.get(t) ?? 0) + c.games);
  }
  // 各球団の「ホームが半分より多い分」
  const surplus = (t: number) => (home.get(t) ?? 0) * 2 - total.get(t)!;
  for (let iter = 0; iter < 50; iter++) {
    let improved = false;
    for (const c of cards) {
      const h = c.homeId;
      const v = c.homeId === c.a ? c.b : c.a;
      const before = Math.abs(surplus(h)) + Math.abs(surplus(v));
      const sh = surplus(h) - 2 * c.games;
      const sv = surplus(v) + 2 * c.games;
      if (Math.abs(sh) + Math.abs(sv) < before) {
        home.set(h, home.get(h)! - c.games);
        home.set(v, (home.get(v) ?? 0) + c.games);
        c.homeId = v;
        improved = true;
      }
    }
    if (!improved) break;
  }
}

/** カードを枠に詰める（貪欲法：残りカードの多い球団から相手を決める） */
function packOnce(rng: Rng, cards: Card[], teamIds: number[]): Card[][] {
  const byPair = new Map<string, Card[]>();
  const left = new Map<number, number>(teamIds.map((t) => [t, 0]));
  for (const c of cards) {
    const k = pairKey(c.a, c.b);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k)!.push(c);
    left.set(c.a, left.get(c.a)! + 1);
    left.set(c.b, left.get(c.b)! + 1);
  }
  let remaining = cards.length;
  const slots: Card[][] = [];
  while (remaining > 0) {
    const order = rng.shuffle(teamIds).sort((x, y) => left.get(y)! - left.get(x)!);
    const used = new Set<number>();
    const slot: Card[] = [];
    for (const t of order) {
      if (used.has(t) || left.get(t)! === 0) continue;
      let best: number | null = null;
      let bestScore = -1;
      for (const o of order) {
        if (o === t || used.has(o)) continue;
        const list = byPair.get(pairKey(t, o));
        if (!list || list.length === 0) continue;
        const score = left.get(o)! * 10 + list.length;
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      }
      if (best == null) continue;
      const card = byPair.get(pairKey(t, best))!.pop()!;
      slot.push(card);
      used.add(t);
      used.add(best);
      left.set(t, left.get(t)! - 1);
      left.set(best, left.get(best)! - 1);
      remaining--;
    }
    slots.push(slot);
  }
  return slots;
}

/** 何通りか試して、枠の数が一番少ない詰め方を選ぶ */
function packSlots(rng: Rng, cards: Card[], teamIds: number[]): Card[][] {
  let best: Card[][] | null = null;
  for (let i = 0; i < PACK_TRIES; i++) {
    const copy = cards.map((c) => ({ ...c }));
    const slots = packOnce(rng, copy, teamIds);
    if (!best || slots.length < best.length) best = slots;
  }
  return best ?? [];
}

/** その年の3月の最終金曜日 */
function openingDay(year: number): Date {
  const d = new Date(Date.UTC(year, OPENING_MONTH, 0)); // 3月31日
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

/** 枠の番号から最初の日付（偶数＝金曜、奇数＝翌週の火曜） */
function slotStart(open: Date, slot: number): Date {
  const d = new Date(open);
  const week = Math.floor((slot + 1) / 2);
  d.setUTCDate(d.getUTCDate() + week * 7 + (slot % 2 === 1 ? -3 : 0));
  return d;
}

/**
 * 日程を作る。試合数が「自動」のときは、143試合から始めて、SEASON_END までに終わる試合数まで減らす。
 * 試合数を指定したときは、その試合数で作る（終わりが10月以降になることがある）。
 */
export function makeSchedule(rng: Rng, teams: Team[], cfg: LeagueConfig, year: number): Schedule {
  if (cfg.games != null) {
    const { games, note } = resolveGames(cfg);
    const s = buildSchedule(rng, teams, cfg, year, games);
    if (note) s.notes.push(note);
    return s;
  }
  const deadline = `${year}-${SEASON_END}`;
  let target = DEFAULT_GAMES;
  for (let i = 0; i < 80; i++) {
    const { games } = resolveGames(cfg, target);
    const trial = new (rng.constructor as new (seed: number) => Rng)(rng.state);
    const s = buildSchedule(trial, teams, cfg, year, games);
    if (s.days[s.days.length - 1].date <= deadline || games <= 60) {
      rng.state = trial.state;
      if (games !== DEFAULT_GAMES) {
        const [m, d] = SEASON_END.split('-').map(Number);
        s.notes.push(`球団数に合わせて、${m}月${d}日までに終わる${games}試合にしました`);
      }
      return s;
    }
    target = games - 1;
  }
  throw new Error('日程を作れませんでした');
}

function buildSchedule(rng: Rng, teams: Team[], cfg: LeagueConfig, year: number, games: number): Schedule {
  const notes: string[] = [];
  const k = interleaguePerPair(cfg);
  const leagues = [0, 1].map((lg) => teams.filter((t) => t.league === lg).map((t) => t.id));

  const homeCount = new Map<number, number>();
  const intraPairs: [number, number, number][] = [];
  for (const lg of [0, 1] as const) {
    const ids = leagues[lg];
    const other = leagues[1 - lg].length;
    for (const [key, g] of intraPairGames(ids, games - k * other)) {
      const [a, b] = key.split('-').map(Number);
      intraPairs.push([a, b, g]);
    }
  }
  const interPairs: [number, number, number][] = [];
  if (k > 0) for (const a of leagues[0]) for (const b of leagues[1]) interPairs.push([a, b, k]);
  // 試合数の少ない組（交流戦）から割り振ると、ホームの数がそろいやすい
  const interCards: Card[] = [];
  for (const [a, b, g] of rng.shuffle(interPairs)) interCards.push(...makeCards(rng, a, b, g, true, homeCount));
  const intraCards: Card[] = [];
  for (const [a, b, g] of rng.shuffle(intraPairs)) intraCards.push(...makeCards(rng, a, b, g, false, homeCount));

  balanceHomes([...interCards, ...intraCards]);
  const allIds = teams.map((t) => t.id);
  let slots: Card[][];
  if (cfg.interleague.mode === 'period' && interCards.length > 0) {
    // リーグ戦の前半 → 交流戦 → リーグ戦の後半
    const before: Card[] = [];
    const after: Card[] = [];
    const byPair = new Map<string, Card[]>();
    for (const c of intraCards) {
      const key = pairKey(c.a, c.b);
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key)!.push(c);
    }
    for (const list of byPair.values()) {
      const nBefore = Math.round(list.length * INTERLEAGUE_START_RATIO);
      list.forEach((c, i) => (i < nBefore ? before : after).push(c));
    }
    slots = [...packSlots(rng, before, allIds), ...packSlots(rng, interCards, allIds), ...packSlots(rng, after, allIds)];
  } else {
    slots = packSlots(rng, [...intraCards, ...interCards], allIds);
  }

  // 枠を日付に直す
  const open = openingDay(year);
  const dayMap = new Map<string, ScheduledGame[]>();
  slots.forEach((slot, si) => {
    const start = slotStart(open, si);
    for (const c of slot) {
      const awayId = c.homeId === c.a ? c.b : c.a;
      for (let g = 0; g < c.games; g++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + g);
        const key = fmtDate(d);
        if (!dayMap.has(key)) dayMap.set(key, []);
        dayMap.get(key)!.push({ awayId, homeId: c.homeId, interleague: c.interleague });
      }
    }
  });
  const days: ScheduleDay[] = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, gs]) => ({ date, games: gs }));
  return { games, days, notes };
}

/** 1球団の日程（日付、相手、ホームかどうか） */
export function teamSchedule(s: Schedule, teamId: number): { date: string; opponent: number; home: boolean; interleague: boolean }[] {
  const out: { date: string; opponent: number; home: boolean; interleague: boolean }[] = [];
  for (const d of s.days) {
    for (const g of d.games) {
      if (g.homeId === teamId) out.push({ date: d.date, opponent: g.awayId, home: true, interleague: g.interleague });
      else if (g.awayId === teamId) out.push({ date: d.date, opponent: g.homeId, home: false, interleague: g.interleague });
    }
  }
  return out;
}
