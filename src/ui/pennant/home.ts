// ホーム画面：自球団の今の様子、次の試合、日送りのボタン、直近の試合、順位、成績上位、選手の様子
import { DEFAULT_INTERLEAGUE_GAMES, DEFAULT_INTERLEAGUE_MODE, DEFAULT_TEAM_COUNTS, LEAGUE_NAMES } from '../../config/league';
import { advanceDay, createWorld, currentDate } from '../../core/season/advance';
import { dateLabel, daysBetween } from '../../core/season/dates';
import { levelPlayers } from '../../core/season/gameTeam';
import { rankOfTeam, standingsTable } from '../../core/season/standings';
import { era } from '../../core/season/stats';
import { firstTeamLogs, probableStarter, streak, teamLeaders } from '../../core/season/teamSummary';
import type { World } from '../../core/season/types';
import { fullName } from '../../core/labels';
import { TIRED_NOTICE } from '../../config/season';
import { teamSchedule } from '../../core/schedule/schedule';
import type { LeagueConfig, Player } from '../../core/types';
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

/** 結果の記号 */
const mark = (r: 'W' | 'L' | 'T') => (r === 'W' ? '○' : r === 'L' ? '●' : '△');

function pitcherLine(w: World, p: Player | null): string {
  if (!p) return '未定';
  const s = w.season.stats.first[p.id]?.pitch;
  const rec = s && s.g ? ` <span class="muted small">${s.w}勝${s.l}敗 防${era(s).toFixed(2)}</span>` : '';
  return `${esc(fullName(p))}${rec}`;
}

export function renderHome(el: HTMLElement): void {
  const w = app.world;
  if (!w) return renderStart(el);
  const me = w.teams.find((t) => t.id === w.userTeamId)!;
  const st = w.season.standings.first[me.id];
  const farm = w.season.standings.farm[me.id];
  const date = currentDate(w);
  const sched = teamSchedule(w.season.schedule, me.id);
  const next = w.season.finished ? undefined : sched.find((x) => x.date >= date);
  const opp = next ? w.teams.find((t) => t.id === next.opponent) : undefined;
  const logs = firstTeamLogs(w);
  const last10 = logs.slice(0, 10);
  const sk = streak(w);
  const table = standingsTable(w, 'first', me.league);
  const myRow = table.findIndex((r) => r.teamId === me.id);
  const gb = table[myRow].gb;
  const pct = st.w + st.l > 0 ? (st.w / (st.w + st.l)).toFixed(3).replace(/^0/, '') : '.000';
  const leaders = teamLeaders(w, me.id);
  const first = levelPlayers(w, me.id, 'first');
  const hot = first.filter((p) => p.condition === 5);
  const cold = first.filter((p) => p.condition === 1);
  const tired = first.filter((p) => p.fatigue >= TIRED_NOTICE);
  const lg = app.lastGame;
  const lastLog = logs[0];

  // 次の試合の予告先発
  let probable = '';
  if (next && opp) {
    const homeTeam = next.home ? me : opp;
    const mineP = probableStarter(w, me.id, next.date);
    const oppP = probableStarter(w, opp.id, next.date);
    probable = `
      <div class="vs">
        <div class="vs-team">${logoSvg(me.logo, 40)}<b>${esc(me.shortName)}</b></div>
        <div class="vs-mid">${next.home ? 'ホーム' : 'ビジター'}<br><span class="muted small">${esc(homeTeam.stadium.name)}</span></div>
        <div class="vs-team">${logoSvg(opp.logo, 40)}<b>${esc(opp.shortName)}</b></div>
      </div>
      <div class="small" style="margin-top:6px">予告先発　${esc(me.shortName)}：${pitcherLine(w, mineP)}<br>　　　　　${esc(opp.shortName)}：${pitcherLine(w, oppP)}</div>`;
  }

  el.innerHTML = `
    <div class="hero" style="--tc:${me.colorMain};--ts:${me.colorSub}">
      <div class="row" style="gap:12px;align-items:center">
        ${logoSvg(me.logo, 60)}
        <div style="min-width:0">
          <div class="hero-date">${w.season.year}年 ${w.season.finished ? 'レギュラーシーズン終了' : dateLabel(date)}</div>
          <div class="hero-name">${esc(me.name)}</div>
        </div>
      </div>
      <div class="hero-stats">
        <div><div class="hero-big">${myRow + 1}<small>位</small></div><div class="hero-sub">${LEAGUE_NAMES[me.league].replace('リーグ', '')}${myRow === 0 ? (table[1] ? `・2位と${table[1].gb.toFixed(1)}差` : '') : `・首位と${gb.toFixed(1)}差`}</div></div>
        <div><div class="hero-big">${st.w}-${st.l}${st.t ? `-${st.t}` : ''}</div><div class="hero-sub">勝率${pct}</div></div>
        <div><div class="hero-big">${sk ? `${sk.count}<small>${sk.kind === 'W' ? '連勝' : '連敗'}</small>` : '-'}</div><div class="hero-sub">二軍 ${rankOfTeam(w, 'farm', me.id)}位 ${farm.w}-${farm.l}</div></div>
      </div>
      ${last10.length ? `<div class="last10">${last10.slice().reverse().map((g) => `<span class="m-${g.result}">${mark(g.result)}</span>`).join('')}<span class="hero-sub">最近${last10.length}試合 ${last10.filter((g) => g.result === 'W').length}勝${last10.filter((g) => g.result === 'L').length}敗</span></div>` : ''}
    </div>

    <div class="card">
      ${next && opp ? `<div class="row" style="justify-content:space-between"><b>次の試合　${dateLabel(next.date)}</b>${next.interleague ? '<span class="chip" style="background:var(--line)">交流戦</span>' : ''}</div>${probable}` : w.season.finished ? '<p>レギュラーシーズンが終わりました。ポストシーズンはステップ7で作ります。</p>' : ''}
      ${app.busy ? `<div class="progress" style="margin-top:10px"><span style="width:${Math.round(app.progress * 100)}%"></span></div><p class="muted">進めています…</p>` : ''}
      ${w.season.finished ? '' : `
      <div class="btns" style="margin-top:10px">
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

    ${lastLog ? `
    <h2>直近の試合</h2>
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div><span class="big ${lastLog.result === 'W' ? 'win' : lastLog.result === 'L' ? 'lose' : ''}">${mark(lastLog.result)} ${lastLog.runsFor}-${lastLog.runsAgainst}</span>
        <span class="small">${lastLog.home ? 'vs' : '@'} ${teamChip(w.teams.find((t) => t.id === lastLog.opponentId))}</span></div>
        <span class="muted small">${dateLabel(lastLog.date)}</span>
      </div>
      <p class="small">${[lastLog.win ? `勝 ${esc(lastLog.win)}` : '', lastLog.loss ? `負 ${esc(lastLog.loss)}` : '', lastLog.save ? `S ${esc(lastLog.save)}` : ''].filter(Boolean).join('　')}</p>
      ${lastLog.summary.map((t) => `<p class="small">${esc(t)}</p>`).join('')}
      ${lg && lg.result.awayId + lg.result.homeId === me.id + lastLog.opponentId ? `<details><summary class="small">スコアと成績を見る</summary>${renderGameResult(lg.result, lg.away, lg.home)}</details>` : ''}
    </div>` : ''}

    <h2>${LEAGUE_NAMES[me.league]}</h2>
    <div class="card"><table class="box">
      <tr><th></th><th class="tl">球団</th><th>勝</th><th>敗</th><th>分</th><th>差</th></tr>
      ${table.map((r, i) => {
        const t = w.teams.find((x) => x.id === r.teamId)!;
        return `<tr class="${t.id === me.id ? 'mine' : ''}"><td>${i + 1}</td><td class="tl">${teamChip(t)} ${esc(t.name)}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${i === 0 ? '-' : r.gb.toFixed(1)}</td></tr>`;
      }).join('')}
    </table></div>

    ${leaders.length ? `<h2>チームの成績上位</h2>
    <div class="tiles">${leaders.map((l) => `<div class="tile"><div class="muted small">${l.label}</div><div class="tile-v">${l.value}</div><div class="small">${esc(fullName(l.player))}</div></div>`).join('')}</div>` : ''}

    ${hot.length || cold.length || tired.length ? `<h2>選手の様子</h2><div class="card small">
      ${hot.length ? `<p><span class="cond cond-5">⬆ 絶好調</span>　${hot.map((p) => esc(fullName(p))).join('、')}</p>` : ''}
      ${cold.length ? `<p><span class="cond cond-1">⬇ 絶不調</span>　${cold.map((p) => esc(fullName(p))).join('、')}</p>` : ''}
      ${tired.length ? `<p><span class="lose">疲れ気味</span>　${tired.map((p) => esc(fullName(p))).join('、')}</p>` : ''}
      <p class="muted">打順や一軍・二軍の入れ替えは「采配」で変えられます。</p>
    </div>` : ''}

    ${logs.length > 1 ? `<details class="card"><summary><b>最近の結果（一軍）</b></summary><table class="box">
      ${logs.slice(0, 15).map((g) => {
        const o = w.teams.find((t) => t.id === g.opponentId);
        return `<tr><td class="tl">${dateLabel(g.date)}</td><td class="tl">${g.home ? 'vs' : '@'} ${teamChip(o)}</td><td class="${g.result === 'W' ? 'win' : g.result === 'L' ? 'lose' : ''}">${mark(g.result)} ${g.runsFor}-${g.runsAgainst}</td><td class="tl small">${esc(g.result === 'W' ? (g.win ?? '') : g.result === 'L' ? (g.loss ?? '') : '')}</td></tr>`;
      }).join('')}</table></details>` : ''}

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
