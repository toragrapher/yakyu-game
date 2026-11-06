// 選手名の管理。引退選手も含めた全選手で、姓と名の組み合わせが重ならないようにする。
import { FAMILY_NAMES, GIVEN_NAMES } from '../config/names';
import type { Rng } from './rng';

export class NameRegistry {
  private used: Set<string>;

  constructor(used: Iterable<string> = []) {
    this.used = new Set(used);
  }

  /** セーブ用の一覧 */
  toArray(): string[] {
    return [...this.used];
  }

  get size(): number {
    return this.used.size;
  }

  has(family: string, given: string): boolean {
    return this.used.has(`${family} ${given}`);
  }

  /** 未使用の名前を1つ作って登録する */
  create(rng: Rng): { familyName: string; givenName: string } {
    const total = FAMILY_NAMES.length * GIVEN_NAMES.length;
    if (this.used.size >= total) throw new Error('使える名前がなくなりました');
    // まずはランダムに試し、重なり続けたら順番に空きを探す
    for (let i = 0; i < 200; i++) {
      const familyName = rng.pick(FAMILY_NAMES);
      const givenName = rng.pick(GIVEN_NAMES);
      if (!this.has(familyName, givenName)) {
        this.used.add(`${familyName} ${givenName}`);
        return { familyName, givenName };
      }
    }
    const start = rng.int(0, total - 1);
    for (let k = 0; k < total; k++) {
      const idx = (start + k) % total;
      const familyName = FAMILY_NAMES[Math.floor(idx / GIVEN_NAMES.length)];
      const givenName = GIVEN_NAMES[idx % GIVEN_NAMES.length];
      if (!this.has(familyName, givenName)) {
        this.used.add(`${familyName} ${givenName}`);
        return { familyName, givenName };
      }
    }
    throw new Error('使える名前がなくなりました');
  }
}
