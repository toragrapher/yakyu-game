// 日程の確認画面（開発用）
import { LEAGUE_NAMES, MAX_TEAMS_PER_LEAGUE, MIN_TEAMS_PER_LEAGUE } from '../config/league';
import { teamSchedule } from '../core/schedule/schedule';
import type { LeagueConfig, Schedule, Team } from '../core/types';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`;
}

export function renderScheduleSettings(cfg: LeagueConfig): string {
  const range = (sel: number) =>
    Array.from({ length: MAX_TEAMS_PER_LEAGUE - MIN_TEAMS_PER_LEAGUE + 1 }, (_, i) => i + MIN_TEAMS_PER_LEAGUE)
      .map((n) => `<option value="${n}" ${n === sel ? 'selected' : ''}>${n}球団</option>`).join('');
  const modes: [LeagueConfig['interleague']['mode'], string][] = [['period', '期間集中型'], ['spread', '分散型'], ['none', 'なし']];
  return `
    <div class="card">
      <div class="row"><label>${LEAGUE_NAMES[0]} <select id="sc-n0">${range(cfg.teamCounts[0])}</select></label></div>
      <div class="row" style="margin-top:8px"><label>${LEAGUE_NAMES[1]} <select id="sc-n1">${range(cfg.teamCounts[1])}</select></label></div>
      <div class="row" style="margin-top:8px"><label>試合数 <input id="sc-games" type="number" inputmode="numeric" placeholder="自動" value="${cfg.games ?? ''}" style="width:6em"></label><span class="muted">空欄＝自動</span></div>
      <div class="row" style="margin-top:8px"><label>交流戦 <select id="sc-mode">${modes.map(([v, l]) => `<option value="${v}" ${v === cfg.interleague.mode ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label><input id="sc-inter" type="number" inputmode="numeric" value="${cfg.interleague.games}" style="width:4.5em">試合（目安）</label></div>
      <div class="row" style="margin-top:8px"><button id="sc-make">日程を作る</button></div>
    </div>`;
}

export function renderSchedule(s: Schedule, teams: Team[], selected: number): string {
  const name = (id: number) => esc(teams.find((t) => t.id === id)?.shortName ?? '?');
  const rows = teams.map((t) => {
    const ts = teamSchedule(s, t.id);
    return `<tr><td class="tl">${esc(t.shortName)}</td><td>${LEAGUE_NAMES[t.league].slice(0, 1)}</td><td>${ts.length}</td><td>${ts.filter((x) => x.home).length}</td><td>${ts.filter((x) => x.interleague).length}</td></tr>`;
  }).join('');
  const mine = teamSchedule(s, selected);
  return `
    <div class="card">
      <p><b>1球団${s.games}試合</b>｜${dateLabel(s.days[0].date)}〜${dateLabel(s.days[s.days.length - 1].date)}（試合のある日 ${s.days.length}日）</p>
      ${s.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}
      <table class="box"><tr><th class="tl">球団</th><th>リーグ</th><th>試合</th><th>ホーム</th><th>交流戦</th></tr>${rows}</table>
    </div>
    <div class="teamtabs">${teams.map((t) => `<button class="${t.id === selected ? '' : 'sub'}" data-sc-team="${t.id}">${esc(t.shortName)}</button>`).join('')}</div>
    <div class="card">
      <table class="box"><tr><th class="tl">日付</th><th class="tl">相手</th><th></th></tr>
      ${mine.map((x) => `<tr><td class="tl">${dateLabel(x.date)}</td><td class="tl">${x.home ? 'vs' : '@'} ${name(x.opponent)}</td><td>${x.home ? 'ホーム' : 'ビジター'}${x.interleague ? '・交流戦' : ''}</td></tr>`).join('')}
      </table>
    </div>`;
}
