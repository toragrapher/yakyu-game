// 成績の画面：順位表と個人成績を切り替えて見る
import { app } from './app';
import { renderStandings } from './pennant/standings';
import { renderStats } from './pennant/stats';

let view: 'standings' | 'stats' = 'standings';

export function renderRecords(el: HTMLElement): void {
  el.innerHTML = `<div class="seg" style="margin-top:4px"><button class="${view === 'standings' ? 'on' : ''}" data-view="standings">順位表</button><button class="${view === 'stats' ? 'on' : ''}" data-view="stats">個人成績</button></div><div id="records-body"></div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view as typeof view; app.refresh(); }));
  const body = el.querySelector<HTMLElement>('#records-body')!;
  if (view === 'standings') renderStandings(body);
  else renderStats(body);
}
