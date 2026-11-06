import { describe, expect, it } from 'vitest';
import { advanceDays, createWorld } from '../src/core/season/advance';
import { runPostseason, startPostseason } from '../src/core/season/postseason';
import { standingsTable } from '../src/core/season/standings';
import type { LeagueConfig } from '../src/core/types';

const cfg = (teams: [number, number], advantage: boolean): LeagueConfig => ({
  teamCounts: [7, 6], games: null, interleague: { mode: 'period', games: 18 }, dh: [true, false], postseason: { teams, advantage },
});

describe('ポストシーズン', () => {
  for (const [teams, adv] of [[[3, 3], true], [[1, 2], true], [[6, 6], false], [[2, 4], false]] as [[number, number], boolean][]) {
    it(`進出 ${teams.join('・')}球団、アドバンテージ${adv ? 'あり' : 'なし'}：日本一が決まり、勝ち上がりのルールどおり`, () => {
      const w = createWorld(31, cfg(teams, adv), 2027);
      advanceDays(w, 99999);
      runPostseason(w);
      const ps = w.season.postseason!;
      expect(ps.finished).toBe(true);
      expect(ps.championId).not.toBeNull();
      for (const lg of [0, 1] as const) {
        // 進出球団は順位表の上位
        const top = standingsTable(w, 'first', lg).slice(0, teams[lg]).map((r) => r.teamId);
        expect(ps.seeds[lg]).toEqual(top);
        expect(ps.series.filter((s) => s.key === (lg === 0 ? 'L0' : 'L1')).length).toBe(teams[lg] - 1);
        expect(ps.seeds[lg]).toContain(ps.leagueWinners[lg]);
      }
      const c = ps.series.find((s) => s.key === 'C')!;
      expect([...c.teams].sort()).toEqual([ps.leagueWinners[0], ps.leagueWinners[1]].sort());
      expect(c.winnerId).toBe(ps.championId);
      for (const s of ps.series) {
        expect(s.winnerId).not.toBeNull();
        const wi = s.teams.indexOf(s.winnerId!);
        // 勝者は必要な勝ち数に達しているか、試合数の上限で上位として勝ち抜けた
        expect(s.wins[wi] >= s.winsNeeded || (wi === 0 && s.games.length >= s.maxGames)).toBe(true);
        expect(s.games.length).toBeLessThanOrEqual(Math.max(s.maxGames, s.key === 'C' ? 12 : s.maxGames));
        // 1位と戦う段階でアドバンテージがあれば、上位に1勝
        const isFinal = s.key !== 'C' && ps.seeds[s.key === 'L0' ? 0 : 1][0] === s.teams[0];
        expect(s.advantage).toBe(isFinal && adv ? 1 : 0);
        // 試合の勝敗と勝ち数が合う
        const won = [0, 1].map((i) => s.games.filter((g) => g.winnerId === s.teams[i]).length);
        expect(won[0] + s.advantage).toBe(s.wins[0]);
        expect(won[1]).toBe(s.wins[1]);
      }
    });
  }

  it('同じシードなら同じ結果になる', () => {
    const run = () => {
      const w = createWorld(41, cfg([3, 3], true), 2027);
      advanceDays(w, 99999);
      startPostseason(w);
      runPostseason(w);
      return JSON.stringify(w.season.postseason);
    };
    expect(run()).toBe(run());
  });
});
