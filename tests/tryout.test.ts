import { describe, expect, it } from 'vitest';
import { ROSTER_LIMIT } from '../src/config/league';
import { autoPick, chooseMethod, finishFounding, startFounding, type NewTeamInput } from '../src/core/founding';
import { finishRoster, syncFirstYear } from '../src/core/offseason/offseason';
import { autoFillTryout, openingShortfall, signTryout, tryoutCandidates, tryoutSigned, unsignTryout } from '../src/core/tryout';
import type { LeagueConfig } from '../src/core/types';
import { playDraft } from './helpers';

const cfg = (): LeagueConfig => ({
  teamCounts: [6, 6], games: null, interleague: { mode: 'period', games: 18 }, dh: [true, true], postseason: { teams: [3, 3], advantage: true },
});
const team: NewTeamInput = {
  name: '湘南シーガルズ', shortName: '湘南', homePref: '神奈川県',
  stadium: { name: '湘南スタジアム', size: 'normal', fence: 'normal', terrace: false, dome: false, turf: 'natural', seaside: true },
  logo: { shape: 'shield', motif: 'wave', text: 'S', main: '#0b3d91', sub: '#f2a900' }, colorMain: '#0b3d91', colorSub: '#f2a900',
};

function toRosterPhase(method: 'omakase' | 'expansion' | 'tryout', seed = 1) {
  const f = startFounding(seed, 2027, cfg(), 0, team);
  chooseMethod(f, method);
  if (method !== 'omakase') autoPick(f);
  const w = finishFounding(f);
  playDraft(w, 5, 0);
  syncFirstYear(w);
  return w;
}

describe('合同トライアウト（初年度の戦力の整理）', () => {
  it('ドラフトの前には獲れず、戦力の整理で獲れる・取り消せる', () => {
    const f = startFounding(1, 2027, cfg(), 0, team);
    chooseMethod(f, 'expansion');
    autoPick(f);
    const w0 = finishFounding(f);
    expect(signTryout(w0, w0.tryout!.pool[0], 'roster')).not.toBeNull();

    const w = toRosterPhase('expansion');
    const c = tryoutCandidates(w)[0];
    expect(signTryout(w, c.id, 'ikusei')).toBeNull();
    expect(c.teamId).toBe(w.userTeamId);
    expect(c.contract).toBe('ikusei');
    expect(tryoutSigned(w).map((p) => p.id)).toContain(c.id);
    unsignTryout(w, c.id);
    expect(c.teamId).toBeNull();
    expect(tryoutCandidates(w).map((p) => p.id)).toContain(c.id);
  });

  it('開幕に必要な人数が足りないと戦力の整理を終えられず、おまかせで埋めると終えられる', () => {
    for (const method of ['omakase', 'expansion', 'tryout'] as const) {
      const w = toRosterPhase(method, 3);
      expect(openingShortfall(w).length).toBeGreaterThan(0);
      expect(finishRoster(w)).not.toBeNull();
      autoFillTryout(w);
      expect(openingShortfall(w)).toEqual([]);
      const roster = w.players.filter((p) => p.teamId === w.userTeamId && !p.retired && p.contract === 'roster').length;
      expect(roster).toBeLessThanOrEqual(ROSTER_LIMIT);
      const left = tryoutCandidates(w);
      expect(finishRoster(w)).toBeNull();
      // 獲らなかった候補はいなくなる
      expect(left.every((p) => p.retired)).toBe(true);
      expect(w.tryout).toBeUndefined();
    }
  });
});
