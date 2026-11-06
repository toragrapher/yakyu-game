// 球団設立の画面：①リーグ設定 → ②球団（名前・本拠地・球場・ロゴ） → ③初期メンバー → ④確認
import {
  EXPANSION_PICKS, ROOKIE_MAX, SHORT_NAME_MAX, TRYOUT_MAX,
} from '../../config/founding';
import {
  DEFAULT_INTERLEAGUE_GAMES, DEFAULT_INTERLEAGUE_MODE, DEFAULT_TEAM_COUNTS, LEAGUE_NAMES, MAX_TEAMS_PER_LEAGUE, MIN_TEAMS_PER_LEAGUE,
} from '../../config/league';
import { PREFECTURES } from '../../config/prefectures';
import { COLOR_CANDIDATES, NICKNAME_CANDIDATES } from '../../config/teams';
import {
  autoPick, canPick, chooseMethod, expansionMaxPerTeam, finishFounding, isRookieCandidate, pick, startFounding, unpick,
  type Founding, type MemberMethod, type NewTeamInput,
} from '../../core/founding';
import { playerTag } from '../../core/labels';
import { overall, potentialOverall } from '../../core/ratings';
import type { LeagueConfig, Logo, Player, Stadium } from '../../core/types';
import { app } from '../app';
import { abilityLine, esc } from '../common';
import { LOGO_EMOJI, logoSvg, MOTIF_LABEL, SHAPE_LABEL } from '../logo';

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  seed: number;
  config: LeagueConfig;
  userLeague: 0 | 1;
  city: string;
  nickname: string;
  shortName: string;
  homePref: string;
  stadium: Stadium;
  logo: Logo;
  founding: Founding | null;
  filter: 'all' | 'P' | 'C' | 'IF' | 'OF' | 'rookie' | 'veteran' | 'picked';
  shown: number;
  sortKey: SortKey;
  /** true＝高い順（年齢は上の順）、false＝低い順 */
  desc: boolean;
  /** 第2条件（1つ目が同じ値のときに使う） */
  sortKey2: SortKey | 'none';
  desc2: boolean;
  /** 総合評価がこの値以上の選手だけ出す（0＝指定なし） */
  minOverall: number;
}

type SortKey = 'value' | 'now' | 'pot' | 'age' | 'contact' | 'power' | 'speed' | 'defense' | 'velocity' | 'control' | 'breaking' | 'stamina';

const SORTS: [SortKey, string][] = [
  ['value', 'おすすめ'], ['now', '総合（今の力）'], ['pot', '将（将来性）'], ['age', '年齢'],
  ['contact', '巧打'], ['power', '長打'], ['speed', '走塁'], ['defense', '守備'],
  ['velocity', '速球'], ['control', '制球'], ['breaking', '変化球'], ['stamina', '体力'],
];
const BAT_KEYS: SortKey[] = ['contact', 'power', 'speed', 'defense'];
const PITCH_KEYS: SortKey[] = ['velocity', 'control', 'breaking', 'stamina'];

/** 並び順の値。対象外（野手の能力で並べたときの投手など）は null */
function sortValue(p: Player, key: SortKey): number | null {
  switch (key) {
    case 'value': return Math.max(overall(p), potentialOverall(p) - 8);
    case 'now': return overall(p);
    case 'pot': return potentialOverall(p);
    case 'age': return p.age;
    default:
      if (BAT_KEYS.includes(key)) return p.mainPos === 'P' ? null : p.bat[key as keyof Player['bat']];
      if (PITCH_KEYS.includes(key)) return p.pitch ? p.pitch[key as keyof NonNullable<Player['pitch']>] : null;
      return null;
  }
}

function initial(): WizardState {
  const [main, sub] = COLOR_CANDIDATES[0];
  return {
    step: 1,
    seed: Math.floor(Math.random() * 1_000_000),
    config: {
      teamCounts: [DEFAULT_TEAM_COUNTS[0], DEFAULT_TEAM_COUNTS[1]],
      games: null,
      interleague: { mode: DEFAULT_INTERLEAGUE_MODE, games: DEFAULT_INTERLEAGUE_GAMES },
      dh: [true, true],
      postseason: { teams: [3, 3], advantage: true },
    },
    userLeague: 0,
    city: '湘南',
    nickname: 'シーガルズ',
    shortName: '湘南',
    homePref: '神奈川県',
    stadium: { name: '湘南スタジアム', size: 'normal', fence: 'normal', terrace: false, dome: false, turf: 'natural', seaside: true },
    logo: { shape: 'shield', motif: 'animal', text: 'S', main, sub },
    founding: null,
    filter: 'all',
    shown: 40,
    sortKey: 'value',
    desc: true,
    sortKey2: 'none',
    desc2: true,
    minOverall: 0,
  };
}

let ws: WizardState = initial();

export function resetWizard(): void {
  ws = initial();
}

function teamInput(): NewTeamInput {
  return {
    name: `${ws.city}${ws.nickname}`,
    shortName: ws.shortName || ws.city.slice(0, 2),
    homePref: ws.homePref,
    stadium: { ...ws.stadium, seaside: ws.stadium.seaside && !ws.stadium.dome },
    logo: { ...ws.logo },
    colorMain: ws.logo.main,
    colorSub: ws.logo.sub,
  };
}

const opt = <T extends string | number>(v: T, label: string, cur: T) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;

function header(title: string): string {
  const steps = ['リーグ', '球団', 'メンバー', '確認'];
  const cur = ws.step === 5 ? 4 : ws.step === 4 ? 3 : ws.step;
  return `<h1>球団設立</h1>
    <div class="seg">${steps.map((s, i) => `<button class="${i + 1 === cur ? 'on' : ''}" disabled>${i + 1}.${s}</button>`).join('')}</div>
    <h2>${title}</h2>`;
}

function preview(): string {
  const t = teamInput();
  return `<div class="card row" style="gap:12px;border-left:6px solid ${t.colorMain}">
    ${logoSvg(t.logo, 64)}
    <div><div class="big" style="color:${t.colorMain}">${esc(t.name)}</div>
    <div class="muted small">略称「${esc(t.shortName)}」｜${esc(t.homePref)}｜${esc(t.stadium.name)}</div></div>
  </div>`;
}

// ---------- ① リーグ設定 ----------
function stepLeague(): string {
  const c = ws.config;
  const counts = (lg: 0 | 1) => Array.from({ length: MAX_TEAMS_PER_LEAGUE - MIN_TEAMS_PER_LEAGUE + 1 }, (_, i) => i + MIN_TEAMS_PER_LEAGUE).map((n) => opt(n, `${n}球団`, c.teamCounts[lg])).join('');
  const ps = (lg: 0 | 1) => Array.from({ length: Math.min(6, c.teamCounts[lg]) }, (_, i) => i + 1).map((n) => opt(n, `上位${n}球団`, c.postseason.teams[lg])).join('');
  return `${header('① リーグ設定')}
    <div class="card">
      <p class="muted small">球団数は自球団を含めた数です。自球団は「新規参入球団」、ほかはすべてAI球団です。</p>
      <label>自球団が入るリーグ<br><select id="lg-user" class="wide">${opt(0, LEAGUE_NAMES[0], ws.userLeague)}${opt(1, LEAGUE_NAMES[1], ws.userLeague)}</select></label>
      <div class="row" style="margin-top:8px"><label>${LEAGUE_NAMES[0]} <select id="lg-n0">${counts(0)}</select></label></div>
      <div class="row" style="margin-top:8px"><label>${LEAGUE_NAMES[1]} <select id="lg-n1">${counts(1)}</select></label></div>
      <div class="row" style="margin-top:8px"><label>試合数 <input id="lg-games" type="number" inputmode="numeric" placeholder="自動" value="${c.games ?? ''}" style="width:6em"></label><span class="muted small">空欄＝自動（143試合前後）</span></div>
      <div class="row" style="margin-top:8px"><label>交流戦 <select id="lg-mode">${opt('period', '期間集中型', c.interleague.mode)}${opt('spread', '分散型', c.interleague.mode)}${opt('none', 'なし', c.interleague.mode)}</select></label>
        <label><input id="lg-inter" type="number" inputmode="numeric" value="${c.interleague.games}" style="width:4.5em">試合（目安）</label></div>
    </div>
    <div class="card">
      <label><input type="checkbox" id="lg-dh0" ${c.dh[0] ? 'checked' : ''}> ${LEAGUE_NAMES[0]}はDHあり</label><br>
      <label><input type="checkbox" id="lg-dh1" ${c.dh[1] ? 'checked' : ''}> ${LEAGUE_NAMES[1]}はDHあり</label>
    </div>
    <div class="card">
      <p>ポストシーズンに進む球団</p>
      <div class="row"><label>${LEAGUE_NAMES[0]} <select id="lg-ps0">${ps(0)}</select></label></div>
      <div class="row" style="margin-top:8px"><label>${LEAGUE_NAMES[1]} <select id="lg-ps1">${ps(1)}</select></label></div>
      <label style="display:block;margin-top:8px"><input type="checkbox" id="lg-adv" ${c.postseason.advantage ? 'checked' : ''}> 1位に1勝分のアドバンテージ</label>
    </div>
    ${ws.founding ? '<p class="muted small">ここを変えると、選んだ初期メンバーはやり直しになります。</p>' : ''}
    <div class="row"><button class="sub" id="wz-cancel">やめる</button><button id="wz-next">次へ</button></div>`;
}

// ---------- ② 球団 ----------
function stepTeam(): string {
  const s = ws.stadium;
  const l = ws.logo;
  return `${header('② 球団')}
    <div id="wz-preview">${preview()}</div>
    <div class="card">
      <div class="row">
        <label>形 <select id="lg-shape">${(Object.keys(SHAPE_LABEL) as Logo['shape'][]).map((k) => opt(k, SHAPE_LABEL[k], l.shape)).join('')}</select></label>
      </div>
      <div style="margin-top:8px"><span class="small">模様</span>
        <input type="hidden" id="lg-motif" value="${l.emoji ? `e:${l.emoji}` : l.motif}">
        <div class="motif-grid">
          ${(Object.keys(MOTIF_LABEL) as Logo['motif'][]).map((k) => `<button class="sub ${!l.emoji && l.motif === k ? 'on' : ''}" data-motif="${k}">${MOTIF_LABEL[k]}</button>`).join('')}
          ${LOGO_EMOJI.map((e) => `<button class="sub emoji ${l.emoji === e ? 'on' : ''}" data-motif="e:${e}">${e}</button>`).join('')}
        </div>
      </div>
      <div class="row" style="margin-top:8px"><label>ロゴの文字 <input id="lg-text" value="${esc(l.text)}" maxlength="3" style="width:4em"></label><span class="muted small">3文字まで</span></div>
      <div class="row" style="margin-top:8px">
        <label>メイン <input type="color" id="lg-main" value="${l.main}"></label>
        <label>サブ <input type="color" id="lg-sub" value="${l.sub}"></label>
      </div>
      <div class="row" style="margin-top:8px">${COLOR_CANDIDATES.map(([m, s2], i) => `<button class="sub" data-color="${i}" style="min-height:32px;padding:2px;border-color:${m}"><span style="display:inline-block;width:18px;height:18px;background:${m};border-radius:4px"></span><span style="display:inline-block;width:10px;height:18px;background:${s2};border-radius:3px"></span></button>`).join('')}</div>
      <p class="muted small">メインとサブの色は、チームカラーとして画面にも使います。</p>
    </div>
    <div class="card">
      <div class="row"><label>地名 <input id="tm-city" value="${esc(ws.city)}" style="width:8em"></label></div>
      <div class="row" style="margin-top:8px"><label>愛称 <input id="tm-nick" value="${esc(ws.nickname)}" style="width:9em"></label>
        <select id="tm-nick-pick"><option value="">候補から選ぶ</option>${NICKNAME_CANDIDATES.map((n) => `<option>${n}</option>`).join('')}</select></div>
      <div class="row" style="margin-top:8px"><label>略称 <input id="tm-short" value="${esc(ws.shortName)}" maxlength="${SHORT_NAME_MAX}" style="width:5em"></label><span class="muted small">${SHORT_NAME_MAX}文字まで（順位表やスコアに使います）</span></div>
      <label style="display:block;margin-top:8px">本拠地<br><select id="tm-pref" class="wide">${PREFECTURES.map((p) => opt(p.name, p.name, ws.homePref)).join('')}</select></label>
      <p class="muted small">本拠地は、地元出身の選手の判定と、気候（春先の気温など）に使います。</p>
    </div>
    <div class="card">
      <div class="row"><label>球場名 <input id="st-name" value="${esc(s.name)}" style="width:11em"></label></div>
      <div class="row" style="margin-top:8px">
        <label>広さ <select id="st-size">${opt('small', '狭い', s.size)}${opt('normal', '標準', s.size)}${opt('large', '広い', s.size)}</select></label>
        <label>フェンス <select id="st-fence">${opt('low', '低い', s.fence)}${opt('normal', '標準', s.fence)}${opt('high', '高い', s.fence)}</select></label>
      </div>
      <div class="row" style="margin-top:8px">
        <label>芝 <select id="st-turf">${opt('natural', '天然芝', s.turf)}${opt('artificial', '人工芝', s.turf)}</select></label>
        <label><input type="checkbox" id="st-terrace" ${s.terrace ? 'checked' : ''}> ホームランテラス</label>
      </div>
      <div class="row" style="margin-top:8px">
        <label><input type="checkbox" id="st-dome" ${s.dome ? 'checked' : ''}> ドーム（屋根あり）</label>
        <label><input type="checkbox" id="st-sea" ${s.seaside ? 'checked' : ''} ${s.dome ? 'disabled' : ''}> 海沿い（風が強い）</label>
      </div>
      <p class="muted small">狭い・フェンスが低い・テラスありは打者向き、広い・フェンスが高いは投手向きです。有利不利はつきません。</p>
    </div>
    <div class="row"><button class="sub" id="wz-back">戻る</button><button id="wz-next">次へ</button></div>`;
}

// ---------- ③ 初期メンバーの集め方 ----------
function stepMethod(): string {
  const cur = ws.founding?.method;
  const card = (m: MemberMethod, title: string, level: string, text: string) => `
    <div class="card" style="${cur === m ? 'outline:2px solid var(--accent)' : ''}">
      <div class="row" style="justify-content:space-between"><b>${title}</b><span class="chip" style="background:var(--line)">${level}</span></div>
      <p class="small">${text}</p>
      <button data-method="${m}">${cur === m ? '選択中（続きへ）' : 'この方法にする'}</button>
    </div>`;
  return `${header('③ 初期メンバーの集め方')}
    <p class="muted small">集め方による戦力の差は、選んだ難しさとして扱います（あとでそろえません）。</p>
    ${card('omakase', 'おまかせ', 'ふつう', 'すべてのポジションを自動で埋めた選手をもらいます。戦力はほかの球団の平均くらいです。')}
    ${card('expansion', 'エクスパンションドラフト', 'やや難しい', `既存の球団がプロテクトした28人以外から、${EXPANSION_PICKS}人を指名します。残りは若手で埋めます。目利きしだいで強くも弱くもなります。`)}
    ${card('tryout', 'トライアウト＋新人', '難しい', `自由契約の選手（最大${TRYOUT_MAX}人）と、特別ドラフトの新人（最大${ROOKIE_MAX}人）だけで組みます。最初は弱いですが、新人が育てば強くなります。`)}
    <div class="row"><button class="sub" id="wz-back">戻る</button></div>`;
}

function candidateRow(f: Founding, p: Player): string {
  const picked = f.picks.includes(p.id);
  const why = picked ? null : canPick(f, p.id);
  const from = f.method === 'expansion' ? f.teams.find((t) => t.id === (picked ? p.draftTeamId : p.teamId)) : null;
  const tag = f.method === 'tryout' ? (isRookieCandidate(f, p) ? '新人' : '自由契約') : from ? from.shortName : '';
  return `<div class="prow ${picked ? 'mine' : ''}">
    <div class="grow"><div><b>${esc(playerTag(p))}</b></div>
    <div class="abil">${abilityLine(p)} <span class="small">${p.age}歳 ${esc(tag)}</span></div></div>
    ${picked ? `<button class="sub" data-unpick="${p.id}">取消</button>` : `<button data-pick="${p.id}" ${why ? 'disabled' : ''}>${f.method === 'expansion' ? '指名' : '獲得'}</button>`}
  </div>`;
}

function stepPick(): string {
  const f = ws.founding!;
  const all = f.pool.map((id) => f.players.find((p) => p.id === id)!);
  const groupOf = (p: Player) => (p.mainPos === 'P' ? 'P' : p.mainPos === 'C' ? 'C' : p.mainPos === 'OF' ? 'OF' : 'IF');
  let list = all.filter((p) => {
    if (ws.minOverall > 0 && Math.round(overall(p)) < ws.minOverall) return false;
    if (ws.filter === 'all') return true;
    if (ws.filter === 'picked') return f.picks.includes(p.id);
    if (ws.filter === 'rookie') return isRookieCandidate(f, p);
    if (ws.filter === 'veteran') return !isRookieCandidate(f, p);
    return groupOf(p) === ws.filter;
  });
  // 並べ替え：第1条件 → 第2条件 → おすすめ順。対象外の選手は、向きに関係なく下へ
  const cmp = (a: Player, b: Player, key: SortKey, desc: boolean) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1;
    // 総合評価などは小数なので、表示と同じ整数で比べる（同じ数字なら第2条件へ）
    const ra = Math.round(va);
    const rb = Math.round(vb);
    return desc ? rb - ra : ra - rb;
  };
  list = list.sort((a, b) =>
    cmp(a, b, ws.sortKey, ws.desc)
    || (ws.sortKey2 !== 'none' ? cmp(a, b, ws.sortKey2, ws.desc2) : 0)
    || sortValue(b, 'value')! - sortValue(a, 'value')!);
  const rookies = f.picks.filter((id) => isRookieCandidate(f, f.players.find((p) => p.id === id)!)).length;
  const counter = f.method === 'expansion'
    ? `指名 ${f.picks.length}/${EXPANSION_PICKS}人（1球団${expansionMaxPerTeam(f)}人まで）`
    : `自由契約 ${f.picks.length - rookies}/${TRYOUT_MAX}人・新人 ${rookies}/${ROOKIE_MAX}人`;
  const filters: [WizardState['filter'], string][] = [['all', '全員'], ['P', '投手'], ['C', '捕手'], ['IF', '内野'], ['OF', '外野'], ...(f.method === 'tryout' ? [['veteran', '自由契約'], ['rookie', '新人']] as [WizardState['filter'], string][] : []), ['picked', '獲得済み']];
  return `${header(f.method === 'expansion' ? '③ エクスパンションドラフト' : '③ トライアウト＋新人')}
    <div class="card"><b>${counter}</b><p class="muted small">足りないポジションは、最後に自動で埋めます。「総合」と「即」は今の力、「将」は将来性（ランクのみ）です。</p>
      <div class="row"><button class="sub" id="pk-auto">おまかせで残りを獲る</button><button id="wz-next">確認へ</button></div></div>
    <div class="row" style="margin-bottom:8px">
      <label>並び順 <select id="pk-sort">${SORTS.map(([k, l]) => opt(k, l, ws.sortKey)).join('')}</select></label>
      <div class="seg" style="margin:0;flex:1"><button class="${ws.desc ? 'on' : ''}" data-desc="1">${ws.sortKey === 'age' ? '年上から' : '高い順'}</button><button class="${ws.desc ? '' : 'on'}" data-desc="0">${ws.sortKey === 'age' ? '若い順' : '低い順'}</button></div>
    </div>
    <div class="row" style="margin-bottom:8px">
      <label>第2条件 <select id="pk-sort2">${opt<string>('none', 'なし', ws.sortKey2)}${SORTS.filter(([k]) => k !== ws.sortKey).map(([k, l]) => opt<string>(k, l, ws.sortKey2)).join('')}</select></label>
      ${ws.sortKey2 !== 'none' ? `<div class="seg" style="margin:0;flex:1"><button class="${ws.desc2 ? 'on' : ''}" data-desc2="1">${ws.sortKey2 === 'age' ? '年上から' : '高い順'}</button><button class="${ws.desc2 ? '' : 'on'}" data-desc2="0">${ws.sortKey2 === 'age' ? '若い順' : '低い順'}</button></div>` : ''}
    </div>
    <div class="row" style="margin-bottom:8px">
      <label>絞り込み 総合 <select id="pk-min">${[0, 40, 50, 60, 70].map((n) => opt(n, n === 0 ? '指定なし' : `${n}以上`, ws.minOverall)).join('')}</select></label>
      <span class="muted small">${list.length}人</span>
    </div>
    <div class="teamtabs" style="margin-bottom:8px">${filters.map(([k, l]) => `<button class="${ws.filter === k ? '' : 'sub'}" data-filter="${k}">${l}</button>`).join('')}</div>
    <div class="card">${list.slice(0, ws.shown).map((p) => candidateRow(f, p)).join('') || '<p class="muted">該当する選手はいません</p>'}
      ${list.length > ws.shown ? `<button class="sub" id="pk-more" style="width:100%;margin-top:8px">もっと見る（残り${list.length - ws.shown}人）</button>` : ''}</div>
    <div class="row"><button class="sub" id="wz-back">集め方を選び直す</button></div>`;
}

// ---------- ④ 確認 ----------
function stepConfirm(): string {
  const f = ws.founding!;
  const c = ws.config;
  const mine = f.players.filter((p) => p.teamId === f.userTeamId);
  const top = mine.slice().sort((a, b) => overall(b) - overall(a)).slice(0, 8);
  return `${header('④ 確認')}
    ${preview()}
    <div class="card small">
      <p>${LEAGUE_NAMES[ws.userLeague]}に参入｜${LEAGUE_NAMES[0]} ${c.teamCounts[0]}球団・${LEAGUE_NAMES[1]} ${c.teamCounts[1]}球団</p>
      <p>試合数 ${c.games ?? '自動'}｜交流戦 ${{ period: '期間集中型', spread: '分散型', none: 'なし' }[c.interleague.mode]}｜DH ${c.dh.map((d, i) => `${LEAGUE_NAMES[i].slice(0, 2)}${d ? 'あり' : 'なし'}`).join('・')}</p>
      <p>ポストシーズン：各リーグ上位${c.postseason.teams[0]}・${c.postseason.teams[1]}球団${c.postseason.advantage ? '（1位にアドバンテージ）' : ''}</p>
      <p>初期メンバー：${{ omakase: 'おまかせ', expansion: 'エクスパンションドラフト', tryout: 'トライアウト＋新人' }[f.method!]}${f.method !== 'omakase' ? `（獲得 ${f.picks.length}人、残りは自動で補充）` : ''}</p>
    </div>
    ${top.length ? `<h2>主な選手</h2><div class="card">${top.map((p) => `<div class="prow"><div class="grow"><b>${esc(playerTag(p))}</b><div class="abil">${abilityLine(p)}</div></div></div>`).join('')}</div>` : ''}
    <h2>ほかの球団の名前</h2>
    <div class="card">${f.teams.filter((t) => !t.isUser).map((t) => `<div class="row" style="margin-bottom:6px"><span class="muted small" style="width:5.5em">${LEAGUE_NAMES[t.league].replace('リーグ', '')}</span><input data-ai-name="${t.id}" value="${esc(t.name)}" style="flex:1;min-width:0"></div>`).join('')}
      <p class="muted small">AI球団の名前は自動で付けています。ここで変えられます。</p></div>
    <div class="row"><button class="sub" id="wz-back">戻る</button><button id="wz-start">この内容でシーズンを始める</button></div>`;
}

export function renderWizard(el: HTMLElement): void {
  const f = ws.founding;
  el.innerHTML =
    ws.step === 1 ? stepLeague()
    : ws.step === 2 ? stepTeam()
    : ws.step === 3 ? stepMethod()
    : ws.step === 4 ? stepPick()
    : stepConfirm();

  const $ = <T extends HTMLElement>(id: string) => el.querySelector<T>(`#${id}`);
  const val = (id: string) => ($<HTMLInputElement>(id)?.value ?? '').trim();
  const checked = (id: string) => !!$<HTMLInputElement>(id)?.checked;
  const go = (step: WizardState['step']) => { ws.step = step; app.refresh(); };

  if (ws.step === 1) {
    const read = () => {
      const c = ws.config;
      ws.userLeague = Number(val('lg-user')) as 0 | 1;
      c.teamCounts = [Number(val('lg-n0')), Number(val('lg-n1'))];
      const g = val('lg-games');
      c.games = g === '' ? null : Math.max(30, Math.min(200, Number(g)));
      c.interleague = { mode: val('lg-mode') as LeagueConfig['interleague']['mode'], games: Math.max(0, Number(val('lg-inter')) || 0) };
      c.dh = [checked('lg-dh0'), checked('lg-dh1')];
      c.postseason = {
        teams: [Math.min(Number(val('lg-ps0')), c.teamCounts[0]), Math.min(Number(val('lg-ps1')), c.teamCounts[1])],
        advantage: checked('lg-adv'),
      };
    };
    el.querySelectorAll('select, input').forEach((x) => x.addEventListener('change', () => { read(); ws.founding = null; app.refresh(); }));
    $('wz-next')!.addEventListener('click', () => { read(); go(2); });
    $('wz-cancel')!.addEventListener('click', () => { app.screen = 'home'; app.refresh(); });
  }

  if (ws.step === 2) {
    const read = () => {
      const oldCity = ws.city;
      ws.city = val('tm-city') || '新球団';
      ws.nickname = val('tm-nick');
      ws.shortName = val('tm-short').slice(0, SHORT_NAME_MAX);
      // 略称が地名の頭のままなら、地名に合わせて変える
      if (!ws.shortName || ws.shortName === oldCity.slice(0, SHORT_NAME_MAX)) ws.shortName = ws.city.slice(0, Math.min(SHORT_NAME_MAX, 2));
      ws.homePref = val('tm-pref');
      ws.stadium = {
        name: val('st-name') || `${ws.city}スタジアム`,
        size: val('st-size') as Stadium['size'],
        fence: val('st-fence') as Stadium['fence'],
        terrace: checked('st-terrace'),
        dome: checked('st-dome'),
        turf: val('st-turf') as Stadium['turf'],
        seaside: checked('st-sea'),
      };
      const mv = val('lg-motif');
      const emoji = mv.startsWith('e:') ? mv.slice(2) : undefined;
      ws.logo = { shape: val('lg-shape') as Logo['shape'], motif: emoji ? 'none' : (mv as Logo['motif']), ...(emoji ? { emoji } : {}), text: val('lg-text').slice(0, 3), main: val('lg-main'), sub: val('lg-sub') };
      // 作りかけのメンバーがあれば、新球団の情報だけ書き換える
      if (ws.founding) {
        const u = ws.founding.teams.find((t) => t.isUser)!;
        Object.assign(u, teamInput());
      }
    };
    const updatePreview = () => { read(); $('wz-preview')!.innerHTML = preview(); };
    // 文字の入力中は画面を作り直さない（キーボードが閉じないように）
    el.querySelectorAll('input[type=text], input:not([type])').forEach((x) => x.addEventListener('input', updatePreview));
    el.querySelectorAll('select, input[type=checkbox], input[type=color]').forEach((x) => x.addEventListener('change', () => { read(); app.refresh(); }));
    el.querySelectorAll<HTMLButtonElement>('[data-motif]').forEach((b) => b.addEventListener('click', () => {
      ($('lg-motif') as HTMLInputElement).value = b.dataset.motif!;
      read();
      app.refresh();
    }));
    $('tm-nick-pick')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      if (v) { $<HTMLInputElement>('tm-nick')!.value = v; read(); app.refresh(); }
    });
    el.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) => b.addEventListener('click', () => {
      const [m, s] = COLOR_CANDIDATES[Number(b.dataset.color)];
      read();
      ws.logo.main = m;
      ws.logo.sub = s;
      app.refresh();
    }));
    $('wz-back')!.addEventListener('click', () => { read(); go(1); });
    $('wz-next')!.addEventListener('click', () => {
      read();
      if (!ws.nickname) return alert('愛称を入れてください');
      go(3);
    });
  }

  if (ws.step === 3) {
    el.querySelectorAll<HTMLButtonElement>('[data-method]').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.method as MemberMethod;
      if (!ws.founding) ws.founding = startFounding(ws.seed, 2027, ws.config, ws.userLeague, teamInput());
      if (ws.founding.method !== m) {
        if (ws.founding.picks.length && !confirm('獲得した選手の選択が消えます。よろしいですか？')) return;
        chooseMethod(ws.founding, m);
        ws.filter = 'all';
        ws.shown = 40;
      }
      go(m === 'omakase' ? 5 : 4);
    }));
    $('wz-back')!.addEventListener('click', () => go(2));
  }

  if (ws.step === 4 && f) {
    el.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      const why = pick(f, Number(b.dataset.pick));
      if (why) alert(why);
      app.refresh();
    }));
    el.querySelectorAll<HTMLButtonElement>('[data-unpick]').forEach((b) => b.addEventListener('click', () => { unpick(f, Number(b.dataset.unpick)); app.refresh(); }));
    el.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => b.addEventListener('click', () => { ws.filter = b.dataset.filter as WizardState['filter']; ws.shown = 40; app.refresh(); }));
    $('pk-more')?.addEventListener('click', () => { ws.shown += 40; app.refresh(); });
    $('pk-sort')!.addEventListener('change', (e) => {
      ws.sortKey = (e.target as HTMLSelectElement).value as SortKey;
      // 年齢は若い順、それ以外は高い順から
      ws.desc = ws.sortKey !== 'age';
      if (ws.sortKey2 === ws.sortKey) ws.sortKey2 = 'none';
      ws.shown = 40;
      app.refresh();
    });
    el.querySelectorAll<HTMLButtonElement>('[data-desc]').forEach((b) => b.addEventListener('click', () => { ws.desc = b.dataset.desc === '1'; ws.shown = 40; app.refresh(); }));
    $('pk-min')!.addEventListener('change', (e) => { ws.minOverall = Number((e.target as HTMLSelectElement).value); ws.shown = 40; app.refresh(); });
    $('pk-sort2')!.addEventListener('change', (e) => {
      ws.sortKey2 = (e.target as HTMLSelectElement).value as SortKey | 'none';
      ws.desc2 = ws.sortKey2 !== 'age';
      ws.shown = 40;
      app.refresh();
    });
    el.querySelectorAll<HTMLButtonElement>('[data-desc2]').forEach((b) => b.addEventListener('click', () => { ws.desc2 = b.dataset.desc2 === '1'; ws.shown = 40; app.refresh(); }));
    $('pk-auto')!.addEventListener('click', () => { autoPick(f); app.refresh(); });
    $('wz-next')!.addEventListener('click', () => go(5));
    $('wz-back')!.addEventListener('click', () => go(3));
  }

  if (ws.step === 5 && f) {
    el.querySelectorAll<HTMLInputElement>('[data-ai-name]').forEach((x) => x.addEventListener('change', () => {
      const t = f.teams.find((tt) => tt.id === Number(x.dataset.aiName))!;
      if (x.value.trim()) t.name = x.value.trim();
    }));
    $('wz-back')!.addEventListener('click', () => go(f.method === 'omakase' ? 3 : 4));
    $('wz-start')!.addEventListener('click', () => {
      // 獲得した人数が少ないときは確認する
      if (f.method !== 'omakase' && f.picks.length === 0 && !confirm('まだ誰も獲得していません。全員を自動で補充して始めますか？')) return;
      app.world = finishFounding(f);
      app.lastGame = null;
      ws = initial();
      app.screen = 'home';
      app.refresh();
    });
  }
}
