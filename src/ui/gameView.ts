// 1試合の結果の表示
import { summaryFor } from '../core/sim/summary';
import { weatherLabel } from '../core/sim/weather';
import type { GameResult, GameTeam, LineupPos } from '../core/sim/types';
import type { Player } from '../core/types';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const POS: Record<LineupPos, string> = { P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '遊', OF: '外', DH: '指', PH: '打' };
const ip = (outs: number) => `${Math.floor(outs / 3)}${outs % 3 ? ` ${outs % 3}/3` : ''}`;

function allPlayers(gt: GameTeam): Player[] {
  return [...gt.lineup.map((s) => s.player), ...gt.bench, gt.starter, ...gt.setup, ...(gt.closer ? [gt.closer] : []), ...gt.bullpen];
}

/** userTeamId を渡すと、その球団から見た勝因（勝ち）・敗因（負け）だけを出す */
export function renderGameResult(r: GameResult, away: GameTeam, home: GameTeam, userTeamId: number | null = null): string {
  const gts = [away, home];
  const byId = new Map<number, Player>();
  for (const gt of gts) for (const p of allPlayers(gt)) byId.set(p.id, p);
  // 同じ試合に同じ姓の選手がいるときは、名前まで出す
  const famCount = new Map<string, number>();
  for (const p of byId.values()) famCount.set(p.familyName, (famCount.get(p.familyName) ?? 0) + 1);
  const name = (id: number | null) => {
    if (id == null) return '';
    const p = byId.get(id);
    if (!p) return '?';
    return esc((famCount.get(p.familyName) ?? 0) > 1 ? `${p.familyName}${p.givenName.slice(0, 1)}` : p.familyName);
  };
  const innings = r.line[0].length;

  const head = Array.from({ length: innings }, (_, i) => `<th>${i + 1}</th>`).join('');
  const row = (side: 0 | 1) =>
    `<tr><th class="tl">${esc(gts[side].team.shortName)}</th>${r.line[side].map((x) => `<td>${x == null ? 'x' : x}</td>`).join('')}<td class="b">${r.score[side]}</td><td>${r.hits[side]}</td><td>${r.errors[side]}</td></tr>`;

  const decisions = [
    r.win != null ? `勝 ${name(r.win)}` : '',
    r.loss != null ? `負 ${name(r.loss)}` : '',
    r.save != null ? `S ${name(r.save)}` : '',
  ].filter(Boolean).join('　');

  const batTable = (side: 0 | 1) => `
    <table class="box"><tr><th class="tl">打者</th><th>打</th><th>安</th><th>本</th><th>点</th><th>四</th><th>振</th><th>盗</th></tr>
    ${r.batting[side].slice().sort((a, b) => a.order - b.order).map((b) => `<tr><td class="tl">${b.order}${POS[b.pos]} ${name(b.playerId)}</td><td>${b.ab}</td><td>${b.h}</td><td>${b.hr || ''}</td><td>${b.rbi || ''}</td><td>${b.bb + b.hbp || ''}</td><td>${b.k || ''}</td><td>${b.sb || ''}</td></tr>`).join('')}
    </table>`;
  const pitTable = (side: 0 | 1) => `
    <table class="box"><tr><th class="tl">投手</th><th>回</th><th>球</th><th>安</th><th>振</th><th>四</th><th>失</th><th>責</th></tr>
    ${r.pitching[side].map((p) => `<tr><td class="tl">${name(p.playerId)}${p.decision ? ` <b>${p.decision === 'S' ? 'S' : p.decision === 'H' ? 'H' : p.decision === 'W' ? '勝' : '負'}</b>` : ''}</td><td>${ip(p.outs)}</td><td>${p.pitches}</td><td>${p.h}</td><td>${p.k}</td><td>${p.bb + p.hbp}</td><td>${p.r}</td><td>${p.er}</td></tr>`).join('')}
    </table>`;

  return `
    <div class="card">
      <div class="scroll"><table class="line"><tr><th></th>${head}<th>計</th><th>安</th><th>失</th></tr>${row(0)}${row(1)}</table></div>
      <p>${decisions}${r.tie ? '引き分け' : ''}</p>
      <p class="muted">${esc(weatherLabel(r.weather))}｜${esc(home.team.stadium.name)}｜${r.dh ? 'DHあり' : 'DHなし'}</p>
      ${summaryFor(r, userTeamId).map((s) => `<p>${esc(s)}</p>`).join('')}
    </div>
    ${([0, 1] as const).map((s) => `<h2>${esc(gts[s].team.name)}</h2><div class="card scroll">${batTable(s)}${pitTable(s)}</div>`).join('')}
  `;
}
