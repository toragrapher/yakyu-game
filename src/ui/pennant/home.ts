// ホーム画面：日付、自球団の成績、日送りのボタン、直近の試合
import { DEFAULT_INTERLEAGUE_GAMES, DEFAULT_INTERLEAGUE_MODE, DEFAULT_TEAM_COUNTS, LEAGUE_NAMES } from '../../config/league';
import { advanceDay, createWorld, currentDate } from '../../core/season/advance';
import { dateLabel, daysBetween } from '../../core/season/dates';
import { rankOfTeam } from '../../core/season/standings';
import { teamSchedule } from '../../core/schedule/schedule';
import type { LeagueConfig } from '../../core/types';
import { app } from '../app';
import { esc, teamChip } from '../common';
import { renderGameResult } from '../gameView';
import { resetWizard } from '../founding/wizard';
import { logoSvg } from '../logo';

function defaultConfig(): LeagueConfig {
  return {
    teamCounts: [DEFAULT_TEAM_COUNTS[0], DEFAULT_TEAM_COUNTS[1]],
    games: null,
    interleague: { mode: DEFAULT_INTERLEAGUE_MODE, games: DEFAULT_INTERLEAGUE_GAMES },
    dh: [true, true],
    postseason: { teams: [3, 3], advantage: true },
  };
}

function renderStart(el: HTMLElement): void {
  el.innerHTML = `
    <h1>球団経営シミュレーション</h1>
    <div class="card">
      <p>新規参入球団のGM兼監督として、球団を設立してペナントを戦います。</p>
      <button id="st-found" style="width:100%">新しく球団をつくる</button>
    </div>
    <div class="card">
      <p class="muted small">開発用：AIが作った球団の1つを自球団にして、すぐ始めます。</p>
      <div class="row"><label>シード番号 <input id="st-seed" type="number" inputmode="numeric" value="${Math.floor(Math.random() * 100000)}" style="width:8em"></label>
      <button class="sub" id="st-go">すぐ始める</button></div>
    </div>`;
  el.querySelector('#st-found')!.addEventListener('click', () => {
    resetWizard();
    app.screen = 'found';
    app.refresh();
  });
  el.querySelector('#st-go')!.addEventListener('click', () => {
    const seed = Number((el.querySelector('#st-seed') as HTMLInputElement).value) || 1;
    app.world = createWorld(seed, defaultConfig(), 2027, 1);
    app.lastGame = null;
    app.refresh();
  });
}

/** 1日進める（自球団の一軍の試合は詳しい結果を残す） */
function stepOneDay(): void {
  const out = advanceDay(app.world!, true);
  if (out?.userGame) app.lastGame = { result: out.userGame.result, away: out.userGame.away, home: out.userGame.home };
}

/** 日数を指定して進める（途中で画面を更新し、固まらないようにする） */
function run(days: number | 'end'): void {
  const w = app.world!;
  if (app.busy || w.season.finished) return;
  const startDate = currentDate(w);
  app.busy = true;
  const total = days === 'end' ? w.season.schedule.days.length - w.season.dayIndex : days;
  let done = 0;
  const tick = () => {
    const until = performance.now() + 30;
    while (performance.now() < until && !w.season.finished) {
      if (days !== 'end' && daysBetween(startDate, currentDate(w)) >= days) break;
      stepOneDay();
      done++;
    }
    app.progress = days === 'end' ? done / Math.max(1, total) : 0;
    const finished = w.season.finished || (days !== 'end' && daysBetween(startDate, currentDate(w)) >= days);
    if (finished) {
      app.busy = false;
      app.progress = 0;
    }
    app.refresh();
    if (!finished) setTimeout(tick, 0);
  };
  tick();
}

export function renderHome(el: HTMLElement): void {
  const w = app.world;
  if (!w) return renderStart(el);
  const me = w.teams.find((t) => t.id === w.userTeamId)!;
  const st = w.season.standings.first[me.id];
  const farm = w.season.standings.farm[me.id];
  const date = currentDate(w);
  const sched = teamSchedule(w.season.schedule, me.id);
  const next = sched.find((x) => x.date >= date && !w.season.finished);
  const opp = next ? w.teams.find((t) => t.id === next.opponent) : undefined;
  const logs = w.season.recentGames.filter((g) => g.level === 'first').slice(0, 10);

  el.innerHTML = `
    <div class="card" style="border-left:6px solid ${me.colorMain}">
      <div class="row" style="gap:10px">${logoSvg(me.logo, 48)}<div>
      <div class="muted">${w.season.year}年 ${w.season.finished ? 'レギュラーシーズン終了' : dateLabel(date)}</div>
      <div class="big" style="color:${me.colorMain}">${esc(me.name)}</div></div></div>
      <div>${LEAGUE_NAMES[me.league]} <b>${rankOfTeam(w, 'first', me.id)}位</b>　${st.w}勝${st.l}敗${st.t}分</div>
      <div class="muted small">二軍 ${rankOfTeam(w, 'farm', me.id)}位 ${farm.w}勝${farm.l}敗${farm.t}分</div>
      ${next && opp ? `<p>次の試合：${dateLabel(next.date)} ${next.home ? 'vs' : '@'} ${teamChip(opp)} ${esc(opp.name)}${next.interleague ? '（交流戦）' : ''}</p>` : ''}
      ${app.busy ? `<div class="progress"><span style="width:${Math.round(app.progress * 100)}%"></span></div><p class="muted">進めています…</p>` : ''}
      ${w.season.finished ? '<p>レギュラーシーズンが終わりました。ポストシーズンはステップ7で作ります。</p>' : `
      <div class="btns">
        <button data-run="1" ${app.busy ? 'disabled' : ''}>1日進む</button>
        <button data-run="7" ${app.busy ? 'disabled' : ''}>1週間進む</button>
        <button data-run="end" ${app.busy ? 'disabled' : ''}>シーズン終了まで</button>
      </div>`}
    </div>
    ${w.season.dayIndex === 0 && w.quickStart ? `
    <div class="card">
      <div class="row"><label>自球団（仮） <select id="pick-team">${w.teams.map((t) => `<option value="${t.id}" ${t.id === w.userTeamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div>
      <p class="muted small">開幕前だけ変えられます。</p>
    </div>` : ''}
    ${app.lastGame ? `<h2>直近の試合</h2>${renderGameResult(app.lastGame.result, app.lastGame.away, app.lastGame.home)}` : ''}
    ${logs.length ? `<h2>最近の結果（一軍）</h2><div class="card"><table class="box">
      ${logs.map((g) => {
        const o = w.teams.find((t) => t.id === g.opponentId);
        return `<tr><td class="tl">${dateLabel(g.date)}</td><td class="tl">${g.home ? 'vs' : '@'} ${teamChip(o)}</td><td class="${g.result === 'W' ? 'win' : g.result === 'L' ? 'lose' : ''}">${g.result === 'W' ? '○' : g.result === 'L' ? '●' : '△'} ${g.runsFor}-${g.runsAgainst}</td><td class="tl small">${esc(g.result === 'W' ? (g.win ?? '') : g.result === 'L' ? (g.loss ?? '') : '')}</td></tr>`;
      }).join('')}</table></div>` : ''}
    ${w.season.news.length ? `<h2>お知らせ</h2><div class="card"><ul class="list">${w.season.news.slice(0, 8).map((n) => `<li class="small">${dateLabel(n.date)} ${esc(n.text)}</li>`).join('')}</ul></div>` : ''}
    <div class="card"><button class="sub" id="new-season">最初からやり直す</button></div>
  `;
  el.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((b) =>
    b.addEventListener('click', () => run(b.dataset.run === 'end' ? 'end' : Number(b.dataset.run))),
  );
  el.querySelector('#pick-team')?.addEventListener('change', (e) => {
    const id = Number((e.target as HTMLSelectElement).value);
    for (const t of w.teams) t.isUser = t.id === id;
    w.userTeamId = id;
    app.refresh();
  });
  el.querySelector('#new-season')!.addEventListener('click', () => {
    if (confirm('今のシーズンを捨てて、最初からやり直しますか？')) {
      app.world = null;
      app.lastGame = null;
      app.refresh();
    }
  });
}
