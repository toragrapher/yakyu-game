// ペナントの進行（日送り）
import { CONDITION, FARM_DH, FATIGUE, KEEP_RECENT_GAMES, ROSTER_MOVES } from '../../config/season';
import { fullName } from '../labels';
import { NameRegistry } from '../names';
import { Rng } from '../rng';
import { makeSchedule } from '../schedule/schedule';
import { simulateGame } from '../sim/game';
import { summaryFor } from '../sim/summary';
import type { GameResult, GameTeam } from '../sim/types';
import { addGate, computeGate, initFans, updateFans } from '../gate';
import { payAccum } from '../finance';
import { weatherLabel } from '../sim/weather';
import { generateAiTeams } from '../generate/team';
import { ensureDraftCandidates } from '../draft';
import { initFinance } from '../finance';
import type { LeagueConfig, Player, Team } from '../types';
import { daysBetween, monthOf } from './dates';
import { selectFirstTeam } from './firstTeam';
import { makeGameTeam } from './gameTeam';
import { reviewRoster } from './roster';
import { addBat, addPitch, emptySeason } from './stats';
import type { GameLog, GateResult, LevelKey, SeasonState, Standing, TeamSettings, World } from './types';

export const defaultSettings = (): TeamSettings => ({
  lineup: null,
  rotation: null,
  closer: null,
  setup: null,
  tactics: { offense: 'normal', pitching: 'normal' },
  autoRoster: true,
});

/** 新しいシーズンの状態を作る（一軍の登録はAIの選び方で初期化） */
export function newSeason(rng: Rng, teams: Team[], players: Player[], config: LeagueConfig, year: number, prevSettings?: Record<number, TeamSettings>): SeasonState {
  const schedule = makeSchedule(rng, teams, config, year);
  const standings: Record<LevelKey, Record<number, Standing>> = { first: {}, farm: {} };
  const firstTeam: Record<number, number[]> = {};
  const settings: Record<number, TeamSettings> = {};
  for (const t of teams) {
    standings.first[t.id] = { w: 0, l: 0, t: 0, rs: 0, ra: 0 };
    standings.farm[t.id] = { w: 0, l: 0, t: 0, rs: 0, ra: 0 };
    const ft = selectFirstTeam(players.filter((p) => p.teamId === t.id && !p.retired));
    firstTeam[t.id] = [...ft.rotation, ...ft.relievers, ...ft.fielders].map((p) => p.id);
    settings[t.id] = prevSettings?.[t.id] ?? defaultSettings();
  }
  const reg = new Set(Object.values(firstTeam).flat());
  for (const p of players) p.level = reg.has(p.id) ? 'first' : 'farm';
  return {
    year,
    schedule,
    dayIndex: 0,
    stats: { first: {}, farm: {} },
    standings,
    firstTeam,
    settings,
    rotationIdx: {},
    lastPitched: {},
    recentPitches: {},
    todayPitches: {},
    recallAfter: {},
    lastRosterReview: {},
    recentGames: [],
    news: [],
    finished: false,
    postseason: null,
  };
}

/** AI球団だけで世界を作る（球団設立の画面ができるまでの仮。userTeamId の球団を自球団として扱う） */
/** firstYear なら、球団設立の年として開幕前のドラフトから始める */
export function createWorld(seed: number, config: LeagueConfig, year: number, userTeamId = 1, firstYear = false): World {
  const rng = new Rng(seed);
  const names = new NameRegistry();
  const { teams, players } = generateAiTeams(rng, names, config.teamCounts);
  const user = teams.find((t) => t.id === userTeamId);
  if (user) user.isUser = true;
  const season = newSeason(rng, teams, players, config, year);
  const w: World = {
    seed,
    rngState: rng.state,
    config,
    teams,
    players,
    usedNames: names.toArray(),
    nextPlayerId: Math.max(...players.map((p) => p.id)) + 1,
    userTeamId,
    quickStart: true,
    season,
  };
  // その年のドラフト候補（シーズン中に視察できる）
  ensureDraftCandidates(w);
  initFans(w, new Rng(seed ^ 0x5eed));
  initFinance(w);
  if (firstYear) startFirstYearHook?.(w);
  return w;
}

/** 球団設立の年を始める処理（offseason から登録する。ファイルどうしの循環を避けるため） */
let startFirstYearHook: ((w: World) => void) | null = null;
export function setStartFirstYearHook(fn: (w: World) => void): void {
  startFirstYearHook = fn;
}

/** 日をまたぐ処理：疲労の回復、調子の波、登板記録のずれ、登録日数 */
export function passDays(w: World, rng: Rng, days: number): void {
  if (days <= 0) return;
  const reg = new Set(Object.values(w.season.firstTeam).flat());
  for (const p of w.players) {
    if (p.retired || p.teamId == null) continue;
    const rec = p.mainPos === 'P' ? FATIGUE.pitcherRecoveryPerDay : FATIGUE.fielderRecoveryPerDay;
    p.fatigue = Math.max(0, p.fatigue - rec * days);
    for (let i = 0; i < days; i++) {
      if (rng.chance(CONDITION.changePerDay)) {
        const toward = p.condition === 3 ? 0 : p.condition > 3 ? -1 : 1;
        const away = toward === 0 ? (rng.chance(0.5) ? 1 : -1) : -toward;
        const step = toward !== 0 && rng.chance(CONDITION.towardNormal) ? toward : away;
        p.condition = Math.max(1, Math.min(5, p.condition + step));
      }
    }
    if (reg.has(p.id)) p.firstTeamDays += days;
  }
  // 登板記録を1日以上ずらす：[前日, 2日前]
  const ids = new Set([...Object.keys(w.season.recentPitches), ...Object.keys(w.season.todayPitches)]);
  for (const id of ids) {
    const today = w.season.todayPitches[Number(id)] ?? 0;
    const r = w.season.recentPitches[Number(id)] ?? [0, 0];
    const next: [number, number] = days === 1 ? [today, r[0]] : days === 2 ? [0, today] : [0, 0];
    if (next[0] === 0 && next[1] === 0) delete w.season.recentPitches[Number(id)];
    else w.season.recentPitches[Number(id)] = next;
  }
  w.season.todayPitches = {};
}

/** 試合に出た選手の疲労と、投手の登板記録を更新する（ポストシーズンでも使う） */
export function applyGameLoad(w: World, r: GameResult, date: string, players: Map<number, Player>): void {
  for (const s of [0, 1] as const) {
    for (const b of r.batting[s]) {
      const p = players.get(b.playerId);
      // 先発出場した野手は疲れる
      if (p && p.mainPos !== 'P' && b.pos !== 'PH' && b.pa > 0) {
        p.fatigue = Math.min(FATIGUE.max, p.fatigue + (b.pos === 'C' ? FATIGUE.catcherPerGame : FATIGUE.fielderPerGame));
      }
    }
    for (const pl of r.pitching[s]) {
      const p = players.get(pl.playerId);
      if (p) p.fatigue = Math.min(FATIGUE.max, p.fatigue + pl.pitches * FATIGUE.perPitch);
      w.season.lastPitched[pl.playerId] = date;
      w.season.todayPitches[pl.playerId] = (w.season.todayPitches[pl.playerId] ?? 0) + pl.pitches;
    }
  }
}

function recordGame(w: World, level: LevelKey, r: GameResult, date: string, players: Map<number, Player>): void {
  const stats = w.season.stats[level];
  const st = w.season.standings[level];
  const ids = [r.awayId, r.homeId];
  for (const s of [0, 1] as const) {
    const me = st[ids[s]];
    me.rs += r.score[s];
    me.ra += r.score[1 - s];
    if (r.tie) me.t++;
    else if (r.score[s] > r.score[1 - s]) me.w++;
    else me.l++;
    for (const b of r.batting[s]) {
      (stats[b.playerId] ??= emptySeason());
      addBat(stats[b.playerId].bat, b);
    }
    for (const pl of r.pitching[s]) {
      (stats[pl.playerId] ??= emptySeason());
      addPitch(stats[pl.playerId].pitch, pl);
    }
  }
  applyGameLoad(w, r, date, players);
  // 自球団の試合は記録を残す
  if (r.awayId === w.userTeamId || r.homeId === w.userTeamId) {
    const userSide: 0 | 1 = r.awayId === w.userTeamId ? 0 : 1;
    const nm = (id: number | null) => (id == null ? null : (players.get(id) ? fullName(players.get(id)!) : null));
    const log: GameLog = {
      date,
      level,
      opponentId: ids[1 - userSide],
      home: userSide === 1,
      runsFor: r.score[userSide],
      runsAgainst: r.score[1 - userSide],
      result: r.tie ? 'T' : r.score[userSide] > r.score[1 - userSide] ? 'W' : 'L',
      win: nm(r.win),
      loss: nm(r.loss),
      save: nm(r.save),
      summary: summaryFor(r, w.userTeamId),
      weather: weatherLabel(r.weather),
    };
    w.season.recentGames.unshift(log);
    w.season.recentGames.length = Math.min(w.season.recentGames.length, KEEP_RECENT_GAMES * 4);
  }
}

/** 観客の計算用の乱数（試合の乱数とは分けて、試合結果に影響しないようにする） */
export function gateRng(w: World, date: string, homeId: number): Rng {
  let h = w.seed ^ 0x9e3779b9;
  for (const c of `${date}:${homeId}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return new Rng(h >>> 0);
}

/** 一軍の試合の後：ファンの増減、ホームゲームの観客と収支（自球団なら資金に入れる） */
export function afterFirstTeamGame(w: World, r: GameResult, date: string, label = ''): { gate: GateResult; fanDelta: [number, number] } {
  const res = (s: 0 | 1): 'W' | 'L' | 'T' => (r.tie ? 'T' : r.score[s] > r.score[1 - s] ? 'W' : 'L');
  const fanDelta: [number, number] = [updateFans(w, r.awayId, res(0)), updateFans(w, r.homeId, res(1))];
  const gate = computeGate(w, gateRng(w, date, r.homeId), r.homeId, r.awayId, date);
  addGate(w, r.homeId, gate);
  if (r.homeId === w.userTeamId) {
    payAccum(w, `${label}入場料収入`, gate.ticket);
    payAccum(w, `${label}グッズ・飲食収入`, gate.goods);
    payAccum(w, `${label}試合運営コスト`, -gate.cost);
  }
  // 自球団の試合の記録に、観客と収支、ファンの増減を付ける
  const log = w.season.recentGames[0];
  if ((r.awayId === w.userTeamId || r.homeId === w.userTeamId) && log && log.date === date && log.level === 'first' && !label) {
    const side: 0 | 1 = r.awayId === w.userTeamId ? 0 : 1;
    log.fanDelta = fanDelta[side];
    if (side === 1) log.gate = gate;
  }
  return { gate, fanDelta };
}

export interface DayOutcome {
  date: string;
  /** 自球団の一軍の試合結果（なければ null） */
  userGame: { result: GameResult; level: LevelKey; away: GameTeam; home: GameTeam } | null;
}

/** 1日進める（その日の一軍・二軍の全試合を行う） */
export function advanceDay(w: World, keepResult = false): DayOutcome | null {
  const s = w.season;
  // 開幕前（球団設立の年のドラフト・キャンプの前）やオフシーズン中は進めない
  if (s.finished || (w.offseason && s.dayIndex === 0)) return null;
  const day = s.schedule.days[s.dayIndex];
  const rng = new Rng(0);
  rng.state = w.rngState;

  const prev = s.dayIndex > 0 ? s.schedule.days[s.dayIndex - 1].date : null;
  passDays(w, rng, prev ? daysBetween(prev, day.date) : 0);

  // 入れ替えの見直し（AI球団と、自動にしている自球団）
  for (const t of w.teams) {
    const last = s.lastRosterReview[t.id];
    if (last && daysBetween(last, day.date) < ROSTER_MOVES.intervalDays) continue;
    s.lastRosterReview[t.id] = day.date;
    if (t.id === w.userTeamId && !s.settings[t.id].autoRoster) continue;
    if (!last) continue; // 開幕日は見直さない
    const moves = reviewRoster(w, t.id, day.date);
    if (t.id === w.userTeamId) {
      for (const m of moves) s.news.unshift({ date: day.date, text: `${fullName(m.up)}を一軍に登録し、${fullName(m.down)}を二軍に落としました` });
    }
  }

  const players = new Map(w.players.map((p) => [p.id, p]));
  const teamById = new Map(w.teams.map((t) => [t.id, t]));
  let userGame: DayOutcome['userGame'] = null;
  for (const g of day.games) {
    const away = teamById.get(g.awayId)!;
    const home = teamById.get(g.homeId)!;
    for (const level of ['first', 'farm'] as const) {
      const dh = level === 'farm' ? FARM_DH : w.config.dh[home.league];
      const ga = makeGameTeam(w, away, level, dh);
      const gh = makeGameTeam(w, home, level, dh);
      if (!ga || !gh) continue;
      const r = simulateGame(rng, ga, gh, { dh, month: monthOf(day.date), night: level === 'first' });
      recordGame(w, level, r, day.date, players);
      if (level === 'first') afterFirstTeamGame(w, r, day.date);
      if (level === 'first' && keepResult && (g.awayId === w.userTeamId || g.homeId === w.userTeamId)) userGame = { result: r, level, away: ga, home: gh };
    }
  }

  s.dayIndex++;
  if (s.dayIndex >= s.schedule.days.length) s.finished = true;
  w.rngState = rng.state;
  return { date: day.date, userGame };
}

/** n日（試合のある日）進める */
export function advanceDays(w: World, n: number): void {
  for (let i = 0; i < n && !w.season.finished; i++) advanceDay(w);
}

/** 今日の日付（次に試合をする日。シーズン終了後は最終日） */
export function currentDate(w: World): string {
  const d = w.season.schedule.days;
  return d[Math.min(w.season.dayIndex, d.length - 1)].date;
}
