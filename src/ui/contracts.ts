// 補強画面の「契約更改」と「お金」のタブ
import { CONTRACT } from '../config/contract';
import { OPENING_MIN, ROSTER_LIMIT } from '../config/league';
import { availableFunds, payroll } from '../core/finance';
import { fullName, POS_LABEL, ROLE_LABEL } from '../core/labels';
import { minOffer } from '../core/offseason/contract';
import { demoteToIkusei, finishContracts, finishRoster, makeOffer, promoteIkusei, releasePlayer, userRosterCount } from '../core/offseason/offseason';
import { FAN_PENALTY, SEATS, type SeatKey } from '../config/gate';
import { canChangePrices, defaultPrices, fansOf } from '../core/gate';
import { overall } from '../core/ratings';
import { avg, era, holdPoints, ops, rate3 } from '../core/season/stats';
import type { World } from '../core/season/types';
import type { Player } from '../core/types';
import { app } from './app';
import { abilityLine, esc } from './common';
import { autoFillTryout, openingCounts, signTryout, tryoutCandidates, tryoutOpen, unsignTryout } from '../core/tryout';
import { moneyLabel } from './money';

/** 提示額の入力（選手ごと。画面を描き直しても残す） */
const offers = new Map<number, number>();
/** 合同トライアウトの候補一覧の絞り込みと表示数 */
let toFilter: 'all' | 'P' | 'C' | 'IF' | 'OF' = 'all';
let toShown = 30;

/** 合同トライアウト（初年度の戦力の整理）の部分 */
function jointTryout(w: World): string {
  if (!tryoutOpen(w)) return '';
  const groupOf = (p: Player) => (p.mainPos === 'P' ? 'P' : p.mainPos === 'C' ? 'C' : p.mainPos === 'OF' ? 'OF' : 'IF');
  const list = tryoutCandidates(w).filter((p) => toFilter === 'all' || groupOf(p) === toFilter).sort((a, b) => overall(b) - overall(a));
  const counts = openingCounts(w);
  const filters: [typeof toFilter, string][] = [['all', '全員'], ['P', '投手'], ['C', '捕手'], ['IF', '内野'], ['OF', '外野']];
  return `
    <h2>合同トライアウト</h2>
    <div class="card">
      <p class="small">自由契約の選手から、足りない選手を獲れます（契約金なし。年俸は期末に払います）。戦力の整理を終えると、獲らなかった選手はいなくなります。</p>
      <p class="small"><b>開幕に必要な人数</b>（今／必要）</p>
      <div class="tiles" style="margin-bottom:8px">${counts.map((c) => `<div class="tile"><div class="tile-k">${c.label}</div><div class="tile-v ${c.have < c.need ? 'short' : 'ok'}">${c.have}<small>/${c.need}</small></div></div>`).join('')}</div>
      <p class="muted small">投手・捕手・野手は支配下と育成の合計です。支配下だけでも投手${OPENING_MIN.roster.P}人・捕手${OPENING_MIN.roster.C}人・捕手以外の野手${OPENING_MIN.roster.F}人以上が必要です（一軍の登録のため）。</p>
      <button class="sub" id="to-auto" style="width:100%">足りない分をおまかせで獲る</button>
    </div>
    <div class="teamtabs" style="margin-bottom:8px">${filters.map(([k, l]) => `<button class="${toFilter === k ? '' : 'sub'}" data-to-filter="${k}">${l}</button>`).join('')}</div>
    <div class="card">${list.slice(0, toShown).map((p) => `<div class="prow"><div class="grow"><b>${esc(fullName(p))}</b> <span class="muted small">${posOf(p)} ${p.age}歳 年俸${moneyLabel(p.salary)}</span><div class="abil">${abilityLine(p)}</div></div>
      <div class="to-btns"><button data-to-sign="${p.id}" data-c="roster">支配下で獲る</button><button class="sub" data-to-sign="${p.id}" data-c="ikusei">育成で獲る</button></div></div>`).join('') || '<p class="muted">該当する選手はいません</p>'}
      ${list.length > toShown ? `<button class="sub" id="to-more" style="width:100%;margin-top:8px">もっと見る（残り${list.length - toShown}人）</button>` : ''}</div>`;
}

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

/** 今年のホームゲームの合計と、チケットの値段の設定 */
function gateSection(w: World): string {
  const g = w.season.gate?.[w.userTeamId];
  const prices = w.ticketPrices ?? defaultPrices();
  const editable = canChangePrices(w);
  const fans = fansOf(w, w.userTeamId);
  return `
    <h2>ファンと観客（${w.season.year}年）</h2>
    <div class="card small">
      <div>ファン：コア層 <b>${fans.core.toLocaleString()}人</b>・ライト層 <b>${fans.light.toLocaleString()}人</b></div>
      ${g ? `<div>ホームゲーム ${g.games}試合・平均観客 <b>${Math.round(g.attendance / g.games).toLocaleString()}人</b></div>
      <div>入場料 ${moneyLabel(g.ticket)}・グッズ飲食 ${moneyLabel(g.goods)}・試合運営 −${moneyLabel(g.cost)}（純損益 ${moneyLabel(g.ticket + g.goods - g.cost)}）</div>
      <table class="box" style="margin-top:6px"><tr><th class="tl">席種</th><th>座席数</th><th>平均の入り</th></tr>
      ${SEATS.map((x) => `<tr><td class="tl">${x.name}</td><td>${x.capacity.toLocaleString()}</td><td>${Math.round(g.seats[x.key] / g.games).toLocaleString()}（${Math.round((g.seats[x.key] / g.games / x.capacity) * 100)}%）</td></tr>`).join('')}</table>` : '<div class="muted">まだホームゲームがありません。</div>'}
    </div>
    <h2>チケットの値段</h2>
    <div class="card small">
      <p class="muted">値段を変えられるのは<b>年に1回、シーズンが始まる前だけ</b>です。値上げすると売上は増えますが、ライト層が来なくなり、数年後のコア層とグッズ収入が減ることがあります。</p>
      <table class="box"><tr><th class="tl">席種</th><th>値段（円）</th></tr>
      ${SEATS.map((x) => `<tr><td class="tl">${x.name}</td><td>${editable ? `<input type="number" inputmode="numeric" data-price="${x.key}" value="${prices[x.key]}" step="100" min="500" style="width:6.5em">` : `${prices[x.key].toLocaleString()}`}</td></tr>`).join('')}</table>
      ${editable ? '<button id="price-save" style="margin-top:6px">この値段に決める</button>' : '<p class="muted">シーズン中なので変えられません。</p>'}
    </div>`;
}

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
    ${gateSection(w)}
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
  if (off.phase === 'draft') return '<div class="card"><p>球団設立の年は、まずドラフト会議を行います。そのあと、ここで戦力の整理をします（設立したばかりなので契約更改はありません）。</p></div>';
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
    const signed = new Set(w.tryout?.signed ?? []);
    const row = (p: Player) => `<div class="prow"><div class="grow"><b>${esc(fullName(p))}</b>${draftees.has(p.id) ? ' <span class="chip" style="background:var(--line)">新人</span>' : ''}${signed.has(p.id) ? ' <span class="chip" style="background:var(--line)">トライアウト</span>' : ''} <span class="muted small">${posOf(p)} ${p.age}歳 総合${Math.round(overall(p))} 年俸${moneyLabel(p.salary)}</span><div class="small muted">${seasonLine(w, p)}</div></div>
      ${signed.has(p.id) ? `<button class="sub" data-to-unsign="${p.id}">取消</button>` : `${p.contract === 'ikusei' ? `<button class="sub" data-promote="${p.id}">支配下へ</button>` : `<button class="sub" data-ikusei="${p.id}">育成へ</button>`}
      <button class="sub" data-release="${p.id}">自由契約</button>`}</div>`;
    const sorted = (ps: Player[]) => ps.slice().sort((a, b) => overall(a) - overall(b));
    return `
      <div class="card">
        <p><b>戦力の整理</b>　支配下 <b class="${cnt.roster > ROSTER_LIMIT ? 'lose' : ''}">${cnt.roster}</b>/${ROSTER_LIMIT}人・育成 ${cnt.ikusei}人</p>
        <p class="muted small">支配下を${ROSTER_LIMIT}人以内にし、開幕に必要な人数がそろうと、次（キャンプ）へ進めます。自由契約にした選手は退団します。総合の低い順に並んでいます。</p>
        <p class="muted small">選手の扱いにファンは敏感です。1年に${FAN_PENALTY.freeReleases}人を超える自由契約、在籍の長い選手や愛着の強い選手の自由契約、若手の育成落ちは、コア層のファンが離れる原因になります。</p>
        ${w.offseason?.fanLoss?.length ? `<p class="small lose">離れたコア層：${w.offseason.fanLoss.reduce((s2, x) => s2 + x.lost, 0).toLocaleString()}人</p>` : ''}
        <button id="rs-done" ${cnt.roster > ROSTER_LIMIT ? 'disabled' : ''}>戦力の整理を終える</button>
      </div>
      ${jointTryout(w)}
      <h2>支配下</h2><div class="card">${sorted(mine.filter((p) => p.contract === 'roster')).map(row).join('')}</div>
      <h2>育成</h2><div class="card">${sorted(mine.filter((p) => p.contract === 'ikusei')).map(row).join('') || '<p class="muted small">いません</p>'}</div>`;
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
  on('[data-ikusei]', 'click', (b) => {
    const p = w.players.find((x) => x.id === Number(b.dataset.ikusei))!;
    if (!confirm(`${fullName(p)}を育成契約に切り替えますか？（プロ年数の浅い選手ほど、ファンが離れます）`)) return;
    const why = demoteToIkusei(w, p.id);
    if (why) alert(why);
    app.refresh();
  });
  on('[data-to-sign]', 'click', (b) => {
    const why = signTryout(w, Number(b.dataset.toSign), b.dataset.c as 'roster' | 'ikusei');
    if (why) alert(why);
    app.refresh();
  });
  on('[data-to-unsign]', 'click', (b) => { unsignTryout(w, Number(b.dataset.toUnsign)); app.refresh(); });
  on('[data-to-filter]', 'click', (b) => { toFilter = b.dataset.toFilter as typeof toFilter; toShown = 30; app.refresh(); });
  on('#to-more', 'click', () => { toShown += 30; app.refresh(); });
  on('#to-auto', 'click', () => { autoFillTryout(w); app.refresh(); });
  on('#rs-done', 'click', () => {
    const why = finishRoster(w);
    if (why) alert(why);
    else {
      app.screen = 'home';
    }
    app.refresh();
  });
}

export function bindMoneyTab(el: HTMLElement, w: World): void {
  el.querySelector('#price-save')?.addEventListener('click', () => {
    if (!canChangePrices(w)) return alert('シーズン中は値段を変えられません');
    const next = { ...(w.ticketPrices ?? defaultPrices()) };
    for (const x of el.querySelectorAll<HTMLInputElement>('[data-price]')) {
      const v = Math.round(Number(x.value) / 100) * 100;
      if (!Number.isFinite(v) || v < 500) return alert('値段は500円以上にしてください');
      next[x.dataset.price as SeatKey] = v;
    }
    if (!confirm('この値段に決めますか？（シーズンが始まると、その年は変えられません）')) return;
    w.ticketPrices = next;
    alert('チケットの値段を決めました');
    app.refresh();
  });
}
