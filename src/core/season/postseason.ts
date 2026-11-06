// ポストシーズン：リーグ内の勝ち上がり（下位から順に上位と対戦）→ 両リーグの勝者による優勝決定シリーズ
import { LEAGUE_NAMES } from '../../config/league';
import {
  CHAMPIONSHIP, CHAMPIONSHIP_HOME_PATTERN, DAYS_BEFORE_POSTSEASON, DAYS_BETWEEN_STAGES, EARLY_STAGE,
  FINAL_STAGE_ADVANTAGE, FINAL_STAGE_PLAIN, POSTSEASON_NAMES,
} from '../../config/postseason';
import { fullName } from '../labels';
import { Rng } from '../rng';
import { simulateGame } from '../sim/game';
import { summaryFor } from '../sim/summary';
import type { GameResult, GameTeam } from '../sim/types';
import type { Player } from '../types';
import { afterFirstTeamGame, applyGameLoad, passDays } from './advance';
import { addDays, daysBetween, monthOf } from './dates';
import { makeGameTeam } from './gameTeam';
import { standingsTable, winPct } from './standings';
import type { PostseasonState, Series, World } from './types';

/** 優勝決定シリーズで、決着がつかないときに打ち切る試合数 */
const CHAMPIONSHIP_HARD_LIMIT = 12;

interface SeriesWithStart extends Series {
  /** この日以降に試合を始める */
  startDate: string;
}

function stageName(lg: 0 | 1, higherIndex: number, seedsCount: number): string {
  // 1位と戦う段階がファイナル。その前は、最初から順にファースト・セカンド・第3…
  if (higherIndex === 0) return `${LEAGUE_NAMES[lg]} ${POSTSEASON_NAMES.league} ${POSTSEASON_NAMES.final}`;
  const order = seedsCount - 2 - higherIndex; // 0 が最初の段階
  const label = order === 0 ? POSTSEASON_NAMES.first : order === 1 ? POSTSEASON_NAMES.second : `第${order + 1}ステージ`;
  return `${LEAGUE_NAMES[lg]} ${POSTSEASON_NAMES.league} ${label}`;
}

function makeLeagueSeries(w: World, lg: 0 | 1, higherIndex: number, lowerId: number, startDate: string): SeriesWithStart {
  const ps = w.season.postseason!;
  const seeds = ps.seeds[lg];
  const rule = higherIndex === 0 ? (w.config.postseason.advantage ? FINAL_STAGE_ADVANTAGE : FINAL_STAGE_PLAIN) : { ...EARLY_STAGE, advantage: 0 };
  return {
    key: lg === 0 ? 'L0' : 'L1',
    name: stageName(lg, higherIndex, seeds.length),
    teams: [seeds[higherIndex], lowerId],
    wins: [rule.advantage, 0],
    advantage: rule.advantage,
    winsNeeded: rule.winsNeeded,
    maxGames: rule.maxGames,
    games: [],
    winnerId: null,
    startDate,
  };
}

/** レギュラーシーズン後に、ポストシーズンを始める */
export function startPostseason(w: World): PostseasonState {
  const s = w.season;
  if (!s.finished) throw new Error('レギュラーシーズンが終わっていません');
  if (s.postseason) return s.postseason;
  const lastDate = s.schedule.days[s.schedule.days.length - 1].date;
  const seeds: [number[], number[]] = [0, 1].map((lg) =>
    standingsTable(w, 'first', lg as 0 | 1).slice(0, Math.max(1, w.config.postseason.teams[lg])).map((r) => r.teamId),
  ) as [number[], number[]];
  const ps: PostseasonState = {
    seeds,
    ladder: [0, 0],
    leagueWinners: [null, null],
    series: [],
    date: lastDate,
    championId: null,
    finished: false,
  };
  s.postseason = ps;
  const start = addDays(lastDate, DAYS_BEFORE_POSTSEASON);
  for (const lg of [0, 1] as const) {
    const n = seeds[lg].length;
    if (n === 1) ps.leagueWinners[lg] = seeds[lg][0];
    else {
      ps.ladder[lg] = n - 2;
      ps.series.push(makeLeagueSeries(w, lg, n - 2, seeds[lg][n - 1], start));
    }
  }
  maybeStartChampionship(w, start);
  return ps;
}

function maybeStartChampionship(w: World, startDate: string): void {
  const ps = w.season.postseason!;
  const [a, b] = ps.leagueWinners;
  if (a == null || b == null || ps.series.some((x) => x.key === 'C')) return;
  // レギュラーシーズンの勝率が高いほうを上位にする
  const pa = winPct(w.season.standings.first[a]);
  const pb = winPct(w.season.standings.first[b]);
  const teams: [number, number] = pa >= pb ? [a, b] : [b, a];
  const c: SeriesWithStart = {
    key: 'C',
    name: POSTSEASON_NAMES.championship,
    teams,
    wins: [0, 0],
    advantage: 0,
    winsNeeded: CHAMPIONSHIP.winsNeeded,
    maxGames: CHAMPIONSHIP.maxGames,
    games: [],
    winnerId: null,
    startDate,
  };
  ps.series.push(c);
}

/** 進行中のシリーズ（まだ勝者が決まっていない） */
export function activeSeries(w: World): Series[] {
  return w.season.postseason?.series.filter((x) => x.winnerId == null) ?? [];
}

/** シリーズの勝敗が決まったか確かめ、決まれば勝者を記録する */
function settle(sr: Series): void {
  if (sr.wins[0] >= sr.winsNeeded) sr.winnerId = sr.teams[0];
  else if (sr.wins[1] >= sr.winsNeeded) sr.winnerId = sr.teams[1];
  else if (sr.games.length >= sr.maxGames) {
    // リーグ内：決着がつかなければ上位の球団が勝ち抜け。優勝決定シリーズは決まるまで続ける
    if (sr.key !== 'C' || sr.games.length >= CHAMPIONSHIP_HARD_LIMIT) sr.winnerId = sr.wins[1] > sr.wins[0] ? sr.teams[1] : sr.teams[0];
  }
}

export interface PostDayOutcome {
  date: string;
  userGame: { result: GameResult; away: GameTeam; home: GameTeam; seriesName: string } | null;
}

/** ポストシーズンを1日進める（その日に試合のあるシリーズを1試合ずつ行う） */
export function advancePostseasonDay(w: World): PostDayOutcome | null {
  const ps = w.season.postseason;
  if (!ps || ps.finished) return null;
  const active = activeSeries(w) as SeriesWithStart[];
  if (active.length === 0) return null;
  const rng = new Rng(0);
  rng.state = w.rngState;

  // 次に試合のある日まで進める
  const nextStart = active.map((x) => x.startDate).sort()[0];
  const date = nextStart > addDays(ps.date, 1) ? nextStart : addDays(ps.date, 1);
  passDays(w, rng, daysBetween(ps.date, date));
  ps.date = date;

  const players = new Map(w.players.map((p) => [p.id, p] as [number, Player]));
  const teamById = new Map(w.teams.map((t) => [t.id, t]));
  let userGame: PostDayOutcome['userGame'] = null;
  for (const sr of active) {
    if (sr.startDate > date) continue;
    const gameNo = sr.games.length;
    const homeIdx = sr.key === 'C' ? (CHAMPIONSHIP_HOME_PATTERN[gameNo] ?? 0) : 0;
    const home = teamById.get(sr.teams[homeIdx])!;
    const away = teamById.get(sr.teams[1 - homeIdx])!;
    const dh = w.config.dh[sr.key === 'C' ? home.league : sr.key === 'L0' ? 0 : 1];
    const ga = makeGameTeam(w, away, 'first', dh);
    const gh = makeGameTeam(w, home, 'first', dh);
    if (!ga || !gh) continue;
    const r = simulateGame(rng, ga, gh, { dh, month: monthOf(date), night: true });
    applyGameLoad(w, r, date, players);
    afterFirstTeamGame(w, r, date, 'ポストシーズン ');
    const winnerId = r.tie ? null : r.score[1] > r.score[0] ? home.id : away.id;
    if (winnerId != null) sr.wins[sr.teams.indexOf(winnerId)]++;
    const nm = (id: number | null) => (id == null ? null : players.get(id) ? fullName(players.get(id)!) : null);
    sr.games.push({ date, awayId: away.id, homeId: home.id, score: r.score, winnerId, win: nm(r.win), loss: nm(r.loss), save: nm(r.save), summary: summaryFor(r, w.userTeamId) });
    if (away.id === w.userTeamId || home.id === w.userTeamId) userGame = { result: r, away: ga, home: gh, seriesName: sr.name };
    settle(sr);
    if (sr.winnerId != null) onSeriesEnd(w, sr, date);
  }
  // その日に試合がなかった空の日でも、日付は進んでいる
  w.rngState = rng.state;
  return { date, userGame };
}

function onSeriesEnd(w: World, sr: Series, date: string): void {
  const ps = w.season.postseason!;
  const name = (id: number) => w.teams.find((t) => t.id === id)!.name;
  const winner = sr.winnerId!;
  if (sr.teams.includes(w.userTeamId)) {
    const mine = sr.teams.indexOf(w.userTeamId);
    const rec = `${sr.wins[mine]}勝${sr.wins[1 - mine]}敗${sr.advantage && mine === 0 ? '（アドバンテージ1勝を含む）' : ''}`;
    w.season.news.unshift({ date, text: winner === w.userTeamId ? `${sr.name}を勝ち抜きました（${rec}）` : `${sr.name}で${name(winner)}に敗れました（${rec}）` });
  }
  const next = addDays(date, 1 + DAYS_BETWEEN_STAGES);
  if (sr.key === 'C') {
    ps.championId = winner;
    ps.finished = true;
    w.season.news.unshift({ date, text: `${name(winner)}が${POSTSEASON_NAMES.championship}を制し、日本一になりました` });
    return;
  }
  const lg = sr.key === 'L0' ? 0 : 1;
  const higherIndex = ps.seeds[lg].indexOf(sr.teams[0]);
  if (higherIndex === 0) {
    ps.leagueWinners[lg] = winner;
    w.season.news.unshift({ date, text: `${LEAGUE_NAMES[lg]}は${name(winner)}が${POSTSEASON_NAMES.league}を制しました` });
    maybeStartChampionship(w, next);
  } else {
    ps.ladder[lg] = higherIndex - 1;
    ps.series.push(makeLeagueSeries(w, lg, higherIndex - 1, winner, next));
  }
}

/** ポストシーズンを最後まで進める */
export function runPostseason(w: World): void {
  if (!w.season.postseason) startPostseason(w);
  for (let i = 0; i < 200 && !w.season.postseason!.finished; i++) advancePostseasonDay(w);
}
