// ロッカールーム：野手・投手の一軍（左）と二軍（右）を並べ、長押しで動かすか、押して選んで入れ替える。
// 入れ替えは仮の状態で、「確定」を押すまで反映しない。「リセット」で最後に確定した状態に戻す。
import { FIRST_TEAM_SIZE } from '../config/league';
import { todayOf } from '../core/draft';
import { fullName, POS_LABEL, ROLE_LABEL } from '../core/labels';
import {
  benchOf, commitLocker, farmOf, lockerProblem, openLocker, reliefOf, resetToAuto, setLineupPos, swapSlots,
  type LockerState, type Slot,
} from '../core/locker';
import { overall } from '../core/ratings';
import { avg, era, holdPoints, ipLabel, ops, rate3 } from '../core/season/stats';
import type { LineupPos } from '../core/sim/types';
import type { OffenseTactic, PitchingTactic, Player } from '../core/types';
import { app } from './app';
import { abilityLine, conditionIcon, esc, fatigueBar } from './common';
import { attachDnd } from './dnd';

let tab: 'fielders' | 'pitchers' | 'tactics' = 'fielders';
/** 押して選んだ場所（もう一つ押すと入れ替え） */
let selected: string | null = null;
let message = '';

const OFFENSE: [OffenseTactic, string][] = [['normal', '標準'], ['slugging', '打て打て'], ['speed', '機動力重視'], ['small', 'スモールベースボール'], ['defense', '守り勝つ']];
const PITCHING: [PitchingTactic, string][] = [['normal', '標準'], ['quickHook', '継投は早め'], ['longStart', '先発引っ張り']];
const POS_OPTIONS: [LineupPos, string][] = [['C', '捕'], ['1B', '一'], ['2B', '二'], ['3B', '三'], ['SS', '遊'], ['OF', '外'], ['DH', '指']];

function parseSlot(s: string): Slot {
  const [k, v] = s.split(':');
  switch (k) {
    case 'lineup': return { k: 'lineup', i: Number(v) };
    case 'rot': return { k: 'rot', i: Number(v) };
    case 'setup': return { k: 'setup', i: Number(v) };
    case 'closer': return { k: 'closer' };
    case 'bench': return { k: 'bench', id: Number(v) };
    case 'relief': return { k: 'relief', id: Number(v) };
    case 'farm': return { k: 'farm', id: Number(v) };
    default: return { k: 'area', name: v as 'bench' | 'relief' | 'farm' };
  }
}

function locker(): LockerState {
  const w = app.world!;
  if (!app.locker || app.locker.teamId !== w.userTeamId) app.locker = openLocker(w);
  return app.locker;
}

function statShort(p: Player): string {
  const s = app.world!.season.stats.first[p.id];
  if (!s) return '';
  if (p.mainPos === 'P') {
    const t = s.pitch;
    if (!t.g) return '';
    const relief = t.sv || holdPoints(t) ? ` ${t.sv}S ${holdPoints(t)}HP` : '';
    return `${t.g}登板 ${t.w}勝${t.l}敗${relief} 防${era(t).toFixed(2)} ${ipLabel(t.outs)}回`;
  }
  const b = s.bat;
  return b.pa ? `${rate3(avg(b))} ${b.hr}本 ${b.rbi}点 OPS${rate3(ops(b))}` : '';
}

/** 小さなカード（1人1行） */
function card(p: Player, slot: string, extra = '', draggable = true): string {
  const role = p.mainPos === 'P' ? ROLE_LABEL[p.role!].slice(0, 2) : POS_LABEL[p.mainPos];
  return `<div class="lk-card ${selected === slot ? 'lk-sel' : ''} ${p.contract === 'ikusei' ? 'lk-ikusei' : ''}" data-slot="${slot}" ${draggable ? 'data-drag' : ''}>
    ${extra}
    <div class="lk-main"><div class="lk-name">${esc(p.familyName)}<span class="lk-given">${esc(p.givenName.slice(0, 2))}</span></div>
    <div class="lk-sub">${role} <b>${Math.round(overall(p))}</b> ${conditionIcon(p)} ${fatigueBar(p)}</div></div>
  </div>`;
}

function emptySlot(slot: string, label: string): string {
  return `<div class="lk-card lk-empty ${selected === slot ? 'lk-sel' : ''}" data-slot="${slot}"><div class="lk-main muted small">${label}</div></div>`;
}

function dropArea(slot: string, label: string): string {
  return `<div class="lk-area ${selected === slot ? 'lk-sel' : ''}" data-slot="${slot}">${label}</div>`;
}

export function renderLocker(el: HTMLElement): void {
  const w = app.world!;
  const L = locker();
  const pp = (id: number) => w.players.find((p) => p.id === id)!;
  const farm = farmOf(w, L).map(pp);
  const firstPs = L.first.map(pp);
  const problem = lockerProblem(w, L);

  let body = '';
  if (tab === 'tactics') {
    const st = w.season.settings[w.userTeamId];
    body = `<div class="card">
      <label>攻撃の方針<br><select id="off" class="wide">${OFFENSE.map(([v, l]) => `<option value="${v}" ${v === st.tactics.offense ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="muted small">打て打て：長打の高い選手が力を発揮。機動力重視：盗塁が増え、走塁の高い選手が力を発揮。スモール：送りバントが増え、巧打の高い選手が力を発揮。守り勝つ：チームの守備が上がる。</p>
      <label>継投の方針<br><select id="pit" class="wide">${PITCHING.map(([v, l]) => `<option value="${v}" ${v === st.tactics.pitching ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="muted small">方針はすぐに反映されます（確定は不要です）。</p>
    </div>`;
  } else if (tab === 'fielders') {
    const bench = benchOf(w, L).map(pp);
    const farmF = farm.filter((p) => p.mainPos !== 'P');
    body = `<div class="lk-cols">
      <div>
        <div class="lk-head">スタメン ${L.lineupManual ? '' : '<span class="muted">（自動）</span>'}</div>
        ${L.lineup.map((x, i) => {
          const sel = `<span class="lk-order">${i + 1}</span><select class="lk-pos" data-pos="${i}">${POS_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === x.pos ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
          return x.playerId != null ? card(pp(x.playerId), `lineup:${i}`, sel) : emptySlot(`lineup:${i}`, `${i + 1}番 空き`);
        }).join('')}
        <div class="lk-head">控え（${bench.length}人）</div>
        ${bench.map((p) => card(p, `bench:${p.id}`)).join('')}
        ${dropArea('area:bench', 'ここに置くと控えへ')}
      </div>
      <div>
        <div class="lk-head">二軍</div>
        ${farmF.filter((p) => p.contract === 'roster').map((p) => card(p, `farm:${p.id}`)).join('')}
        ${dropArea('area:farm', 'ここに置くと二軍へ')}
        <div class="lk-head muted">育成</div>
        ${farmF.filter((p) => p.contract === 'ikusei').map((p) => card(p, `farm:${p.id}`, '', false)).join('')}
      </div>
    </div>`;
  } else {
    const relief = reliefOf(w, L).map(pp);
    const farmP = farm.filter((p) => p.mainPos === 'P');
    body = `<div class="lk-cols">
      <div>
        <div class="lk-head">先発 ${L.pitchManual ? '' : '<span class="muted">（自動）</span>'}</div>
        ${L.rotation.map((id, i) => (id != null ? card(pp(id), `rot:${i}`, `<span class="lk-order">${i + 1}</span>`) : emptySlot(`rot:${i}`, `先発${i + 1} 空き`))).join('')}
        <div class="lk-head">中継ぎ（${relief.length}人）</div>
        ${relief.map((p) => card(p, `relief:${p.id}`)).join('')}
        ${dropArea('area:relief', 'ここに置くと中継ぎへ')}
        <div class="lk-head">セットアッパー</div>
        ${L.setup.map((id, i) => (id != null ? card(pp(id), `setup:${i}`, `<span class="lk-order">${7 + i}回</span>`) : emptySlot(`setup:${i}`, `${7 + i}回 空き`))).join('')}
        <div class="lk-head">守護神</div>
        ${L.closer != null ? card(pp(L.closer), 'closer') : emptySlot('closer', '空き')}
      </div>
      <div>
        <div class="lk-head">二軍</div>
        ${farmP.filter((p) => p.contract === 'roster').map((p) => card(p, `farm:${p.id}`)).join('')}
        ${dropArea('area:farm', 'ここに置くと二軍へ')}
        <div class="lk-head muted">育成</div>
        ${farmP.filter((p) => p.contract === 'ikusei').map((p) => card(p, `farm:${p.id}`, '', false)).join('')}
      </div>
    </div>`;
  }

  // 選んだ選手の詳しい情報
  let detail = '';
  if (selected && !selected.startsWith('area')) {
    const slot = parseSlot(selected);
    const id = slot.k === 'lineup' ? L.lineup[slot.i].playerId : slot.k === 'rot' ? L.rotation[slot.i] : slot.k === 'setup' ? L.setup[slot.i] : slot.k === 'closer' ? L.closer : 'id' in slot ? slot.id : null;
    if (id != null) {
      const p = pp(id);
      detail = `<div class="card small lk-detail"><b>${esc(fullName(p))}</b> ${p.age}歳 ${p.mainPos === 'P' ? ROLE_LABEL[p.role!] : POS_LABEL[p.mainPos]}<div class="abil">${abilityLine(p)}</div><div>${statShort(p) || '<span class="muted">一軍の成績なし</span>'}</div><div class="muted">入れ替える相手を押すか、長押しして重ねてください。</div></div>`;
    }
  }

  const st = w.season.settings[w.userTeamId];
  el.innerHTML = `
    <h1>ロッカールーム</h1>
    <div class="seg"><button class="${tab === 'fielders' ? 'on' : ''}" data-tab="fielders">野手</button><button class="${tab === 'pitchers' ? 'on' : ''}" data-tab="pitchers">投手</button><button class="${tab === 'tactics' ? 'on' : ''}" data-tab="tactics">方針</button></div>
    ${tab !== 'tactics' ? `
    <div class="card lk-bar">
      <div class="small">一軍 <b>${firstPs.length}</b>/${FIRST_TEAM_SIZE}人（投手${firstPs.filter((p) => p.mainPos === 'P').length}・野手${firstPs.filter((p) => p.mainPos !== 'P').length}）
        ${L.dirty ? '<span class="lose">未確定の変更があります</span>' : '<span class="muted">変更なし</span>'}</div>
      ${message ? `<div class="small lose">${esc(message)}</div>` : ''}
      ${L.dirty && problem ? `<div class="small lose">確定できません：${esc(problem)}</div>` : ''}
      <div class="row" style="margin-top:6px">
        <button id="lk-commit" ${!L.dirty || problem ? 'disabled' : ''}>確定</button>
        <button class="sub" id="lk-reset" ${!L.dirty ? 'disabled' : ''}>リセット</button>
        <button class="sub" id="lk-auto">${tab === 'fielders' ? '打順を自動に' : '投手を自動に'}</button>
      </div>
      <label class="small" style="display:block;margin-top:6px"><input type="checkbox" id="auto-roster" ${st.autoRoster ? 'checked' : ''}> 一軍・二軍の入れ替えを自動で行う（週1回）</label>
    </div>
    ${detail}
    <p class="muted small">長押しして持ち上げ、入れ替えたい選手や枠の上で離します。押して選んでから、相手を押しても入れ替わります。</p>` : ''}
    ${body}`;

  // ---- 操作 ----
  const after = () => app.refresh();
  el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab as typeof tab; selected = null; message = ''; after(); }));
  el.querySelector('#off')?.addEventListener('change', (e) => { st.tactics.offense = (e.target as HTMLSelectElement).value as OffenseTactic; after(); });
  el.querySelector('#pit')?.addEventListener('change', (e) => { st.tactics.pitching = (e.target as HTMLSelectElement).value as PitchingTactic; after(); });
  el.querySelector('#auto-roster')?.addEventListener('change', (e) => { st.autoRoster = (e.target as HTMLInputElement).checked; after(); });
  el.querySelectorAll<HTMLSelectElement>('[data-pos]').forEach((s) => s.addEventListener('change', () => { setLineupPos(L, Number(s.dataset.pos), s.value as LineupPos); after(); }));
  el.querySelector('#lk-commit')?.addEventListener('click', () => {
    const why = commitLocker(w, L, todayOf(w));
    message = why ?? '';
    if (!why) {
      app.locker = openLocker(w);
      selected = null;
    }
    after();
  });
  el.querySelector('#lk-reset')?.addEventListener('click', () => { app.locker = openLocker(w); selected = null; message = ''; after(); });
  el.querySelector('#lk-auto')?.addEventListener('click', () => { resetToAuto(w, L, tab === 'fielders' ? 'lineup' : 'pitching'); message = ''; after(); });

  const doSwap = (a: string, b: string) => {
    const why = swapSlots(w, L, parseSlot(a), parseSlot(b), todayOf(w));
    message = why ?? '';
    selected = null;
    after();
  };
  attachDnd(el, {
    onDrop: doSwap,
    onTap: (slot) => {
      if (selected == null) {
        if (slot.startsWith('area')) return;
        selected = slot;
        message = '';
        after();
      } else if (selected === slot) {
        selected = null;
        after();
      } else doSwap(selected, slot);
    },
  });
  // 空き枠・置き場所は、押して選んだあとの入れ替え先にもなる
  el.querySelectorAll<HTMLElement>('.lk-empty, .lk-area').forEach((x) => x.addEventListener('click', () => {
    if (selected && x.dataset.slot) doSwap(selected, x.dataset.slot);
  }));
}
