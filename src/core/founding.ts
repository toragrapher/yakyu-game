// 球団設立：リーグ設定・新球団・AI球団・初期メンバー（3方式）を決めて、最初のシーズンを始める
import {
  EXPANSION_FILLER_CAP_SHIFT, EXPANSION_MAX_PER_TEAM, EXPANSION_PICKS, EXPANSION_PROTECT, FILLER_CAP_SHIFT, OMAKASE_PARITY, ROOKIE_AGE,
  ROOKIE_CAP_SHIFT, ROOKIE_MAX, ROOKIE_POOL, SLOT_SLACK, TRYOUT_AGE, TRYOUT_CAP_SHIFT, TRYOUT_MAX, TRYOUT_POOL,
} from '../config/founding';
import { ROSTER_LIMIT } from '../config/league';
import { IKUSEI_TEMPLATE, ROSTER_TEMPLATE } from '../config/generate';
import { generatePlayer } from './generate/player';
import { equalizeTeams, generateAiTeams } from './generate/team';
import { NameRegistry } from './names';
import { overall, potentialOverall } from './ratings';
import { Rng } from './rng';
import { salaryFor } from './salary';
import { newSeason } from './season/advance';
import type { World } from './season/types';
import type { LeagueConfig, MainPos, PitcherRole, Player, Team } from './types';

export type MemberMethod = 'expansion' | 'tryout' | 'omakase';

/** 新球団の情報（画面で入力する部分） */
export type NewTeamInput = Omit<Team, 'id' | 'league' | 'isUser'>;

/** 設立の途中の状態 */
export interface Founding {
  seed: number;
  year: number;
  rngState: number;
  config: LeagueConfig;
  userLeague: 0 | 1;
  teams: Team[];
  players: Player[];
  usedNames: string[];
  nextPlayerId: number;
  userTeamId: number;
  method: MemberMethod | null;
  /** 候補の選手ID（エクスパンション：プロテクト外、トライアウト：自由契約＋新人） */
  pool: number[];
  /** 指名・獲得した選手ID */
  picks: number[];
}

/** 区分：テンプレートの枠（投手の役割・守備位置） */
function slotKey(p: { mainPos: MainPos; role: PitcherRole | null }): string {
  return p.mainPos === 'P' ? `P:${p.role === 'CL' ? 'RP' : p.role}` : p.mainPos;
}

/** 区分ごとの基本人数（抑えは中継ぎに含める） */
function slotNeeds(template: typeof ROSTER_TEMPLATE): Map<string, { pos: MainPos; role?: PitcherRole; count: number }> {
  const m = new Map<string, { pos: MainPos; role?: PitcherRole; count: number }>();
  for (const t of template) {
    const key = slotKey({ mainPos: t.pos, role: t.role ?? null });
    const cur = m.get(key);
    if (cur) cur.count += t.count;
    else m.set(key, { pos: t.pos, role: t.role === 'CL' ? 'RP' : t.role, count: t.count });
  }
  return m;
}

/** 設立を始める：AI球団を作り、新球団の枠を用意する */
export function startFounding(seed: number, year: number, config: LeagueConfig, userLeague: 0 | 1, team: NewTeamInput): Founding {
  const rng = new Rng(seed);
  const names = new NameRegistry();
  const aiCounts: [number, number] = [config.teamCounts[0], config.teamCounts[1]];
  aiCounts[userLeague] -= 1;
  const { teams, players } = generateAiTeams(rng, names, aiCounts);
  const userTeamId = Math.max(...teams.map((t) => t.id)) + 1;
  const user: Team = { ...team, id: userTeamId, league: userLeague, isUser: true };
  // 新球団と色がかぶらないように、AI球団の名前（愛称）が同じなら変える
  for (const t of teams) if (t.name === user.name) t.name = `${t.name}２`;
  return {
    seed,
    year,
    rngState: rng.state,
    config,
    userLeague,
    teams: [...teams, user],
    players,
    usedNames: names.toArray(),
    nextPlayerId: Math.max(...players.map((p) => p.id)) + 1,
    userTeamId,
    method: null,
    pool: [],
    picks: [],
  };
}

function withRng<T>(f: Founding, fn: (rng: Rng, names: NameRegistry) => T): T {
  const rng = new Rng(0);
  rng.state = f.rngState;
  const names = new NameRegistry(f.usedNames);
  const out = fn(rng, names);
  f.rngState = rng.state;
  f.usedNames = names.toArray();
  return out;
}

/** 方式を選び、候補を用意する */
export function chooseMethod(f: Founding, method: MemberMethod): void {
  // 前に選んだ方式の候補を片付ける
  resetMethod(f);
  f.method = method;
  if (method === 'expansion') {
    // 各AI球団は評価の高い28人をプロテクトする（今の力と将来性の高いほう）
    const value = (p: Player) => Math.max(overall(p), potentialOverall(p) - 6);
    for (const t of f.teams.filter((x) => !x.isUser)) {
      const roster = f.players.filter((p) => p.teamId === t.id && p.contract === 'roster').sort((a, b) => value(b) - value(a));
      f.pool.push(...roster.slice(EXPANSION_PROTECT).map((p) => p.id));
    }
  } else if (method === 'tryout') {
    withRng(f, (rng, names) => {
      const make = (count: number, age: [number, number], capShift: number, rookie: boolean) => {
        for (let i = 0; i < count; i++) {
          // ポジションは、1球団の人数の比率で選ぶ
          const pick = rng.weighted(ROSTER_TEMPLATE.map((x) => [x, x.count] as const));
          const p = generatePlayer(rng, names, f.nextPlayerId++, { pos: pick.pos, role: pick.role, teamId: null, age: rng.int(age[0], age[1]), capShift });
          if (rookie) {
            // 新人はプロ1年目。経歴は年齢から（高校18歳・大学22歳・社会人それ以外）
            p.proYears = 0;
            p.career = p.age <= 18 ? 'highSchool' : p.age === 22 ? 'college' : p.age < 22 ? 'highSchool' : 'industrial';
            p.salary = salaryFor(p);
          }
          f.players.push(p);
          f.pool.push(p.id);
        }
      };
      make(TRYOUT_POOL, TRYOUT_AGE, TRYOUT_CAP_SHIFT, false);
      make(ROOKIE_POOL, ROOKIE_AGE, ROOKIE_CAP_SHIFT, true);
    });
  }
}

/** 方式の選び直し：獲得をすべて取り消し、トライアウトの候補は消す */
function resetMethod(f: Founding): void {
  for (const id of f.picks) {
    const p = f.players.find((x) => x.id === id)!;
    p.teamId = p.draftTeamId; // エクスパンションなら元の球団へ
  }
  if (f.method === 'tryout') {
    const pool = new Set(f.pool);
    f.players = f.players.filter((p) => !pool.has(p.id));
  }
  f.pool = [];
  f.picks = [];
  f.method = null;
}

/** トライアウトの候補の中で、新人（特別ドラフト）かどうか */
export function isRookieCandidate(f: Founding, p: Player): boolean {
  return f.method === 'tryout' && f.pool.includes(p.id) && p.proYears === 0;
}

/** 指名・獲得できるか（できないときは理由） */
export function canPick(f: Founding, id: number): string | null {
  if (!f.pool.includes(id)) return '候補にいない選手です';
  if (f.picks.includes(id)) return 'すでに獲得しています';
  const p = f.players.find((x) => x.id === id)!;
  const key = slotKey(p);
  const needs = slotNeeds(ROSTER_TEMPLATE).get(key);
  const sameSlot = f.picks.filter((x) => slotKey(f.players.find((y) => y.id === x)!) === key).length;
  if (needs && sameSlot >= needs.count + SLOT_SLACK) return `このポジションはもう十分です（${needs.count + SLOT_SLACK}人まで）`;
  if (f.method === 'expansion') {
    if (f.picks.length >= EXPANSION_PICKS) return `指名は${EXPANSION_PICKS}人までです`;
    const fromTeam = f.picks.filter((x) => f.players.find((y) => y.id === x)!.draftTeamId === p.teamId).length;
    if (fromTeam >= expansionMaxPerTeam(f)) return `1球団から${expansionMaxPerTeam(f)}人までです`;
  }
  if (f.method === 'tryout') {
    const rookies = f.picks.filter((x) => isRookieCandidate(f, f.players.find((y) => y.id === x)!)).length;
    if (isRookieCandidate(f, p) && rookies >= ROOKIE_MAX) return `新人は${ROOKIE_MAX}人までです`;
    if (!isRookieCandidate(f, p) && f.picks.length - rookies >= TRYOUT_MAX) return `自由契約の選手は${TRYOUT_MAX}人までです`;
  }
  return null;
}

export function expansionMaxPerTeam(f: Founding): number {
  const ai = f.teams.filter((t) => !t.isUser).length;
  return Math.max(EXPANSION_MAX_PER_TEAM, Math.ceil(EXPANSION_PICKS / ai) + 1);
}

export function pick(f: Founding, id: number): string | null {
  const why = canPick(f, id);
  if (why) return why;
  const p = f.players.find((x) => x.id === id)!;
  if (f.method === 'expansion') p.draftTeamId = p.teamId; // 元の球団を覚えておく
  p.teamId = f.userTeamId;
  f.picks.push(id);
  return null;
}

export function unpick(f: Founding, id: number): void {
  const i = f.picks.indexOf(id);
  if (i < 0) return;
  f.picks.splice(i, 1);
  const p = f.players.find((x) => x.id === id)!;
  p.teamId = f.method === 'expansion' ? p.draftTeamId : null;
}

/** 候補を評価の高い順に、上限まで自動で獲得する */
export function autoPick(f: Founding): void {
  const cands = f.pool
    .map((id) => f.players.find((p) => p.id === id)!)
    .filter((p) => !f.picks.includes(p.id))
    .sort((a, b) => Math.max(overall(b), potentialOverall(b) - 8) - Math.max(overall(a), potentialOverall(a) - 8));
  // まずは基本人数の枠を埋めるように獲り、余った枠で残りを獲る
  const needs = slotNeeds(ROSTER_TEMPLATE);
  const count = (key: string) => f.picks.filter((x) => slotKey(f.players.find((y) => y.id === x)!) === key).length;
  for (const p of cands) if (count(slotKey(p)) < (needs.get(slotKey(p))?.count ?? 0)) pick(f, p.id);
  for (const p of cands) if (!f.picks.includes(p.id)) pick(f, p.id);
}

/** 球団の支配下・育成を基本人数まで埋める（支配下は上限70人を超えない） */
function fillRoster(f: Founding, rng: Rng, names: NameRegistry, teamId: number, capShift: number): void {
  for (const [template, contract] of [[ROSTER_TEMPLATE, 'roster'], [IKUSEI_TEMPLATE, 'ikusei']] as const) {
    const mine = () => f.players.filter((p) => p.teamId === teamId && p.contract === contract && !p.retired);
    for (const [key, t] of slotNeeds(template)) {
      const have = mine().filter((p) => slotKey(p) === key).length;
      for (let i = have; i < t.count; i++) {
        if (contract === 'roster' && mine().length >= ROSTER_LIMIT) break;
        const age = contract === 'ikusei' ? rng.int(18, 23) : rng.int(19, 30);
        f.players.push(generatePlayer(rng, names, f.nextPlayerId++, { pos: t.pos, role: t.role, teamId, contract, age, capShift }));
      }
    }
  }
}

/** 設立を終えて、最初のシーズンを始める */
export function finishFounding(f: Founding): World {
  if (!f.method) throw new Error('初期メンバーの集め方を選んでください');
  const user = f.teams.find((t) => t.isUser)!;
  withRng(f, (rng, names) => {
    if (f.method === 'omakase') {
      fillRoster(f, rng, names, user.id, 0);
      // 戦力をリーグ平均にそろえる
      equalizeTeams(f.teams, f.players, OMAKASE_PARITY, user.id);
    } else {
      fillRoster(f, rng, names, user.id, f.method === 'expansion' ? EXPANSION_FILLER_CAP_SHIFT : FILLER_CAP_SHIFT);
      // 指名された球団は、若手で人数を補う
      if (f.method === 'expansion') for (const t of f.teams.filter((x) => !x.isUser)) fillRoster(f, rng, names, t.id, FILLER_CAP_SHIFT);
    }
    // 獲れなかったトライアウトの候補は、どこにも所属しない（引退扱い）
    for (const p of f.players) if (p.teamId == null) p.retired = true;
    for (const p of f.players) if (p.teamId === user.id) p.draftTeamId = null; // 生え抜きではない
  });
  const rng = new Rng(0);
  rng.state = f.rngState;
  const season = newSeason(rng, f.teams, f.players, f.config, f.year);
  return {
    seed: f.seed,
    rngState: rng.state,
    config: f.config,
    teams: f.teams,
    players: f.players,
    usedNames: f.usedNames,
    nextPlayerId: f.nextPlayerId,
    userTeamId: user.id,
    season,
  };
}
