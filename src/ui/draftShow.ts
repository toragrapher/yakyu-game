// ドラフトの演出：1位入札の発表（1球団ずつめくる）、くじ（封筒を選ぶ・開ける）
// 画面全体に重ねて表示する。描き直しで消えないよう、#app の外（body）に置く
import { fullName } from '../core/labels';
import type { DraftEvent, DraftLottery, World } from '../core/season/types';
import { esc, teamChip } from './common';

let showing = false;
/** くじを選ぶ窓を出している間 */
let picking = false;

function overlay(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ds-overlay';
  document.body.appendChild(el);
  return el;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 1位入札の発表 */
async function showBids(w: World, ev: Extract<DraftEvent, { kind: 'bids' }>): Promise<void> {
  const el = overlay();
  const count = new Map<number, number>();
  for (const b of ev.bids) count.set(b.playerId, (count.get(b.playerId) ?? 0) + 1);
  const team = (id: number) => w.teams.find((t) => t.id === id);
  const player = (id: number) => w.draft!.candidates.find((p) => p.id === id) ?? w.players.find((p) => p.id === id);
  // 自球団を最後に発表して盛り上げる
  const bids = [...ev.bids.filter((b) => b.teamId !== w.userTeamId), ...ev.bids.filter((b) => b.teamId === w.userTeamId)];
  let fast = false;
  el.innerHTML = `<div class="ds-panel"><div class="ds-title">1位入札の発表</div><div class="ds-list"></div>
    <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="sub" data-skip>とばす</button><button data-next style="display:none">次へ</button></div></div>`;
  const list = el.querySelector<HTMLElement>('.ds-list')!;
  el.querySelector('[data-skip]')!.addEventListener('click', () => { fast = true; });
  for (const b of bids) {
    const p = player(b.playerId);
    const n = count.get(b.playerId)!;
    const row = document.createElement('div');
    row.className = `ds-bid ${b.teamId === w.userTeamId ? 'ds-mine' : ''}`;
    row.innerHTML = `<span>${teamChip(team(b.teamId))}</span><span class="ds-flip"><b>${esc(p ? fullName(p) : '?')}</b>${n > 1 ? ` <span class="ds-conflict">競合！${n}球団</span>` : ''}</span>`;
    list.appendChild(row);
    if (!fast) await wait(b.teamId === w.userTeamId ? 900 : 380);
  }
  const next = el.querySelector<HTMLButtonElement>('[data-next]')!;
  el.querySelector<HTMLElement>('[data-skip]')!.style.display = 'none';
  next.style.display = '';
  await new Promise<void>((r) => next.addEventListener('click', () => r()));
  el.remove();
}

function envelopeHtml(w: World, idx: number, owner: number | undefined, opened: boolean, winning: boolean, clickable: boolean): string {
  const t = owner != null ? w.teams.find((x) => x.id === owner) : undefined;
  return `<div class="ds-env-wrap">
    <div class="ds-env ${opened ? 'ds-open' : ''} ${opened && winning ? 'ds-win' : ''} ${clickable ? 'ds-pick' : ''} ${owner === w.userTeamId ? 'ds-mine' : ''}" data-env="${idx}">
      <div class="ds-env-front">くじ</div>
      <div class="ds-env-back">${winning ? '交渉権<br>確定' : '✕'}</div>
    </div>
    <div class="ds-env-owner">${t ? teamChip(t) : '<span class="muted small">まだ</span>'}</div>
  </div>`;
}

/** くじの結果（封筒を開ける） */
async function showLottery(w: World, ev: Extract<DraftEvent, { kind: 'lottery' }>): Promise<void> {
  const el = overlay();
  const p = w.draft!.candidates.find((x) => x.id === ev.playerId) ?? w.players.find((x) => x.id === ev.playerId);
  const owners = (i: number) => Number(Object.entries(ev.choices).find(([, e]) => e === i)?.[0]);
  const n = ev.teams.length;
  const render = (opened: boolean) => `<div class="ds-panel"><div class="ds-title">抽選：${esc(p ? fullName(p) : '?')}（${n}球団）</div>
    <div class="ds-envs">${Array.from({ length: n }, (_, i) => envelopeHtml(w, i, owners(i), opened, i === ev.winning, false)).join('')}</div>
    <div class="ds-result">${opened ? (ev.user ? (ev.winnerId === w.userTeamId ? '<span class="win">交渉権を獲得しました！</span>' : '<span class="lose">残念…外れました</span>') : `${esc(w.teams.find((t) => t.id === ev.winnerId)!.name)}が交渉権を獲得`) : '開封します…'}</div>
    <div class="row" style="justify-content:flex-end;margin-top:8px"><button data-next ${opened ? '' : 'style="display:none"'}>次へ</button></div></div>`;
  el.innerHTML = render(false);
  await wait(ev.user ? 900 : 500);
  el.innerHTML = render(true);
  await new Promise<void>((r) => el.querySelector('[data-next]')!.addEventListener('click', () => r()));
  el.remove();
}

/** 自球団がくじを選ぶ */
function pickLottery(w: World, lot: DraftLottery, onPick: (i: number) => void): void {
  picking = true;
  const el = overlay();
  const p = w.draft!.candidates.find((x) => x.id === lot.playerId);
  const owners = (i: number) => {
    const e = Object.entries(lot.choices).find(([, v]) => v === i);
    return e ? Number(e[0]) : undefined;
  };
  el.innerHTML = `<div class="ds-panel"><div class="ds-title">抽選：${esc(p ? fullName(p) : '?')}（${lot.teams.length}球団）</div>
    <p class="small">くじを1つ選んでください。当たりは1枚です。</p>
    <div class="ds-envs">${Array.from({ length: lot.teams.length }, (_, i) => envelopeHtml(w, i, owners(i), false, false, owners(i) == null)).join('')}</div>
    <p class="muted small">くじを選ぶ順：${lot.teams.map((t) => esc(w.teams.find((x) => x.id === t)!.shortName)).join(' → ')}</p></div>`;
  el.querySelectorAll<HTMLElement>('.ds-pick').forEach((env) => env.addEventListener('click', async () => {
    env.classList.add('ds-chosen');
    await wait(400);
    el.remove();
    picking = false;
    onPick(Number(env.dataset.env));
  }));
}

/**
 * たまった出来事を順に見せ、自球団のくじがあれば選ばせる。
 * drawLottery を呼んだら refresh で再び呼ばれ、結果の演出に進む
 */
export async function runDraftShow(w: World, events: DraftEvent[], lottery: DraftLottery | null | undefined, onPick: (i: number) => void, onDone: () => void): Promise<void> {
  if (showing || picking) return;
  showing = true;
  try {
    for (const ev of events) {
      if (ev.kind === 'bids') await showBids(w, ev);
      else await showLottery(w, ev);
    }
  } finally {
    showing = false;
  }
  if (lottery) pickLottery(w, lottery, onPick);
  else if (events.length) onDone();
}
