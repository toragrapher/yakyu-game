// 補強画面の「契約更改」と「お金」のタブ
import { CONTRACT } from '../config/contract';
import { ROSTER_LIMIT } from '../config/league';
import { availableFunds, payroll } from '../core/finance';
import { fullName, POS_LABEL, ROLE_LABEL } from '../core/labels';
import { minOffer } from '../core/offseason/contract';
import { finishContracts, finishRoster, makeOffer, promoteIkusei, releasePlayer, userRosterCount } from '../core/offseason/offseason';
import { overall } from '../core/ratings';
import { avg, era, holdPoints, ops, rate3 } from '../core/season/stats';
import type { World } from '../core/season/types';
import type { Player } from '../core/types';
import { app } from './app';
import { esc } from './common';
import { moneyLabel } from './money';

/** 提示額の入力（選手ごと。画面を描き直しても残す） */
const offers = new Map<number, number>();

function seasonLine(w: World, p: Player): string {
  const s = w.season.stats.first[p.id];
  if (!s) return '一軍出場なし';
  if (p.mainPos === 'P') {
    const t = s.pitch;
    if (!t.g) return '一軍登板なし';
    return `${t.g}登板 ${t.w}勝${t.l}敗 ${t.sv}S ${holdPoints(t)}HP 防${era(t).toFixed(2)}`;
  }
  const b = s.bat;
  return b.pa ? `${b.g}試合 ${rate3(avg(b))} ${b.hr}本 ${b.rbi}点 OPS${rate3(ops(b))}` : '一軍出場なし';
}

const posOf = (p: Player) => (p.mainPos === 'P' ? ROLE_LABEL[p.role!] : POS_LABEL[p.mainPos]);

export function renderMoneyTab(w: World): string {
  const f = w.finance;
  if (!f) return '<div class="card"><p class="muted">お金の記録がありません。</p></div>';
  const years = [...new Set(f.ledger.map((x) => x.year))].sort((a, b) => b - a);
  return `
    <div class="card">
      <div class="row" style="justify-content:space-between"><span>残高</span><b class="big">${moneyLabel(f.balance)}</b></div>
      <div class="row small" style="justify-content:space-between"><span>選手の年俸総額</span><span>${moneyLabel(payroll(w))}</span></div>
      <div class="row small" style="justify-content:space-between"><span>使える資金（年俸と運営費の見込みを引いた額）</span><b>${moneyLabel(availableFunds(w))}</b></div>
      <p class="muted small">年俸と運営費は年度を締めるときに払います。ドラフトの契約金とキャンプの費用は、そのときに払います。入場料などの収入は第2段階で追加します。</p>
    </div>
    ${years.map((y) => {
      const items = f.ledger.filter((x) => x.year === y);
      const sum = items.reduce((s, x) => s + x.amount, 0);
      return `<h2>${y}年の収支（${moneyLabel(sum)}）</h2><div class="card"><table class="box">
        ${items.map((x) => `<tr><td class="tl small">${esc(x.label)}</td><td class="${x.amount < 0 ? 'lose' : 'win'}" style="text-align:right;white-space:nowrap">${x.amount >= 0 ? '+' : ''}${moneyLabel(x.amount)}</td></tr>`).join('')}
      </table></div>`;
    }).join('')}`;
}

export function renderContractTab(w: World): string {
  const off = w.offseason;
  if (!off) {
    return `<div class="card"><p>契約更改は、ドラフト会議の後に「メイン」で年度を締めてから行います。</p>
      <p class="muted small">今の年俸総額：${moneyLabel(payroll(w))}</p></div>`;
  }
  const funds = availableFunds(w);
  if (off.phase === 'contracts') {
    const talks = Object.values(off.contracts);
    const pending = talks.filter((c) => c.status === 'pending');
    const rows = talks
      .map((c) => ({ c, p: w.players.find((x) => x.id === c.playerId)! }))
      .sort((a, b) => (a.c.status === 'pending' ? 0 : 1) - (b.c.status === 'pending' ? 0 : 1) || b.c.wish - a.c.wish);
    return `
      <div class="card">
        <p><b>契約更改</b>　残り${pending.length}人 / ${talks.length}人</p>
        <p class="small">使える資金：<b>${moneyLabel(funds)}</b></p>
        <p class="muted small">希望額より低い提示は断られることがあります。断られるたびに愛着が下がり、<b>${CONTRACT.maxRefusals}回断られると退団</b>（自由契約）します。減額は1億円以下で25%、1億円超で40%までです。</p>
        <div class="row"><button class="sub" id="ct-all" ${pending.length ? '' : 'disabled'}>残り全員に希望額で提示</button>
        <button id="ct-done" ${pending.length ? 'disabled' : ''}>契約更改を終える</button></div>
      </div>
      <div class="card">${rows.map(({ c, p }) => {
        const val = offers.get(p.id) ?? c.wish;
        const status = c.status === 'agreed' ? `<span class="win">合意 ${moneyLabel(c.salary!)}</span>` : c.status === 'left' ? '<span class="lose">決裂・退団</span>' : c.refused ? `<span class="lose">保留（${c.refused}回）</span>` : '';
        return `<div class="prow" style="flex-wrap:wrap">
          <div class="grow"><b>${esc(fullName(p))}</b> <span class="muted small">${posOf(p)} ${p.age}歳 総合${Math.round(overall(p))}</span> ${status}
            <div class="small muted">${seasonLine(w, p)}</div>
            <div class="small">今 ${moneyLabel(c.current)} → 希望 <b>${moneyLabel(c.wish)}</b></div></div>
          ${c.status === 'pending' ? `<div class="row" style="width:100%;gap:4px;margin-top:4px">
            <input type="number" inputmode="numeric" data-offer="${p.id}" value="${val}" min="${minOffer(c.current)}" step="10" style="width:7em">万円
            <button class="sub" data-adj="${p.id}" data-rate="-0.1">-10%</button>
            <button class="sub" data-adj="${p.id}" data-rate="0">希望額</button>
            <button data-send="${p.id}">提示</button>
          </div>` : ''}
        </div>`;
      }).join('')}</div>`;
  }
  if (off.phase === 'roster') {
    const mine = w.players.filter((p) => p.teamId === w.userTeamId && !p.retired);
    const cnt = userRosterCount(w);
    const draftees = new Set((w.draft?.picks ?? []).filter((x) => x.teamId === w.userTeamId).map((x) => x.playerId));
    const row = (p: Player) => `<div class="prow"><div class="grow"><b>${esc(fullName(p))}</b>${draftees.has(p.id) ? ' <span class="chip" style="background:var(--line)">新人</span>' : ''} <span class="muted small">${posOf(p)} ${p.age}歳 総合${Math.round(overall(p))} 年俸${moneyLabel(p.salary)}</span><div class="small muted">${seasonLine(w, p)}</div></div>
      ${p.contract === 'ikusei' ? `<button class="sub" data-promote="${p.id}">支配下へ</button>` : ''}
      <button class="sub" data-release="${p.id}">自由契約</button></div>`;
    const sorted = (ps: Player[]) => ps.slice().sort((a, b) => overall(a) - overall(b));
    return `
      <div class="card">
        <p><b>戦力の整理</b>　支配下 <b class="${cnt.roster > ROSTER_LIMIT ? 'lose' : ''}">${cnt.roster}</b>/${ROSTER_LIMIT}人・育成 ${cnt.ikusei}人</p>
        <p class="muted small">支配下を${ROSTER_LIMIT}人以内にすると、次（キャンプ）へ進めます。自由契約にした選手は退団します。総合の低い順に並んでいます。</p>
        <button id="rs-done" ${cnt.roster > ROSTER_LIMIT ? 'disabled' : ''}>戦力の整理を終える</button>
      </div>
      <h2>支配下</h2><div class="card">${sorted(mine.filter((p) => p.contract === 'roster')).map(row).join('')}</div>
      <h2>育成</h2><div class="card">${sorted(mine.filter((p) => p.contract === 'ikusei')).map(row).join('')}</div>`;
  }
  return '<div class="card"><p>契約更改と戦力の整理は終わりました。「メイン」でキャンプ地を選んで、翌年の開幕へ進みます。</p></div>';
}

export function bindContractTab(el: HTMLElement, w: World): void {
  const on = (sel: string, ev: string, fn: (x: HTMLElement) => void) => el.querySelectorAll<HTMLElement>(sel).forEach((x) => x.addEventListener(ev, () => fn(x)));
  on('[data-offer]', 'change', (x) => offers.set(Number(x.dataset.offer), Number((x as HTMLInputElement).value)));
  on('[data-adj]', 'click', (b) => {
    const id = Number(b.dataset.adj);
    const c = w.offseason!.contracts[id];
    const rate = Number(b.dataset.rate);
    const cur = offers.get(id) ?? c.wish;
    offers.set(id, rate === 0 ? c.wish : Math.max(minOffer(c.current), Math.round((cur * (1 + rate)) / 10) * 10));
    app.refresh();
  });
  on('[data-send]', 'click', (b) => {
    const id = Number(b.dataset.send);
    const input = el.querySelector<HTMLInputElement>(`[data-offer="${id}"]`);
    const amount = Number(input?.value ?? 0);
    const p = w.players.find((x) => x.id === id)!;
    const r = makeOffer(w, id, amount);
    if ('error' in r) alert(r.error);
    else if (r.result === 'agreed') alert(`${fullName(p)}と${moneyLabel(w.offseason!.contracts[id].salary!)}で合意しました`);
    else if (r.result === 'refused') alert(`${fullName(p)}は納得しませんでした（保留）`);
    else alert(`${fullName(p)}との交渉は決裂し、退団しました`);
    app.refresh();
  });
  on('#ct-all', 'click', () => {
    if (!confirm('残っている全員に希望額で提示しますか？')) return;
    for (const c of Object.values(w.offseason!.contracts)) {
      if (c.status !== 'pending') continue;
      const r = makeOffer(w, c.playerId, c.wish);
      if ('error' in r) {
        alert(r.error);
        break;
      }
    }
    app.refresh();
  });
  on('#ct-done', 'click', () => {
    const why = finishContracts(w);
    if (why) alert(why);
    app.refresh();
  });
  on('[data-release]', 'click', (b) => {
    const p = w.players.find((x) => x.id === Number(b.dataset.release))!;
    if (!confirm(`${fullName(p)}を自由契約にしますか？（退団します）`)) return;
    releasePlayer(w, p.id);
    app.refresh();
  });
  on('[data-promote]', 'click', (b) => {
    const why = promoteIkusei(w, Number(b.dataset.promote));
    if (why) alert(why);
    app.refresh();
  });
  on('#rs-done', 'click', () => {
    const why = finishRoster(w);
    if (why) alert(why);
    else {
      app.screen = 'home';
    }
    app.refresh();
  });
}
