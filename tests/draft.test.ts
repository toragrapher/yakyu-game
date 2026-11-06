import { describe, expect, it } from 'vitest';
import { MAX_REGULAR_PICKS } from '../src/config/draft';
import {
  beginRound1, scoutReport, scoutWidth, startDraft, todayOf, visit,
} from '../src/core/draft';
import { overall, potentialOverall } from '../src/core/ratings';
import { advanceDay, advanceDays, createWorld } from '../src/core/season/advance';
import { runPostseason } from '../src/core/season/postseason';
import type { World } from '../src/core/season/types';
import { playDraft } from './helpers';

function worldAfterSeason(seed: number): World {
  const w = createWorld(seed, { teamCounts: [7, 6], games: null, interleague: { mode: 'period', games: 18 }, dh: [true, true], postseason: { teams: [3, 3], advantage: true } }, 2027);
  advanceDays(w, 99999);
  runPostseason(w);
  return w;
}

describe('ドラフト', () => {
  it('スカウト報告の幅は本当の値を含み、視察すると狭くなる', () => {
    const w = worldAfterSeason(2);
    const d = startDraft(w);
    for (const p of d.candidates.slice(0, 30)) {
      const r = scoutReport(d, p);
      expect(r.now[0]).toBeLessThanOrEqual(overall(p) + 0.5);
      expect(r.now[1]).toBeGreaterThanOrEqual(overall(p) - 0.5);
      expect(r.pot[0]).toBeLessThanOrEqual(potentialOverall(p) + 0.5);
      expect(r.pot[1]).toBeGreaterThanOrEqual(potentialOverall(p) - 0.5);
    }
    const p = d.candidates[0];
    const before = scoutWidth(d, p.id);
    expect(visit(w, p.id)).toBeNull();
    expect(scoutWidth(d, p.id)).toBeLessThan(before);
  });

  it('視察は1か月に3回まで、同じ月に同じ選手は1回まで。月が変わると戻る。開幕から候補がいる', () => {
    const w = createWorld(6, { teamCounts: [7, 6], games: null, interleague: { mode: 'period', games: 18 }, dh: [true, true], postseason: { teams: [3, 3], advantage: true } }, 2027);
    const d = w.draft!;
    expect(d.candidates.length).toBeGreaterThan(0);
    const [a, b, c, e] = d.candidates;
    expect(visit(w, a.id)).toBeNull();
    expect(visit(w, a.id)).toContain('今月');
    expect(visit(w, b.id)).toBeNull();
    expect(visit(w, c.id)).toBeNull();
    expect(visit(w, e.id)).toContain('3回');
    // 次の月まで進める
    const month = todayOf(w).slice(0, 7);
    while (todayOf(w).slice(0, 7) === month) advanceDay(w);
    expect(visit(w, a.id)).toBeNull();
    expect(d.scout[a.id].visits).toBe(2);
    // シーズン中はドラフト会議を始められない
    expect(() => beginRound1(w)).toThrow();
  });

  it('全球団が1位を1人ずつ獲り、同じ選手を2球団が獲らない。最後に入団する', () => {
    const w = worldAfterSeason(3);
    const before = w.players.length;
    startDraft(w);
    playDraft(w, 5, 2);
    const d = w.draft!;
    expect(d.phase).toBe('done');
    for (const t of w.teams) expect(d.picks.filter((x) => x.teamId === t.id && x.round === 1 && !x.ikusei).length).toBe(1);
    const ids = d.picks.map((x) => x.playerId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(w.players.length).toBe(before + d.picks.length);
    const mine = d.picks.filter((x) => x.teamId === w.userTeamId);
    expect(mine.filter((x) => !x.ikusei).length).toBe(5);
    expect(mine.filter((x) => x.ikusei).length).toBe(2);
    for (const x of mine) {
      const p = w.players.find((y) => y.id === x.playerId)!;
      expect(p.teamId).toBe(w.userTeamId);
      expect(p.contract).toBe(x.ikusei ? 'ikusei' : 'roster');
      expect(p.proYears).toBe(0);
    }
    // 名前は重ならない
    const names = w.players.map((p) => `${p.familyName} ${p.givenName}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('自球団の支配下の指名は上限まで', () => {
    const w = worldAfterSeason(4);
    startDraft(w);
    playDraft(w, 99, 0);
    const mine = w.draft!.picks.filter((x) => x.teamId === w.userTeamId && !x.ikusei);
    expect(mine.length).toBeLessThanOrEqual(MAX_REGULAR_PICKS);
  });

  it('同じシードなら同じ結果になる', () => {
    const run = () => {
      const w = worldAfterSeason(5);
      startDraft(w);
      playDraft(w, 4, 1);
      return JSON.stringify(w.draft!.picks);
    };
    expect(run()).toBe(run());
  });
});
