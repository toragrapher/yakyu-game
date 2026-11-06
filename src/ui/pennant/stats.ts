// 成績の画面（打撃・投手、一軍・二軍、リーグ・自球団）
import { LEAGUE_NAMES, QUALIFY_IP_PER_GAME, QUALIFY_PA_PER_GAME } from '../../config/league';
import { fullName } from '../../core/labels';
import { avg, era, holdPoints, ipLabel, ops, rate3 } from '../../core/season/stats';
import type { BatTotals, LevelKey, PitchTotals } from '../../core/season/types';
import type { Player } from '../../core/types';
import { app } from '../app';
import { esc, posShort, teamChip } from '../common';

let level: LevelKey = 'first';
let kind: 'bat' | 'pitch' = 'bat';
let scope: 'mine' | 0 | 1 = 'mine';
type BatSort = 'avg' | 'hr' | 'rbi' | 'sb' | 'ops';
type PitchSort = 'era' | 'w' | 'sv' | 'k' | 'hp';
let sortBat: BatSort = 'avg';
let sortPitch: PitchSort = 'era';

const BAT_SORTS: [BatSort, string][] = [['avg', '打率'], ['hr', '本塁打'], ['rbi', '打点'], ['sb', '盗塁'], ['ops', 'OPS']];
const PITCH_SORTS: [PitchSort, string][] = [['era', '防御率'], ['w', '勝利'], ['sv', 'セーブ'], ['hp', 'ホールドポイント'], ['k', '奪三振']];

export function renderStats(el: HTMLElement): void {
  const w = app.world!;
  const stats = w.season.stats[level];
  const byId = new Map(w.players.map((p) => [p.id, p]));
  const teamOf = (p: Player) => w.teams.find((t) => t.id === p.teamId);
  // 規定（試合を消化した分だけ）
  const played = (tid: number) => {
    const s = w.season.standings[level][tid];
    return s.w + s.l + s.t;
  };
  const inScope = (p: Player) => {
    if (scope === 'mine') return p.teamId === w.userTeamId;
    return teamOf(p)?.league === scope;
  };
  const rows: { p: Player; bat: BatTotals; pitch: PitchTotals }[] = [];
  for (const [id, s] of Object.entries(stats)) {
    const p = byId.get(Number(id));
    if (p && inScope(p)) rows.push({ p, bat: s.bat, pitch: s.pitch });
  }

  let table = '';
  if (kind === 'bat') {
    let list = rows.filter((r) => r.bat.pa > 0);
    const qualified = (r: (typeof rows)[number]) => r.bat.pa >= played(r.p.teamId!) * QUALIFY_PA_PER_GAME;
    if (scope !== 'mine' && (sortBat === 'avg' || sortBat === 'ops')) list = list.filter(qualified);
    const key = (r: (typeof rows)[number]) => (sortBat === 'avg' ? avg(r.bat) : sortBat === 'ops' ? ops(r.bat) : r.bat[sortBat]);
    list.sort((a, b) => key(b) - key(a) || b.bat.pa - a.bat.pa);
    if (scope === 'mine') list.sort((a, b) => b.bat.pa - a.bat.pa);
    table = `<table class="box"><tr><th class="tl">選手</th><th>試</th><th>打率</th><th>本</th><th>点</th><th>盗</th><th>OPS</th><th>打席</th></tr>
      ${list.slice(0, 40).map((r) => `<tr class="${r.p.teamId === w.userTeamId && scope !== 'mine' ? 'mine' : ''}"><td class="tl">${scope === 'mine' ? '' : teamChip(teamOf(r.p)) + ' '}${esc(fullName(r.p))}<span class="muted small"> ${posShort(r.p)}</span></td><td>${r.bat.g}</td><td>${rate3(avg(r.bat))}</td><td>${r.bat.hr}</td><td>${r.bat.rbi}</td><td>${r.bat.sb}</td><td>${rate3(ops(r.bat))}</td><td>${r.bat.pa}${scope === 'mine' && !qualified(r) ? '' : ''}</td></tr>`).join('')}
    </table>`;
  } else {
    let list = rows.filter((r) => r.pitch.g > 0);
    const qualified = (r: (typeof rows)[number]) => r.pitch.outs / 3 >= played(r.p.teamId!) * QUALIFY_IP_PER_GAME;
    if (scope !== 'mine' && sortPitch === 'era') list = list.filter(qualified);
    const key = (r: (typeof rows)[number]) => (sortPitch === 'era' ? -era(r.pitch) : sortPitch === 'hp' ? holdPoints(r.pitch) : r.pitch[sortPitch]);
    list.sort((a, b) => key(b) - key(a) || b.pitch.outs - a.pitch.outs);
    if (scope === 'mine') list.sort((a, b) => b.pitch.outs - a.pitch.outs);
    table = `<table class="box"><tr><th class="tl">投手</th><th>登</th><th>勝</th><th>敗</th><th>S</th><th>H</th><th>HP</th><th>防御率</th><th>回</th><th>振</th></tr>
      ${list.slice(0, 40).map((r) => `<tr class="${r.p.teamId === w.userTeamId && scope !== 'mine' ? 'mine' : ''}"><td class="tl">${scope === 'mine' ? '' : teamChip(teamOf(r.p)) + ' '}${esc(fullName(r.p))}</td><td>${r.pitch.g}</td><td>${r.pitch.w}</td><td>${r.pitch.l}</td><td>${r.pitch.sv}</td><td>${r.pitch.hld}</td><td>${holdPoints(r.pitch)}</td><td>${era(r.pitch).toFixed(2)}</td><td>${ipLabel(r.pitch.outs)}</td><td>${r.pitch.k}</td></tr>`).join('')}
    </table>`;
  }

  const sorts = kind === 'bat' ? BAT_SORTS : PITCH_SORTS;
  const cur = kind === 'bat' ? sortBat : sortPitch;
  el.innerHTML = `
    <h1>成績</h1>
    <div class="seg"><button class="${level === 'first' ? 'on' : ''}" data-lv="first">一軍</button><button class="${level === 'farm' ? 'on' : ''}" data-lv="farm">二軍</button></div>
    <div class="seg"><button class="${kind === 'bat' ? 'on' : ''}" data-kind="bat">打撃</button><button class="${kind === 'pitch' ? 'on' : ''}" data-kind="pitch">投手</button></div>
    <div class="seg"><button class="${scope === 'mine' ? 'on' : ''}" data-scope="mine">自球団</button><button class="${scope === 0 ? 'on' : ''}" data-scope="0">${LEAGUE_NAMES[0].replace('リーグ', '')}</button><button class="${scope === 1 ? 'on' : ''}" data-scope="1">${LEAGUE_NAMES[1].replace('リーグ', '')}</button></div>
    ${scope !== 'mine' ? `<div class="row" style="margin-bottom:8px"><label>並び順 <select id="sort">${sorts.map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('')}</select></label><span class="muted small">打率・防御率は規定以上</span></div>` : ''}
    <div class="card scroll">${rows.length ? table : '<p class="muted">まだ試合がありません</p>'}</div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-lv]').forEach((b) => b.addEventListener('click', () => { level = b.dataset.lv as LevelKey; app.refresh(); }));
  el.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind as typeof kind; app.refresh(); }));
  el.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach((b) => b.addEventListener('click', () => { scope = b.dataset.scope === 'mine' ? 'mine' : (Number(b.dataset.scope) as 0 | 1); app.refresh(); }));
  el.querySelector('#sort')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (kind === 'bat') sortBat = v as BatSort;
    else sortPitch = v as PitchSort;
    app.refresh();
  });
}
