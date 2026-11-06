// 開発用の画面（第1段階）：選手の生成と1試合のシミュレーションを確かめる
import { LEAGUE_NAMES } from '../config/league';
import { generateAiTeams } from '../core/generate/team';
import { ORDER_FIT_LABEL, handLabel, playerTag, salaryLabel } from '../core/labels';
import { NameRegistry } from '../core/names';
import { overall, rankOf } from '../core/ratings';
import { Rng } from '../core/rng';
import { simulateGame } from '../core/sim/game';
import { buildGameTeam } from '../core/sim/lineup';
import type { GameResult, GameTeam } from '../core/sim/types';
import type { Player, Team } from '../core/types';
import { renderGameResult } from './gameView';
import { renderSchedule, renderScheduleSettings } from './scheduleView';
import { makeSchedule } from '../core/schedule/schedule';
import type { LeagueConfig, Schedule } from '../core/types';
import { DEFAULT_INTERLEAGUE_GAMES, DEFAULT_INTERLEAGUE_MODE, DEFAULT_TEAM_COUNTS } from '../config/league';

let app: HTMLElement;

let teams: Team[] = [];
let players: Player[] = [];
let selectedTeam = 1;
let seed = 12345;
let tab: 'players' | 'game' = 'players';
let showSchedule = false;
let scConfig: LeagueConfig = {
  teamCounts: [DEFAULT_TEAM_COUNTS[0], DEFAULT_TEAM_COUNTS[1]],
  games: null,
  interleague: { mode: DEFAULT_INTERLEAGUE_MODE, games: DEFAULT_INTERLEAGUE_GAMES },
  dh: [true, true],
  postseason: { teams: [3, 3], advantage: true },
};
let scTeams: Team[] = [];
let schedule: Schedule | null = null;
let scSelected = 1;

function buildSchedule(): void {
  const rng = new Rng(seed);
  scTeams = generateAiTeams(rng, new NameRegistry(), scConfig.teamCounts).teams;
  schedule = makeSchedule(rng, scTeams, scConfig, 2027);
  if (!scTeams.some((t) => t.id === scSelected)) scSelected = scTeams[0].id;
}
let awayId = 1;
let homeId = 2;
let gameCount = 0;
let lastGame: { result: GameResult; away: GameTeam; home: GameTeam } | null = null;

/** 1試合を行う。先発は上位6人の先発投手からランダム */
function playGame(): void {
  const rng = new Rng(seed * 1000 + ++gameCount);
  const make = (id: number) => {
    const team = teams.find((t) => t.id === id)!;
    const roster = players.filter((p) => p.teamId === id && p.contract === 'roster');
    const sps = roster.filter((p) => p.role === 'SP').sort((a, b) => overall(b) - overall(a)).slice(0, 6);
    return buildGameTeam(team, roster, { dh: true, starter: rng.pick(sps) });
  };
  const away = make(awayId);
  const home = make(homeId);
  const result = simulateGame(rng, away, home, { dh: true, month: rng.int(4, 9), night: true });
  lastGame = { result, away, home };
}

function gameSection(): string {
  const opt = (sel: number) => teams.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  return `
    <div class="card">
      <div class="row"><label>ビジター <select id="away">${opt(awayId)}</select></label></div>
      <div class="row" style="margin-top:8px"><label>ホーム　 <select id="home">${opt(homeId)}</select></label></div>
      <div class="row" style="margin-top:8px"><button id="play">1試合</button><span class="muted">${gameCount}試合目</span></div>
    </div>
    ${lastGame ? renderGameResult(lastGame.result, lastGame.away, lastGame.home) : ''}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const r = (v: number) => `<span class="rank rank-${rankOf(v)}">${rankOf(v)}</span>`;

function abilities(p: Player): string {
  if (p.pitch) {
    const a = p.pitch;
    return `速球${r(a.velocity)} 制球${r(a.control)} 変化${r(a.breaking)} 体力${r(a.stamina)}`;
  }
  const b = p.bat;
  return `巧打${r(b.contact)} 長打${r(b.power)} 走塁${r(b.speed)} 守備${r(b.defense)}`;
}

function playerItem(p: Player): string {
  return `<li>
    <div class="name">${esc(playerTag(p))}${p.contract === 'ikusei' ? ' <span class="muted">育成</span>' : ''}</div>
    <div class="abil">${abilities(p)}</div>
    <div class="abil">${p.age}歳 ${handLabel(p)} ${esc(p.birthPref)} ${p.mainPos === 'P' ? '' : ORDER_FIT_LABEL[p.orderFit]} 年俸${salaryLabel(p.salary)}</div>
  </li>`;
}

function render(): void {
  const team = teams.find((t) => t.id === selectedTeam);
  const mine = players.filter((p) => p.teamId === selectedTeam).sort((a, b) => overall(b) - overall(a));
  const pitchers = mine.filter((p) => p.mainPos === 'P');
  const batters = mine.filter((p) => p.mainPos !== 'P');
  const payroll = mine.filter((p) => p.contract === 'roster').reduce((s, p) => s + p.salary, 0);

  app.innerHTML = `
    <h1>開発用の確認</h1>
    <div class="card">
      <div class="row">
        <label>シード番号 <input id="seed" type="number" inputmode="numeric" value="${seed}" style="width:9em"></label>
        <button id="gen">選手を生成</button>
      </div>
      <p class="muted">同じシード番号なら、何度押しても同じ選手が出ます。全${players.length}人・同名なし。</p>
    </div>
    ${teams.length ? `
    <div class="tabs"><button class="${!showSchedule && tab === 'players' ? '' : 'sub'}" data-tab="players">選手一覧</button><button class="${!showSchedule && tab === 'game' ? '' : 'sub'}" data-tab="game">1試合</button><button class="${showSchedule ? '' : 'sub'}" data-tab="schedule">日程</button></div>
    ` : ''}
    ${showSchedule ? renderScheduleSettings(scConfig) + (schedule ? renderSchedule(schedule, scTeams, scSelected) : '') : ''}
    ${teams.length && !showSchedule && tab === 'game' ? gameSection() : ''}
    ${teams.length && !showSchedule && tab === 'players' ? `
    <div class="teamtabs">${teams.map((t) => `<button class="${t.id === selectedTeam ? '' : 'sub'}" data-team="${t.id}">${esc(t.shortName)}</button>`).join('')}</div>
    <div class="card">
      <div class="name" style="color:${team!.colorMain}">${esc(team!.name)}</div>
      <div class="muted">${LEAGUE_NAMES[team!.league]}｜本拠地 ${esc(team!.homePref)}｜${esc(team!.stadium.name)}｜支配下年俸総額 ${salaryLabel(payroll)}</div>
    </div>
    <h2>投手（${pitchers.length}人）</h2>
    <div class="card"><ul class="list">${pitchers.map(playerItem).join('')}</ul></div>
    <h2>野手（${batters.length}人）</h2>
    <div class="card"><ul class="list">${batters.map(playerItem).join('')}</ul></div>
    ` : ''}
  `;

  document.getElementById('gen')!.addEventListener('click', () => {
    seed = Number((document.getElementById('seed') as HTMLInputElement).value) || 0;
    generate();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.tab === 'schedule') showSchedule = true;
      else {
        showSchedule = false;
        tab = b.dataset.tab as typeof tab;
      }
      render();
    }),
  );
  document.getElementById('away')?.addEventListener('change', (e) => (awayId = Number((e.target as HTMLSelectElement).value)));
  document.getElementById('home')?.addEventListener('change', (e) => (homeId = Number((e.target as HTMLSelectElement).value)));
  document.getElementById('play')?.addEventListener('click', () => {
    if (awayId === homeId) {
      alert('ビジターとホームは別の球団を選んでください');
      return;
    }
    playGame();
    render();
  });
  document.getElementById('sc-make')?.addEventListener('click', () => {
    const num = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value);
    const gamesText = (document.getElementById('sc-games') as HTMLInputElement).value.trim();
    scConfig = {
      ...scConfig,
      teamCounts: [num('sc-n0'), num('sc-n1')],
      games: gamesText === '' ? null : Math.max(20, Math.min(200, Number(gamesText))),
      interleague: { mode: (document.getElementById('sc-mode') as HTMLSelectElement).value as LeagueConfig['interleague']['mode'], games: Math.max(0, num('sc-inter')) },
    };
    buildSchedule();
    render();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-sc-team]').forEach((b) =>
    b.addEventListener('click', () => {
      scSelected = Number(b.dataset.scTeam);
      render();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-team]').forEach((b) =>
    b.addEventListener('click', () => {
      selectedTeam = Number(b.dataset.team);
      render();
      window.scrollTo(0, 0);
    }),
  );
}

function generate(): void {
  const result = generateAiTeams(new Rng(seed), new NameRegistry(), [6, 6]);
  teams = result.teams;
  players = result.players;
  gameCount = 0;
  lastGame = null;
  if (!teams.some((t) => t.id === selectedTeam)) selectedTeam = teams[0].id;
  render();
}

/** 開発用画面を表示する */
export function mountDev(el: HTMLElement): void {
  app = el;
  if (teams.length === 0) generate();
  else render();
}
