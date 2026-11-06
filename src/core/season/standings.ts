// 順位表
import type { LevelKey, Standing, World } from './types';

export interface StandingRow extends Standing {
  teamId: number;
  games: number;
  pct: number;
  /** 首位とのゲーム差（首位は0） */
  gb: number;
}

export function winPct(s: Standing): number {
  return s.w + s.l > 0 ? s.w / (s.w + s.l) : 0;
}

export function standingsTable(w: World, level: LevelKey, league: 0 | 1): StandingRow[] {
  const rows = w.teams
    .filter((t) => t.league === league)
    .map((t) => {
      const s = w.season.standings[level][t.id];
      return { ...s, teamId: t.id, games: s.w + s.l + s.t, pct: winPct(s), gb: 0 };
    })
    .sort((a, b) => b.pct - a.pct || b.w - a.w || (b.rs - b.ra) - (a.rs - a.ra));
  const top = rows[0];
  for (const r of rows) r.gb = (top.w - r.w + (r.l - top.l)) / 2;
  return rows;
}

/** 球団の順位（1始まり） */
export function rankOfTeam(w: World, level: LevelKey, teamId: number): number {
  const t = w.teams.find((x) => x.id === teamId)!;
  return standingsTable(w, level, t.league).findIndex((r) => r.teamId === teamId) + 1;
}
