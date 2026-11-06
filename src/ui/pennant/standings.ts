// 順位表の画面
import { LEAGUE_NAMES } from '../../config/league';
import { standingsTable } from '../../core/season/standings';
import type { LevelKey } from '../../core/season/types';
import { app } from '../app';
import { esc, teamChip } from '../common';

let level: LevelKey = 'first';

export function renderStandings(el: HTMLElement): void {
  const w = app.world!;
  const tables = ([0, 1] as const).map((lg) => {
    const rows = standingsTable(w, level, lg);
    return `<h2>${LEAGUE_NAMES[lg]}</h2><div class="card scroll"><table class="box">
      <tr><th></th><th class="tl">球団</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>差</th><th>得点</th><th>失点</th></tr>
      ${rows.map((r, i) => {
        const t = w.teams.find((x) => x.id === r.teamId)!;
        return `<tr class="${t.id === w.userTeamId ? 'mine' : ''}"><td>${i + 1}</td><td class="tl">${teamChip(t)} ${esc(t.name)}</td><td>${r.games}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.pct.toFixed(3).replace(/^0/, '')}</td><td>${i === 0 ? '-' : r.gb.toFixed(1)}</td><td>${r.rs}</td><td>${r.ra}</td></tr>`;
      }).join('')}
    </table></div>`;
  }).join('');
  el.innerHTML = `
    <h1>順位表</h1>
    <div class="seg"><button class="${level === 'first' ? 'on' : ''}" data-lv="first">一軍</button><button class="${level === 'farm' ? 'on' : ''}" data-lv="farm">二軍</button></div>
    ${tables}`;
  el.querySelectorAll<HTMLButtonElement>('[data-lv]').forEach((b) =>
    b.addEventListener('click', () => {
      level = b.dataset.lv as LevelKey;
      app.refresh();
    }),
  );
}
