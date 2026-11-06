// 開発用の画面（第1段階のステップ1）：選手の生成を確かめる
import { LEAGUE_NAMES } from './config/league';
import { generateAiTeams } from './core/generate/team';
import { ORDER_FIT_LABEL, handLabel, playerTag, salaryLabel } from './core/labels';
import { NameRegistry } from './core/names';
import { overall, rankOf } from './core/ratings';
import { Rng } from './core/rng';
import type { Player, Team } from './core/types';
import './ui/style.css';

const app = document.getElementById('app')!;

let teams: Team[] = [];
let players: Player[] = [];
let selectedTeam = 1;
let seed = 12345;

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
    <h1>選手生成の確認（開発用）</h1>
    <div class="card">
      <div class="row">
        <label>シード番号 <input id="seed" type="number" inputmode="numeric" value="${seed}" style="width:9em"></label>
        <button id="gen">選手を生成</button>
      </div>
      <p class="muted">同じシード番号なら、何度押しても同じ選手が出ます。全${players.length}人・同名なし。</p>
    </div>
    ${teams.length ? `
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
  if (!teams.some((t) => t.id === selectedTeam)) selectedTeam = teams[0].id;
  render();
}

render();
