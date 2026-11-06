// アプリの入口：下のメニューで画面を切り替える
import { app, DEV_MODE, type ScreenName } from './ui/app';
import { mountDev } from './ui/dev';
import { renderWizard } from './ui/founding/wizard';
import { detachDnd } from './ui/dnd';
import { renderLocker } from './ui/locker';
import { renderHome } from './ui/pennant/home';
import { renderRecords } from './ui/records';
import { renderReinforce } from './ui/reinforce';
import './ui/style.css';
import { scheduleSave } from './save/autosave';
import { deleteSave, loadWorld } from './save/db';
import { registerServiceWorker } from './pwa';

const root = document.getElementById('app')!;
root.innerHTML = `<div id="screen"></div><nav class="nav" id="nav"></nav>`;
const screen = document.getElementById('screen')!;
const nav = document.getElementById('nav')!;

/** 下のメニューのアイコン（線で描いたSVG） */
const ICONS: Record<string, string> = {
  // 球場（ダイヤモンド）
  home: '<path d="M12 3 21 12 12 21 3 12Z"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3v2M21 12h-2M12 21v-2M3 12h2"/>',
  // 棒グラフ
  records: '<path d="M4 20h16"/><path d="M6.5 20v-6M11 20V8M15.5 20v-9M20 20V5"/>',
  // ユニフォーム
  locker: '<path d="M8 3h8l4 3-2.5 3.5L16 8.5V21H8V8.5L6.5 9.5 4 6Z"/><path d="M10.5 12h3"/>',
  // 人を加える
  reinforce: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5"/><path d="M18 8v6M15 11h6"/>',
  // 工具
  dev: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5L16 12l-4-4Z"/>',
};

const ALL_MENU: [ScreenName, string, string][] = [
  ['home', ICONS.home, 'メイン'],
  ['records', ICONS.records, '成績'],
  ['locker', ICONS.locker, 'ロッカー'],
  ['reinforce', ICONS.reinforce, '補強'],
  ['dev', ICONS.dev, '開発'],
];
// 開発用の画面は、アドレスに ?dev を付けたときだけ出す
const MENU = ALL_MENU.filter(([k]) => k !== 'dev' || DEV_MODE);

let lastScreen: ScreenName | null = null;

function refresh(): void {
  if (app.screen === 'dev' && !DEV_MODE) app.screen = 'home';
  const needWorld = app.screen !== 'home' && app.screen !== 'dev' && app.screen !== 'found';
  if (needWorld && !app.world) app.screen = 'home';
  // 球団設立の途中は、下のメニューを隠す
  nav.style.display = app.screen === 'found' ? 'none' : '';
  nav.innerHTML = MENU.map(([k, icon, label]) => `<button class="${app.screen === k ? 'on' : ''}" data-nav="${k}" ${app.busy && k !== app.screen ? 'disabled' : ''}><svg viewBox="0 0 24 24">${icon}</svg>${label}${k === 'locker' && app.locker?.dirty ? '<span class="nav-dot"></span>' : ''}</button>`).join('');
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
  if (app.screen !== 'locker') detachDnd();
  if (app.screen === 'home') renderHome(screen);
  else if (app.screen === 'records') renderRecords(screen);
  else if (app.screen === 'locker') renderLocker(screen);
  else if (app.screen === 'reinforce') renderReinforce(screen);
  else if (app.screen === 'found') renderWizard(screen);
  else mountDev(screen);
  window.scrollTo(0, changed ? 0 : y);
  // 画面を切り替えたときは、横から少しスライドして出す
  if (changed) {
    screen.classList.remove('screen-in');
    void screen.offsetWidth;
    screen.classList.add('screen-in');
  }
}

app.refresh = () => {
  refresh();
  // 進めている途中（シーズン終了まで など）は、終わってから保存する
  if (!app.busy) scheduleSave(app.world);
};

/** 起動：保存してある続きがあれば読み込む */
async function boot(): Promise<void> {
  screen.innerHTML = '<p class="muted" style="padding:24px">読み込み中…</p>';
  try {
    const rec = await loadWorld();
    if (rec) app.world = rec.world;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (confirm(`セーブデータを読み込めませんでした（${msg}）。\nセーブを消して最初から始めますか？`)) await deleteSave();
  }
  app.refresh();
}
void boot();

registerServiceWorker();
