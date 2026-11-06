import { describe, expect, it } from 'vitest';
import { roundRobinDays, runBalanceSeason } from '../src/core/balance/season';

describe("検証用のシーズン（本番と同じ仕組み）", () => {
  it('奇数の球団数でも、1日に同じ球団が2試合しない', () => {
    const days = roundRobinDays([1, 2, 3, 4, 5, 6, 7]);
    expect(days.length).toBe(7);
    for (const d of days) {
      const ids = d.flat();
      expect(new Set(ids).size).toBe(ids.length);
      expect(d.length).toBe(3); // 1球団は休み
    }
  });

  it('3シーズン回すと、リーグ平均がおおむね目標の近くになる', () => {
    for (let s = 0; s < 3; s++) {
      const r = runBalanceSeason(500 + s);
      expect(r.leagueAvg).toBeGreaterThan(0.235);
      expect(r.leagueAvg).toBeLessThan(0.275);
      expect(r.leagueEra).toBeGreaterThan(2.8);
      expect(r.leagueEra).toBeLessThan(4.4);
      for (const t of r.teams) expect(t.games).toBe(r.teams[0].games);
    }
  });
});
