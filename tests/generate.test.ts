import { describe, expect, it } from 'vitest';
import { FAMILY_NAMES, GIVEN_NAMES } from '../src/config/names';
import { generateAiTeams } from '../src/core/generate/team';
import { NameRegistry } from '../src/core/names';
import { Rng } from '../src/core/rng';

describe('シード付き乱数', () => {
  it('同じシードなら同じ値が出る', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('状態を保存して戻すと続きから同じ値が出る', () => {
    const a = new Rng(7);
    a.next();
    const saved = a.state;
    const x = a.next();
    const b = new Rng(0);
    b.state = saved;
    expect(b.next()).toBe(x);
  });
});

describe('選手名', () => {
  it('辞書に同じ姓・名が重複して入っていない', () => {
    expect(new Set(FAMILY_NAMES).size).toBe(FAMILY_NAMES.length);
    expect(new Set(GIVEN_NAMES).size).toBe(GIVEN_NAMES.length);
  });
  it('2万人作っても同名がいない', () => {
    const rng = new Rng(1);
    const names = new NameRegistry();
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      const n = names.create(rng);
      const key = `${n.familyName} ${n.givenName}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('球団と選手の生成', () => {
  const make = (seed: number) => generateAiTeams(new Rng(seed), new NameRegistry(), [6, 6]);

  it('同じシードなら同じ選手ができる', () => {
    expect(JSON.stringify(make(5))).toBe(JSON.stringify(make(5)));
  });
  it('支配下は70人以内、選手IDと名前は重複しない', () => {
    const { teams, players } = make(3);
    expect(teams.length).toBe(12);
    for (const t of teams) {
      const roster = players.filter((p) => p.teamId === t.id && p.contract === 'roster');
      expect(roster.length).toBeLessThanOrEqual(70);
    }
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
    expect(new Set(players.map((p) => `${p.familyName} ${p.givenName}`)).size).toBe(players.length);
  });
  it('能力は1〜100に収まる', () => {
    const { players } = make(9);
    for (const p of players) {
      for (const v of Object.values(p.bat)) expect(v).toBeGreaterThanOrEqual(1);
      for (const v of Object.values(p.bat)) expect(v).toBeLessThanOrEqual(100);
      if (p.pitch) for (const v of Object.values(p.pitch)) expect(v).toBeLessThanOrEqual(100);
    }
  });
});
