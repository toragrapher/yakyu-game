import { describe, expect, it } from 'vitest';
import { EXPANSION_PICKS, ROOKIE_MAX, TRYOUT_MAX } from '../src/config/founding';
import { ROSTER_LIMIT } from '../src/config/league';
import { autoPick, canPick, chooseMethod, finishFounding, isRookieCandidate, pick, startFounding, unpick, type NewTeamInput } from '../src/core/founding';
import { advanceDays } from '../src/core/season/advance';
import type { LeagueConfig } from '../src/core/types';
import { completeFirstYear } from './helpers';

const cfg = (a = 7, b = 6): LeagueConfig => ({
  teamCounts: [a, b], games: null, interleague: { mode: 'period', games: 18 }, dh: [true, false], postseason: { teams: [3, 3], advantage: true },
});
const team: NewTeamInput = {
  name: '湘南シーガルズ', shortName: '湘南', homePref: '神奈川県',
  stadium: { name: '湘南スタジアム', size: 'normal', fence: 'normal', terrace: false, dome: false, turf: 'natural', seaside: true },
  logo: { shape: 'shield', motif: 'wave', text: 'S', main: '#0b3d91', sub: '#f2a900' }, colorMain: '#0b3d91', colorSub: '#f2a900',
};

describe('球団設立', () => {
  for (const method of ['omakase', 'expansion', 'tryout'] as const) {
    it(`${method}：球団数どおりにでき、全球団が支配下70人以内・試合ができる`, () => {
      const f = startFounding(1, 2027, cfg(), 1, team);
      chooseMethod(f, method);
      if (method !== 'omakase') autoPick(f);
      const w = finishFounding(f);
      expect(w.teams.filter((t) => t.league === 0).length).toBe(7);
      expect(w.teams.filter((t) => t.league === 1).length).toBe(6);
      const me = w.teams.find((t) => t.id === w.userTeamId)!;
      expect(me.league).toBe(1);
      expect(me.name).toBe('湘南シーガルズ');
      for (const t of w.teams) {
        const roster = w.players.filter((p) => p.teamId === t.id && p.contract === 'roster' && !p.retired);
        expect(roster.length).toBeLessThanOrEqual(ROSTER_LIMIT);
        expect(roster.length).toBeGreaterThanOrEqual(60);
        expect(roster.filter((p) => p.mainPos === 'C').length).toBeGreaterThanOrEqual(3);
      }
      // 同名の選手はいない
      const names = w.players.map((p) => `${p.familyName} ${p.givenName}`);
      expect(new Set(names).size).toBe(names.length);
      completeFirstYear(w);
      advanceDays(w, 20);
      expect(w.season.standings.first[me.id].w + w.season.standings.first[me.id].l + w.season.standings.first[me.id].t).toBeGreaterThan(0);
    });
  }

  it('エクスパンション：指名の上限と、取り消すと元の球団に戻る', () => {
    const f = startFounding(2, 2027, cfg(), 0, team);
    chooseMethod(f, 'expansion');
    const id = f.pool[0];
    const from = f.players.find((p) => p.id === id)!.teamId;
    expect(pick(f, id)).toBeNull();
    expect(f.players.find((p) => p.id === id)!.teamId).toBe(f.userTeamId);
    unpick(f, id);
    expect(f.players.find((p) => p.id === id)!.teamId).toBe(from);
    autoPick(f);
    expect(f.picks.length).toBe(EXPANSION_PICKS);
    const other = f.pool.find((x) => !f.picks.includes(x))!;
    expect(canPick(f, other)).not.toBeNull();
  });

  it('トライアウト：自由契約と新人の上限、選び直すと候補が消える', () => {
    const f = startFounding(3, 2027, cfg(), 0, team);
    chooseMethod(f, 'tryout');
    autoPick(f);
    const picked = f.picks.map((id) => f.players.find((p) => p.id === id)!);
    expect(picked.filter((p) => isRookieCandidate(f, p)).length).toBeLessThanOrEqual(ROOKIE_MAX);
    expect(picked.filter((p) => !isRookieCandidate(f, p)).length).toBeLessThanOrEqual(TRYOUT_MAX);
    const before = f.players.length;
    chooseMethod(f, 'omakase');
    expect(f.players.length).toBeLessThan(before);
    expect(f.players.filter((p) => p.teamId === f.userTeamId).length).toBe(0);
  });
});
