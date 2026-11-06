// ドラフト会議：候補の生成、スカウト（能力の幅）、1位の抽選、2位以降と育成の指名、入団
import {
  AI_EVAL_NOISE, AI_IKUSEI_PICKS_MAX, AI_REGULAR_PICKS, CANDIDATES_PER_TEAM, CAREER_MIX, DRAFT_POSITION_WEIGHTS,
  IKUSEI_BONUS, IKUSEI_SALARY, MAX_IKUSEI_PICKS, MAX_REGULAR_PICKS, PROSPECT_TIERS, REGION_SCOUT_POWER, ROOKIE_SALARY,
  SCOUT_BASE_WIDTH, SCOUT_MIN_WIDTH, SCOUT_NARROW_RATE, SCOUT_VISITS_PER_MONTH, SIGNING_BONUS,
} from '../config/draft';
import { ROSTER_TEMPLATE } from '../config/generate';
import { generatePlayer } from './generate/player';
import { fullName } from './labels';
import { NameRegistry } from './names';
import { batterOverall, overall, pitcherOverall, potentialOverall } from './ratings';
import { Rng } from './rng';
import { winPct } from './season/standings';
import { canAfford, pay, registerJoin } from './finance';
import type { DraftEvent, DraftLottery, DraftState, World } from './season/types';
import type { BatAbilities, FieldPos, MainPos, PitchAbilities, PitcherRole, Player } from './types';

const BAT_KEYS = ['contact', 'power', 'speed', 'defense'] as const;
const PITCH_KEYS = ['velocity', 'control', 'breaking', 'stamina'] as const;

function withRng<T>(w: World, fn: (rng: Rng) => T): T {
  const rng = new Rng(0);
  rng.state = w.rngState;
  const out = fn(rng);
  w.rngState = rng.state;
  return out;
}

/**
 * 今のドラフト（なければ候補を作る）。ふだんはそのシーズンの秋のドラフト（開幕と同時に候補を作り、シーズン中に視察できる）。
 * 球団設立の年は、開幕前に行う最初のドラフト（前の年の秋）
 */
export function ensureDraftCandidates(w: World): DraftState {
  const first = !!w.offseason?.firstYear;
  return startDraft(w, first ? w.season.year - 1 : w.season.year, first);
}

/** ドラフト候補を作る（すでにその年の分があればそれを返す） */
export function startDraft(w: World, year = w.season.year, firstYear = false): DraftState {
  if (w.draft && w.draft.year === year) return w.draft;
  return withRng(w, (rng) => {
    const names = new NameRegistry(w.usedNames);
    const candidates: Player[] = [];
    const scout: DraftState['scout'] = {};
    const n = w.teams.length * CANDIDATES_PER_TEAM;
    for (let i = 0; i < n; i++) {
      const c = rng.weighted(CAREER_MIX.map((x) => [x, x.weight] as const));
      const slot = rng.weighted(DRAFT_POSITION_WEIGHTS);
      const [pos, role] = slot.startsWith('P:') ? ['P', slot.slice(2)] : [slot, undefined];
      const tier = rng.weighted(PROSPECT_TIERS.map((t) => [t, t.weight] as const));
      const p = generatePlayer(rng, names, w.nextPlayerId++, {
        pos: pos as MainPos, role: role as PitcherRole | undefined, teamId: null, age: rng.int(c.age[0], c.age[1]), capShift: tier.capShift,
      });
      p.career = c.career;
      p.proYears = 0;
      p.draftTeamId = null;
      candidates.push(p);
      const offsets: Record<string, number> = {};
      for (const k of [...BAT_KEYS, ...PITCH_KEYS]) {
        offsets[k] = rng.next();
        offsets[`cap:${k}`] = rng.next();
      }
      scout[p.id] = { visits: 0, offsets };
    }
    w.usedNames = names.toArray();
    // AI球団の指名数の目標
    const aiTargets: DraftState['aiTargets'] = {};
    for (const t of w.teams) aiTargets[t.id] = [rng.int(AI_REGULAR_PICKS[0], AI_REGULAR_PICKS[1]), rng.int(0, AI_IKUSEI_PICKS_MAX)];
    w.draft = {
      year,
      firstYear,
      lottery: null,
      events: [],
      phase: 'scouting',
      candidates,
      scout,
      visitLog: {},
      picks: [],
      round1Pending: [],
      log: [],
      order: [],
      turn: 0,
      round: 1,
      passed: [],
      aiTargets,
    };
    return w.draft;
  });
}

// ---------- スカウト（能力の幅） ----------

/** 能力の幅の大きさ（ポイント） */
export function scoutWidth(d: DraftState, id: number): number {
  const v = d.scout[id]?.visits ?? 0;
  return Math.max(SCOUT_MIN_WIDTH, (SCOUT_BASE_WIDTH / REGION_SCOUT_POWER) * Math.pow(SCOUT_NARROW_RATE, v));
}

/** 本当の値を含む幅 [下, 上] */
function rangeOf(d: DraftState, p: Player, key: string, truth: number): [number, number] {
  const wdt = scoutWidth(d, p.id) * (key.startsWith('cap:') ? 1.3 : 1);
  const u = d.scout[p.id]?.offsets[key] ?? 0.5;
  const lo = Math.max(1, Math.round(truth - u * wdt));
  const hi = Math.min(100, Math.round(truth + (1 - u) * wdt));
  return [lo, hi];
}

export interface ScoutReport {
  abilities: { key: string; range: [number, number] }[];
  now: [number, number];
  pot: [number, number];
}

/** スカウト報告（画面に出すのはランクの幅だけ） */
export function scoutReport(d: DraftState, p: Player): ScoutReport {
  const isP = p.mainPos === 'P';
  const keys = isP ? PITCH_KEYS : BAT_KEYS;
  const cur = (isP ? p.pitch! : p.bat) as unknown as Record<string, number>;
  const cap = (isP ? p.pitchCap! : p.batCap) as unknown as Record<string, number>;
  const abilities = keys.map((k) => ({ key: k, range: rangeOf(d, p, k, cur[k]) }));
  const capRanges = keys.map((k) => rangeOf(d, p, `cap:${k}`, cap[k]));
  const ov = (vals: number[]) => {
    if (isP) {
      const a: PitchAbilities = { velocity: vals[0], control: vals[1], breaking: vals[2], stamina: vals[3] };
      return pitcherOverall(a, p.role!);
    }
    const b: BatAbilities = { contact: vals[0], power: vals[1], speed: vals[2], defense: vals[3] };
    return batterOverall(b, p.mainPos as FieldPos);
  };
  return {
    abilities,
    now: [ov(abilities.map((a) => a.range[0])), ov(abilities.map((a) => a.range[1]))],
    pot: [ov(capRanges.map((r) => r[0])), ov(capRanges.map((r) => r[1]))],
  };
}

/** 今の日付（シーズン中は次の試合日、ポストシーズン中はその日） */
export function todayOf(w: World): string {
  const s = w.season;
  if (s.postseason) return s.postseason.date;
  return s.schedule.days[Math.min(s.dayIndex, s.schedule.days.length - 1)].date;
}

/** 今月の視察の残り回数 */
export function visitsLeftThisMonth(w: World): number {
  const d = w.draft!;
  const month = todayOf(w).slice(0, 7);
  return SCOUT_VISITS_PER_MONTH - (d.visitLog[month]?.length ?? 0);
}

/** 今月すでに視察した候補か */
export function visitedThisMonth(w: World, id: number): boolean {
  return (w.draft!.visitLog[todayOf(w).slice(0, 7)] ?? []).includes(id);
}

/** 視察する（幅が狭くなる）。1か月に3回まで、同じ月に同じ選手は1回まで */
export function visit(w: World, id: number): string | null {
  const d = w.draft!;
  if (d.phase !== 'scouting') return 'ドラフト会議が始まったので、視察はできません';
  if (!d.candidates.some((p) => p.id === id)) return '候補にいない選手です';
  const month = todayOf(w).slice(0, 7);
  const log = (d.visitLog[month] ??= []);
  if (log.length >= SCOUT_VISITS_PER_MONTH) return `今月の視察は${SCOUT_VISITS_PER_MONTH}回までです`;
  if (log.includes(id)) return 'この選手は今月すでに視察しました';
  log.push(id);
  d.scout[id].visits++;
  return null;
}

// ---------- 指名 ----------

export function available(d: DraftState): Player[] {
  const taken = new Set(d.picks.map((x) => x.playerId));
  return d.candidates.filter((p) => !taken.has(p.id));
}

const slotOf = (p: Player) => (p.mainPos === 'P' ? `P:${p.role === 'SP' ? 'SP' : 'RP'}` : p.mainPos);

/** AIの評価：将来性を重く、足りないポジションに上乗せ、見る目のぶれ */
function aiValue(w: World, rng: Rng, teamId: number, p: Player): number {
  const roster = w.players.filter((x) => x.teamId === teamId && !x.retired && x.contract === 'roster');
  const need = ROSTER_TEMPLATE.filter((t) => slotOf({ mainPos: t.pos, role: t.role ?? null } as Player) === slotOf(p)).reduce((s, t) => s + t.count, 0);
  const have = roster.filter((x) => slotOf(x) === slotOf(p)).length;
  const needBonus = have < need ? 3 : 0;
  return overall(p) * 0.4 + potentialOverall(p) * 0.6 + needBonus + rng.normal(0, AI_EVAL_NOISE);
}

function aiChoose(w: World, rng: Rng, teamId: number): Player | null {
  const list = available(w.draft!);
  let best: Player | null = null;
  let bestV = -Infinity;
  for (const p of list) {
    const v = aiValue(w, rng, teamId, p);
    if (v > bestV) {
      bestV = v;
      best = p;
    }
  }
  return best;
}

function teamName(w: World, id: number): string {
  return w.teams.find((t) => t.id === id)!.name;
}

/** その順位の契約金（万円） */
export function bonusFor(round: number, ikusei: boolean): number {
  return ikusei ? IKUSEI_BONUS : SIGNING_BONUS[Math.min(round - 1, SIGNING_BONUS.length - 1)];
}

function addPick(w: World, teamId: number, p: Player, round: number, ikusei: boolean): void {
  const d = w.draft!;
  const bonus = bonusFor(round, ikusei);
  d.picks.push({
    round, ikusei, teamId, playerId: p.id,
    bonus,
    salary: ikusei ? IKUSEI_SALARY : ROOKIE_SALARY[Math.min(round - 1, ROOKIE_SALARY.length - 1)],
  });
  // 自球団は指名のときに契約金を払う
  if (teamId === w.userTeamId) pay(w, `ドラフト契約金（${fullName(p)}）`, -bonus);
  d.log.push(`${ikusei ? `育成${round}位` : `${round}位`}：${teamName(w, teamId)} → ${fullName(p)}`);
}

/** 1位指名を始める */
export function beginRound1(w: World): void {
  const d = w.draft!;
  if (!d.firstYear && !w.season.postseason?.finished) throw new Error('ドラフト会議はポストシーズンの後です');
  d.phase = 'round1';
  d.round1Pending = w.teams.map((t) => t.id);
}

/**
 * 1位指名の入札を出す（自球団の入札と、AI球団の入札を同時に）。
 * 自球団が入っていない競合は自動で抽選。自球団が入った競合は、くじ（lottery）を用意して止まる。
 * 外れた球団は入札し直し。自球団が外れたら、次の入札を待つ。
 */
export function submitRound1(w: World, userPickId: number | null): string | null {
  const d = w.draft!;
  const user = w.userTeamId;
  if (d.lottery) return '先にくじを引いてください';
  if (d.round1Pending.includes(user)) {
    if (userPickId == null) return '指名する選手を選んでください';
    if (!available(d).some((p) => p.id === userPickId)) return 'その選手はもう指名されています';
    if (!canAfford(w, bonusFor(1, false))) return 'お金が足りないため、1位の契約金を払えません';
  }
  withRng(w, (rng) => {
    let first = true;
    while (d.round1Pending.length > 0 && !d.lottery && (first || !d.round1Pending.includes(user))) {
      first = false;
      round1Iteration(w, rng, userPickId);
    }
  });
  if (d.round1Pending.length === 0 && !d.lottery) beginRegular(w);
  return null;
}

/** 1回分の入札と、その結果（競合の抽選） */
function round1Iteration(w: World, rng: Rng, userPickId: number | null): void {
  const d = w.draft!;
  const user = w.userTeamId;
  const wants = new Map<number, number[]>(); // 選手 → 入札した球団
  const bids: { teamId: number; playerId: number }[] = [];
  for (const t of d.round1Pending) {
    const id = t === user ? userPickId! : aiChoose(w, rng, t)?.id;
    if (id == null) continue;
    if (!wants.has(id)) wants.set(id, []);
    wants.get(id)!.push(t);
    bids.push({ teamId: t, playerId: id });
  }
  (d.events ??= []).push({ kind: 'bids', bids });
  const losers: number[] = [];
  for (const [id, teams] of wants) {
    const p = d.candidates.find((x) => x.id === id)!;
    if (teams.length === 1) {
      addPick(w, teams[0], p, 1, false);
      continue;
    }
    // くじ：競合した球団の数だけ封筒を並べ、当たりは1枚
    const lot = { playerId: id, teams: rng.shuffle(teams), winning: rng.int(0, teams.length - 1), choices: {} as Record<number, number> };
    if (teams.includes(user)) {
      // 自球団より前の順番のAI球団は、先にくじを選んでおく
      for (const t of lot.teams) {
        if (t === user) break;
        lot.choices[t] = pickFreeEnvelope(rng, lot);
      }
      d.lottery = lot;
      continue;
    }
    for (const t of lot.teams) lot.choices[t] = pickFreeEnvelope(rng, lot);
    const winner = settleLottery(w, lot, false);
    for (const t of teams) if (t !== winner) losers.push(t);
  }
  // くじ待ちの球団は、まだ外れていない
  d.round1Pending = losers;
  if (d.lottery) for (const t of d.lottery.teams) if (!d.round1Pending.includes(t)) d.round1Pending.push(t);
}

/** まだ誰も選んでいない封筒を1枚選ぶ */
function pickFreeEnvelope(rng: Rng, lot: { teams: number[]; choices: Record<number, number> }): number {
  const used = new Set(Object.values(lot.choices));
  const free = Array.from({ length: lot.teams.length }, (_, i) => i).filter((i) => !used.has(i));
  return rng.pick(free);
}

/** くじを開ける：当たりの封筒を選んだ球団が交渉権を得る */
function settleLottery(w: World, lot: DraftLottery, user: boolean): number {
  const d = w.draft!;
  const p = d.candidates.find((x) => x.id === lot.playerId)!;
  const winner = Number(Object.entries(lot.choices).find(([, e]) => e === lot.winning)![0]);
  d.log.push(`抽選：${fullName(p)}に${lot.teams.length}球団（${lot.teams.map((t) => teamName(w, t)).join('・')}）→ ${teamName(w, winner)}が交渉権`);
  (d.events ??= []).push({ kind: 'lottery', playerId: lot.playerId, teams: lot.teams, winnerId: winner, winning: lot.winning, choices: { ...lot.choices }, user });
  addPick(w, winner, p, 1, false);
  return winner;
}

/** 自球団がくじを選ぶ（封筒の番号）。残りのAI球団も選び、開けて結果を決める。その後、1位指名を続ける */
export function drawLottery(w: World, envelope: number): string | null {
  const d = w.draft!;
  const lot = d.lottery;
  if (!lot) return 'くじはありません';
  if (Object.values(lot.choices).includes(envelope) || envelope < 0 || envelope >= lot.teams.length) return 'そのくじは選べません';
  withRng(w, (rng) => {
    lot.choices[w.userTeamId] = envelope;
    for (const t of lot.teams) if (lot.choices[t] == null) lot.choices[t] = pickFreeEnvelope(rng, lot);
    const winner = settleLottery(w, lot, true);
    d.lottery = null;
    // 当たった球団は入札を終える。外れた球団は入札し直し
    d.round1Pending = d.round1Pending.filter((t) => t !== winner);
    // 自球団が当たったなら、残りのAI球団の入札を進める（自球団が外れたら、自球団の再入札を待つ）
    while (d.round1Pending.length > 0 && !d.lottery && !d.round1Pending.includes(w.userTeamId)) round1Iteration(w, rng, null);
  });
  if (d.round1Pending.length === 0 && !d.lottery) beginRegular(w);
  return null;
}

/** 画面で見せる出来事を取り出す（取り出したら消す） */
export function takeDraftEvents(w: World): DraftEvent[] {
  const d = w.draft;
  if (!d?.events?.length) return [];
  const out = d.events;
  d.events = [];
  return out;
}

/**
 * 2位以降の順番：レギュラーシーズンの勝率の低い球団から。
 * 球団設立の年は新球団が最初、ほかの球団はくじで決める。巡ごとに折り返す
 */
function beginRegular(w: World): void {
  const d = w.draft!;
  d.phase = 'regular';
  if (d.firstYear) {
    const others = withRng(w, (rng) => rng.shuffle(w.teams.filter((t) => t.id !== w.userTeamId).map((t) => t.id)));
    d.order = w.teams.some((t) => t.id === w.userTeamId) ? [w.userTeamId, ...others] : others;
  } else {
    d.order = w.teams.slice().sort((a, b) => winPct(w.season.standings.first[a.id]) - winPct(w.season.standings.first[b.id]) || a.id - b.id).map((t) => t.id);
  }
  d.round = 2;
  d.turn = 0;
  d.passed = [];
  advanceDraft(w);
}

/** 今の巡の指名順（巡ごとに折り返す） */
function sequence(d: DraftState): number[] {
  const firstRound = d.phase === 'regular' ? 2 : 1;
  return (d.round - firstRound) % 2 === 0 ? d.order : d.order.slice().reverse();
}

export function currentTeam(d: DraftState): number | null {
  if (d.phase !== 'regular' && d.phase !== 'ikusei') return null;
  return sequence(d)[d.turn] ?? null;
}

function countPicks(d: DraftState, teamId: number, ikusei: boolean): number {
  return d.picks.filter((x) => x.teamId === teamId && x.ikusei === ikusei).length;
}

/** 次の球団へ。全球団が指名を終えたら、育成ドラフトへ（または終了） */
function nextTurn(w: World): void {
  const d = w.draft!;
  d.turn++;
  if (d.turn >= d.order.length) {
    d.turn = 0;
    d.round++;
  }
  const maxRound = d.phase === 'regular' ? MAX_REGULAR_PICKS + 1 : MAX_IKUSEI_PICKS;
  if (d.passed.length >= d.order.length || d.round > maxRound || available(d).length === 0) {
    if (d.phase === 'regular') {
      d.phase = 'ikusei';
      d.round = 1;
      d.turn = 0;
      d.passed = [];
      d.log.push('― 育成ドラフト ―');
    } else finishDraft(w);
  }
}

/** 自球団の番が来るまで、AI球団の指名を進める */
export function advanceDraft(w: World): void {
  const d = w.draft!;
  withRng(w, (rng) => {
    for (let guard = 0; guard < 2000; guard++) {
      if (d.phase !== 'regular' && d.phase !== 'ikusei') return;
      const t = currentTeam(d)!;
      if (d.passed.includes(t)) {
        nextTurn(w);
        continue;
      }
      if (t === w.userTeamId) return;
      const ik = d.phase === 'ikusei';
      const target = d.aiTargets[t][ik ? 1 : 0] + (ik ? 0 : 1); // 支配下は1位の分を足す
      const have = countPicks(d, t, ik);
      const p = have < target ? aiChoose(w, rng, t) : null;
      if (p) addPick(w, t, p, ik ? have + 1 : d.round, ik);
      else d.passed.push(t);
      nextTurn(w);
    }
  });
}

/** 自球団の指名 */
export function userPick(w: World, id: number): string | null {
  const d = w.draft!;
  if (currentTeam(d) !== w.userTeamId) return '自球団の番ではありません';
  if (!available(d).some((p) => p.id === id)) return 'その選手はもう指名されています';
  const ik = d.phase === 'ikusei';
  const have = countPicks(d, w.userTeamId, ik);
  if (!ik && have >= MAX_REGULAR_PICKS) return `支配下の指名は${MAX_REGULAR_PICKS}人までです`;
  if (ik && have >= MAX_IKUSEI_PICKS) return `育成の指名は${MAX_IKUSEI_PICKS}人までです`;
  if (!canAfford(w, bonusFor(ik ? have + 1 : d.round, ik))) return 'お金が足りないため、契約金を払えません';
  addPick(w, w.userTeamId, d.candidates.find((p) => p.id === id)!, ik ? have + 1 : d.round, ik);
  nextTurn(w);
  advanceDraft(w);
  return null;
}

/** 自球団の指名を終える（支配下、または育成） */
export function userPass(w: World): void {
  const d = w.draft!;
  if (currentTeam(d) !== w.userTeamId) return;
  d.passed.push(w.userTeamId);
  d.log.push(`${teamName(w, w.userTeamId)}は${d.phase === 'ikusei' ? '育成' : ''}指名を終えました`);
  nextTurn(w);
  advanceDraft(w);
}

/** 指名した選手を入団させる */
function finishDraft(w: World): void {
  const d = w.draft!;
  d.phase = 'done';
  for (const pk of d.picks) {
    const p = d.candidates.find((x) => x.id === pk.playerId)!;
    p.teamId = pk.teamId;
    p.draftTeamId = pk.teamId;
    p.contract = pk.ikusei ? 'ikusei' : 'roster';
    p.salary = pk.salary;
    p.level = 'farm';
    w.players.push(p);
    // シーズン後の入団なので、その年の年俸は日割りで0（翌年から全額）
    registerJoin(w, p.id, pk.teamId);
  }
  const mine = d.picks.filter((x) => x.teamId === w.userTeamId);
  const total = mine.reduce((s, x) => s + x.bonus, 0);
  w.season.news.unshift({
    date: w.season.postseason?.date ?? (d.firstYear ? w.season.schedule.days[0].date : w.season.schedule.days[w.season.schedule.days.length - 1].date),
    text: `ドラフトで${mine.filter((x) => !x.ikusei).length}人（育成${mine.filter((x) => x.ikusei).length}人）が入団しました。契約金の合計は${total.toLocaleString()}万円です`,
  });
  // 指名されなかった候補は消える（名前は使用済みのまま）
  d.candidates = d.candidates.filter((p) => d.picks.some((x) => x.playerId === p.id));
}
