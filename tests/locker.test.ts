import { describe, expect, it } from 'vitest';
import { benchOf, commitLocker, farmOf, lockerProblem, openLocker, reliefOf, resetToAuto, swapSlots } from '../src/core/locker';
import { advanceDay, createWorld } from '../src/core/season/advance';
import type { LeagueConfig } from '../src/core/types';

const cfg = (): LeagueConfig => ({
  teamCounts: [7, 6], games: null, interleague: { mode: 'period', games: 18 }, dh: [true, true], postseason: { teams: [3, 3], advantage: true },
});
const date = (w: ReturnType<typeof createWorld>) => w.season.schedule.days[0].date;

describe('ロッカールーム', () => {
  it('開いた直後は、一軍の顔ぶれ・スタメン9人・先発・抑えがそろっている', () => {
    const w = createWorld(1, cfg(), 2027);
    const L = openLocker(w);
    expect(L.first.length).toBe(w.season.firstTeam[w.userTeamId].length);
    expect(L.lineup.length).toBe(9);
    expect(L.lineup.every((x) => x.playerId != null)).toBe(true);
    expect(L.rotation.filter((x) => x != null).length).toBe(6);
    expect(L.closer).not.toBeNull();
    expect(lockerProblem(w, L)).toBeNull();
    expect(L.dirty).toBe(false);
    // 控え＝一軍の野手からスタメンを除いた人数
    const fielders = L.first.filter((id) => w.players.find((p) => p.id === id)!.mainPos !== 'P');
    expect(benchOf(w, L).length).toBe(fielders.length - 9);
  });

  it('二軍の野手とスタメンを入れ替えても、確定するまで一軍は変わらない。リセットなら再登録の制限もかからない', () => {
    const w = createWorld(2, cfg(), 2027);
    const before = [...w.season.firstTeam[w.userTeamId]];
    const L = openLocker(w);
    const farmF = farmOf(w, L).map((id) => w.players.find((p) => p.id === id)!).find((p) => p.mainPos === 'OF' && p.contract === 'roster')!;
    const out = L.lineup.findIndex((x) => w.players.find((p) => p.id === x.playerId)!.mainPos === 'OF');
    const outId = L.lineup[out].playerId!;
    expect(swapSlots(w, L, { k: 'farm', id: farmF.id }, { k: 'lineup', i: out }, date(w))).toBeNull();
    expect(L.lineup[out].playerId).toBe(farmF.id);
    expect(L.first).toContain(farmF.id);
    expect(L.first).not.toContain(outId);
    expect(w.season.firstTeam[w.userTeamId]).toEqual(before); // まだ反映されない
    // リセット（開き直し）すれば元どおりで、制限もない
    const L2 = openLocker(w);
    expect(L2.first).toEqual(before);
    expect(w.season.recallAfter[outId]).toBeUndefined();
    // 確定すれば反映され、落とした選手に制限がかかる
    expect(commitLocker(w, L, date(w))).toBeNull();
    expect(w.season.firstTeam[w.userTeamId]).toContain(farmF.id);
    expect(w.season.firstTeam[w.userTeamId]).not.toContain(outId);
    expect(w.season.recallAfter[outId]).toBeDefined();
    expect(w.season.settings[w.userTeamId].lineup).not.toBeNull();
  });

  it('投手と野手、育成は入れられない枠がある', () => {
    const w = createWorld(3, cfg(), 2027);
    const L = openLocker(w);
    const pitcher = reliefOf(w, L)[0];
    expect(swapSlots(w, L, { k: 'relief', id: pitcher }, { k: 'lineup', i: 0 }, date(w))).toContain('投手');
    const ik = farmOf(w, L).map((id) => w.players.find((p) => p.id === id)!).find((p) => p.contract === 'ikusei' && p.mainPos === 'P')!;
    expect(swapSlots(w, L, { k: 'farm', id: ik.id }, { k: 'closer' }, date(w))).toContain('育成');
  });

  it('中継ぎと抑えの入れ替え、確定で設定に残る。自動に戻せる', () => {
    const w = createWorld(4, cfg(), 2027);
    const L = openLocker(w);
    const r = reliefOf(w, L)[0];
    const oldCloser = L.closer!;
    expect(swapSlots(w, L, { k: 'relief', id: r }, { k: 'closer' }, date(w))).toBeNull();
    expect(L.closer).toBe(r);
    expect(reliefOf(w, L)).toContain(oldCloser);
    expect(commitLocker(w, L, date(w))).toBeNull();
    expect(w.season.settings[w.userTeamId].closer).toBe(r);
    const L2 = openLocker(w);
    resetToAuto(w, L2, 'pitching');
    expect(commitLocker(w, L2, date(w))).toBeNull();
    expect(w.season.settings[w.userTeamId].closer).toBeNull();
    // 確定した設定で試合ができる
    for (let i = 0; i < 3; i++) advanceDay(w);
  });

  it('一軍が29人を超える・捕手が足りないと確定できない', () => {
    const w = createWorld(5, cfg(), 2027);
    const L = openLocker(w);
    const farmF = farmOf(w, L).map((id) => w.players.find((p) => p.id === id)!).find((p) => p.mainPos !== 'P' && p.contract === 'roster')!;
    expect(swapSlots(w, L, { k: 'farm', id: farmF.id }, { k: 'area', name: 'bench' }, date(w))).toBeNull();
    expect(lockerProblem(w, L)).toContain('29人');
    expect(commitLocker(w, L, date(w))).not.toBeNull();
    const L2 = openLocker(w);
    const catchers = [...L2.first].map((id) => w.players.find((p) => p.id === id)!).filter((p) => p.mainPos === 'C');
    for (const c of catchers) {
      const inLineup = L2.lineup.findIndex((x) => x.playerId === c.id);
      swapSlots(w, L2, inLineup >= 0 ? { k: 'lineup', i: inLineup } : { k: 'bench', id: c.id }, { k: 'area', name: 'farm' }, date(w));
    }
    expect(lockerProblem(w, L2)).not.toBeNull();
  });
});
