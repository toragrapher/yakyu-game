// 支配下の人数と登録枠、ポジション別の内訳（ロッカー・補強・ドラフト・契約更改で使う）
import { ROSTER_LIMIT } from '../config/league';
import type { World } from '../core/season/types';
import type { Player } from '../core/types';

type Group = 'SP' | 'RP' | 'CL' | 'C' | 'IF' | 'OF';
const LABEL: Record<Group, string> = { SP: '先発', RP: '中継ぎ', CL: '抑え', C: '捕手', IF: '内野', OF: '外野' };

function groupOf(p: Player): Group {
  if (p.mainPos === 'P') return p.role === 'SP' ? 'SP' : p.role === 'CL' ? 'CL' : 'RP';
  if (p.mainPos === 'C') return 'C';
  if (p.mainPos === 'OF') return 'OF';
  return 'IF';
}

function count(ps: Player[]): Record<Group, number> {
  const c: Record<Group, number> = { SP: 0, RP: 0, CL: 0, C: 0, IF: 0, OF: 0 };
  for (const p of ps) c[groupOf(p)]++;
  return c;
}

/** 内訳の1行（例：投手34（先発14・中継ぎ18・抑え2）／捕手5／内野14／外野15） */
function breakdown(c: Record<Group, number>): string {
  const pit = c.SP + c.RP + c.CL;
  return `投手${pit}（${LABEL.SP}${c.SP}・${LABEL.RP}${c.RP}・${LABEL.CL}${c.CL}）／${LABEL.C}${c.C}／${LABEL.IF}${c.IF}／${LABEL.OF}${c.OF}`;
}

/**
 * 支配下と育成の人数・内訳のカード。
 * ドラフト中は、指名済み（まだ入団していない）選手を足した入団後の人数も出す
 */
export function rosterSummary(w: World): string {
  const mine = w.players.filter((p) => p.teamId === w.userTeamId && !p.retired);
  const roster = mine.filter((p) => p.contract === 'roster');
  const ikusei = mine.filter((p) => p.contract === 'ikusei');
  const d = w.draft;
  // ドラフト中の指名（入団前）
  const pending = d && d.phase !== 'done' && d.phase !== 'scouting'
    ? d.picks.filter((x) => x.teamId === w.userTeamId).map((x) => ({ pick: x, p: d.candidates.find((c) => c.id === x.playerId)! })).filter((x) => x.p)
    : [];
  const pendRoster = pending.filter((x) => !x.pick.ikusei).map((x) => x.p);
  const pendIkusei = pending.filter((x) => x.pick.ikusei).map((x) => x.p);
  const after = roster.length + pendRoster.length;
  const over = (n: number) => (n > ROSTER_LIMIT ? 'lose' : '');
  return `<div class="card small roster-sum">
    <div class="row" style="justify-content:space-between">
      <span>支配下 <b class="${over(roster.length)}" style="font-size:16px">${roster.length}</b>/${ROSTER_LIMIT}人（空き${Math.max(0, ROSTER_LIMIT - roster.length)}）</span>
      <span>育成 <b>${ikusei.length}</b>人</span>
    </div>
    <div class="muted">支配下：${breakdown(count(roster))}</div>
    ${ikusei.length ? `<div class="muted">育成：${breakdown(count(ikusei))}</div>` : ''}
    ${pending.length ? `<div style="margin-top:4px">指名済み：支配下${pendRoster.length}人・育成${pendIkusei.length}人 → 入団後 支配下 <b class="${over(after)}">${after}</b>/${ROSTER_LIMIT}人${after > ROSTER_LIMIT ? '（オフの戦力の整理で70人以内にします）' : ''}
      <div class="muted">指名済みの内訳：${breakdown(count([...pendRoster, ...pendIkusei]))}</div></div>` : ''}
  </div>`;
}
