// 表彰：リーグごとのタイトル、MVP、新人王
import { QUALIFY_IP_PER_GAME, QUALIFY_PA_PER_GAME } from '../../config/league';
import { fullName } from '../labels';
import { avg, era, ops } from '../season/stats';
import type { Award, PlayerSeason, World } from '../season/types';
import type { Player } from '../types';

/** 打者・投手の活躍の点数（MVP・新人王に使う） */
export function valueScore(p: Player, s: PlayerSeason): number {
  if (p.mainPos === 'P') {
    const ip = s.pitch.outs / 3;
    if (ip <= 0) return 0;
    return (3.8 - era(s.pitch)) * ip / 9 + s.pitch.w * 0.5 + s.pitch.sv * 0.25 + s.pitch.hld * 0.1;
  }
  const b = s.bat;
  if (b.pa <= 0) return 0;
  return (ops(b) - 0.68) * b.pa / 12 + b.hr * 0.15 + b.sb * 0.05;
}

export function computeAwards(w: World): Award[] {
  const stats = w.season.stats.first;
  const games = w.season.schedule.games;
  const out: Award[] = [];
  const byId = new Map(w.players.map((p) => [p.id, p]));
  for (const lg of [0, 1] as const) {
    const teamIds = new Set(w.teams.filter((t) => t.league === lg).map((t) => t.id));
    const list = Object.entries(stats)
      .map(([id, s]) => ({ p: byId.get(Number(id))!, s }))
      .filter((x) => x.p && x.p.teamId != null && teamIds.has(x.p.teamId));
    const add = (title: string, x: { p: Player; s: PlayerSeason } | undefined, value: string) => {
      if (!x) return;
      out.push({ league: lg, title, playerId: x.p.id, playerName: fullName(x.p), teamId: x.p.teamId!, value });
    };
    const best = <T>(arr: T[], key: (x: T) => number, low = false) => arr.slice().sort((a, b) => (low ? key(a) - key(b) : key(b) - key(a)))[0];
    const qb = list.filter((x) => x.s.bat.pa >= games * QUALIFY_PA_PER_GAME);
    const qp = list.filter((x) => x.s.pitch.outs / 3 >= games * QUALIFY_IP_PER_GAME);
    const r3 = (v: number) => v.toFixed(3).replace(/^0/, '');
    let x = best(qb, (y) => avg(y.s.bat));
    add('首位打者', x, x ? r3(avg(x.s.bat)) : '');
    x = best(list, (y) => y.s.bat.hr);
    if (x && x.s.bat.hr > 0) add('本塁打王', x, `${x.s.bat.hr}本`);
    x = best(list, (y) => y.s.bat.rbi);
    if (x && x.s.bat.rbi > 0) add('打点王', x, `${x.s.bat.rbi}打点`);
    x = best(list, (y) => y.s.bat.sb);
    if (x && x.s.bat.sb > 0) add('盗塁王', x, `${x.s.bat.sb}盗塁`);
    x = best(list, (y) => y.s.pitch.w);
    if (x && x.s.pitch.w > 0) add('最多勝', x, `${x.s.pitch.w}勝`);
    x = best(qp, (y) => era(y.s.pitch), true);
    add('最優秀防御率', x, x ? era(x.s.pitch).toFixed(2) : '');
    x = best(list, (y) => y.s.pitch.sv);
    if (x && x.s.pitch.sv > 0) add('最多セーブ', x, `${x.s.pitch.sv}S`);
    x = best(list, (y) => y.s.pitch.k);
    if (x && x.s.pitch.k > 0) add('最多奪三振', x, `${x.s.pitch.k}奪三振`);
    x = best(list, (y) => valueScore(y.p, y.s));
    if (x) add('MVP', x, '');
    // 新人王：プロ1年目（年度を締める前なので proYears が0）
    const rookies = list.filter((y) => y.p.proYears === 0);
    x = best(rookies, (y) => valueScore(y.p, y.s));
    if (x && valueScore(x.p, x.s) > 0) add('新人王', x, '');
  }
  return out;
}
