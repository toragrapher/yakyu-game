import { describe, expect, it } from 'vitest';
import { SEATS } from '../src/config/gate';
import { proratedPayroll, registerJoin } from '../src/core/finance';
import { canChangePrices, computeGate, fanPenalty, updateFans } from '../src/core/gate';
import { Rng } from '../src/core/rng';
import { advanceDay, advanceDays, createWorld } from '../src/core/season/advance';
import { summaryFor } from '../src/core/sim/summary';

const cfg = () => ({ teamCounts: [6, 6] as [number, number], games: null, interleague: { mode: 'period' as const, games: 18 }, dh: [true, true] as [boolean, boolean], postseason: { teams: [3, 3] as [number, number], advantage: true } });

describe('勝因・敗因', () => {
  it('自球団が勝てば勝因だけ、負ければ敗因だけ', () => {
    const w = createWorld(1, cfg(), 2027);
    let won = false;
    let lost = false;
    for (let i = 0; i < 30 && !(won && lost); i++) {
      const out = advanceDay(w, true);
      const r = out?.userGame?.result;
      if (!r || r.tie) continue;
      const side = r.awayId === w.userTeamId ? 0 : 1;
      const lines = summaryFor(r, w.userTeamId);
      if (r.score[side] > r.score[1 - side]) {
        won = true;
        expect(lines.every((l) => l.startsWith('勝因'))).toBe(true);
      } else {
        lost = true;
        expect(lines.every((l) => l.startsWith('敗因'))).toBe(true);
      }
      expect(w.season.recentGames.find((g) => g.level === 'first')!.summary).toEqual(lines);
    }
    expect(won && lost).toBe(true);
  });
});

describe('観客とお金', () => {
  it('観客は座席数を超えない。値上げすると観客が減る', () => {
    const w = createWorld(2, cfg(), 2027);
    const home = w.userTeamId;
    const away = w.teams.find((t) => t.id !== home)!.id;
    const g1 = computeGate(w, new Rng(5), home, away, '2027-05-01');
    for (const s of SEATS) expect(g1.seats[s.key]).toBeLessThanOrEqual(s.capacity);
    w.ticketPrices = { S: 13000, A: 7600, B: 5600, OH: 4000, OV: 4000 };
    const g2 = computeGate(w, new Rng(5), home, away, '2027-05-01');
    expect(g2.attendance).toBeLessThan(g1.attendance);
  });

  it('ホームゲームの純損益が資金に入り、勝てばファンが増え、負ければ減る', () => {
    const w = createWorld(3, cfg(), 2027);
    for (let i = 0; i < 40; i++) {
      const before = w.finance!.balance;
      advanceDay(w, true);
      const log = w.season.recentGames.find((g) => g.level === 'first');
      if (log?.gate && log.date === w.season.schedule.days[w.season.dayIndex - 1].date) {
        expect(w.finance!.balance - before).toBe(log.gate.net);
        break;
      }
    }
    const f = { ...w.fans![w.userTeamId] };
    expect(updateFans(w, w.userTeamId, 'W')).toBeGreaterThan(0);
    expect(updateFans(w, w.userTeamId, 'L')).toBeLessThan(0);
    expect(w.fans![w.userTeamId].core).not.toBe(f.core - 1);
  });

  it('収支が付くのはホームゲームだけ（日程のホーム・ビジターと一致する）', () => {
    const w = createWorld(7, cfg(), 2027);
    let home = 0;
    let away = 0;
    for (let i = 0; i < 40; i++) {
      const out = advanceDay(w, true);
      if (!out?.userGame) continue;
      const log = w.season.recentGames.find((g) => g.level === 'first')!;
      const isHome = out.userGame.result.homeId === w.userTeamId;
      expect(log.date).toBe(out.date);
      expect(log.home).toBe(isHome);
      expect(!!log.gate).toBe(isHome);
      if (isHome) home++;
      else away++;
    }
    expect(home).toBeGreaterThan(0);
    expect(away).toBeGreaterThan(0);
  });

  it('チケットの値段は開幕前だけ変えられる', () => {
    const w = createWorld(4, cfg(), 2027);
    expect(canChangePrices(w)).toBe(true);
    advanceDay(w);
    expect(canChangePrices(w)).toBe(false);
  });

  it('年俸の日割り：ずっといた選手は全額、途中加入は試合数の割合', () => {
    const w = createWorld(5, cfg(), 2027);
    advanceDays(w, 99999);
    const full = w.players.filter((p) => p.teamId === w.userTeamId).reduce((s, p) => s + p.salary, 0);
    expect(proratedPayroll(w)).toBe(full);
    // 1人を「途中で入った」ことにする（シーズンの半分を消化した時点）
    const p = w.players.find((x) => x.teamId === w.userTeamId)!;
    const total = w.season.schedule.games;
    w.season.joinedAt = { [p.id]: Math.floor(total / 2) };
    const expected = full - p.salary + (p.salary * (total - Math.floor(total / 2))) / total;
    expect(Math.abs(proratedPayroll(w) - expected)).toBeLessThanOrEqual(1);
    // シーズン後に入った選手（ドラフトなど）はその年は0
    registerJoin(w, p.id, w.userTeamId);
    expect(Math.abs(proratedPayroll(w) - (full - p.salary))).toBeLessThanOrEqual(1);
  });

  it('在籍の長い選手の自由契約や若手の育成落ちで、コア層が離れる', () => {
    const w = createWorld(6, cfg(), 2027);
    const before = w.fans![w.userTeamId].core;
    const lostVet = fanPenalty(w, 'release', { proYears: 12, attachment: 50, releasesThisYear: 1 });
    expect(lostVet).toBeGreaterThan(0);
    const lostYoung = fanPenalty(w, 'ikusei', { proYears: 1, attachment: 40, releasesThisYear: 0 });
    const lostOld = fanPenalty(w, 'ikusei', { proYears: 8, attachment: 40, releasesThisYear: 0 });
    expect(lostYoung).toBeGreaterThan(lostOld);
    expect(fanPenalty(w, 'release', { proYears: 2, attachment: 30, releasesThisYear: 3 })).toBe(0);
    expect(w.fans![w.userTeamId].core).toBe(before - lostVet - lostYoung - lostOld);
  });
});
