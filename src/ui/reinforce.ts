// 補強の画面：ドラフト候補（シーズン中の視察とドラフト会議）、助っ人外国人とスカウト配置（第2段階）
import { MAX_IKUSEI_PICKS, MAX_REGULAR_PICKS } from '../config/draft';
import {
  available, beginRound1, currentTeam, drawLottery, ensureDraftCandidates, scoutReport, submitRound1, takeDraftEvents, userPass, userPick, visit,
  visitedThisMonth, visitsLeftThisMonth,
} from '../core/draft';
import type { World } from '../core/season/types';
import { fullName, POS_LABEL, ROLE_LABEL } from '../core/labels';
import { rankOf } from '../core/ratings';
import type { DraftState } from '../core/season/types';
import type { Player } from '../core/types';
import { app } from './app';
import { rosterSummary } from './rosterSummary';
import { runDraftShow } from './draftShow';
import { syncFirstYear } from '../core/offseason/offseason';
import { bindContractTab, bindMoneyTab, renderContractTab, renderMoneyTab } from './contracts';
import { availableFunds } from '../core/finance';
import { moneyLabel } from './money';
import { esc, teamChip } from './common';

const CAREER_LABEL = { highSchool: '高校', college: '大学', industrial: '社会人' } as const;
const ABIL_LABEL: Record<string, string> = { contact: '巧', power: '長', speed: '走', defense: '守', velocity: '速', control: '制', breaking: '変', stamina: '体' };

let career: 'all' | 'highSchool' | 'college' | 'industrial' = 'all';
let pos: 'all' | 'P' | 'C' | 'IF' | 'OF' = 'all';
let sortKey: 'pot' | 'now' | 'age' = 'pot';
let shown = 40;
let showAllLog = false;
let tab: 'draft' | 'contract' | 'money' | 'foreign' | 'scout' = 'draft';

/** ほかの画面から、開くタブを指定する */
export function openReinforceTab(t: typeof tab): void {
  tab = t;
}

/** ランクの幅（高い方から。例：「A〜C」。同じなら「B」） */
function rankRange([lo, hi]: [number, number]): string {
  const a = rankOf(hi);
  const b = rankOf(lo);
  return a === b ? a : `${a}〜${b}`;
}

/** 色は幅の一番上のランクに合わせる（本当の値を色で漏らさない） */
function rankRangeBadge(r: [number, number]): string {
  return `<span class="rank rank-${rankOf(r[1])}">${rankRange(r)}</span>`;
}

function candidateRow(w: World, d: DraftState, p: Player, canPick: boolean): string {
  const rep = scoutReport(d, p);
  const v = d.scout[p.id]?.visits ?? 0;
  const posL = p.mainPos === 'P' ? ROLE_LABEL[p.role!] : POS_LABEL[p.mainPos];
  return `<div class="prow">
    <div class="grow">
      <div><b>${esc(fullName(p))}</b> <span class="muted small">${posL}｜${CAREER_LABEL[p.career]} ${p.age}歳｜${esc(p.birthPref)}</span></div>
      <div class="abil">即${rankRangeBadge(rep.now)} 将${rankRangeBadge(rep.pot)}　${rep.abilities.map((a) => `${ABIL_LABEL[a.key]}${rankRangeBadge(a.range)}`).join('')}</div>
      <div class="muted small">視察 ${v}回</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${d.phase === 'scouting' ? `<button class="sub" data-visit="${p.id}" ${visitsLeftThisMonth(w) <= 0 || visitedThisMonth(w, p.id) ? 'disabled' : ''}>${visitedThisMonth(w, p.id) ? '視察済' : '視察'}</button>` : ''}
      ${canPick ? `<button data-pick="${p.id}">指名</button>` : ''}
    </div>
  </div>`;
}

export function renderReinforce(el: HTMLElement): void {
  const w = app.world!;
  const items: [typeof tab, string][] = [['draft', 'ドラフト'], ['contract', '契約更改'], ['money', 'お金'], ['foreign', '助っ人外国人'], ['scout', 'スカウト配置']];
  const tabs = `<h1>補強</h1>
    <div class="teamtabs" style="margin-bottom:10px">${items.map(([k, l]) => `<button class="${tab === k ? '' : 'sub'}" data-tab="${k}">${l}${k === 'contract' && w.offseason && w.offseason.phase !== 'camp' ? '<span class="nav-dot" style="top:2px;right:2px"></span>' : ''}</button>`).join('')}</div>
    ${rosterSummary(w)}`;
  const bindTabs = () => el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab as typeof tab; app.refresh(); }));
  if (tab === 'contract') {
    el.innerHTML = tabs + renderContractTab(w);
    bindTabs();
    bindContractTab(el, w);
    return;
  }
  if (tab === 'money') {
    el.innerHTML = tabs + renderMoneyTab(w);
    bindTabs();
    bindMoneyTab(el, w);
    return;
  }
  if (tab !== 'draft') {
    el.innerHTML = `${tabs}<div class="card"><p>${tab === 'foreign' ? '助っ人外国人の獲得' : '地域ごとのスカウトの配置'}は、第2段階で追加します。</p></div>`;
    bindTabs();
    return;
  }
  renderDraft(el, w, tabs);
}

function renderDraft(el: HTMLElement, w: World, tabs: string): void {
  syncFirstYear(w);
  const d = ensureDraftCandidates(w);
  const me = w.userTeamId;
  const myTurn = (d.phase === 'round1' && d.round1Pending.includes(me) && !d.lottery) || ((d.phase === 'regular' || d.phase === 'ikusei') && currentTeam(d) === me);
  const mine = d.picks.filter((x) => x.teamId === me);

  // ---- 状況の説明 ----
  let status = '';
  if (d.phase === 'scouting') {
    const ready = !!w.season.postseason?.finished || !!d.firstYear;
    status = `<p>候補を見比べ、気になる選手を<b>視察</b>すると、能力の幅が狭まります。視察は<b>1か月に3回まで</b>、同じ選手は同じ月に1回までです（今月の残り${visitsLeftThisMonth(w)}回）。</p>
      ${ready ? '<button id="dr-begin" style="width:100%">ドラフト会議を始める（1位指名へ）</button>' : '<p class="muted small">ドラフト会議はポストシーズンの後に行います。</p>'}`;
  } else if (d.phase === 'round1') {
    const lost = mine.length === 0 && d.log.length > 0;
    status = d.lottery
      ? '<p><b>1位指名</b>：競合しました。くじを引いてください。</p><button id="dr-lottery" style="width:100%">くじを引く</button>'
      : mine.some((x) => x.round === 1)
        ? '<p><b>1位指名</b>：交渉権を獲得しました。ほかの球団の外れ1位を待っています。</p>'
        : `<p><b>1位指名</b>：${lost ? '<span class="lose">抽選に外れました。</span>もう一度、' : ''}入札する選手の「指名」を押してください。全球団が同時に入札し、重なればくじ引きです。</p>`;
  } else if (d.phase === 'regular' || d.phase === 'ikusei') {
    const ik = d.phase === 'ikusei';
    const count = mine.filter((x) => x.ikusei === ik).length;
    status = `<p><b>${ik ? `育成ドラフト ${d.round}巡目` : `${d.round}位指名`}</b>　自球団の番です（${ik ? '育成' : '支配下'} ${count}/${ik ? MAX_IKUSEI_PICKS : MAX_REGULAR_PICKS}人）。</p>
      <button class="sub" id="dr-pass" style="width:100%">${ik ? '育成の指名を終える' : '支配下の指名を終える（育成ドラフトへ）'}</button>`;
  } else {
    status = `<p><b>ドラフト会議が終わりました。</b>指名した選手は入団しました。${d.firstYear ? '次は「メイン」から戦力の整理とキャンプへ進みます。' : '次は「メイン」で年度を締めます。'}</p>
      <button id="dr-home" style="width:100%">メインへ</button>`;
  }

  if (w.finance && d.phase !== 'done') status += `<p class="muted small">使える資金：${moneyLabel(availableFunds(w))}（契約金は指名のときに払います）</p>`;

  // ---- 自球団の指名 ----
  const pickedList = mine.length
    ? `<h2>自球団の指名</h2><div class="card"><table class="box"><tr><th class="tl">順位</th><th class="tl">選手</th><th>契約金</th><th>年俸</th></tr>
      ${mine.map((x) => {
        const p = d.candidates.find((c) => c.id === x.playerId) ?? w.players.find((c) => c.id === x.playerId)!;
        const posL = p.mainPos === 'P' ? ROLE_LABEL[p.role!] : POS_LABEL[p.mainPos];
        return `<tr><td class="tl">${x.ikusei ? '育成' : ''}${x.round}位</td><td class="tl">${esc(fullName(p))} <span class="muted small">${posL}・${CAREER_LABEL[p.career]}</span></td><td>${x.bonus.toLocaleString()}万</td><td>${x.salary.toLocaleString()}万</td></tr>`;
      }).join('')}</table>
      <p class="muted small">契約金の合計 ${mine.reduce((s, x) => s + x.bonus, 0).toLocaleString()}万円（指名のときに残高から払いました）</p></div>`
    : '';

  // ---- 候補一覧 ----
  let list = d.phase === 'done' ? [] : available(d);
  list = list.filter((p) => {
    if (career !== 'all' && p.career !== career) return false;
    if (pos === 'all') return true;
    const g = p.mainPos === 'P' ? 'P' : p.mainPos === 'C' ? 'C' : p.mainPos === 'OF' ? 'OF' : 'IF';
    return g === pos;
  });
  const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
  list.sort((a, b) => {
    if (sortKey === 'age') return a.age - b.age;
    const ra = scoutReport(d, a);
    const rb = scoutReport(d, b);
    return sortKey === 'now' ? mid(rb.now) - mid(ra.now) : mid(rb.pot) - mid(ra.pot);
  });
  const seg = <T extends string>(name: string, cur: T, items: [T, string][]) =>
    `<div class="seg">${items.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-${name}="${k}">${l}</button>`).join('')}</div>`;

  const logs = showAllLog ? d.log : d.log.slice(-8);
  el.innerHTML = `
    ${tabs}
    <h2>${d.year}年 ドラフト会議${d.firstYear ? '（球団設立の年）' : ''}</h2>
    <div class="card">${status}</div>
    ${pickedList}
    ${d.log.length ? `<h2>指名の経過</h2><div class="card small">${logs.map((l) => `<div>${esc(l)}</div>`).join('')}
      ${d.log.length > 8 ? `<button class="sub" id="dr-log" style="margin-top:6px">${showAllLog ? '最近だけ表示' : `すべて表示（${d.log.length}件）`}</button>` : ''}</div>` : ''}
    ${d.phase !== 'done' ? `
    <h2>候補（${list.length}人）</h2>
    <p class="muted small">能力はスカウト報告の幅です（本当の値はこの幅の中）。${d.phase === 'scouting' ? `今月の視察 残り${visitsLeftThisMonth(w)}回。` : ''}</p>
    ${seg('career', career, [['all', '全員'], ['highSchool', '高校'], ['college', '大学'], ['industrial', '社会人']])}
    ${seg('pos', pos, [['all', '全員'], ['P', '投手'], ['C', '捕手'], ['IF', '内野'], ['OF', '外野']])}
    ${seg('sort', sortKey, [['pot', '将来性順'], ['now', '即戦力順'], ['age', '若い順']])}
    <div class="card">${list.slice(0, shown).map((p) => candidateRow(w, d, p, myTurn)).join('') || '<p class="muted">該当する候補はいません</p>'}
      ${list.length > shown ? `<button class="sub" id="dr-more" style="width:100%;margin-top:8px">もっと見る（残り${list.length - shown}人）</button>` : ''}</div>` : ''}
    ${d.phase === 'done' ? `<h2>各球団の1位</h2><div class="card small">${d.picks.filter((x) => x.round === 1 && !x.ikusei).map((x) => {
      const p = w.players.find((c) => c.id === x.playerId)!;
      return `<div>${teamChip(w.teams.find((t) => t.id === x.teamId))} ${esc(fullName(p))}</div>`;
    }).join('')}</div>` : ''}
  `;

  const on = (sel: string, fn: (b: HTMLElement) => void) => el.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
  on('#dr-begin', () => { beginRound1(w); app.refresh(); });
  on('#dr-pass', () => {
    if (!confirm(d.phase === 'ikusei' ? '育成の指名を終えますか？' : '支配下の指名を終えますか？（育成ドラフトに進みます）')) return;
    userPass(w);
    app.refresh();
  });
  on('#dr-home', () => { app.screen = 'home'; app.refresh(); });
  on('[data-tab]', (b) => { tab = b.dataset.tab as typeof tab; app.refresh(); });
  on('#dr-log', () => { showAllLog = !showAllLog; app.refresh(); });
  on('#dr-more', () => { shown += 40; app.refresh(); });
  on('[data-visit]', (b) => { const why = visit(w, Number(b.dataset.visit)); if (why) alert(why); app.refresh(); });
  on('[data-pick]', (b) => {
    const id = Number(b.dataset.pick);
    const p = d.candidates.find((c) => c.id === id)!;
    if (!confirm(`${fullName(p)}を指名しますか？`)) return;
    const why = d.phase === 'round1' ? submitRound1(w, id) : userPick(w, id);
    if (why) alert(why);
    app.refresh();
  });
  on('[data-career]', (b) => { career = b.dataset.career as typeof career; shown = 40; app.refresh(); });
  // 入札の発表とくじの演出
  const startShow = () => {
    const evs = takeDraftEvents(w);
    if (evs.length || d.lottery) {
      void runDraftShow(w, evs, d.lottery, (i) => {
        const why = drawLottery(w, i);
        if (why) alert(why);
        app.refresh();
      }, () => app.refresh());
    }
  };
  on('#dr-lottery', startShow);
  startShow();
  on('[data-pos]', (b) => { pos = b.dataset.pos as typeof pos; shown = 40; app.refresh(); });
  on('[data-sort]', (b) => { sortKey = b.dataset.sort as typeof sortKey; shown = 40; app.refresh(); });
}
