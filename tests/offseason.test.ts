import { describe, expect, it } from 'vitest';
import { CAMP_RANKS, CAMP_SITES } from '../src/config/camp';
import { ROSTER_LIMIT } from '../src/config/league';
import { advanceDraft, available, beginRound1, currentTeam, submitRound1, userPass, userPick } from '../src/core/draft';
import { availableFunds } from '../src/core/finance';
import { acceptChance, minOffer, offer } from '../src/core/offseason/contract';
import {
  closeYear, finishCamp, finishContracts, finishRoster, makeOffer, releasePlayer, runOffseasonAuto, shouldRetire, userRosterCount,
} from '../src/core/offseason/offseason';
import { overall } from '../src/core/ratings';
import { Rng } from '../src/core/rng';
import { advanceDays, createWorld } from '../src/core/season/advance';
import { runPostseason } from '../src/core/season/postseason';
import type { World } from '../src/core/season/types';

const cfg = () => ({ teamCounts: [6, 6] as [number, number], games: null, interleague: { mode: 'period' as const, games: 18 }, dh: [true, true] as [boolean, boolean], postseason: { teams: [3, 3] as [number, number], advantage: true } });

/** シーズン・ポストシーズン・ドラフト（自球団は5人指名）まで進める */
function toAfterDraft(seed: number, userTeam = 1): World {
  const w = createWorld(seed, cfg(), 2027, userTeam);
  advanceDays(w, 99999);
  runPostseason(w);
  const d = w.draft!;
  beginRound1(w);
  for (let i = 0; i < 500 && d.phase !== 'done'; i++) {
    const best = () => available(d)[0].id;
    if (d.phase === 'round1') submitRound1(w, best());
    else if (currentTeam(d) === w.userTeamId) {
      const mine = d.picks.filter((x) => x.teamId === w.userTeamId && !x.ikusei).length;
      if (d.phase === 'regular' && mine < 5) userPick(w, best());
      else userPass(w);
    } else advanceDraft(w);
  }
  return w;
}

describe('オフシーズン', () => {
  it('年度を締める：表彰・記録・決算・引退・成長、契約更改の準備', () => {
    const w = toAfterDraft(1);
    const before = w.finance!.balance;
    const ages = new Map(w.players.map((p) => [p.id, p.age]));
    const off = closeYear(w);
    // 表彰は両リーグに首位打者とMVP
    for (const lg of [0, 1]) {
      expect(off.awards.some((a) => a.league === lg && a.title === '首位打者')).toBe(true);
      expect(off.awards.some((a) => a.league === lg && a.title === 'MVP')).toBe(true);
    }
    expect(w.history!.length).toBe(1);
    // 決算：年俸と運営費を払い、スポンサー収益を受け取る
    const labels = w.finance!.ledger.map((x) => x.label);
    expect(labels).toContain('選手の年俸');
    expect(labels).toContain('運営費');
    expect(labels).toContain('スポンサー収益（基本）');
    expect(w.finance!.balance).not.toBe(before);
    // 引退した選手がいる。残った選手は1歳年をとる（ドラフト新人を除く）
    expect(off.retired.length).toBeGreaterThan(0);
    const draftees = new Set(w.draft!.picks.map((x) => x.playerId));
    const aged = w.players.filter((p) => !p.retired && !draftees.has(p.id));
    expect(aged.every((p) => p.age === ages.get(p.id)! + 1)).toBe(true);
    // 自球団の契約更改がある
    expect(Object.values(off.contracts).length).toBeGreaterThan(30);
  });

  it('成長は能力上限を超えない', () => {
    const w = toAfterDraft(2);
    const caps = new Map(w.players.map((p) => [p.id, { ...(p.pitch ? p.pitchCap! : p.batCap) }]));
    const vals = new Map(w.players.map((p) => [p.id, { ...(p.pitch ? p.pitch : p.bat) }]));
    closeYear(w);
    for (const p of w.players) {
      const cap = caps.get(p.id) as unknown as Record<string, number>;
      const was = vals.get(p.id) as unknown as Record<string, number>;
      const now = (p.pitch ? p.pitch : p.bat) as unknown as Record<string, number>;
      for (const k of Object.keys(cap)) if (now[k] > was[k]) expect(now[k]).toBeLessThanOrEqual(Math.max(was[k], cap[k]));
    }
  });

  it('引退の条件：総合が低い、または下がり方が大きい、または42歳', () => {
    const p = { age: 34, mainPos: 'SS' } as never;
    expect(shouldRetire(p, 60, 47)).toBe(true); // 33歳以上で48未満
    expect(shouldRetire({ age: 31 } as never, 70, 63)).toBe(true); // 10%下落
    expect(shouldRetire({ age: 31 } as never, 70, 68)).toBe(false);
    expect(shouldRetire({ age: 25 } as never, 50, 40)).toBe(false); // 若手は下がっても引退しない
    expect(shouldRetire({ age: 42 } as never, 80, 80)).toBe(true);
  });

  it('契約更改：希望額なら合意、低すぎる提示が3回断られると退団。減額制限がある', () => {
    const w = createWorld(3, cfg(), 2027);
    const p = w.players.find((x) => x.teamId === w.userTeamId && x.contract === 'roster')!;
    expect(minOffer(10000)).toBe(7500);
    expect(minOffer(20000)).toBe(12000);
    expect(acceptChance(p, 1000, 1000)).toBe(1);
    const talk = { playerId: p.id, current: 1000, wish: 5000, refused: 0, status: 'pending' as const, salary: null };
    const rng = new Rng(1);
    expect(offer(w, rng, talk, 1000)).toBe('refused');
    expect(offer(w, rng, talk, 1000)).toBe('refused');
    expect(offer(w, rng, talk, 1000)).toBe('left');
    expect(p.teamId).toBeNull();
    const p2 = w.players.find((x) => x.teamId === w.userTeamId && x.contract === 'roster')!;
    const t2 = { playerId: p2.id, current: p2.salary, wish: p2.salary, refused: 0, status: 'pending' as const, salary: null };
    expect(offer(w, rng, t2, p2.salary)).toBe('agreed');
  });

  it('契約更改 → 戦力の整理（70人以内）→ キャンプ → 翌年のシーズン', () => {
    const w = toAfterDraft(4);
    closeYear(w);
    expect(finishContracts(w)).not.toBeNull(); // 交渉が残っている
    for (const c of Object.values(w.offseason!.contracts)) makeOffer(w, c.playerId, c.wish);
    expect(finishContracts(w)).toBeNull();
    // AI球団は70人以内
    for (const t of w.teams.filter((x) => x.id !== w.userTeamId)) {
      expect(w.players.filter((p) => p.teamId === t.id && !p.retired && p.contract === 'roster').length).toBeLessThanOrEqual(ROSTER_LIMIT);
    }
    // 自球団：70人を超えていれば進めない
    while (userRosterCount(w).roster > ROSTER_LIMIT) {
      expect(finishRoster(w)).not.toBeNull();
      const worst = w.players.filter((p) => p.teamId === w.userTeamId && !p.retired && p.contract === 'roster').sort((a, b) => overall(a) - overall(b))[0];
      releasePlayer(w, worst.id);
    }
    expect(finishRoster(w)).toBeNull();
    const site = CAMP_SITES.find((s) => s.rank === 'B')!;
    const bal = w.finance!.balance;
    expect(finishCamp(w, site.id)).toBeNull();
    expect(w.finance!.balance).toBe(bal - CAMP_RANKS[site.rank].cost);
    expect(w.season.year).toBe(2028);
    expect(w.season.dayIndex).toBe(0);
    expect(w.draft!.year).toBe(2028);
    expect(w.players.every((p) => !p.retired)).toBe(true);
    expect(Number.isFinite(availableFunds(w))).toBe(true);
    advanceDays(w, 10);
    expect(w.season.standings.first[w.userTeamId].w + w.season.standings.first[w.userTeamId].l).toBeGreaterThan(0);
  });

  it('AI球団だけの世界で3年続けて回せる（同じシードなら同じ結果）', () => {
    const run = () => {
      const w = createWorld(5, cfg(), 2027, -1);
      for (let y = 0; y < 3; y++) {
        advanceDays(w, 99999);
        runPostseason(w);
        runOffseasonAuto(w);
      }
      for (const t of w.teams) {
        const n = w.players.filter((p) => p.teamId === t.id && p.contract === 'roster').length;
        expect(n).toBeLessThanOrEqual(ROSTER_LIMIT);
        expect(n).toBeGreaterThanOrEqual(60);
      }
      return JSON.stringify(w.history);
    };
    const a = run();
    expect(a).toBe(run());
  });
});
