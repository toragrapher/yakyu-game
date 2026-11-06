// アプリの入口：下のメニューで画面を切り替える
import { app, type ScreenName } from './ui/app';
import { mountDev } from './ui/dev';
import { renderWizard } from './ui/founding/wizard';
import { renderHome } from './ui/pennant/home';
import { renderManage } from './ui/pennant/manage';
import { renderStandings } from './ui/pennant/standings';
import { renderStats } from './ui/pennant/stats';
import './ui/style.css';

const root = document.getElementById('app')!;
root.innerHTML = `<div id="screen"></div><nav class="nav" id="nav"></nav>`;
const screen = document.getElementById('screen')!;
const nav = document.getElementById('nav')!;

const MENU: [ScreenName, string, string][] = [
  ['home', '🏠', 'ホーム'],
  ['standings', '🏆', '順位'],
  ['stats', '📊', '成績'],
  ['manage', '📋', '采配'],
  ['dev', '🔧', '開発'],
];

let lastScreen: ScreenName | null = null;

function refresh(): void {
  const needWorld = app.screen !== 'home' && app.screen !== 'dev' && app.screen !== 'found';
  if (needWorld && !app.world) app.screen = 'home';
  // 球団設立の途中は、下のメニューを隠す
  nav.style.display = app.screen === 'found' ? 'none' : '';
  nav.innerHTML = MENU.map(([k, icon, label]) => `<button class="${app.screen === k ? 'on' : ''}" data-nav="${k}" ${app.busy && k !== app.screen ? 'disabled' : ''}>${icon}<br>${label}</button>`).join('');
  nav.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((b) =>
    b.addEventListener('click', () => {
      app.screen = b.dataset.nav as ScreenName;
      refresh();
    }),
  );
  // 画面を切り替えたときだけ先頭に戻す
  const changed = lastScreen !== app.screen;
  lastScreen = app.screen;
  const y = window.scrollY;
  if (app.screen === 'home') renderHome(screen);
  else if (app.screen === 'standings') renderStandings(screen);
  else if (app.screen === 'stats') renderStats(screen);
  else if (app.screen === 'manage') renderManage(screen);
  else if (app.screen === 'found') renderWizard(screen);
  else mountDev(screen);
  window.scrollTo(0, changed ? 0 : y);
}

app.refresh = refresh;
refresh();
