import { describe, expect, it } from 'vitest';
import { FIRST_TEAM_SIZE } from '../src/config/league';
import { advanceDay, advanceDays, createWorld } from '../src/core/season/advance';
import { levelPlayers, rotationOf } from '../src/core/season/gameTeam';
import { canDemote, canPromote, demote, promote } from '../src/core/season/roster';
import type { LeagueConfig } from '../src/core/types';

const cfg = (): LeagueConfig => ({
  teamCounts: [7, 6], games: null, interleague: { mode: 'period', games: 18 }, dh: [true, true], postseason: { teams: [3, 3], advantage: true },
});

describe('ペナントの日送り', () => {
  it('シーズンを最後まで進めると、全球団が日程どおりの試合数をこなす（一軍・二軍）', () => {
    const w = createWorld(3, cfg(), 2027);
    advanceDays(w, 10000);
    expect(w.season.finished).toBe(true);
    for (const t of w.teams) {
      for (const lv of ['first', 'farm'] as const) {
        const s = w.season.standings[lv][t.id];
        expect(s.w + s.l + s.t).toBe(w.season.schedule.games);
      }
      // 一軍は29人以内、先発ローテは先発投手
      expect(w.season.firstTeam[t.id].length).toBeLessThanOrEqual(FIRST_TEAM_SIZE);
      const rot = rotationOf(w, t.id, 'first', levelPlayers(w, t.id, 'first'));
      expect(rot.filter((p) => p.role === 'SP').length).toBeGreaterThanOrEqual(5);
    }
    // 勝ちと負けの合計は同じ
    const sum = (k: 'w' | 'l') => Object.values(w.season.standings.first).reduce((a, s) => a + s[k], 0);
    expect(sum('w')).toBe(sum('l'));
  });

  it('同じシードなら同じ結果になる（セーブして読み込んでも同じ）', () => {
    const a = createWorld(5, cfg(), 2027);
    advanceDays(a, 20);
    const b = JSON.parse(JSON.stringify(a));
    advanceDays(a, 10);
    advanceDays(b, 10);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('疲労と調子が変化する', () => {
    const w = createWorld(8, cfg(), 2027);
    advanceDays(w, 15);
    expect(w.players.some((p) => p.fatigue > 0)).toBe(true);
    expect(w.players.some((p) => p.condition !== 3)).toBe(true);
  });

  it('手動の打順は次の試合から使われる', () => {
    const w = createWorld(11, cfg(), 2027);
    const me = w.userTeamId;
    const fielders = levelPlayers(w, me, 'first').filter((p) => p.mainPos !== 'P');
    const used = new Set<number>();
    const take = (pos: string) => {
      const p = fielders.find((x) => x.mainPos === pos && !used.has(x.id)) ?? fielders.find((x) => !used.has(x.id))!;
      used.add(p.id);
      return p;
    };
    const order = [
      { p: take('C'), pos: 'C' }, { p: take('1B'), pos: '1B' }, { p: take('2B'), pos: '2B' }, { p: take('3B'), pos: '3B' },
      { p: take('SS'), pos: 'SS' }, { p: take('OF'), pos: 'OF' }, { p: take('OF'), pos: 'OF' }, { p: take('OF'), pos: 'OF' }, { p: take('OF'), pos: 'DH' },
    ] as const;
    w.season.settings[me].lineup = order.map((x) => ({ playerId: x.p.id, pos: x.pos }));
    // 自球団の試合がある日まで進める
    for (let i = 0; i < 10; i++) {
      const out = advanceDay(w, true);
      if (out?.userGame) {
        const side = out.userGame.result.awayId === me ? 0 : 1;
        const lines = out.userGame.result.batting[side].filter((b) => b.pos !== 'PH').slice(0, 9);
        const dhGame = out.userGame.result.dh;
        const expected = order.filter((x) => dhGame || x.pos !== 'DH').map((x) => x.p.id);
        expect(lines.map((b) => b.playerId).slice(0, expected.length)).toEqual(expected);
        return;
      }
    }
    throw new Error('自球団の試合がありませんでした');
  });

  it('一軍・二軍の入れ替えのルール', () => {
    const w = createWorld(12, cfg(), 2027);
    const me = w.userTeamId;
    const date = w.season.schedule.days[0].date;
    const first = levelPlayers(w, me, 'first');
    const farm = levelPlayers(w, me, 'farm');
    const up = farm.find((p) => p.contract === 'roster')!;
    // 29人いっぱいなら上げられない
    expect(canPromote(w, up, date)).toContain('29人');
    // 育成選手は上げられない
    const ik = farm.find((p) => p.contract === 'ikusei')!;
    expect(canPromote(w, ik, date)).toContain('育成');
    // 落とした選手は10日間戻せない
    const down = first.find((p) => p.mainPos === 'OF')!;
    expect(canDemote(w, down)).toBeNull();
    demote(w, down, date);
    expect(canPromote(w, down, date)).toContain('戻せません');
    expect(canPromote(w, up, date)).toBeNull();
    promote(w, up);
    expect(w.season.firstTeam[me].length).toBe(FIRST_TEAM_SIZE);
    // 捕手は2人を下回らない
    const cs = levelPlayers(w, me, 'first').filter((p) => p.mainPos === 'C');
    if (cs.length === 2) expect(canDemote(w, cs[0])).toContain('捕手');
  });
});
