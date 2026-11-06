// オフシーズンの流れ：年度を締める（表彰・引退・成長）→ 契約更改 → 戦力の整理 → キャンプ → 翌年のシーズン
import { MIN_SALARY_IKUSEI, MIN_SALARY_ROSTER } from '../../config/budget';
import { ROSTER_TEMPLATE } from '../../config/generate';
import {
  AI_ROSTER_TARGET, IKUSEI_YEARS, RETIRE_DROP_AGE, RETIRE_DROP_RATE, RETIRE_LOW_OVERALL, RETIRE_MAX_AGE,
} from '../../config/growth';
import { ROSTER_LIMIT } from '../../config/league';
import { advanceDraft, beginRound1, ensureDraftCandidates, submitRound1 } from '../draft';
import { generatePlayer } from '../generate/player';
import { fullName } from '../labels';
import { NameRegistry } from '../names';
import { overall, potentialOverall } from '../ratings';
import { Rng } from '../rng';
import { newSeason } from '../season/advance';
import { standingsTable } from '../season/standings';
import type { OffseasonState, World } from '../season/types';
import type { MainPos, Player, PitcherRole } from '../types';
import { computeAwards } from './awards';
import { applyCamp, chooseAiCamp } from './camp';
import { computeWish } from './contract';
import { applyGrowth } from './growth';
import { availableFunds, settleYear } from '../finance';
import { offer } from './contract';
import { fanPenalty, yearEndFans } from '../gate';

function withRng<T>(w: World, fn: (rng: Rng) => T): T {
  const rng = new Rng(0);
  rng.state = w.rngState;
  const out = fn(rng);
  w.rngState = rng.state;
  return out;
}

const active = (w: World, teamId: number) => w.players.filter((p) => p.teamId === teamId && !p.retired);

/** 引退するか（総合の値が低い、または総合の下がり方が大きい） */
export function shouldRetire(p: Player, before: number, after: number): boolean {
  if (p.age >= RETIRE_MAX_AGE) return true;
  for (const [age, min] of RETIRE_LOW_OVERALL) {
    if (p.age >= age) {
      if (after < min) return true;
      break;
    }
  }
  if (p.age >= RETIRE_DROP_AGE && before > 0 && (before - after) / before >= RETIRE_DROP_RATE) return true;
  return false;
}

/** 年度を締める：表彰、成長と衰え、引退、決算、契約更改の準備 */
export function closeYear(w: World): OffseasonState {
  const s = w.season;
  if (!s.postseason?.finished) throw new Error('ポストシーズンが終わっていません');
  if (w.draft?.phase !== 'done') throw new Error('ドラフト会議が終わっていません');
  if (w.offseason && w.offseason.year === s.year) return w.offseason;

  const awards = computeAwards(w);
  // 年ごとの記録
  const me = w.teams.find((t) => t.id === w.userTeamId);
  const standings = [0, 1].map((lg) => standingsTable(w, 'first', lg as 0 | 1).map((r) => r.teamId)) as [number[], number[]];
  const st = me ? s.standings.first[me.id] : null;
  (w.history ??= []).push({
    year: s.year,
    standings,
    championId: s.postseason.championId,
    leagueWinners: s.postseason.leagueWinners,
    awards,
    user: me && st ? { w: st.w, l: st.l, t: st.t, rank: standings[me.league].indexOf(me.id) + 1 } : null,
  });

  // 決算（自球団のお金）と、ファンの入れ替わり（ライト層の一部がコア層に）
  settleYear(w, awards);
  yearEndFans(w);

  // ドラフトで入ったばかりの選手は、成長も引退もしない
  const draftees = new Set((w.draft?.picks ?? []).map((x) => x.playerId));
  const retired: OffseasonState['retired'] = [];
  withRng(w, (rng) => {
    const players = w.players.filter((p) => p.teamId != null && !p.retired && !draftees.has(p.id));
    const before = new Map(players.map((p) => [p.id, overall(p)]));
    applyGrowth(w, rng, players);
    for (const p of players) {
      const b = before.get(p.id)!;
      const a = overall(p);
      p.prevOverall = b;
      if (shouldRetire(p, b, a)) {
        const st2 = s.stats.first[p.id];
        const note = st2 ? (p.mainPos === 'P' ? `一軍${st2.pitch.g}登板` : `一軍${st2.bat.g}試合`) : '一軍出場なし';
        retired.push({ name: fullName(p), teamId: p.teamId!, age: p.age, note });
        p.retired = true;
        p.teamId = null;
      }
    }
  });
  for (const r of retired.filter((x) => x.teamId === w.userTeamId)) {
    s.news.unshift({ date: s.postseason.date, text: `${r.name}（${r.age}歳）が引退しました` });
  }

  // 契約更改：自球団は交渉、AI球団は希望額で合意
  const contracts: OffseasonState['contracts'] = {};
  for (const t of w.teams) {
    for (const p of active(w, t.id)) {
      if (draftees.has(p.id) || p.contract !== 'roster') continue;
      const wish = computeWish(w, p);
      if (t.id === w.userTeamId) contracts[p.id] = { playerId: p.id, current: p.salary, wish, refused: 0, status: 'pending', salary: null };
      else p.salary = wish;
    }
  }
  w.offseason = { year: s.year, phase: 'contracts', awards, retired, contracts, released: [] };
  return w.offseason;
}

/** 選手を残す価値（AIの戦力の整理用） */
function keepValue(p: Player): number {
  return overall(p) * 0.6 + potentialOverall(p) * 0.4 - Math.max(0, p.age - 30) * 1.5;
}

const slotOf = (p: { mainPos: MainPos; role: PitcherRole | null }) => (p.mainPos === 'P' ? (p.role === 'SP' ? 'SP' : 'RP') : p.mainPos === 'OF' ? 'OF' : p.mainPos === 'C' ? 'C' : 'IF');
/** AI球団が最低限そろえるポジションの人数 */
const MIN_SLOTS: Record<string, number> = { SP: 9, RP: 13, C: 3, IF: 9, OF: 9 };

/** AI球団の戦力の整理：70人以内に、育成の自由契約と昇格、足りないポジションの補充 */
export function aiRosterManage(w: World, rng: Rng, teamId: number): void {
  const off = w.offseason;
  const release = (p: Player) => {
    p.retired = true;
    p.teamId = null;
    off?.released.push({ name: fullName(p), teamId });
  };
  // 育成は一定年数で自由契約
  for (const p of active(w, teamId).filter((x) => x.contract === 'ikusei' && x.proYears >= IKUSEI_YEARS)) release(p);
  // 支配下が多すぎれば、残す価値の低い順に自由契約
  let roster = active(w, teamId).filter((x) => x.contract === 'roster').sort((a, b) => keepValue(a) - keepValue(b));
  while (roster.length > ROSTER_LIMIT) release(roster.shift()!);
  // 足りないポジションは、自由契約の選手を獲った扱いで補う（第1段階の簡易版）
  const names = new NameRegistry(w.usedNames);
  for (const [slot, min] of Object.entries(MIN_SLOTS)) {
    roster = active(w, teamId).filter((x) => x.contract === 'roster');
    let have = roster.filter((x) => slotOf(x) === slot).length;
    while (have < min) {
      if (roster.length >= ROSTER_LIMIT) {
        // 多いポジションから、残す価値の低い選手を外す
        const counts = new Map<string, number>();
        for (const x of roster) counts.set(slotOf(x), (counts.get(slotOf(x)) ?? 0) + 1);
        const victim = roster.filter((x) => slotOf(x) !== slot && (counts.get(slotOf(x)) ?? 0) > (MIN_SLOTS[slotOf(x)] ?? 0)).sort((a, b) => keepValue(a) - keepValue(b))[0];
        if (!victim) break;
        release(victim);
      }
      const t = ROSTER_TEMPLATE.find((x) => slotOf({ mainPos: x.pos, role: x.role ?? null }) === slot)!;
      const p = generatePlayer(rng, names, w.nextPlayerId++, { pos: t.pos, role: t.role, teamId, age: rng.int(24, 31), capShift: -4 });
      p.draftTeamId = null;
      w.players.push(p);
      roster = active(w, teamId).filter((x) => x.contract === 'roster');
      have++;
    }
  }
  w.usedNames = names.toArray();
  // 空きがあれば、育成から昇格
  roster = active(w, teamId).filter((x) => x.contract === 'roster');
  const ikusei = active(w, teamId).filter((x) => x.contract === 'ikusei').sort((a, b) => keepValue(b) - keepValue(a));
  while (roster.length < AI_ROSTER_TARGET && ikusei.length) {
    const p = ikusei.shift()!;
    p.contract = 'roster';
    p.salary = Math.max(p.salary, MIN_SALARY_ROSTER);
    roster.push(p);
  }
}

/** 契約更改を終える（残っている交渉があれば進めない） */
export function finishContracts(w: World): string | null {
  const off = w.offseason!;
  const pending = Object.values(off.contracts).filter((c) => c.status === 'pending');
  if (pending.length) return `まだ${pending.length}人と交渉が終わっていません`;
  for (const c of Object.values(off.contracts)) {
    if (c.status === 'left') {
      const p = w.players.find((x) => x.id === c.playerId)!;
      off.released.push({ name: fullName(p), teamId: w.userTeamId });
    }
  }
  withRng(w, (rng) => {
    for (const t of w.teams) if (t.id !== w.userTeamId) aiRosterManage(w, rng, t.id);
  });
  off.phase = 'roster';
  return null;
}

/** 自球団の支配下・育成の人数 */
export function userRosterCount(w: World): { roster: number; ikusei: number } {
  const ps = active(w, w.userTeamId);
  return { roster: ps.filter((p) => p.contract === 'roster').length, ikusei: ps.filter((p) => p.contract === 'ikusei').length };
}

/** 選手の扱いで離れたコア層を記録する */
function noteFanLoss(w: World, text: string, lost: number): void {
  if (lost <= 0 || !w.offseason) return;
  (w.offseason.fanLoss ??= []).push({ text, lost });
}

/** 自球団の選手を自由契約にする（オフシーズンの戦力の整理）。扱いによってはコア層のファンが離れる */
export function releasePlayer(w: World, id: number): void {
  const p = w.players.find((x) => x.id === id)!;
  if (p.teamId !== w.userTeamId) return;
  p.retired = true;
  p.teamId = null;
  w.offseason?.released.push({ name: fullName(p), teamId: w.userTeamId });
  const count = w.offseason?.released.filter((x) => x.teamId === w.userTeamId).length ?? 0;
  const lost = fanPenalty(w, 'release', { proYears: p.proYears, attachment: p.attachment, releasesThisYear: count });
  noteFanLoss(w, `${fullName(p)}の自由契約`, lost);
}

/** 自球団の支配下選手を育成契約に切り替える（育成落ち）。プロ年数が浅いほど、コア層のファンが離れる */
export function demoteToIkusei(w: World, id: number): string | null {
  const p = w.players.find((x) => x.id === id)!;
  if (p.teamId !== w.userTeamId) return '自球団の選手ではありません';
  if (p.contract !== 'roster') return 'すでに育成選手です';
  p.contract = 'ikusei';
  p.salary = MIN_SALARY_IKUSEI;
  const lost = fanPenalty(w, 'ikusei', { proYears: p.proYears, attachment: p.attachment, releasesThisYear: 0 });
  noteFanLoss(w, `${fullName(p)}の育成落ち`, lost);
  return null;
}

/** 育成選手を支配下に上げる */
export function promoteIkusei(w: World, id: number): string | null {
  const p = w.players.find((x) => x.id === id)!;
  if (p.contract !== 'ikusei') return '育成選手ではありません';
  if (userRosterCount(w).roster >= ROSTER_LIMIT) return `支配下は${ROSTER_LIMIT}人までです`;
  p.contract = 'roster';
  p.salary = Math.max(p.salary, MIN_SALARY_ROSTER);
  return null;
}

/** 戦力の整理を終える（支配下70人以内でないと進めない） */
export function finishRoster(w: World): string | null {
  const n = userRosterCount(w).roster;
  if (w.teams.some((t) => t.id === w.userTeamId) && n > ROSTER_LIMIT) return `支配下が${n}人います。${ROSTER_LIMIT}人以内にしてください`;
  w.offseason!.phase = 'camp';
  return null;
}

/** キャンプを行い、翌年のシーズンを始める */
export function finishCamp(w: World, userSiteId: string | null): string | null {
  const why = withRng(w, (rng) => {
    for (const t of w.teams) {
      const site = t.id === w.userTeamId ? userSiteId : chooseAiCamp(rng);
      if (site) {
        const err = applyCamp(w, rng, t.id, site);
        if (err) return err;
      }
    }
    return null;
  });
  if (why) return why;
  startNextSeason(w);
  return null;
}

/** 翌年のシーズンを作る（采配の設定は引き継ぐ） */
export function startNextSeason(w: World): void {
  const year = w.season.year + 1;
  const prevSettings = w.season.settings;
  // 引退・退団した選手は消す（名前は使用済みとして残す）
  w.players = w.players.filter((p) => !p.retired && p.teamId != null);
  for (const p of w.players) {
    p.fatigue = 0;
    p.condition = 3;
    p.level = 'farm';
  }
  withRng(w, (rng) => {
    w.season = newSeason(rng, w.teams, w.players, w.config, year, prevSettings);
  });
  w.offseason = null;
  w.draft = null;
  ensureDraftCandidates(w);
}

/** AI球団だけの世界で、ドラフトからオフシーズン・翌年の開幕までを自動で進める（検証ツール用） */
export function runOffseasonAuto(w: World): void {
  const d = ensureDraftCandidates(w);
  if (d.phase === 'scouting') {
    beginRound1(w);
    submitRound1(w, null);
  }
  advanceDraft(w);
  closeYear(w);
  // 自球団がいなければ、契約は全員合意済み
  finishContracts(w);
  finishRoster(w);
  finishCamp(w, null);
}

/** 自球団の選手に年俸を提示する（上がる分は使える資金の範囲で） */
export function makeOffer(w: World, playerId: number, amount: number): { result: 'agreed' | 'refused' | 'left' } | { error: string } {
  const off = w.offseason;
  if (!off || off.phase !== 'contracts') return { error: '今は契約更改の時期ではありません' };
  const talk = off.contracts[playerId];
  if (!talk || talk.status !== 'pending') return { error: 'この選手との交渉は終わっています' };
  const raise = amount - talk.current;
  if (raise > 0 && raise > availableFunds(w)) return { error: 'お金が足りないため、この金額は提示できません' };
  const result = withRng(w, (rng) => offer(w, rng, talk, amount));
  const p = w.players.find((x) => x.id === playerId)!;
  if (result === 'left') {
    w.season.news.unshift({ date: w.season.postseason?.date ?? '', text: `${fullName(p)}との交渉が決裂し、退団しました` });
    noteFanLoss(w, `${fullName(p)}との契約決裂`, fanPenalty(w, 'contractBreak', { proYears: p.proYears, attachment: p.attachment, releasesThisYear: 0 }));
  }
  return { result };
}
