// ロッカールーム：一軍・二軍の入れ替えと、打順・投手の役割を「仮」に動かし、確定でまとめて反映する
import { FIRST_TEAM_SIZE, ROTATION_SIZE } from '../config/league';
import { rotationOf } from './season/gameTeam';
import { lineupProblem } from './season/lineupCheck';
import { demote, promote } from './season/roster';
import type { World } from './season/types';
import { buildGameTeam } from './sim/lineup';
import type { LineupPos } from './sim/types';
import type { Player } from './types';

export interface LockerState {
  teamId: number;
  /** 一軍に登録する選手 */
  first: number[];
  /** スタメン（打順。DHあり） */
  lineup: { playerId: number | null; pos: LineupPos }[];
  /** 先発ローテ（6枠） */
  rotation: (number | null)[];
  /** セットアッパー（7回・8回） */
  setup: (number | null)[];
  closer: number | null;
  /** 手で動かした（確定すると手動の設定になる） */
  lineupManual: boolean;
  pitchManual: boolean;
  dirty: boolean;
}

/** 入れ替えの場所 */
export type Slot =
  | { k: 'lineup'; i: number }
  | { k: 'rot'; i: number }
  | { k: 'setup'; i: number }
  | { k: 'closer' }
  | { k: 'bench'; id: number }
  | { k: 'relief'; id: number }
  | { k: 'farm'; id: number }
  | { k: 'area'; name: 'bench' | 'relief' | 'farm' };

const pById = (w: World, id: number) => w.players.find((p) => p.id === id)!;
const isP = (p: Player) => p.mainPos === 'P';

/** 自動で組んだ場合の打順 */
function autoLineup(w: World, teamId: number, first: number[]): LockerState['lineup'] {
  const team = w.teams.find((t) => t.id === teamId)!;
  const players = first.map((id) => pById(w, id));
  const gt = buildGameTeam(team, players, { dh: true });
  return gt.lineup.map((s) => ({ playerId: s.player.id, pos: s.pos }));
}

/** 自動で組んだ場合の先発・勝ちパターン・抑え */
function autoPitching(w: World, teamId: number, first: number[]): Pick<LockerState, 'rotation' | 'setup' | 'closer'> {
  const team = w.teams.find((t) => t.id === teamId)!;
  const players = first.map((id) => pById(w, id));
  // 'farm' を指定すると、設定を見ずに自動で組む
  const rot = rotationOf(w, teamId, 'farm', players);
  const others = players.filter((p) => isP(p) && !rot.includes(p));
  const gt = buildGameTeam(team, [...players.filter((p) => !isP(p)), rot[0] ?? others[0], ...others], { dh: true, starter: rot[0] ?? others[0] });
  const rotation: (number | null)[] = rot.map((p) => p.id);
  while (rotation.length < ROTATION_SIZE) rotation.push(null);
  const setup: (number | null)[] = gt.setup.map((p) => p.id);
  while (setup.length < 2) setup.push(null);
  return { rotation: rotation.slice(0, ROTATION_SIZE), setup: setup.slice(0, 2), closer: gt.closer?.id ?? null };
}

/** 今の状態からロッカールームを開く */
export function openLocker(w: World, teamId = w.userTeamId): LockerState {
  const s = w.season;
  const first = [...(s.firstTeam[teamId] ?? [])];
  const st = s.settings[teamId];
  const reg = new Set(first);
  const lineupOk = st.lineup && !lineupProblem(st.lineup, new Set(first.filter((id) => !isP(pById(w, id)))));
  const lineup = lineupOk ? st.lineup!.map((x) => ({ ...x })) : autoLineup(w, teamId, first);
  const auto = autoPitching(w, teamId, first);
  const keep = (id: number | null) => (id != null && reg.has(id) ? id : null);
  let rotation = auto.rotation;
  if (st.rotation) {
    rotation = st.rotation.map(keep);
    while (rotation.length < ROTATION_SIZE) rotation.push(null);
  }
  const setup = st.setup ? [keep(st.setup[0] ?? null), keep(st.setup[1] ?? null)] : auto.setup;
  const closer = st.closer != null ? keep(st.closer) : auto.closer;
  return {
    teamId,
    first,
    lineup,
    rotation: rotation.slice(0, ROTATION_SIZE),
    setup,
    closer,
    lineupManual: !!lineupOk,
    pitchManual: !!(st.rotation || st.setup || st.closer != null),
    dirty: false,
  };
}

/** 控え野手（一軍でスタメンにいない野手） */
export function benchOf(w: World, L: LockerState): number[] {
  const inLineup = new Set(L.lineup.map((x) => x.playerId));
  return L.first.filter((id) => !isP(pById(w, id)) && !inLineup.has(id));
}

/** 中継ぎ（一軍の投手で、先発・勝ちパターン・抑え以外） */
export function reliefOf(w: World, L: LockerState): number[] {
  const used = new Set([...L.rotation, ...L.setup, L.closer].filter((x): x is number => x != null));
  return L.first.filter((id) => isP(pById(w, id)) && !used.has(id));
}

/** 二軍（支配下と育成） */
export function farmOf(w: World, L: LockerState): number[] {
  const reg = new Set(L.first);
  return w.players.filter((p) => p.teamId === L.teamId && !p.retired && !reg.has(p.id)).map((p) => p.id);
}

function occupant(L: LockerState, s: Slot): number | null {
  switch (s.k) {
    case 'lineup': return L.lineup[s.i]?.playerId ?? null;
    case 'rot': return L.rotation[s.i] ?? null;
    case 'setup': return L.setup[s.i] ?? null;
    case 'closer': return L.closer;
    case 'area': return null;
    default: return s.id;
  }
}

type Place = 'fielder' | 'pitcher' | 'farm';
function placeKind(s: Slot): Place {
  if (s.k === 'lineup' || s.k === 'bench' || (s.k === 'area' && s.name === 'bench')) return 'fielder';
  if (s.k === 'farm' || (s.k === 'area' && s.name === 'farm')) return 'farm';
  return 'pitcher';
}

/** 選手を、どの枠からも外す（一軍の登録はそのまま） */
function detach(L: LockerState, id: number): void {
  for (const x of L.lineup) if (x.playerId === id) x.playerId = null;
  L.rotation = L.rotation.map((x) => (x === id ? null : x));
  L.setup = L.setup.map((x) => (x === id ? null : x));
  if (L.closer === id) L.closer = null;
}

function putAt(L: LockerState, s: Slot, id: number | null): void {
  if (id != null) {
    if (placeKind(s) === 'farm') L.first = L.first.filter((x) => x !== id);
    else if (!L.first.includes(id)) L.first.push(id);
  }
  switch (s.k) {
    case 'lineup': L.lineup[s.i].playerId = id; break;
    case 'rot': L.rotation[s.i] = id; break;
    case 'setup': L.setup[s.i] = id; break;
    case 'closer': L.closer = id; break;
    default: break;
  }
}

/**
 * 2つの場所の選手を入れ替える（仮）。片方が空き（枠やエリア）なら移動になる。
 * 入れられない組み合わせなら理由を返す。
 */
export function swapSlots(w: World, L: LockerState, a: Slot, b: Slot, date: string): string | null {
  const ida = occupant(L, a);
  const idb = occupant(L, b);
  if (ida == null && idb == null) return null;
  if (ida === idb) return null;
  const check = (id: number | null, to: Slot): string | null => {
    if (id == null) return null;
    const p = pById(w, id);
    const kind = placeKind(to);
    if (kind === 'fielder' && isP(p)) return '投手は野手の枠に入れられません';
    if (kind === 'pitcher' && !isP(p)) return '野手は投手の枠に入れられません';
    if (kind !== 'farm') {
      if (p.contract !== 'roster') return '育成選手は一軍に登録できません';
      // 確定済みで二軍にいる選手は、再登録の制限を確かめる（仮に落とした選手はリセット扱いなので戻せる）
      const wasFirst = (w.season.firstTeam[L.teamId] ?? []).includes(id);
      const after = w.season.recallAfter[id];
      if (!wasFirst && after && date < after) return `${p.familyName}は${after.slice(5).replace('-', '/')}まで一軍に戻せません`;
    }
    return null;
  };
  const why = check(ida, b) ?? check(idb, a);
  if (why) return why;
  if (ida != null) detach(L, ida);
  if (idb != null) detach(L, idb);
  // 一軍の登録人数は、確定のときにまとめて確かめる
  putAt(L, b, ida);
  putAt(L, a, idb);
  for (const s of [a, b]) {
    const k = placeKind(s);
    if (k === 'fielder' || (k === 'farm' && [ida, idb].some((id) => id != null && !isP(pById(w, id))))) L.lineupManual = true;
    if (k === 'pitcher' || (k === 'farm' && [ida, idb].some((id) => id != null && isP(pById(w, id))))) L.pitchManual = true;
  }
  // 一軍から外れた選手がスタメン・役割に残らないように
  for (const id of [ida, idb]) if (id != null && !L.first.includes(id)) detach(L, id);
  L.dirty = true;
  return null;
}

/** スタメンの守備位置を変える（仮） */
export function setLineupPos(L: LockerState, i: number, pos: LineupPos): void {
  L.lineup[i].pos = pos;
  L.lineupManual = true;
  L.dirty = true;
}

/** 打順・投手の役割を自動に戻す（仮。一軍の顔ぶれはそのまま） */
export function resetToAuto(w: World, L: LockerState, part: 'lineup' | 'pitching'): void {
  if (part === 'lineup') {
    L.lineup = autoLineup(w, L.teamId, L.first);
    L.lineupManual = false;
  } else {
    Object.assign(L, autoPitching(w, L.teamId, L.first));
    L.pitchManual = false;
  }
  L.dirty = true;
}

/** 確定する前の確認（問題があれば理由） */
export function lockerProblem(w: World, L: LockerState): string | null {
  const ps = L.first.map((id) => pById(w, id));
  if (ps.length > FIRST_TEAM_SIZE) return `一軍は${FIRST_TEAM_SIZE}人までです（今${ps.length}人）`;
  if (ps.filter((p) => p.mainPos === 'C').length < 2) return '一軍の捕手は2人以上必要です';
  if (ps.filter(isP).length < 10) return '一軍の投手は10人以上必要です';
  if (ps.filter((p) => !isP(p)).length < 10) return '一軍の野手は10人以上必要です';
  if (L.lineupManual) {
    if (L.lineup.some((x) => x.playerId == null)) return 'スタメンに空きがあります';
    const prob = lineupProblem(L.lineup as { playerId: number; pos: LineupPos }[], new Set(ps.filter((p) => !isP(p)).map((p) => p.id)));
    if (prob) return `スタメン：${prob}`;
  }
  if (L.pitchManual && L.rotation.filter((x) => x != null).length < 4) return '先発ローテは4人以上にしてください';
  return null;
}

/** 確定：一軍・二軍の入れ替えと、打順・投手の設定を反映する */
export function commitLocker(w: World, L: LockerState, date: string): string | null {
  const why = lockerProblem(w, L);
  if (why) return why;
  const before = new Set(w.season.firstTeam[L.teamId]);
  const after = new Set(L.first);
  for (const id of before) if (!after.has(id)) demote(w, pById(w, id), date);
  for (const id of after) if (!before.has(id)) promote(w, pById(w, id));
  const st = w.season.settings[L.teamId];
  st.lineup = L.lineupManual ? L.lineup.map((x) => ({ playerId: x.playerId!, pos: x.pos })) : null;
  if (L.pitchManual) {
    st.rotation = L.rotation.filter((x): x is number => x != null);
    st.setup = L.setup.filter((x): x is number => x != null);
    st.closer = L.closer;
  } else {
    st.rotation = null;
    st.setup = null;
    st.closer = null;
  }
  L.dirty = false;
  return null;
}
