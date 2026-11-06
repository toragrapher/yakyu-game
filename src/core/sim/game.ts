// 1試合のシミュレーション（1打席ずつ確率で進める）
import {
  ADVANCE, BUNT, CONDITION_POINTS, FATIGUE_POINTS, IN_PLAY, ORDER_FIT_SLOTS, ORDER_MISFIT_POINTS,
  PARK, PITCHES, PITCHING, PIVOT, STEAL, TACTIC_FIT, WEATHER,
} from '../../config/balance';
import type { Rng } from '../rng';
import type { FieldPos, Player, Team } from '../types';
import { defenseAt } from './lineup';
import { resolvePA, type BatterEff, type ParkEff, type PitcherEff } from './pa';
import { makeSummary } from './summary';
import type { BatLine, GameOptions, GameResult, GameTeam, LineupSlot, PitchLine, Weather } from './types';
import { makeWeather } from './weather';

/** 塁上の走者 */
interface Runner {
  player: Player;
  line: BatLine;
  /** この走者を出した投手（失点の責任） */
  resp: number;
  earned: boolean;
}

interface Side {
  gt: GameTeam;
  lineup: LineupSlot[];
  idx: number;
  pitcher: Player;
  pLine: PitchLine;
  limit: number;
  /** 今の投手の、この登板での失点 */
  usedPitchers: Set<number>;
  usedBench: Set<number>;
  needPitcherChange: boolean;
  batLines: BatLine[];
  batMap: Map<number, BatLine>;
  pitchLines: PitchLine[];
  runs: number;
  hits: number;
  errors: number;
  line: number[];
  defense: number;
  catcherDefense: number;
}

const clampP = (x: number) => Math.max(0, Math.min(1, x));

function newBatLine(p: Player, pos: LineupSlot['pos'], order: number): BatLine {
  return { playerId: p.id, pos, order, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, r: 0, bb: 0, hbp: 0, k: 0, sb: 0, cs: 0, sh: 0, sf: 0, gidp: 0 };
}

function newPitchLine(p: Player, starter: boolean, lead: number): PitchLine {
  return { playerId: p.id, outs: 0, bf: 0, h: 0, hr: 0, bb: 0, hbp: 0, k: 0, r: 0, er: 0, pitches: 0, starter, enterLead: lead, exitLead: lead, decision: null };
}

function pitcherLimit(p: Player, starter: boolean, gt: GameTeam): number {
  const st = p.pitch?.stamina ?? 30;
  if (!starter) return PITCHING.relieverLimitBase + st * PITCHING.relieverLimitPerStamina;
  let lim = PITCHING.starterLimitBase + st * PITCHING.starterLimitPerStamina;
  if (gt.tactics.pitching === 'quickHook') lim += PITCHING.quickHook;
  if (gt.tactics.pitching === 'longStart') lim += PITCHING.longStart;
  return lim;
}

/** チームの守備力（守っている8人の平均） */
function teamDefense(lineup: LineupSlot[], gt: GameTeam): { defense: number; catcher: number } {
  const fielders = lineup.filter((s) => s.pos !== 'DH' && s.pos !== 'P' && s.pos !== 'PH');
  let sum = 0;
  let catcher = PIVOT;
  for (const f of fielders) {
    const d = defenseAt(f.player, f.pos as FieldPos);
    sum += d;
    if (f.pos === 'C') catcher = d;
  }
  let defense = fielders.length ? sum / fielders.length : PIVOT;
  if (gt.tactics.offense === 'defense') defense += TACTIC_FIT.defense.team;
  return { defense, catcher };
}

export function parkEffect(home: Team, w: Weather): ParkEff {
  const st = home.stadium;
  let hr = PARK.size[st.size].hr * PARK.fence[st.fence].hr * (st.terrace ? PARK.terrace.hr : 1);
  let d = PARK.size[st.size].d * PARK.fence[st.fence].d;
  let s = 1;
  if (st.turf === 'artificial') {
    s *= PARK.artificialTurf.s;
    d *= PARK.artificialTurf.d;
  }
  hr *= 1 + (w.temp - 20) * WEATHER.hrPerDegree;
  if (w.windDir === 'out') hr *= 1 + w.wind * WEATHER.hrPerWind;
  if (w.windDir === 'in') hr *= Math.max(0.5, 1 - w.wind * WEATHER.hrPerWind);
  return { hr, d, s };
}

function batterEff(p: Player, slot: number, gt: GameTeam): BatterEff {
  const adj = (p.condition - 3) * CONDITION_POINTS - p.fatigue * FATIGUE_POINTS;
  const misfit = p.mainPos !== 'P' && !ORDER_FIT_SLOTS[p.orderFit].includes(slot) ? ORDER_MISFIT_POINTS : 0;
  let contact = p.bat.contact + adj - misfit;
  let power = p.bat.power + adj - misfit;
  let speed = p.bat.speed;
  const t = gt.tactics.offense;
  if (t === 'slugging' && p.bat.power >= TACTIC_FIT.slugging.threshold) power += TACTIC_FIT.slugging.power;
  if (t === 'speed' && p.bat.speed >= TACTIC_FIT.speed.threshold) speed += TACTIC_FIT.speed.speed;
  if (t === 'small' && p.bat.contact >= TACTIC_FIT.small.threshold) contact += TACTIC_FIT.small.contact;
  return { contact, power, speed, bats: p.bats };
}

function pitcherEff(s: Side): PitcherEff {
  const p = s.pitcher;
  const a = p.pitch ?? { velocity: 20, control: 20, breaking: 20, stamina: 20 };
  const over = Math.max(0, s.pLine.pitches - s.limit * PITCHING.fatigueStart);
  const adj = (p.condition - 3) * CONDITION_POINTS - p.fatigue * FATIGUE_POINTS - over * PITCHING.fatiguePointsPerPitch;
  return { velocity: a.velocity + adj, control: a.control + adj, breaking: a.breaking + adj, throws: p.throws };
}

export function simulateGame(rng: Rng, away: GameTeam, home: GameTeam, opts: GameOptions): GameResult {
  const weather = makeWeather(rng, home.team, opts.month, opts.night);
  const park = parkEffect(home.team, weather);

  const makeSide = (gt: GameTeam): Side => {
    const lineup = gt.lineup.map((s) => ({ ...s }));
    const { defense, catcher } = teamDefense(lineup, gt);
    const pLine = newPitchLine(gt.starter, true, 0);
    const batLines: BatLine[] = [];
    const batMap = new Map<number, BatLine>();
    lineup.forEach((s, i) => {
      const bl = newBatLine(s.player, s.pos, i + 1);
      batLines.push(bl);
      batMap.set(s.player.id, bl);
    });
    return {
      gt, lineup, idx: 0, pitcher: gt.starter, pLine, limit: pitcherLimit(gt.starter, true, gt),
      usedPitchers: new Set([gt.starter.id]), usedBench: new Set(), needPitcherChange: false,
      batLines, batMap, pitchLines: [pLine], runs: 0, hits: 0, errors: 0, line: [], defense, catcherDefense: catcher,
    };
  };
  const sides: [Side, Side] = [makeSide(away), makeSide(home)];

  /** 最後にリードが入れ替わったときの記録（勝ち・負け投手用） */
  let lastLead: { team: 0 | 1; winPitcher: number; losePitcher: number } | null = null;
  let inning = 1;
  let tie = false;

  // ---- 継投 ----
  const availableRelievers = (s: Side) => {
    const all = [...s.gt.setup, ...(s.gt.closer ? [s.gt.closer] : []), ...s.gt.bullpen];
    return all.filter((p) => !s.usedPitchers.has(p.id));
  };

  const chooseReliever = (s: Side, lead: number): Player | null => {
    const free = (p: Player | null | undefined) => (p && !s.usedPitchers.has(p.id) ? p : null);
    const pen = s.gt.bullpen.filter((p) => !s.usedPitchers.has(p.id));
    if (inning >= 9 && lead >= 1 && lead <= 3 && free(s.gt.closer)) return s.gt.closer;
    if (inning >= 7 && inning <= 8 && lead >= 0 && lead <= 3) {
      const su = free(s.gt.setup[inning - 7]) ?? s.gt.setup.find((p) => free(p));
      if (su) return su;
    }
    if (inning >= 10) {
      const late = s.gt.setup.find((p) => free(p)) ?? free(s.gt.closer);
      if (late && Math.abs(lead) <= 1) return late;
    }
    if (pen.length > 0) return Math.abs(lead) <= 3 ? pen[0] : pen[pen.length - 1];
    // 中継ぎがいなければ、勝ちパターンや抑えも使う
    return availableRelievers(s)[0] ?? null;
  };

  const changePitcher = (s: Side, next: Player, lead: number) => {
    s.pLine.exitLead = lead;
    s.pitcher = next;
    s.usedPitchers.add(next.id);
    s.pLine = newPitchLine(next, false, lead);
    s.pitchLines.push(s.pLine);
    s.limit = pitcherLimit(next, false, s.gt);
    s.needPitcherChange = false;
    // DHなしなら、投手（または代打）の打順に新しい投手が入る
    const slot = s.lineup.findIndex((x) => x.pos === 'P' || x.pos === 'PH');
    if (slot >= 0 && !opts.dh) s.lineup[slot] = { player: next, pos: 'P' };
  };

  /** 守備側の投手を代えるか判断する */
  const considerChange = (def: Side, off: Side, atInningStart: boolean) => {
    const lead = def.runs - off.runs;
    const pl = def.pLine;
    let change = def.needPitcherChange;
    if (!change && pl.starter) {
      if (pl.pitches >= def.limit * (atInningStart ? 0.95 : 1.1)) change = true;
      else if (pl.r >= PITCHING.shelledRuns || (inning <= 4 && pl.r >= PITCHING.earlyShelledRuns)) change = true;
      else if (atInningStart && inning >= 7 && lead >= 1 && lead <= 3 && pl.pitches >= def.limit * 0.8) change = true;
      else if (atInningStart && inning >= 9 && lead >= 1 && lead <= 3 && def.gt.closer && !def.usedPitchers.has(def.gt.closer.id) && !(pl.r <= 1 && pl.pitches < def.limit * 0.85)) change = true;
    } else if (!change) {
      const blowout = Math.abs(lead) >= 4;
      if (atInningStart && pl.outs >= 3 && !(blowout && pl.pitches < def.limit)) change = true;
      else if (pl.pitches >= def.limit + 8) change = true;
      else if (!atInningStart && pl.r - 0 >= 3 && pl.outs < 3) change = true;
    }
    if (!change) return;
    const next = chooseReliever(def, lead);
    if (next) changePitcher(def, next, lead);
  };

  // ---- 得点 ----
  /** 今の半イニングで、自責点にならない状態か（失策で3アウトを逃した後） */
  let inningUnearned = false;
  const score = (off: Side, def: Side, offIdx: 0 | 1, r: Runner, rbiLine: BatLine | null) => {
    const before = off.runs - def.runs;
    off.runs++;
    off.line[off.line.length - 1]++;
    r.line.r++;
    if (rbiLine) rbiLine.rbi++;
    const pl = def.pitchLines.find((x) => x.playerId === r.resp) ?? def.pLine;
    pl.r++;
    if (r.earned && !inningUnearned) pl.er++;
    const after = off.runs - def.runs;
    if (before <= 0 && after > 0) lastLead = { team: offIdx, winPitcher: off.pitcher.id, losePitcher: r.resp };
    if (after === 0) lastLead = null;
  };

  // ---- 半イニング ----
  const playHalf = (offIdx: 0 | 1) => {
    const off = sides[offIdx];
    const def = sides[offIdx === 0 ? 1 : 0];
    off.line.push(0);
    considerChange(def, off, true);
    let outs = 0;
    /** 失策がなければ取れていたアウトの数。アウト数との合計が3以上になった後の得点は自責点にしない */
    let errorOuts = 0;
    const bases: (Runner | null)[] = [null, null, null];
    const walkoff = () => offIdx === 1 && inning >= 9 && off.runs > def.runs;
    inningUnearned = false;
    const addOut = (n = 1) => {
      outs += n;
      def.pLine.outs += n;
      if (outs + errorOuts >= 3) inningUnearned = true;
    };

    while (outs < 3) {
      if (outs > 0 || bases.some((b) => b)) considerChange(def, off, false);

      // 盗塁
      const stealer = bases[0] && !bases[1] ? 0 : bases[1] && !bases[2] && outs < 2 ? 1 : -1;
      if (stealer >= 0) {
        const r = bases[stealer]!;
        const spd = r.player.bat.speed;
        if (spd >= STEAL.minSpeed) {
          const t = off.gt.tactics.offense;
          const tm = t === 'speed' ? STEAL.speedTactic : t === 'small' ? STEAL.smallTactic : t === 'slugging' ? STEAL.sluggingTactic : 1;
          let p = STEAL.attemptBase * Math.exp((STEAL.attemptElasticity * (spd - PIVOT)) / 10) * tm;
          if (stealer === 1) p *= STEAL.thirdFactor;
          if (rng.chance(p)) {
            const succ = clampP(STEAL.successBase + (spd - PIVOT) * STEAL.successPerSpeed + (def.catcherDefense - PIVOT) * STEAL.successPerCatcher);
            bases[stealer] = null;
            if (rng.chance(succ)) {
              bases[stealer + 1] = r;
              r.line.sb++;
            } else {
              r.line.cs++;
              addOut();
              if (outs >= 3) break;
            }
          }
        }
      }

      // 代打（DHなしで投手の打順）
      let slot = off.lineup[off.idx];
      if (!opts.dh && slot.pos === 'P') {
        const tired = off.pLine.pitches >= off.limit * 0.85;
        if ((inning >= PITCHING.pinchHitInning || tired) && availableRelievers(off).length > 0) {
          const ph = off.gt.bench.find((p) => !off.usedBench.has(p.id));
          if (ph) {
            off.usedBench.add(ph.id);
            slot = { player: ph, pos: 'PH' };
            off.lineup[off.idx] = slot;
            off.needPitcherChange = true;
          }
        }
      }
      const batter = slot.player;
      let bl = off.batMap.get(batter.id);
      if (!bl) {
        bl = newBatLine(batter, slot.pos, off.idx + 1);
        off.batLines.push(bl);
        off.batMap.set(batter.id, bl);
      }
      const be = batterEff(batter, off.idx, off.gt);
      const runnerOf = (earned = true): Runner => ({ player: batter, line: bl!, resp: def.pitcher.id, earned });
      off.idx = (off.idx + 1) % 9;
      const pl = def.pLine;
      pl.bf++;
      bl.pa++;

      // 送りバント
      const close = Math.abs(off.runs - def.runs) <= 2;
      const buntSituation = outs === 0 && (bases[0] || bases[1]) && !bases[2] && close;
      const pitcherBunt = slot.pos === 'P' && outs < 2 && (bases[0] || bases[1]) && !bases[2];
      let buntP = 0;
      if (pitcherBunt) buntP = BUNT.pitcher;
      else if (buntSituation && be.power <= BUNT.maxPower) {
        const t = off.gt.tactics.offense;
        buntP = t === 'small' ? BUNT.smallTactic : t === 'slugging' ? BUNT.normal * 0.2 : BUNT.normal;
      }
      if (buntP > 0 && rng.chance(buntP)) {
        pl.pitches += PITCHES.bunt;
        if (rng.chance(BUNT.success)) {
          bl.sh++;
          addOut();
          if (bases[1]) { bases[2] = bases[1]; bases[1] = null; }
          if (bases[0]) { bases[1] = bases[0]; bases[0] = null; }
        } else {
          bl.ab++;
          addOut();
          // 先の走者がアウト、打者は一塁へ
          if (bases[1]) bases[1] = null;
          else bases[0] = null;
          bases[0] = runnerOf();
        }
        continue;
      }

      const res = resolvePA(rng, be, pitcherEff(def), def.defense, park);
      const pc = res === 'K' ? PITCHES.K : res === 'BB' ? PITCHES.BB : res === 'HBP' ? PITCHES.HBP : PITCHES.inPlay;
      pl.pitches += Math.max(1, Math.round(rng.normal(pc, PITCHES.sd)));
      const spdAdj = (r: Runner) => (r.player.bat.speed - PIVOT) * ADVANCE.perSpeed;
      const twoOut = outs === 2 ? 0.15 : 0;

      switch (res) {
        case 'K':
          bl.ab++; bl.k++; pl.k++;
          addOut();
          break;
        case 'BB':
        case 'HBP': {
          if (res === 'BB') { bl.bb++; pl.bb++; } else { bl.hbp++; pl.hbp++; }
          if (bases[0]) {
            if (bases[1]) {
              if (bases[2]) score(off, def, offIdx, bases[2], bl);
              bases[2] = bases[1];
            }
            bases[1] = bases[0];
          }
          bases[0] = runnerOf();
          break;
        }
        case 'S': {
          bl.ab++; bl.h++; pl.h++; off.hits++;
          const [r1, r2, r3] = bases;
          bases[0] = runnerOf(); bases[1] = null; bases[2] = null;
          if (r3) score(off, def, offIdx, r3, bl);
          if (r2) {
            if (rng.chance(clampP(ADVANCE.singleSecondScores + spdAdj(r2) + twoOut))) score(off, def, offIdx, r2, bl);
            else bases[2] = r2;
          }
          if (r1) {
            if (!bases[2] && rng.chance(clampP(ADVANCE.singleFirstToThird + spdAdj(r1) + twoOut))) bases[2] = r1;
            else bases[1] = r1;
          }
          break;
        }
        case 'D': {
          bl.ab++; bl.h++; bl.d++; pl.h++; off.hits++;
          const [r1, r2, r3] = bases;
          bases[0] = null; bases[1] = runnerOf(); bases[2] = null;
          if (r3) score(off, def, offIdx, r3, bl);
          if (r2) score(off, def, offIdx, r2, bl);
          if (r1) {
            if (rng.chance(clampP(ADVANCE.doubleFirstScores + spdAdj(r1) + twoOut))) score(off, def, offIdx, r1, bl);
            else bases[2] = r1;
          }
          break;
        }
        case 'T': {
          bl.ab++; bl.h++; bl.t++; pl.h++; off.hits++;
          for (const r of bases) if (r) score(off, def, offIdx, r, bl);
          bases[0] = null; bases[1] = null; bases[2] = runnerOf();
          break;
        }
        case 'HR': {
          bl.ab++; bl.h++; bl.hr++; pl.h++; pl.hr++; off.hits++;
          for (const r of bases) if (r) score(off, def, offIdx, r, bl);
          bases[0] = null; bases[1] = null; bases[2] = null;
          score(off, def, offIdx, runnerOf(), bl);
          break;
        }
        case 'OUT': {
          bl.ab++;
          const errP = IN_PLAY.error * Math.exp((IN_PLAY.errorElasticity * (def.defense - PIVOT)) / 10);
          if (rng.chance(errP)) {
            // 失策：打者は一塁へ、走者は1つずつ進む（打点なし）
            def.errors++;
            errorOuts++;
            if (outs + errorOuts >= 3) inningUnearned = true;
            const [r1, r2, r3] = bases;
            if (r3) score(off, def, offIdx, r3, null);
            bases[2] = r2; bases[1] = r1; bases[0] = runnerOf(false);
            break;
          }
          const ground = rng.chance(clampP(IN_PLAY.groundBase + IN_PLAY.groundPerPower * (be.power - PIVOT)));
          if (ground) {
            const dpP = clampP(IN_PLAY.doublePlay + IN_PLAY.doublePlayPerSpeed * (be.speed - PIVOT) + IN_PLAY.doublePlayPerDefense * (def.defense - PIVOT));
            if (bases[0] && outs < 2 && rng.chance(dpP)) {
              bl.gidp++;
              bases[0] = null;
              addOut(2);
              if (outs < 3) {
                if (bases[2]) { score(off, def, offIdx, bases[2], null); bases[2] = null; }
                if (bases[1]) { bases[2] = bases[1]; bases[1] = null; }
              }
              break;
            }
            const outsBefore = outs;
            addOut();
            if (outs >= 3) break;
            // 打者は一塁でアウト。押し出される走者は必ず進み、そうでない走者は確率で進む
            const [r1, r2, r3] = bases;
            const force2 = !!r1;
            const force3 = force2 && !!r2;
            bases[0] = null;
            if (r3 && (force3 || (outsBefore < 2 && rng.chance(IN_PLAY.groundScore)))) { score(off, def, offIdx, r3, bl); bases[2] = null; }
            if (r2 && !bases[2] && (force2 || rng.chance(IN_PLAY.advanceOnOut))) { bases[2] = r2; bases[1] = null; }
            if (r1) bases[1] = r1;
          } else {
            const outsBefore = outs;
            addOut();
            if (outs >= 3) break;
            if (bases[2] && outsBefore < 2 && rng.chance(IN_PLAY.sacFly)) {
              bl.ab--; bl.sf++;
              score(off, def, offIdx, bases[2], bl);
              bases[2] = null;
            }
            if (bases[1] && !bases[2] && rng.chance(IN_PLAY.advanceOnOut * 0.6)) { bases[2] = bases[1]; bases[1] = null; }
          }
          break;
        }
      }
      if (walkoff()) return;
    }
  };

  // ---- 試合の進行 ----
  for (;;) {
    playHalf(0);
    if (inning >= 9 && sides[1].runs > sides[0].runs) {
      sides[1].line.push(NaN); // 9回裏なし
      break;
    }
    playHalf(1);
    if (inning >= 9 && sides[0].runs !== sides[1].runs) break;
    if (inning >= PITCHING.maxInnings) {
      tie = true;
      break;
    }
    inning++;
  }

  // ---- 勝敗・セーブ・ホールド ----
  for (const [i, s] of sides.entries()) {
    const other = sides[1 - i];
    s.pLine.exitLead = s.runs - other.runs;
  }
  let win: number | null = null;
  let loss: number | null = null;
  let save: number | null = null;
  const ll = lastLead as { team: 0 | 1; winPitcher: number; losePitcher: number } | null;
  if (!tie && ll) {
    const ws = sides[ll.team];
    win = ll.winPitcher;
    const starterLine = ws.pitchLines[0];
    if (win === starterLine.playerId && starterLine.outs < PITCHING.starterWinOuts && ws.pitchLines.length > 1) {
      win = ws.pitchLines[1].playerId;
    }
    loss = ll.losePitcher;
    const last = ws.pitchLines[ws.pitchLines.length - 1];
    if (last.playerId !== win && !last.starter && last.enterLead > 0 && (last.enterLead <= 3 || last.outs >= 9)) save = last.playerId;
  }
  for (const s of sides) {
    for (const pl of s.pitchLines) {
      if (pl.playerId === win) pl.decision = 'W';
      else if (pl.playerId === loss) pl.decision = 'L';
      else if (pl.playerId === save) pl.decision = 'S';
      else if (!pl.starter && pl.enterLead >= 1 && pl.enterLead <= 3 && pl.exitLead > 0 && pl.outs >= 1 && pl !== s.pitchLines[s.pitchLines.length - 1]) pl.decision = 'H';
    }
  }

  const homeLine: (number | null)[] = sides[1].line.map((x) => (Number.isNaN(x) ? null : x));
  const result: GameResult = {
    awayId: away.team.id,
    homeId: home.team.id,
    score: [sides[0].runs, sides[1].runs],
    hits: [sides[0].hits, sides[1].hits],
    errors: [sides[0].errors, sides[1].errors],
    line: [sides[0].line, homeLine],
    tie,
    batting: [sides[0].batLines, sides[1].batLines],
    pitching: [sides[0].pitchLines, sides[1].pitchLines],
    win,
    loss,
    save,
    weather,
    dh: opts.dh,
    summary: [],
  };
  result.summary = makeSummary(result, away, home);
  return result;
}
