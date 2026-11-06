// シード付き乱数（mulberry32）。状態は1つの整数なので、セーブにそのまま保存できる。
// 同じシードからは必ず同じ順番で同じ値が出る（不具合の再現と検証用）。

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** 現在の状態（セーブ用） */
  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }

  /** 0以上1未満の小数 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min以上max以下の整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 確率pで true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 配列から1つ選ぶ */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('空の配列からは選べません');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** 重み付きで1つ選ぶ */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of items) total += w;
    let r = this.next() * total;
    for (const [v, w] of items) {
      r -= w;
      if (r < 0) return v;
    }
    return items[items.length - 1][0];
  }

  /** 正規分布（平均mean、標準偏差sd） */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** 配列を並べ替えた新しい配列を返す */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
