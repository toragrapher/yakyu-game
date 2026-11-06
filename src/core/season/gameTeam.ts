// その日の試合に出る編成を作る（一軍・二軍）
import { ROTATION_SIZE } from '../../config/league';
import { FATIGUE } from '../../config/season';
import { pitcherOverall } from '../ratings';
import { buildGameTeam } from '../sim/lineup';
import type { GameTeam } from '../sim/types';
import type { Player, Team } from '../types';
import { relieverAvailable } from './firstTeam';
import { lineupProblem } from './lineupCheck';
import type { LevelKey, World } from './types';

const spValue = (p: Player) => (p.pitch ? pitcherOverall(p.pitch, 'SP') : 0);

/** その球団・その軍の選手 */
export function levelPlayers(w: World, teamId: number, level: LevelKey): Player[] {
  const reg = new Set(w.season.firstTeam[teamId] ?? []);
  return w.players.filter((p) => p.teamId === teamId && !p.retired && (level === 'first' ? reg.has(p.id) : !reg.has(p.id)));
}

/** 先発ローテーション（設定があればそれ、なければ先発投手の上位） */
export function rotationOf(w: World, teamId: number, level: LevelKey, players: Player[]): Player[] {
  const pitchers = players.filter((p) => p.mainPos === 'P');
  const setting = level === 'first' ? w.season.settings[teamId]?.rotation : null;
  if (setting) {
    const rot = setting.map((id) => pitchers.find((p) => p.id === id)).filter((p): p is Player => !!p);
    if (rot.length >= 4) return rot;
  }
  const sps = pitchers.filter((p) => p.role === 'SP').sort((a, b) => spValue(b) - spValue(a));
  const rot = sps.slice(0, ROTATION_SIZE);
  if (rot.length < ROTATION_SIZE) {
    // 先発が足りなければ、体力のある投手で埋める
    const extra = pitchers.filter((p) => !rot.includes(p)).sort((a, b) => (b.pitch?.stamina ?? 0) - (a.pitch?.stamina ?? 0));
    rot.push(...extra.slice(0, ROTATION_SIZE - rot.length));
  }
  return rot;
}

export function makeGameTeam(w: World, team: Team, level: LevelKey, dh: boolean): GameTeam | null {
  const players = levelPlayers(w, team.id, level);
  const pitchers = players.filter((p) => p.mainPos === 'P');
  const fielders = players.filter((p) => p.mainPos !== 'P');
  if (pitchers.length === 0 || fielders.length < 9) return null;
  const settings = w.season.settings[team.id];

  // 先発：ローテーションの順番で、疲れの取れている投手
  const rot = rotationOf(w, team.id, level, players);
  const key = `${team.id}:${level}`;
  const start = w.season.rotationIdx[key] ?? 0;
  let starter: Player | null = null;
  for (let i = 0; i < rot.length; i++) {
    const p = rot[(start + i) % rot.length];
    if (p.fatigue <= FATIGUE.starterReadyAt) {
      starter = p;
      w.season.rotationIdx[key] = (start + i + 1) % rot.length;
      break;
    }
  }
  if (!starter) {
    // 全員疲れていれば、一番疲れていない投手
    starter = pitchers.slice().sort((a, b) => a.fatigue - b.fatigue)[0];
    w.season.rotationIdx[key] = (start + 1) % Math.max(1, rot.length);
  }

  // 中継ぎ：ローテーション以外で、連投や疲労で休みでない投手
  const rotIds = new Set(rot.map((p) => p.id));
  let pen = pitchers.filter((p) => p.id !== starter!.id && !rotIds.has(p.id) && p.fatigue <= FATIGUE.relieverReadyAt && relieverAvailable(w.season.recentPitches[p.id] ?? [0, 0]));
  if (pen.length < 3) {
    // 足りなければ、疲れの少ない投手を加える
    const more = pitchers.filter((p) => p.id !== starter!.id && !pen.includes(p)).sort((a, b) => a.fatigue - b.fatigue);
    pen = [...pen, ...more.slice(0, 3 - pen.length)];
  }

  // 野手：一軍で打順の設定があれば使う（登録外の選手がいれば自動に戻す）
  let lineup: { player: Player; pos: NonNullable<NonNullable<typeof settings>['lineup']>[number]['pos'] }[] | undefined;
  if (level === 'first' && settings?.lineup && !lineupProblem(settings.lineup, new Set(fielders.map((p) => p.id)))) {
    lineup = settings.lineup.map((s) => ({ player: fielders.find((p) => p.id === s.playerId)!, pos: s.pos }));
  }
  let usable = fielders;
  if (!lineup) {
    // 疲れている野手は休ませる（ただし9人と捕手1人は残す）
    const rested = fielders.filter((p) => p.fatigue < FATIGUE.fielderRestAt);
    if (rested.length >= 9 && rested.some((p) => p.mainPos === 'C')) usable = rested;
  }

  const closer = level === 'first' && settings?.closer != null ? pen.find((p) => p.id === settings.closer) ?? null : undefined;
  const setup = level === 'first' && settings?.setup ? settings.setup.map((id) => pen.find((p) => p.id === id)).filter((p): p is Player => !!p) : undefined;

  const gt = buildGameTeam(team, [...usable, starter, ...pen], {
    dh,
    starter,
    tactics: settings?.tactics,
    lineup,
    closer,
    setup,
  });
  // 控えには休ませた野手も入れておく（代打用）
  for (const p of fielders) if (!gt.bench.includes(p) && !gt.lineup.some((s) => s.player === p)) gt.bench.push(p);
  return gt;
}
