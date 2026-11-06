import { describe, expect, it } from 'vitest';
import { generateAiTeams } from '../src/core/generate/team';
import { NameRegistry } from '../src/core/names';
import { Rng } from '../src/core/rng';
import { interleaguePerPair, makeSchedule, splitIntoCards, teamSchedule } from '../src/core/schedule/schedule';
import type { LeagueConfig } from '../src/core/types';

function config(a: number, b: number, mode: LeagueConfig['interleague']['mode'], games: number | null = null): LeagueConfig {
  return { teamCounts: [a, b], games, interleague: { mode, games: 18 }, dh: [true, true], postseason: { teams: [3, 3], advantage: true } };
}

const CASES: [number, number, LeagueConfig['interleague']['mode']][] = [
  [7, 6, 'period'], [6, 6, 'period'], [6, 6, 'spread'], [6, 6, 'none'], [7, 6, 'none'],
  [5, 5, 'period'], [5, 7, 'spread'], [4, 12, 'period'], [12, 12, 'spread'], [4, 4, 'none'], [9, 8, 'period'],
];

describe('日程', () => {
  it('カードは1〜3試合に分かれる', () => {
    expect(splitIntoCards(25)).toEqual([3, 3, 3, 3, 3, 3, 3, 2, 2]);
    expect(splitIntoCards(4)).toEqual([2, 2]);
    expect(splitIntoCards(3)).toEqual([3]);
  });

  for (const [a, b, mode] of CASES) {
    it(`${a}球団＋${b}球団・交流戦${mode}：試合数がそろい、同じ日に2試合なし、月曜は休み`, () => {
      const rng = new Rng(a * 100 + b);
      const { teams } = generateAiTeams(rng, new NameRegistry(), [a, b]);
      const cfg = config(a, b, mode);
      const s = makeSchedule(rng, teams, cfg, 2027);
      const k = interleaguePerPair(cfg);

      for (const d of s.days) {
        expect(new Date(`${d.date}T00:00:00Z`).getUTCDay()).not.toBe(1); // 月曜
        const ids = d.games.flatMap((g) => [g.awayId, g.homeId]);
        expect(new Set(ids).size).toBe(ids.length);
      }
      for (const t of teams) {
        const ts = teamSchedule(s, t.id);
        expect(ts.length).toBe(s.games);
        const home = ts.filter((x) => x.home).length;
        expect(Math.abs(home * 2 - s.games)).toBeLessThanOrEqual(6);
        const otherCount = teams.filter((o) => o.league !== t.league).length;
        expect(ts.filter((x) => x.interleague).length).toBe(k * otherCount);
        // 同じリーグの相手との試合数の差は1以内
        const vs = new Map<number, number>();
        for (const x of ts) if (!x.interleague) vs.set(x.opponent, (vs.get(x.opponent) ?? 0) + 1);
        const v = [...vs.values()];
        expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1);
      }
      // 期間集中型なら、交流戦の期間中はリーグ戦をしない
      if (mode === 'period') {
        const interDays = s.days.filter((d) => d.games.some((g) => g.interleague)).map((d) => d.date);
        const first = interDays[0];
        const last = interDays[interDays.length - 1];
        for (const d of s.days) if (d.date >= first && d.date <= last) for (const g of d.games) expect(g.interleague).toBe(true);
      }
      // 自動のときは10月上旬までに終わる
      expect(s.days[s.days.length - 1].date <= '2027-10-08').toBe(true);
    });
  }

  it('初期設定（7＋6球団・期間集中型）は143試合前後になる', () => {
    const rng = new Rng(1);
    const { teams } = generateAiTeams(rng, new NameRegistry(), [7, 6]);
    const s = makeSchedule(rng, teams, config(7, 6, 'period'), 2027);
    expect(s.games).toBeGreaterThanOrEqual(140);
    expect(s.games).toBeLessThanOrEqual(143);
  });

  it('試合数を指定すると、その試合数（または一番近い値）になる', () => {
    const rng = new Rng(2);
    const { teams } = generateAiTeams(rng, new NameRegistry(), [6, 6]);
    expect(makeSchedule(rng, teams, config(6, 6, 'period', 120), 2027).games).toBe(120);
    const odd = makeSchedule(rng, teams, config(6, 6, 'none', 101), 2027);
    expect(Math.abs(odd.games - 101)).toBeLessThanOrEqual(2);
  });

  it('同じ乱数なら同じ日程になる', () => {
    const make = () => {
      const rng = new Rng(9);
      const { teams } = generateAiTeams(rng, new NameRegistry(), [7, 6]);
      return makeSchedule(rng, teams, config(7, 6, 'period'), 2027);
    };
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
  });
});
