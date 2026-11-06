// 選手の生成
import {
  ABILITY_MAX, ABILITY_MIN, ABILITY_SPREAD_SD, AGE_WEIGHTS, CAP_MEAN, CAP_SD,
  DECLINE_PER_YEAR_AFTER_PEAK, GAP_PER_YEAR_BEFORE_PEAK, GROWTH_TYPE_WEIGHTS,
  IKUSEI_CAP_PENALTY, PEAK_AGES,
} from '../../config/generate';
import { PREFECTURES } from '../../config/prefectures';
import type { NameRegistry } from '../names';
import type { Rng } from '../rng';
import { salaryFor } from '../salary';
import type {
  BatAbilities, Bats, Career, ContractType, FieldPos, GrowthType, MainPos, OrderFit,
  Personality, PitchAbilities, PitcherRole, Player, Throws,
} from '../types';

const PERSONALITIES: readonly Personality[] = ['loyal', 'ambitious', 'money', 'local', 'mypace'];
const FIELD_POSITIONS: readonly FieldPos[] = ['C', '1B', '2B', '3B', 'SS', 'OF'];

/** サブポジションになりやすい組み合わせ */
const SUB_POS_CANDIDATES: Record<FieldPos, readonly FieldPos[]> = {
  C: ['1B', '3B'],
  '1B': ['3B', 'OF'],
  '2B': ['SS', '3B', '1B'],
  '3B': ['1B', '2B', 'OF'],
  SS: ['2B', '3B'],
  OF: ['1B'],
};

export interface PlayerSpec {
  pos: MainPos;
  role?: PitcherRole;
  age?: number;
  contract?: ContractType;
  teamId: number | null;
  /** 能力上限の平均を上下させる（エクスパンション用やドラフトの目玉など） */
  capShift?: number;
}

const clamp = (v: number) => Math.max(ABILITY_MIN, Math.min(ABILITY_MAX, Math.round(v)));

/** 年齢と成長タイプから、上限に対して今どれだけ低いか */
export function gapFromCap(age: number, growth: GrowthType): number {
  const [peakStart, peakEnd] = PEAK_AGES[growth];
  const slow = growth === 'steady' ? 0.6 : 1;
  if (age < peakStart) return (peakStart - age) * GAP_PER_YEAR_BEFORE_PEAK * slow;
  if (age > peakEnd) return (age - peakEnd) * DECLINE_PER_YEAR_AFTER_PEAK * slow;
  return 0;
}

function careerForAge(rng: Rng, age: number): { career: Career; proYears: number } {
  // 入団時の年齢：高校18、大学22、社会人24（目安）
  const options: [Career, number][] = [];
  if (age >= 18) options.push(['highSchool', 5]);
  if (age >= 22) options.push(['college', 4]);
  if (age >= 24) options.push(['industrial', 2]);
  const career = rng.weighted(options);
  const entryAge = career === 'highSchool' ? 18 : career === 'college' ? 22 : 24;
  return { career, proYears: age - entryAge };
}

function makeHands(rng: Rng, pos: MainPos): { throws: Throws; bats: Bats } {
  // 捕手・二塁・三塁・遊撃はほぼ右投げ
  const rightOnly = pos === 'C' || pos === '2B' || pos === '3B' || pos === 'SS';
  const throws: Throws = rightOnly ? 'R' : rng.chance(pos === 'P' ? 0.3 : 0.25) ? 'L' : 'R';
  let bats: Bats;
  if (throws === 'L') bats = rng.chance(0.9) ? 'L' : 'R';
  else bats = rng.weighted<Bats>([['R', pos === 'P' ? 80 : 65], ['L', pos === 'P' ? 18 : 30], ['S', 3]]);
  return { throws, bats };
}

function orderFitOf(b: BatAbilities): OrderFit {
  if (b.power >= 70 && b.power >= b.contact) return 'cleanup';
  if (b.speed >= 65 && b.contact >= 55) return 'leadoff';
  if (b.contact >= 60 && b.speed >= 50) return 'second';
  if (b.contact + b.power >= 110) return 'middle';
  return 'lower';
}

export function generatePlayer(rng: Rng, names: NameRegistry, id: number, spec: PlayerSpec): Player {
  const { familyName, givenName } = names.create(rng);
  const growthType = rng.weighted(GROWTH_TYPE_WEIGHTS);
  const age = spec.age ?? rng.weighted(AGE_WEIGHTS);
  const { career, proYears } = careerForAge(rng, age);
  const contract = spec.contract ?? 'roster';
  const isPitcher = spec.pos === 'P';
  const { throws, bats } = makeHands(rng, spec.pos);

  // 選手全体の「素材の良さ」と、能力ごとの得手不得手
  let capBase = rng.normal(CAP_MEAN, CAP_SD) + (spec.capShift ?? 0);
  if (contract === 'ikusei') capBase -= IKUSEI_CAP_PENALTY;
  // 大器晩成は上限が高いことが多い
  if (growthType === 'veryLate') capBase += 4;
  const gap = gapFromCap(age, growthType);
  const capOf = () => clamp(capBase + rng.normal(0, ABILITY_SPREAD_SD));
  const curOf = (cap: number) => clamp(cap - gap * (0.7 + rng.next() * 0.6));

  let batCap: BatAbilities;
  let pitchCap: PitchAbilities | null = null;
  if (isPitcher) {
    pitchCap = { velocity: capOf(), control: capOf(), breaking: capOf(), stamina: capOf() };
    // 先発は体力が高め、中継ぎ・抑えは速球が高め
    if (spec.role === 'SP') pitchCap.stamina = clamp(pitchCap.stamina + 12);
    else pitchCap.velocity = clamp(pitchCap.velocity + 5);
    batCap = { contact: clamp(rng.normal(22, 6)), power: clamp(rng.normal(18, 6)), speed: clamp(rng.normal(35, 10)), defense: clamp(rng.normal(45, 10)) };
  } else {
    batCap = { contact: capOf(), power: capOf(), speed: capOf(), defense: capOf() };
    // ポジションの特徴：遊撃・二塁・捕手は守備、一塁は長打
    if (spec.pos === 'SS' || spec.pos === '2B') batCap.defense = clamp(batCap.defense + 8);
    if (spec.pos === 'C') batCap.defense = clamp(batCap.defense + 6);
    if (spec.pos === '1B') { batCap.power = clamp(batCap.power + 8); batCap.defense = clamp(batCap.defense - 8); }
  }

  const bat: BatAbilities = isPitcher
    ? { ...batCap }
    : { contact: curOf(batCap.contact), power: curOf(batCap.power), speed: curOf(batCap.speed), defense: curOf(batCap.defense) };
  const pitch: PitchAbilities | null = pitchCap
    ? { velocity: curOf(pitchCap.velocity), control: curOf(pitchCap.control), breaking: curOf(pitchCap.breaking), stamina: curOf(pitchCap.stamina) }
    : null;

  // 守備位置の適性
  const posFit: Partial<Record<FieldPos, number>> = {};
  if (!isPitcher) {
    const main = spec.pos as FieldPos;
    posFit[main] = 100;
    const subCount = rng.weighted([[0, 40], [1, 45], [2, 15]] as const);
    const cands = rng.shuffle(SUB_POS_CANDIDATES[main]);
    for (let i = 0; i < Math.min(subCount, cands.length); i++) posFit[cands[i]] = rng.int(40, 85);
  }

  const player: Player = {
    id,
    familyName,
    givenName,
    age,
    birthPref: rng.weighted(PREFECTURES.map((p) => [p.name, p.weight] as const)),
    throws,
    bats,
    mainPos: spec.pos,
    role: isPitcher ? (spec.role ?? 'RP') : null,
    posFit,
    bat,
    pitch,
    batCap,
    pitchCap,
    growthType,
    orderFit: orderFitOf(bat),
    personality: rng.pick(PERSONALITIES),
    attachment: rng.int(30, 60),
    condition: 3,
    fatigue: 0,
    salary: 0,
    contract,
    career,
    proYears,
    firstTeamDays: 0,
    draftTeamId: spec.teamId,
    teamId: spec.teamId,
    level: 'farm',
    retired: false,
  };
  player.salary = salaryFor(player);
  return player;
}

export { FIELD_POSITIONS };
