// ポストシーズンの組み合わせと結果の表示
import { LEAGUE_NAMES } from '../../config/league';
import { POSTSEASON_NAMES } from '../../config/postseason';
import { dateLabel } from '../../core/season/dates';
import type { Series, World } from '../../core/season/types';
import { esc } from '../common';
import { logoSvg } from '../logo';

function seriesCard(w: World, sr: Series): string {
  const team = (id: number) => w.teams.find((t) => t.id === id)!;
  const short = sr.name.replace(/^.+リーグ /, '').replace(`${POSTSEASON_NAMES.league} `, '');
  const row = (i: 0 | 1) => {
    const t = team(sr.teams[i]);
    const won = sr.winnerId === t.id;
    const lost = sr.winnerId != null && !won;
    return `<div class="ps-team ${t.id === w.userTeamId ? 'mine' : ''}" style="${lost ? 'opacity:.5' : ''}">
      ${logoSvg(t.logo, 24)}<span class="grow">${esc(t.name)}${i === 0 && sr.advantage ? ' <span class="muted small">（1勝分のアドバンテージ）</span>' : ''}</span>
      <b class="ps-wins">${sr.wins[i]}</b>${won ? ' <span class="win">勝ち抜け</span>' : ''}
    </div>`;
  };
  const marks = sr.games.map((g) => {
    const top = g.winnerId == null ? '△' : g.winnerId === sr.teams[0] ? '◯' : '●';
    return `<span title="${dateLabel(g.date)} ${g.score[0]}-${g.score[1]}">${top}</span>`;
  }).join('');
  return `<div class="ps-card">
    <div class="small"><b>${esc(short)}</b> <span class="muted">${sr.winsNeeded}勝で勝ち抜け</span></div>
    ${row(0)}${row(1)}
    ${sr.games.length ? `<div class="ps-marks small muted">上位から見て ${marks}</div>` : '<div class="small muted">これから</div>'}
  </div>`;
}

export function renderPostseason(w: World): string {
  const ps = w.season.postseason!;
  const champion = ps.championId != null ? w.teams.find((t) => t.id === ps.championId)! : null;
  const league = (lg: 0 | 1) => {
    const list = ps.series.filter((x) => x.key === (lg === 0 ? 'L0' : 'L1'));
    const seeds = ps.seeds[lg].map((id, i) => `${i + 1}位 ${esc(w.teams.find((t) => t.id === id)!.shortName)}`).join('・');
    return `<h2>${LEAGUE_NAMES[lg]} ${POSTSEASON_NAMES.league}</h2>
      <p class="muted small">進出：${seeds}</p>
      ${list.length ? list.map((sr) => seriesCard(w, sr)).join('') : '<p class="small">1位が勝ち上がりです。</p>'}`;
  };
  const final = ps.series.find((x) => x.key === 'C');
  return `
    ${champion ? `<div class="hero" style="--tc:${champion.colorMain};text-align:center">
      <div>${logoSvg(champion.logo, 72)}</div>
      <div class="hero-name">${esc(champion.name)}</div>
      <div>${POSTSEASON_NAMES.championship}を制し、日本一！</div>
    </div>` : ''}
    <h2>${POSTSEASON_NAMES.championship}</h2>
    ${final ? seriesCard(w, final) : '<p class="muted small">両リーグの勝者が決まると始まります。</p>'}
    ${league(0)}
    ${league(1)}`;
}
