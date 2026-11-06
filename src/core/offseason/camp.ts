// キャンプ：キャンプ地の能力アップ（能力上限は超えない）
import {
  AI_CAMP_RANKS, CAMP_AGE_FACTOR, CAMP_ALL_FACTOR, CAMP_BASE_GAIN, CAMP_RANKS, CAMP_SITES, type AbilityKey,
} from '../../config/camp';
import { canAfford, pay } from '../finance';
import type { Rng } from '../rng';
import type { World } from '../season/types';

/** AI球団のキャンプ地 */
export function chooseAiCamp(rng: Rng): string {
  return rng.pick(CAMP_SITES.filter((s) => AI_CAMP_RANKS.includes(s.rank))).id;
}

/** キャンプを行う（自球団なら費用を払う） */
export function applyCamp(w: World, rng: Rng, teamId: number, siteId: string): string | null {
  const site = CAMP_SITES.find((s) => s.id === siteId);
  if (!site) return 'キャンプ地が見つかりません';
  const { cost, mult } = CAMP_RANKS[site.rank];
  if (teamId === w.userTeamId) {
    if (!canAfford(w, cost)) return 'お金が足りません';
    pay(w, `キャンプ（${site.name}）`, -cost);
  }
  for (const p of w.players.filter((x) => x.teamId === teamId && !x.retired)) {
    const ageF = CAMP_AGE_FACTOR.find(([a]) => p.age <= a)?.[1] ?? 0.4;
    const isP = !!p.pitch;
    const keys: AbilityKey[] = isP ? ['velocity', 'control', 'breaking', 'stamina'] : ['contact', 'power', 'speed', 'defense'];
    const focus = site.focus === 'all' ? keys : keys.filter((k) => (site.focus as AbilityKey[]).includes(k));
    const f = site.focus === 'all' ? CAMP_ALL_FACTOR : 1;
    const cur = (isP ? p.pitch : p.bat) as unknown as Record<string, number>;
    const cap = (isP ? p.pitchCap : p.batCap) as unknown as Record<string, number>;
    for (const k of focus) {
      const gain = Math.round(rng.next() * CAMP_BASE_GAIN * mult * ageF * f);
      cur[k] = Math.min(Math.max(cur[k], cap[k]), cur[k] + gain);
    }
  }
  return null;
}
