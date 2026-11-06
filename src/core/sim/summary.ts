// 試合後の「勝因・敗因」の文を作る
import type { OffenseTactic, Player } from '../types';
import type { BatLine, GameResult, GameTeam, PitchLine } from './types';

const TACTIC_LABEL: Record<OffenseTactic, string> = {
  normal: '標準', slugging: '打て打て', speed: '機動力重視', small: 'スモールベースボール', defense: '守り勝つ',
};

function findPlayer(gt: GameTeam, id: number): Player | undefined {
  const all = [...gt.lineup.map((s) => s.player), ...gt.bench, gt.starter, ...gt.setup, ...(gt.closer ? [gt.closer] : []), ...gt.bullpen];
  return all.find((p) => p.id === id);
}

const nameOf = (gt: GameTeam, id: number) => findPlayer(gt, id)?.familyName ?? '?';
const ip = (outs: number) => `${Math.floor(outs / 3)}回${outs % 3 ? `${outs % 3}/3` : ''}`;

/** 打者の活躍度（大まかな点数） */
function batScore(b: BatLine): number {
  return b.h + b.d + b.t * 2 + b.hr * 3 + b.rbi * 1.2 + b.bb * 0.5 + b.sb * 0.5;
}

function bestBatter(lines: BatLine[]): BatLine | null {
  let best: BatLine | null = null;
  for (const b of lines) if (!best || batScore(b) > batScore(best)) best = b;
  return best && batScore(best) >= 3 ? best : null;
}

function batText(gt: GameTeam, b: BatLine): string {
  const parts = [`${b.ab}打数${b.h}安打`];
  if (b.hr) parts.push(`${b.hr}本塁打`);
  if (b.rbi) parts.push(`${b.rbi}打点`);
  return `${nameOf(gt, b.playerId)}が${parts.join('')}`;
}

function starterText(gt: GameTeam, p: PitchLine): string {
  return `先発${nameOf(gt, p.playerId)}が${ip(p.outs)}${p.r}失点`;
}

export function makeSummary(r: GameResult, away: GameTeam, home: GameTeam): string[] {
  if (r.tie) return [`延長${r.line[0].length}回で引き分け。`];
  const w = r.score[1] > r.score[0] ? 1 : 0;
  const l = 1 - w;
  const wt = w === 1 ? home : away;
  const lt = l === 1 ? home : away;
  const out: string[] = [];

  // 勝因
  const reasons: string[] = [];
  const wStarter = r.pitching[w][0];
  if (wStarter.outs >= 18 && wStarter.r <= 2) reasons.push(`${starterText(wt, wStarter)}の好投`);
  const hero = bestBatter(r.batting[w]);
  if (hero) reasons.push(batText(wt, hero));
  const wHr = r.batting[w].reduce((s, b) => s + b.hr, 0);
  const wSb = r.batting[w].reduce((s, b) => s + b.sb, 0);
  const wSh = r.batting[w].reduce((s, b) => s + b.sh, 0);
  const t = wt.tactics.offense;
  if (t === 'slugging' && wHr >= 2) reasons.push(`「${TACTIC_LABEL[t]}」がはまり${wHr}本塁打`);
  else if (t === 'speed' && wSb >= 2) reasons.push(`「${TACTIC_LABEL[t]}」が効き盗塁${wSb}`);
  else if (t === 'small' && wSh >= 2) reasons.push(`「${TACTIC_LABEL[t]}」で送りバント${wSh}つを得点につなげた`);
  else if (t === 'defense' && r.errors[w] === 0 && r.score[l] <= 2) reasons.push(`「${TACTIC_LABEL[t]}」で無失策・${r.score[l]}失点`);
  if (r.save) reasons.push(`抑えの${nameOf(wt, r.save)}が逃げ切り`);
  if (reasons.length === 0) reasons.push(`${r.hits[w]}安打で${r.score[w]}点`);
  out.push(`勝因：${reasons.slice(0, 2).join('。')}。`);

  // 敗因
  const lose: string[] = [];
  const lStarter = r.pitching[l][0];
  if (lStarter.r >= 4) lose.push(starterText(lt, lStarter));
  if (r.errors[l] >= 2) lose.push(`失策${r.errors[l]}`);
  const lh = r.hits[l];
  if (lh <= 5) lose.push(`打線が${lh}安打に抑えられた`);
  const lGidp = r.batting[l].reduce((s, b) => s + b.gidp, 0);
  if (lGidp >= 2) lose.push(`併殺打${lGidp}`);
  if (lose.length === 0 && r.loss) lose.push(`${nameOf(lt, r.loss)}が勝ち越しを許した`);
  out.push(`敗因：${lose.slice(0, 2).join('。')}。`);
  return out;
}
