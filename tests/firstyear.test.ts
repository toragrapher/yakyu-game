import { describe, expect, it } from 'vitest';
import { available, beginRound1, drawLottery, submitRound1, takeDraftEvents } from '../src/core/draft';
import { chooseMethod, finishFounding, startFounding, type NewTeamInput } from '../src/core/founding';
import { potentialOverall } from '../src/core/ratings';
import { advanceDay, advanceDays, createWorld } from '../src/core/season/advance';
import '../src/core/offseason/offseason';
import { completeFirstYear, playDraft } from './helpers';

const cfg = () => ({ teamCounts: [6, 6] as [number, number], games: null, interleague: { mode: 'period' as const, games: 18 }, dh: [true, true] as [boolean, boolean], postseason: { teams: [3, 3] as [number, number], advantage: true } });
const team: NewTeamInput = {
  name: '湘南シーガルズ', shortName: '湘南', homePref: '神奈川県',
  stadium: { name: '湘南スタジアム', size: 'normal', fence: 'normal', terrace: false, dome: false, turf: 'natural', seaside: true },
  logo: { shape: 'shield', motif: 'wave', text: 'S', main: '#0b3d91', sub: '#f2a900' }, colorMain: '#0b3d91', colorSub: '#f2a900',
};

describe('球団設立の年', () => {
  it('設立のあとはドラフトから始まり、ドラフト → 戦力の整理 → キャンプのあとに開幕する', () => {
    const f = startFounding(1, 2027, cfg(), 0, team);
    chooseMethod(f, 'omakase');
    const w = finishFounding(f);
    expect(w.offseason?.firstYear).toBe(true);
    expect(w.offseason?.phase).toBe('draft');
    expect(w.draft!.year).toBe(2026);
    expect(w.draft!.firstYear).toBe(true);
    // 開幕前は日を進められない
    expect(advanceDay(w)).toBeNull();
    expect(w.season.dayIndex).toBe(0);
    completeFirstYear(w);
    expect(w.offseason).toBeNull();
    expect(w.season.year).toBe(2027);
    expect(w.draft!.year).toBe(2027);
    expect(w.draft!.phase).toBe('scouting');
    advanceDays(w, 5);
    expect(w.season.dayIndex).toBe(5);
  });

  it('2位以降は新球団が最初で、巡ごとに折り返す（3巡目は最後、4巡目はまた最初）', () => {
    const w = createWorld(2, cfg(), 2027, 1, true);
    playDraft(w, 4, 0);
    const d = w.draft!;
    const reg = (r: number) => d.picks.filter((x) => x.round === r && !x.ikusei);
    expect(d.order[0]).toBe(w.userTeamId);
    expect(reg(2)[0].teamId).toBe(w.userTeamId);
    expect(reg(3)[reg(3).length - 1].teamId).toBe(w.userTeamId);
    expect(reg(4)[0].teamId).toBe(w.userTeamId);
    // 2巡目と4巡目は同じ順、3巡目はその逆
    expect(reg(4).map((x) => x.teamId)).toEqual(reg(2).map((x) => x.teamId));
    expect(reg(3).map((x) => x.teamId)).toEqual(reg(2).map((x) => x.teamId).reverse());
  });

  it('自球団が競合するとくじ待ちで止まり、くじを選ぶと交渉権が1球団に決まる', () => {
    let tested = false;
    for (let seed = 1; seed < 30 && !tested; seed++) {
      const w = createWorld(seed, cfg(), 2027, 1, true);
      const d = w.draft!;
      beginRound1(w);
      // いちばんの目玉に入札する（競合しやすい）
      const top = available(d).sort((a, b) => potentialOverall(b) - potentialOverall(a))[0];
      submitRound1(w, top.id);
      if (!d.lottery) continue;
      tested = true;
      expect(d.lottery.playerId).toBe(top.id);
      expect(d.lottery.teams).toContain(w.userTeamId);
      expect(d.picks.some((x) => x.playerId === top.id)).toBe(false);
      expect(submitRound1(w, top.id)).not.toBeNull(); // くじを引くまで入札できない
      const used = new Set(Object.values(d.lottery.choices));
      const env = [...Array(d.lottery.teams.length).keys()].find((x) => !used.has(x))!;
      expect(drawLottery(w, env)).toBeNull();
      const winners = d.picks.filter((x) => x.playerId === top.id);
      expect(winners.length).toBe(1);
      const evs = takeDraftEvents(w);
      expect(evs.some((e) => e.kind === 'bids')).toBe(true);
      const lot = evs.find((e) => e.kind === 'lottery' && e.user);
      expect(lot).toBeDefined();
      if (winners[0].teamId !== w.userTeamId) {
        // 外れたら、もう一度入札できる
        expect(d.round1Pending).toContain(w.userTeamId);
      }
    }
    expect(tested).toBe(true);
  });
});
