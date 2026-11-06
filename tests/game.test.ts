import { describe, expect, it } from 'vitest';
import { generateAiTeams } from '../src/core/generate/team';
import { NameRegistry } from '../src/core/names';
import { Rng } from '../src/core/rng';
import { simulateGame } from '../src/core/sim/game';
import { buildGameTeam } from '../src/core/sim/lineup';
import { paProbabilities } from '../src/core/sim/pa';

const league = generateAiTeams(new Rng(77), new NameRegistry(), [6, 6]);
const gameTeam = (id: number, dh: boolean) =>
  buildGameTeam(league.teams[id - 1], league.players.filter((p) => p.teamId === id && p.contract === 'roster'), { dh });

describe('1打席', () => {
  it('結果の確率の合計は1', () => {
    const probs = paProbabilities(
      { contact: 80, power: 30, speed: 60, bats: 'L' },
      { velocity: 50, control: 70, breaking: 60, throws: 'R' },
      60,
      { hr: 1.1, d: 1, s: 1 },
    );
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    for (const p of probs) expect(p).toBeGreaterThan(0);
  });
});

describe('1試合', () => {
  it('同じ乱数なら同じ試合結果になる', () => {
    const a = simulateGame(new Rng(1), gameTeam(1, true), gameTeam(2, true), { dh: true, month: 6, night: true });
    const b = simulateGame(new Rng(1), gameTeam(1, true), gameTeam(2, true), { dh: true, month: 6, night: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('得点・失点・アウト数・勝敗の記録がつじつまが合う（DHあり・なし各300試合）', () => {
    const rng = new Rng(2);
    let totalRuns = 0;
    let huge = 0;
    let games = 0;
    for (const dh of [true, false]) {
      for (let i = 0; i < 300; i++) {
        const away = 1 + (i % 12);
        const home = 1 + ((i + 5) % 12);
        const r = simulateGame(rng, gameTeam(away, dh), gameTeam(home, dh), { dh, month: 4 + (i % 6), night: i % 2 === 0 });
        for (const s of [0, 1] as const) {
          const lineSum = r.line[s].reduce<number>((a, x) => a + (x ?? 0), 0);
          expect(lineSum).toBe(r.score[s]);
          // 打者の得点の合計＝チームの得点
          expect(r.batting[s].reduce((a, b) => a + b.r, 0)).toBe(r.score[s]);
          // 投手の失点の合計＝相手の得点
          expect(r.pitching[s].reduce((a, p) => a + p.r, 0)).toBe(r.score[1 - s]);
          for (const p of r.pitching[s]) expect(p.er).toBeLessThanOrEqual(p.r);
          // 打席数＝打数＋四死球＋犠打＋犠飛
          for (const b of r.batting[s]) expect(b.pa).toBe(b.ab + b.bb + b.hbp + b.sh + b.sf);
        }
        // 守備側のアウト数は少なくとも8回分
        expect(r.pitching[1].reduce((a, p) => a + p.outs, 0)).toBeGreaterThanOrEqual(24);
        if (r.tie) {
          expect(r.score[0]).toBe(r.score[1]);
          expect(r.win).toBeNull();
        } else {
          expect(r.score[0]).not.toBe(r.score[1]);
          expect(r.win).not.toBeNull();
          expect(r.loss).not.toBeNull();
        }
        for (const x of r.score) if (x >= 20) huge++;
        totalRuns += r.score[0] + r.score[1];
        games++;
      }
    }
    // 1チーム1試合あたりの平均得点が極端でない
    const perTeam = totalRuns / games / 2;
    expect(perTeam).toBeGreaterThan(2.5);
    expect(perTeam).toBeLessThan(7);
    // 20点以上はごくまれ
    expect(huge / (games * 2)).toBeLessThan(0.003);
  });
});
