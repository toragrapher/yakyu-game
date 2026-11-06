// 采配の画面：方針、打順、先発ローテ、勝ちパターン、一軍・二軍の入れ替え
import { FIRST_TEAM_SIZE } from '../../config/league';
import { fullName } from '../../core/labels';
import { currentDate } from '../../core/season/advance';
import { levelPlayers, rotationOf } from '../../core/season/gameTeam';
import { lineupProblem } from '../../core/season/lineupCheck';
import { canDemote, canPromote, demote, promote } from '../../core/season/roster';
import { avg, era, ipLabel } from '../../core/season/stats';
import { buildGameTeam } from '../../core/sim/lineup';
import type { LineupPos } from '../../core/sim/types';
import type { OffenseTactic, PitchingTactic, Player } from '../../core/types';
import { app } from '../app';
import { abilityLine, conditionIcon, esc, fatigueBar, posShort } from '../common';

let section: 'tactics' | 'lineup' | 'pitching' | 'roster' = 'lineup';

const OFFENSE: [OffenseTactic, string][] = [['normal', '標準'], ['slugging', '打て打て'], ['speed', '機動力重視'], ['small', 'スモールベースボール'], ['defense', '守り勝つ']];
const PITCHING: [PitchingTactic, string][] = [['normal', '標準'], ['quickHook', '継投は早め'], ['longStart', '先発引っ張り']];
const POS_OPTIONS: [LineupPos, string][] = [['C', '捕'], ['1B', '一'], ['2B', '二'], ['3B', '三'], ['SS', '遊'], ['OF', '外'], ['DH', '指']];

function statShort(p: Player): string {
  const s = app.world!.season.stats.first[p.id];
  if (!s) return '';
  if (p.mainPos === 'P') return s.pitch.g ? `${s.pitch.g}登板 防${era(s.pitch).toFixed(2)} ${ipLabel(s.pitch.outs)}回` : '';
  return s.bat.pa ? `${rate3(avg(s.bat))} ${s.bat.hr}本 ${s.bat.pa}打席` : '';
}
const rate3 = (v: number) => v.toFixed(3).replace(/^0/, '');

function playerInfo(p: Player): string {
  return `<div class="grow"><div><b>${esc(fullName(p))}</b> <span class="muted small">${posShort(p)} ${p.age}歳</span> ${conditionIcon(p)} ${fatigueBar(p)}</div><div class="abil">${abilityLine(p)} <span class="small">${statShort(p)}</span></div></div>`;
}

export function renderManage(el: HTMLElement): void {
  const w = app.world!;
  const me = w.userTeamId;
  const st = w.season.settings[me];
  const first = levelPlayers(w, me, 'first');
  const farm = levelPlayers(w, me, 'farm');
  const regIds = new Set(first.map((p) => p.id));
  const fielders = first.filter((p) => p.mainPos !== 'P');
  const pitchers = first.filter((p) => p.mainPos === 'P');
  const date = currentDate(w);
  let body = '';

  if (section === 'tactics') {
    body = `<div class="card">
      <label>攻撃の方針<br><select id="off" class="wide">${OFFENSE.map(([v, l]) => `<option value="${v}" ${v === st.tactics.offense ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="muted small">打て打て：長打の高い選手が力を発揮。機動力重視：盗塁が増え、走塁の高い選手が力を発揮。スモール：送りバントが増え、巧打の高い選手が力を発揮。守り勝つ：チームの守備が上がる。</p>
      <label>継投の方針<br><select id="pit" class="wide">${PITCHING.map(([v, l]) => `<option value="${v}" ${v === st.tactics.pitching ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>`;
  }

  if (section === 'lineup') {
    if (!st.lineup) {
      const gt = buildGameTeam(w.teams.find((t) => t.id === me)!, [...fielders, ...pitchers], { dh: true });
      body = `<div class="card">
        <p>今は<b>自動</b>で打順を組んでいます（疲れた野手は休ませます）。次の試合の予定：</p>
        ${gt.lineup.map((s, i) => `<div class="prow"><span>${i + 1}</span><span class="chip" style="background:var(--line)">${POS_OPTIONS.find((x) => x[0] === s.pos)?.[1] ?? '投'}</span>${playerInfo(s.player)}</div>`).join('')}
        <div class="row" style="margin-top:8px"><button id="lu-manual">手動で組む</button></div>
      </div>`;
      el.dataset.autoLineup = JSON.stringify(gt.lineup.map((s) => ({ playerId: s.player.id, pos: s.pos })));
    } else {
      const problem = lineupProblem(st.lineup, regIds);
      body = `<div class="card">
        ${problem ? `<p class="lose">この打順は使えません：${esc(problem)}（直すまでは自動で組みます）</p>` : '<p class="muted small">手動の打順です。疲れていても出場します。</p>'}
        ${st.lineup.map((s, i) => `<div class="prow">
          <span>${i + 1}</span>
          <select data-lu-pos="${i}">${POS_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === s.pos ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select data-lu-player="${i}" style="flex:1;min-width:0">${fielders.map((p) => `<option value="${p.id}" ${p.id === s.playerId ? 'selected' : ''}>${esc(fullName(p))}（${posShort(p)}）</option>`).join('')}${regIds.has(s.playerId) ? '' : '<option selected>（二軍の選手）</option>'}</select>
          <button class="sub" data-lu-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="sub" data-lu-down="${i}" ${i === 8 ? 'disabled' : ''}>↓</button>
        </div>`).join('')}
        <div class="row" style="margin-top:8px"><button class="sub" id="lu-auto">自動に戻す</button></div>
      </div>
      <h2>控え野手</h2><div class="card">${fielders.filter((p) => !st.lineup!.some((s) => s.playerId === p.id)).map((p) => `<div class="prow">${playerInfo(p)}</div>`).join('')}</div>`;
    }
  }

  if (section === 'pitching') {
    const rot = rotationOf(w, me, 'first', first);
    const pen = pitchers.filter((p) => !rot.includes(p));
    const opt = (sel: number | null, list: Player[], allowAuto: boolean) =>
      `${allowAuto ? `<option value="" ${sel == null ? 'selected' : ''}>自動</option>` : ''}${list.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(fullName(p))}（${posShort(p)}）</option>`).join('')}`;
    body = `<div class="card">
      <h2 style="margin-top:0">先発ローテーション ${st.rotation ? '' : '<span class="muted small">（自動）</span>'}</h2>
      ${rot.map((p, i) => `<div class="prow"><span>${i + 1}</span>${st.rotation ? `<select data-rot="${i}" style="flex:1;min-width:0">${opt(p.id, pitchers, false)}</select>` : playerInfo(p)}</div>`).join('')}
      <div class="row" style="margin-top:8px">${st.rotation ? '<button class="sub" id="rot-auto">自動に戻す</button>' : '<button id="rot-manual">手動で組む</button>'}</div>
    </div>
    <div class="card">
      <h2 style="margin-top:0">勝ちパターン</h2>
      <label>7回 <select data-setup="0" class="wide">${opt(st.setup?.[0] ?? null, pen, true)}</select></label>
      <label>8回 <select data-setup="1" class="wide">${opt(st.setup?.[1] ?? null, pen, true)}</select></label>
      <label>抑え <select id="closer" class="wide">${opt(st.closer, pen, true)}</select></label>
      <p class="muted small">リードが3点以内のとき、7回・8回・9回に登板します。連投や疲れで投げられない日は、ほかの投手が投げます。</p>
    </div>
    <h2>中継ぎ</h2><div class="card">${pen.map((p) => `<div class="prow">${playerInfo(p)}</div>`).join('')}</div>`;
  }

  if (section === 'roster') {
    const farmRoster = farm.filter((p) => p.contract === 'roster');
    const ikusei = farm.filter((p) => p.contract === 'ikusei');
    const list = (ps: Player[], btn: (p: Player) => string) => ps.map((p) => `<div class="prow">${playerInfo(p)}${btn(p)}</div>`).join('');
    const sortPos = (a: Player, b: Player) => (a.mainPos === 'P' ? 0 : 1) - (b.mainPos === 'P' ? 0 : 1);
    body = `<div class="card">
      <label><input type="checkbox" id="auto-roster" ${st.autoRoster ? 'checked' : ''}> 一軍・二軍の入れ替えを自動で行う（週1回）</label>
      <p class="muted small">二軍に落とした選手は10日間一軍に戻せません。</p>
    </div>
    <h2>一軍（${first.length}/${FIRST_TEAM_SIZE}人：投手${pitchers.length}・野手${fielders.length}）</h2>
    <div class="card">${list(first.slice().sort(sortPos), (p) => `<button class="sub" data-down="${p.id}">二軍へ</button>`)}</div>
    <h2>二軍（支配下 ${farmRoster.length}人）</h2>
    <div class="card">${list(farmRoster.slice().sort(sortPos), (p) => {
      const why = canPromote(w, p, date);
      return why && !why.startsWith('一軍は') ? `<span class="muted small">${esc(why)}</span>` : `<button data-up="${p.id}">一軍へ</button>`;
    })}</div>
    <h2>育成（${ikusei.length}人）</h2>
    <div class="card">${list(ikusei, () => '')}</div>`;
  }

  el.innerHTML = `
    <h1>采配</h1>
    <div class="seg">
      <button class="${section === 'lineup' ? 'on' : ''}" data-sec="lineup">打順</button>
      <button class="${section === 'pitching' ? 'on' : ''}" data-sec="pitching">投手</button>
      <button class="${section === 'tactics' ? 'on' : ''}" data-sec="tactics">方針</button>
      <button class="${section === 'roster' ? 'on' : ''}" data-sec="roster">一軍二軍</button>
    </div>
    ${body}`;

  // ---- 操作 ----
  const on = (sel: string, ev: string, fn: (e: HTMLElement) => void) => el.querySelectorAll<HTMLElement>(sel).forEach((x) => x.addEventListener(ev, () => fn(x)));
  on('[data-sec]', 'click', (b) => { section = b.dataset.sec as typeof section; app.refresh(); });
  on('#off', 'change', (s) => { st.tactics.offense = (s as HTMLSelectElement).value as OffenseTactic; app.refresh(); });
  on('#pit', 'change', (s) => { st.tactics.pitching = (s as HTMLSelectElement).value as PitchingTactic; app.refresh(); });
  on('#lu-manual', 'click', () => { st.lineup = JSON.parse(el.dataset.autoLineup ?? '[]'); app.refresh(); });
  on('#lu-auto', 'click', () => { st.lineup = null; app.refresh(); });
  on('[data-lu-pos]', 'change', (s) => { st.lineup![Number(s.dataset.luPos)].pos = (s as HTMLSelectElement).value as LineupPos; app.refresh(); });
  on('[data-lu-player]', 'change', (s) => {
    const i = Number(s.dataset.luPlayer);
    const id = Number((s as HTMLSelectElement).value);
    // すでに打順にいる選手を選んだら、入れ替える
    const j = st.lineup!.findIndex((x) => x.playerId === id);
    if (j >= 0) st.lineup![j].playerId = st.lineup![i].playerId;
    st.lineup![i].playerId = id;
    app.refresh();
  });
  const swap = (i: number, j: number) => { const l = st.lineup!; [l[i], l[j]] = [l[j], l[i]]; app.refresh(); };
  on('[data-lu-up]', 'click', (b) => swap(Number(b.dataset.luUp), Number(b.dataset.luUp) - 1));
  on('[data-lu-down]', 'click', (b) => swap(Number(b.dataset.luDown), Number(b.dataset.luDown) + 1));
  on('#rot-manual', 'click', () => { st.rotation = rotationOf(w, me, 'first', first).map((p) => p.id); app.refresh(); });
  on('#rot-auto', 'click', () => { st.rotation = null; app.refresh(); });
  on('[data-rot]', 'change', (s) => {
    const i = Number(s.dataset.rot);
    const id = Number((s as HTMLSelectElement).value);
    const j = st.rotation!.indexOf(id);
    if (j >= 0) st.rotation![j] = st.rotation![i];
    st.rotation![i] = id;
    app.refresh();
  });
  on('[data-setup]', 'change', (s) => {
    const i = Number(s.dataset.setup);
    const v = (s as HTMLSelectElement).value;
    const cur = st.setup ? st.setup.slice() : [];
    if (v === '') cur.splice(i, 1);
    else cur[i] = Number(v);
    st.setup = cur.filter((x) => x != null).length ? cur.filter((x) => x != null) : null;
    app.refresh();
  });
  on('#closer', 'change', (s) => { const v = (s as HTMLSelectElement).value; st.closer = v === '' ? null : Number(v); app.refresh(); });
  on('#auto-roster', 'change', (c) => { st.autoRoster = (c as HTMLInputElement).checked; app.refresh(); });
  on('[data-down]', 'click', (b) => {
    const p = w.players.find((x) => x.id === Number(b.dataset.down))!;
    const why = canDemote(w, p);
    if (why) return alert(why);
    demote(w, p, date);
    app.refresh();
  });
  on('[data-up]', 'click', (b) => {
    const p = w.players.find((x) => x.id === Number(b.dataset.up))!;
    const why = canPromote(w, p, date);
    if (why) return alert(why.startsWith('一軍は') ? `${why}。先に誰かを二軍に落としてください。` : why);
    promote(w, p);
    app.refresh();
  });
}
