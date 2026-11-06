// ホーム画面：自球団の今の様子、次の試合、日送りのボタン、直近の試合、順位、成績上位、選手の様子
import { DEFAULT_INTERLEAGUE_GAMES, DEFAULT_INTERLEAGUE_MODE, DEFAULT_TEAM_COUNTS, LEAGUE_NAMES } from '../../config/league';
import { advanceDay, createWorld, currentDate } from '../../core/season/advance';
import { dateLabel, daysBetween } from '../../core/season/dates';
import { levelPlayers } from '../../core/season/gameTeam';
import { rankOfTeam, standingsTable } from '../../core/season/standings';
import { era } from '../../core/season/stats';
import { firstTeamLogs, probableStarter, streak, teamLeaders } from '../../core/season/teamSummary';
import type { GateResult, World } from '../../core/season/types';
import { fullName } from '../../core/labels';
import { TIRED_NOTICE } from '../../config/season';
import { teamSchedule } from '../../core/schedule/schedule';
import type { LeagueConfig, Player } from '../../core/types';
import { app, DEV_MODE } from '../app';
import { esc, teamChip } from '../common';
import { renderGameResult } from '../gameView';
import { resetWizard } from '../founding/wizard';
import { logoSvg } from '../logo';
import { activeSeries, advancePostseasonDay, startPostseason } from '../../core/season/postseason';
import { renderPostseason } from './postseasonView';
import { CAMP_RANKS, CAMP_SITES } from '../../config/camp';
import { SEATS } from '../../config/gate';
import { availableFunds } from '../../core/finance';
import { closeYear, finishCamp, syncFirstYear } from '../../core/offseason/offseason';
import { moneyLabel } from '../money';
import { openReinforceTab } from '../reinforce';
import { deleteSave, listSaves, loadWorld } from '../../save/db';
import { saveNow, saveStatus } from '../../save/autosave';
import { commitLocker } from '../../core/locker';
import { todayOf } from '../../core/draft';

function defaultConfig(): LeagueConfig {
  return {
    teamCounts: [DEFAULT_TEAM_COUNTS[0], DEFAULT_TEAM_COUNTS[1]],
    games: null,
    interleague: { mode: DEFAULT_INTERLEAGUE_MODE, games: DEFAULT_INTERLEAGUE_GAMES },
    dh: [true, true],
    postseason: { teams: [3, 3], advantage: true },
  };
}

/** タイトル画面：セーブ枠（3つ）を選ぶ */
function renderStart(el: HTMLElement): void {
  if (!app.saves) {
    el.innerHTML = '<p class="muted" style="padding:24px">読み込み中…</p>';
    void listSaves().then((x) => { app.saves = x; app.refresh(); }, () => { app.saves = [null, null, null]; app.refresh(); });
    return;
  }
  const saves = app.saves;
  const firstEmpty = saves.findIndex((x) => !x) + 1;
  const when = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  el.innerHTML = `
    <div class="bc-title" style="--tc:#1b3b8f;--ts:#fff">
      <div class="bc-top"><span class="bc-tag">プレイボール</span></div>
      <div class="bc-name" style="margin:8px 0 4px">球団経営シミュレーション</div>
      <div class="bc-s">新規参入球団のGM兼監督として、球団を設立してペナントを戦います。</div>
    </div>
    ${saves.map((m, i) => {
      const slot = i + 1;
      const [team, at] = m ? m.label.split('｜') : ['', ''];
      return `<div class="card slot-card ${m ? '' : 'empty'}">
        <div class="slot-no">${slot}</div>
        <div class="slot-body">
          ${m ? `<div class="slot-team">${esc(team)}</div><div class="small">${esc(at ?? '')}</div><div class="muted small">保存 ${when(m.savedAt)}</div>` : '<div class="muted">空き</div>'}
        </div>
        <div class="slot-btns">
          ${m ? `<button data-load="${slot}">続きから</button><button class="sub" data-del="${slot}">消す</button>` : `<button data-new="${slot}">新しく始める</button>`}
        </div>
      </div>`;
    }).join('')}
    ${DEV_MODE ? `<div class="card">
      <p class="muted small">開発用：AIが作った球団の1つを自球団にして、空いている枠ですぐ始めます。</p>
      <div class="row"><label>シード番号 <input id="st-seed" type="number" inputmode="numeric" value="${Math.floor(Math.random() * 100000)}" style="width:8em"></label>
      <button class="sub" id="st-go" ${firstEmpty ? '' : 'disabled'}>すぐ始める</button></div>
    </div>` : ''}`;
  el.querySelectorAll<HTMLButtonElement>('[data-new]').forEach((b) => b.addEventListener('click', () => {
    app.slot = Number(b.dataset.new);
    resetWizard();
    app.screen = 'found';
    app.refresh();
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-load]').forEach((b) => b.addEventListener('click', async () => {
    const slot = Number(b.dataset.load);
    b.disabled = true;
    try {
      const rec = await loadWorld(slot);
      if (!rec) throw new Error('セーブが見つかりません');
      app.slot = slot;
      app.world = rec.world;
      app.lastGame = null;
      app.locker = null;
      app.screen = 'home';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (confirm(`セーブ${slot}を読み込めませんでした（${msg}）。\nこのセーブを消しますか？`)) {
        await deleteSave(slot);
        app.saves = null;
      }
    }
    app.refresh();
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const slot = Number(b.dataset.del);
    if (!confirm(`セーブ${slot}を消しますか？（元には戻せません）`)) return;
    await deleteSave(slot);
    app.saves = null;
    app.refresh();
  }));
  el.querySelector('#st-go')?.addEventListener('click', () => {
    const seed = Number((el.querySelector('#st-seed') as HTMLInputElement).value) || 1;
    app.slot = firstEmpty;
    app.world = createWorld(seed, defaultConfig(), 2027, 1, true);
    app.lastGame = null;
    app.refresh();
  });
}

/** 1日進める（自球団の一軍の試合は詳しい結果を残す） */
function stepOneDay(): void {
  const out = advanceDay(app.world!, true);
  if (out?.userGame) app.lastGame = { result: out.userGame.result, away: out.userGame.away, home: out.userGame.home };
}

/**
 * 進める前に、ロッカールームの未確定の変更を片付ける。
 * 確定して進む／変更を捨てて進む／やめる を聞く。進めてよければ true
 */
function settleLocker(): boolean {
  const w = app.world!;
  const L = app.locker;
  if (L?.dirty) {
    if (confirm('ロッカールームに未確定の変更があります。\n確定して進みますか？\n（キャンセルを押すと、変更を捨てるかを聞きます）')) {
      const why = commitLocker(w, L, todayOf(w));
      if (why) {
        alert(`確定できませんでした：${why}\nロッカールームで直してください。`);
        return false;
      }
    } else if (!confirm('変更を捨てて進みますか？')) {
      return false;
    }
  }
  // 日が進むと一軍の顔ぶれが変わることがあるので、次に開くときに作り直す
  app.locker = null;
  return true;
}

/** 日数を指定して進める（途中で画面を更新し、固まらないようにする） */
function run(days: number | 'end'): void {
  const w = app.world!;
  if (app.busy || w.season.finished) return;
  if (!settleLocker()) return;
  const startDate = currentDate(w);
  app.busy = true;
  const total = days === 'end' ? w.season.schedule.days.length - w.season.dayIndex : days;
  let done = 0;
  const tick = () => {
    const until = performance.now() + 30;
    while (performance.now() < until && !w.season.finished) {
      if (days !== 'end' && daysBetween(startDate, currentDate(w)) >= days) break;
      stepOneDay();
      done++;
    }
    app.progress = days === 'end' ? done / Math.max(1, total) : 0;
    const finished = w.season.finished || (days !== 'end' && daysBetween(startDate, currentDate(w)) >= days);
    if (finished) {
      app.busy = false;
      app.progress = 0;
    }
    app.refresh();
    if (!finished) setTimeout(tick, 0);
  };
  tick();
}

/** 結果の記号 */
const mark = (r: 'W' | 'L' | 'T') => (r === 'W' ? '○' : r === 'L' ? '●' : '△');

function pitcherLine(w: World, p: Player | null): string {
  if (!p) return '未定';
  const s = w.season.stats.first[p.id]?.pitch;
  const rec = s && s.g ? ` <span class="muted small">${s.w}勝${s.l}敗 防${era(s).toFixed(2)}</span>` : '';
  return `${esc(fullName(p))}${rec}`;
}

/** ポストシーズンを進める（1日、または最後まで） */
function runPost(mode: 'day' | 'end'): void {
  const w = app.world!;
  if (app.busy) return;
  if (!settleLocker()) return;
  if (!w.season.postseason) startPostseason(w);
  const step = () => {
    const out = advancePostseasonDay(w);
    if (out?.userGame) app.lastGame = { result: out.userGame.result, away: out.userGame.away, home: out.userGame.home, label: out.userGame.seriesName };
    return out;
  };
  if (mode === 'day') {
    step();
    app.refresh();
    return;
  }
  app.busy = true;
  const tick = () => {
    const until = performance.now() + 30;
    while (performance.now() < until && !w.season.postseason!.finished) if (!step()) break;
    if (w.season.postseason!.finished) app.busy = false;
    app.refresh();
    if (app.busy) setTimeout(tick, 0);
  };
  tick();
}

/** 自動セーブの状態 */
function saveLine(): string {
  const st = saveStatus();
  if (st.error) return `<span class="lose">保存できませんでした：${esc(st.error)}</span>`;
  if (!st.savedAt) return '自動で保存します（この端末の中に保存）';
  const t = st.savedAt;
  return `自動保存しました（${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}）`;
}

/** ホーム・ビジターの印 */
function haChip(home: boolean): string {
  return `<span class="chip" style="background:${home ? 'var(--accent)' : 'var(--line)'};color:${home ? '#fff' : 'var(--text)'}">${home ? 'ホーム' : 'ビジター'}</span>`;
}

/** ホームゲームの観客と収支（中継の数字パネル） */
function gateBox(g: GateResult): string {
  const seats = SEATS.map((x) => `${x.name.replace('席', '')} ${g.seats[x.key].toLocaleString()}${g.soldOut.includes(x.key) ? '<b class="bc-full">満員</b>' : ''}`).join('・');
  return `<div class="bc-gate">
    <div class="bc-gate-grid">
      <div><span class="bc-k">観客</span><b>${g.attendance.toLocaleString()}<small>人</small></b></div>
      <div><span class="bc-k">入場料</span><b>+${moneyLabel(g.ticket)}</b></div>
      <div><span class="bc-k">グッズ・飲食</span><b>+${moneyLabel(g.goods)}</b></div>
      <div><span class="bc-k">試合運営</span><b>−${moneyLabel(g.cost)}</b></div>
    </div>
    <div class="muted small">${seats}</div>
    <div class="bc-net">この試合の純損益 <b class="${g.net >= 0 ? 'win' : 'lose'}">${g.net >= 0 ? '+' : ''}${moneyLabel(g.net)}</b></div>
  </div>`;
}

/** キャンプ地の選択（画面を描き直しても残す） */
let campChoice: string = CAMP_SITES.find((x) => x.rank === 'B')!.id;

/** ドラフトの後の流れ：年度を締める → 契約更改 → 戦力の整理 → キャンプ → 翌年 */
function offseasonPanel(w: World): string {
  const off = w.offseason;
  if (!off) {
    return `<p class="small">ドラフト会議が終わりました。<b>年度を締める</b>と、表彰・成長と衰え・引退・決算（年俸の支払いとスポンサー収益）を行います。</p>
      <button id="os-close" style="width:100%">${w.season.year}年度を締める</button>`;
  }
  if (off.phase === 'contracts') return `<p><b>契約更改</b>：自球団の選手と年俸を交渉します。</p><button id="go-contract" style="width:100%">契約更改へ（補強）</button>`;
  if (off.phase === 'roster') return `<p><b>戦力の整理</b>：支配下を70人以内にします（自由契約・育成からの昇格）。</p><button id="go-contract" style="width:100%">戦力の整理へ（補強）</button>`;
  const funds = availableFunds(w);
  return `<p><b>キャンプ</b>：キャンプ地を選ぶと、全選手の能力が上がります。ランクが高いほど効果が大きく、費用もかかります。</p>
    <p class="small">使える資金：<b>${moneyLabel(funds)}</b></p>
    ${CAMP_SITES.map((site) => {
      const { cost, mult } = CAMP_RANKS[site.rank];
      const ok = funds >= cost;
      return `<label class="prow" style="${ok ? '' : 'opacity:.5'}"><input type="radio" name="camp" value="${site.id}" ${campChoice === site.id ? 'checked' : ''} ${ok ? '' : 'disabled'}>
        <div class="grow"><b>${esc(site.name)}</b> <span class="rank rank-${site.rank === 'S' ? 'S' : site.rank === 'A' ? 'A' : site.rank === 'B' ? 'B' : 'C'}">${site.rank}</span>
        <div class="small muted">${esc(site.note)}（効果×${mult}）</div></div><span class="small">${moneyLabel(cost)}</span></label>`;
    }).join('')}
    <p class="muted small">チケットの値段は、開幕前の今だけ「補強」の「お金」で変えられます。</p>
    <button id="os-camp" style="width:100%;margin-top:8px">キャンプを行い、${off.firstYear ? w.season.year : w.season.year + 1}年の開幕へ</button>`;
}

/** 年度を締めたあとの記録（表彰・引退・決算） */
function yearSummary(w: World): string {
  const off = w.offseason;
  if (!off) return '';
  const team = (id: number) => w.teams.find((t) => t.id === id);
  const awards = ([0, 1] as const).map((lg) => `<h2>${LEAGUE_NAMES[lg]} 表彰</h2><div class="card"><table class="box">
    ${off.awards.filter((a) => a.league === lg).map((a) => `<tr class="${a.teamId === w.userTeamId ? 'mine' : ''}"><td class="tl small">${esc(a.title)}</td><td class="tl">${esc(a.playerName)} ${teamChip(team(a.teamId))}</td><td class="small">${esc(a.value)}</td></tr>`).join('')}
  </table></div>`).join('');
  const mineRetired = off.retired.filter((r) => r.teamId === w.userTeamId);
  const ledger = (w.finance?.ledger ?? []).filter((x) => x.year === off.year);
  const net = ledger.reduce((s2, x) => s2 + x.amount, 0);
  return `${awards}
    ${off.fanLoss?.length ? `<h2>選手の扱いで離れたファン</h2><div class="card small">${off.fanLoss.map((x) => `<div>${esc(x.text)}：コア層 <span class="lose">−${x.lost.toLocaleString()}人</span></div>`).join('')}</div>` : ''}
    <h2>引退</h2><div class="card small">${mineRetired.length ? mineRetired.map((r) => `<div>${esc(r.name)}（${r.age}歳・${esc(r.note)}）</div>`).join('') : '<p class="muted">自球団の引退選手はいません。</p>'}
      <p class="muted">リーグ全体で${off.retired.length}人が引退しました。</p></div>
    ${w.finance ? `<h2>${off.year}年の収支（${moneyLabel(net)}）</h2><div class="card"><table class="box">${ledger.map((x) => `<tr><td class="tl small">${esc(x.label)}</td><td class="${x.amount < 0 ? 'lose' : 'win'}" style="text-align:right;white-space:nowrap">${x.amount >= 0 ? '+' : ''}${moneyLabel(x.amount)}</td></tr>`).join('')}</table>
      <p class="small">残高 <b>${moneyLabel(w.finance.balance)}</b></p></div>` : ''}`;
}

/** 球団設立の年：開幕の前に、ドラフト → 戦力の整理 → キャンプ */
function firstYearPanel(w: World): string {
  const off = w.offseason!;
  const steps = ['ドラフト会議', '戦力の整理', 'キャンプ', '開幕'];
  const cur = off.phase === 'draft' ? 0 : off.phase === 'roster' ? 1 : 2;
  const bar = `<div class="seg" style="margin-bottom:8px">${steps.map((x, i) => `<button class="${i === cur ? 'on' : ''}" disabled>${x}</button>`).join('')}</div>`;
  if (off.phase === 'draft') {
    return `${bar}<p><b>球団設立の年です。</b>開幕の前に、まず${off.year}年のドラフト会議で新人を指名します。</p>
      <button id="go-draft" style="width:100%">ドラフト会議へ（補強）</button>`;
  }
  return bar + offseasonPanel(w);
}

/** レギュラーシーズン後の「次の試合」欄 */
function postseasonPanel(w: World, myRank: number): string {
  const ps = w.season.postseason;
  const me = w.userTeamId;
  if (!ps) {
    const qualified = myRank <= w.config.postseason.teams[w.teams.find((t) => t.id === me)!.league];
    return `<p><b>レギュラーシーズン終了</b>　${myRank}位で${qualified ? '<span class="win">ポストシーズン進出！</span>' : 'ポストシーズン進出はなりませんでした'}</p>
      <button id="ps-start" style="width:100%">ポストシーズンを始める</button>`;
  }
  if (ps.finished) {
    const champ = w.teams.find((t) => t.id === ps.championId)!;
    const draftDone = w.draft?.year === w.season.year && w.draft.phase === 'done';
    const head = `<p><b>${champ.id === me ? '日本一になりました！' : `${esc(champ.name)}が日本一になりました`}</b></p>`;
    if (!draftDone) return `${head}<button id="go-draft" style="width:100%">ドラフト会議へ（補強）</button>`;
    return head + offseasonPanel(w);
  }
  const mine = activeSeries(w).find((x) => x.teams.includes(me));
  const info = mine
    ? `<p><b>${esc(mine.name)}</b>　第${mine.games.length + 1}戦 vs ${esc(w.teams.find((t) => t.id === (mine.teams[0] === me ? mine.teams[1] : mine.teams[0]))!.name)}</p>`
    : '<p class="muted">自球団の試合はありません。ほかの球団の試合を進めます。</p>';
  return `${info}
    ${app.busy ? '<p class="muted">進めています…</p>' : ''}
    <div class="btns" style="grid-template-columns:1fr 1fr">
      <button data-ps="day" ${app.busy ? 'disabled' : ''}>1日進む</button>
      <button data-ps="end" ${app.busy ? 'disabled' : ''}>最後まで</button>
    </div>`;
}

export function renderHome(el: HTMLElement): void {
  const w = app.world;
  if (!w) return renderStart(el);
  syncFirstYear(w);
  const me = w.teams.find((t) => t.id === w.userTeamId)!;
  const st = w.season.standings.first[me.id];
  const date = currentDate(w);
  const sched = teamSchedule(w.season.schedule, me.id);
  const next = w.season.finished ? undefined : sched.find((x) => x.date >= date);
  const opp = next ? w.teams.find((t) => t.id === next.opponent) : undefined;
  const logs = firstTeamLogs(w);
  const last10 = logs.slice(0, 10);
  const sk = streak(w);
  const table = standingsTable(w, 'first', me.league);
  const myRow = table.findIndex((r) => r.teamId === me.id);
  const gb = table[myRow].gb;
  const pct = st.w + st.l > 0 ? (st.w / (st.w + st.l)).toFixed(3).replace(/^0/, '') : '.000';
  const leaders = teamLeaders(w, me.id);
  const first = levelPlayers(w, me.id, 'first');
  const hot = first.filter((p) => p.condition === 5);
  const cold = first.filter((p) => p.condition === 1);
  const tired = first.filter((p) => p.fatigue >= TIRED_NOTICE);
  const lg = app.lastGame;
  const lastLog = logs[0];

  // 次の試合（中継の対戦カード）
  let matchup = '';
  if (next && opp) {
    const homeTeam = next.home ? me : opp;
    const mineP = probableStarter(w, me.id, next.date);
    const oppP = probableStarter(w, opp.id, next.date);
    const side = (t: typeof me, isHome: boolean, right = false) => `
      <div class="bc-side ${right ? 'right' : ''}" style="--tc:${t.colorMain}">
        ${logoSvg(t.logo, 46)}<b>${esc(t.shortName)}</b><span>${isHome ? 'ホーム' : 'ビジター'}</span>
      </div>`;
    matchup = `
      <div class="bc-strip"><span>次の試合</span><b>${dateLabel(next.date)}</b>${next.interleague ? '<span class="bc-tag">交流戦</span>' : ''}</div>
      <div class="bc-vs">${side(me, next.home)}<div class="bc-mid">対</div>${side(opp, !next.home, true)}</div>
      <div class="bc-stadium">${esc(homeTeam.stadium.name)}</div>
      <div class="bc-starters">
        <div><span class="bc-k">予告先発</span></div>
        <div class="bc-sp"><span class="bc-dot" style="background:${me.colorMain}"></span>${esc(me.shortName)}　${pitcherLine(w, mineP)}</div>
        <div class="bc-sp"><span class="bc-dot" style="background:${opp.colorMain}"></span>${esc(opp.shortName)}　${pitcherLine(w, oppP)}</div>
      </div>`;
  }

  // 直近の試合（中継のスコア表示）
  let lastCard = '';
  if (lastLog && !w.season.postseason) {
    const oppT = w.teams.find((t) => t.id === lastLog.opponentId)!;
    const awayT = lastLog.home ? oppT : me;
    const homeT = lastLog.home ? me : oppT;
    const awayRuns = lastLog.home ? lastLog.runsAgainst : lastLog.runsFor;
    const homeRuns = lastLog.home ? lastLog.runsFor : lastLog.runsAgainst;
    const row = (t: typeof me, runs: number, other: number) => `
      <div class="bc-srow ${runs > other ? 'lead' : ''}" style="--tc:${t.colorMain}">
        <span class="bc-sname">${esc(t.shortName)}</span><span class="bc-sruns">${runs}</span>
      </div>`;
    const res = lastLog.result === 'W' ? '<span class="bc-res win">勝</span>' : lastLog.result === 'L' ? '<span class="bc-res lose">敗</span>' : '<span class="bc-res">分</span>';
    lastCard = `
    <div class="card bc-last">
      <div class="bc-strip"><span>直近の試合</span><b>${dateLabel(lastLog.date)}</b>${haChip(lastLog.home)}</div>
      <div class="bc-score">
        <div class="bc-rows">${row(awayT, awayRuns, homeRuns)}${row(homeT, homeRuns, awayRuns)}</div>
        ${res}
      </div>
      <div class="muted small" style="margin-top:4px">${esc(homeT.stadium.name)}${lastLog.home ? '' : '（相手の本拠地）'}　${[lastLog.win ? `勝 ${esc(lastLog.win)}` : '', lastLog.loss ? `負 ${esc(lastLog.loss)}` : '', lastLog.save ? `S ${esc(lastLog.save)}` : ''].filter(Boolean).join('　')}</div>
      ${lastLog.summary.map((t) => `<div class="bc-telop ${lastLog.result === 'W' ? 'good' : lastLog.result === 'L' ? 'bad' : ''}">${esc(t)}</div>`).join('')}
      ${lastLog.fanDelta != null ? `<div class="small" style="margin-top:6px">ファン <b class="${lastLog.fanDelta >= 0 ? 'win' : 'lose'}">${lastLog.fanDelta >= 0 ? '+' : ''}${lastLog.fanDelta.toLocaleString()}人</b></div>` : ''}
      ${lastLog.gate ? gateBox(lastLog.gate) : !lastLog.home ? '<p class="small muted" style="margin-top:6px">ビジターの試合なので、入場料・グッズ・飲食の収入は相手球団に入ります（自球団の収支はありません）。</p>' : ''}
      ${lg && lg.result.awayId + lg.result.homeId === me.id + lastLog.opponentId ? `<details><summary class="small">スコアと成績を見る</summary>${renderGameResult(lg.result, lg.away, lg.home, me.id)}</details>` : ''}
    </div>`;
  }

  const news = w.season.news.slice(0, 6);
  el.innerHTML = `
    <div class="bc-title" style="--tc:${me.colorMain};--ts:${me.colorSub}">
      <div class="bc-top"><span class="bc-tag">${w.season.year}年</span><span>${w.offseason?.firstYear ? '開幕前' : w.season.finished ? 'レギュラーシーズン終了' : dateLabel(date)}</span></div>
      <div class="bc-team">${logoSvg(me.logo, 54)}<div class="bc-name">${esc(me.name)}</div></div>
      <div class="bc-stats">
        <div class="bc-stat"><span class="bc-k">${LEAGUE_NAMES[me.league]}</span><span class="bc-v">${myRow + 1}<small>位</small></span><span class="bc-s">${myRow === 0 ? (table[1] ? `2位と${table[1].gb.toFixed(1)}差` : '') : `首位と${gb.toFixed(1)}差`}</span></div>
        <div class="bc-stat"><span class="bc-k">勝敗</span><span class="bc-v">${st.w}-${st.l}${st.t ? `<small>(${st.t})</small>` : ''}</span><span class="bc-s">勝率${pct}</span></div>
        <div class="bc-stat"><span class="bc-k">${sk ? (sk.kind === 'W' ? '連勝' : '連敗') : '連勝・連敗'}</span><span class="bc-v ${sk?.kind === 'W' ? 'hot' : ''}">${sk ? sk.count : 'なし'}</span><span class="bc-s">二軍${rankOfTeam(w, 'farm', me.id)}位</span></div>
      </div>
      ${w.finance ? `<div class="bc-money"><span>資金 <b>${moneyLabel(w.finance.balance)}</b></span>${w.fans?.[me.id] ? `<span>ファン <b>${((w.fans[me.id].core + w.fans[me.id].light) / 10000).toFixed(1)}万人</b></span>` : ''}</div>` : ''}
      ${last10.length ? `<div class="last10">${last10.slice().reverse().map((g) => `<span class="m-${g.result}">${mark(g.result)}</span>`).join('')}<span class="bc-s">最近${last10.length}試合 ${last10.filter((g) => g.result === 'W').length}勝${last10.filter((g) => g.result === 'L').length}敗${last10.some((g) => g.result === 'T') ? `(${last10.filter((g) => g.result === 'T').length})` : ''}</span></div>` : ''}
    </div>

    ${news.length ? `<div class="bc-ticker"><span class="bc-ticker-label">速報</span><div class="bc-ticker-track"><span>${news.map((n) => `${dateLabel(n.date)}　${esc(n.text)}`).join('　　◆　　')}</span></div></div>` : ''}

    <div class="card bc-next">
      ${w.offseason?.firstYear ? firstYearPanel(w) : next && opp ? matchup : w.season.finished ? postseasonPanel(w, myRow + 1) : ''}
      ${app.busy && !w.season.finished ? `<div class="progress" style="margin-top:10px"><span style="width:${Math.round(app.progress * 100)}%"></span></div><p class="muted">進めています…</p>` : ''}
      ${w.season.finished || w.offseason?.firstYear ? '' : `
      <button class="bc-go" data-run="1" ${app.busy ? 'disabled' : ''}>▶ 1日進む</button>
      <div class="bc-go2">
        <button class="sub" data-run="7" ${app.busy ? 'disabled' : ''}>1週間進む</button>
        <button class="sub" data-run="end" ${app.busy ? 'disabled' : ''}>シーズン終了まで</button>
      </div>`}
    </div>

    ${w.offseason && !w.offseason.firstYear ? yearSummary(w) : w.season.postseason ? renderPostseason(w) : ''}

    ${w.quickStart && w.offseason?.firstYear && w.draft?.phase === 'scouting' ? `
    <div class="card">
      <div class="row"><label>自球団（仮） <select id="pick-team">${w.teams.map((t) => `<option value="${t.id}" ${t.id === w.userTeamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div>
      <p class="muted small">開幕前だけ変えられます。</p>
    </div>` : ''}

    ${w.season.postseason && lg?.label ? `<h2>直近の試合（${esc(lg.label.replace(/^.+リーグ /, ''))}）</h2>${renderGameResult(lg.result, lg.away, lg.home, me.id)}` : ''}

    ${lastCard}

    <h2>${LEAGUE_NAMES[me.league]}</h2>
    <div class="card bc-standings"><table class="box">
      <tr><th></th><th class="tl">球団</th><th>勝</th><th>敗</th><th>分</th><th>差</th></tr>
      ${table.map((r, i) => {
        const t = w.teams.find((x) => x.id === r.teamId)!;
        return `<tr class="${t.id === me.id ? 'mine' : ''}"><td class="bc-rank">${i + 1}</td><td class="tl"><span class="bc-bar" style="background:${t.colorMain}"></span>${esc(t.name)}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${i === 0 ? '-' : r.gb.toFixed(1)}</td></tr>`;
      }).join('')}
    </table></div>

    ${leaders.length ? `<h2>チームの成績上位</h2>
    <div class="tiles">${leaders.map((l) => `<div class="tile"><div class="tile-k">${l.label}</div><div class="tile-v">${l.value}</div><div class="small">${esc(fullName(l.player))}</div></div>`).join('')}</div>` : ''}

    ${hot.length || cold.length || tired.length ? `<h2>選手の様子</h2><div class="card small">
      ${hot.length ? `<p><span class="cond cond-5">⬆ 絶好調</span>　${hot.map((p) => esc(fullName(p))).join('、')}</p>` : ''}
      ${cold.length ? `<p><span class="cond cond-1">⬇ 絶不調</span>　${cold.map((p) => esc(fullName(p))).join('、')}</p>` : ''}
      ${tired.length ? `<p><span class="lose">疲れ気味</span>　${tired.map((p) => esc(fullName(p))).join('、')}</p>` : ''}
      <p class="muted">打順や一軍・二軍の入れ替えは「ロッカー」で変えられます。</p>
    </div>` : ''}

    ${logs.length > 1 ? `<details class="card"><summary><b>最近の結果（一軍）</b></summary><table class="box">
      ${logs.slice(0, 15).map((g) => {
        const o = w.teams.find((t) => t.id === g.opponentId);
        return `<tr><td class="tl">${dateLabel(g.date)}</td><td class="tl">${haChip(g.home)} ${teamChip(o)}</td><td class="${g.result === 'W' ? 'win' : g.result === 'L' ? 'lose' : ''}">${mark(g.result)} ${g.runsFor}-${g.runsAgainst}</td><td class="tl small">${esc(g.result === 'W' ? (g.win ?? '') : g.result === 'L' ? (g.loss ?? '') : '')}</td></tr>`;
      }).join('')}</table></details>` : ''}

    ${w.season.news.length ? `<details class="card"><summary><b>お知らせ</b></summary><ul class="list">${w.season.news.slice(0, 12).map((n) => `<li class="small">${dateLabel(n.date)} ${esc(n.text)}</li>`).join('')}</ul></details>` : ''}
    <div class="card small"><div class="muted">セーブ${app.slot}｜${saveLine()}</div>
      <div class="bc-go2"><button class="sub" id="to-title">セーブ枠の選択へ</button><button class="sub" id="new-season">最初からやり直す</button></div></div>
  `;
  el.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((b) =>
    b.addEventListener('click', () => run(b.dataset.run === 'end' ? 'end' : Number(b.dataset.run))),
  );
  el.querySelector('#go-draft')?.addEventListener('click', () => { openReinforceTab('draft'); app.screen = 'reinforce'; app.refresh(); });
  el.querySelector('#go-contract')?.addEventListener('click', () => { openReinforceTab('contract'); app.screen = 'reinforce'; app.refresh(); });
  el.querySelector('#os-close')?.addEventListener('click', () => {
    if (!confirm(`${w.season.year}年度を締めますか？（表彰・成長・引退・決算を行います）`)) return;
    closeYear(w);
    app.locker = null;
    app.refresh();
  });
  el.querySelectorAll<HTMLInputElement>('input[name=camp]').forEach((r) => r.addEventListener('change', () => { campChoice = r.value; }));
  el.querySelector('#os-camp')?.addEventListener('click', () => {
    const site = CAMP_SITES.find((x) => x.id === campChoice)!;
    if (!confirm(`${site.name}でキャンプを行い、${w.season.year + 1}年のシーズンを始めますか？（費用 ${moneyLabel(CAMP_RANKS[site.rank].cost)}）`)) return;
    const why = finishCamp(w, campChoice);
    if (why) return alert(why);
    app.lastGame = null;
    app.locker = null;
    app.refresh();
  });
  el.querySelector('#ps-start')?.addEventListener('click', () => { startPostseason(w); app.refresh(); });
  el.querySelectorAll<HTMLButtonElement>('[data-ps]').forEach((b) => b.addEventListener('click', () => runPost(b.dataset.ps as 'day' | 'end')));
  el.querySelector('#pick-team')?.addEventListener('change', (e) => {
    const id = Number((e.target as HTMLSelectElement).value);
    for (const t of w.teams) t.isUser = t.id === id;
    w.userTeamId = id;
    app.refresh();
  });
  el.querySelector('#new-season')!.addEventListener('click', () => {
    if (confirm(`セーブ${app.slot}の球団を消して、最初からやり直しますか？（元には戻せません）`)) {
      app.world = null;
      app.lastGame = null;
      app.locker = null;
      app.saves = null;
      void deleteSave(app.slot).then(() => app.refresh());
    }
  });
  el.querySelector('#to-title')!.addEventListener('click', async () => {
    if (app.busy) return;
    await saveNow();
    app.world = null;
    app.lastGame = null;
    app.locker = null;
    app.saves = null;
    app.refresh();
  });
}
