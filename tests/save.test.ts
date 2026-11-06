import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { advanceDays, createWorld } from '../src/core/season/advance';
import '../src/core/offseason/offseason';
import { deleteSave, listSaves, loadWorld, saveWorld } from '../src/save/db';
import { completeFirstYear } from './helpers';

const cfg = () => ({ teamCounts: [6, 6] as [number, number], games: null, interleague: { mode: 'period' as const, games: 18 }, dh: [true, true] as [boolean, boolean], postseason: { teams: [3, 3] as [number, number], advantage: true } });

describe('セーブ', () => {
  it('保存して読み込むと同じ状態に戻り、続きを遊ぶと同じ結果になる', async () => {
    const w = createWorld(1, cfg(), 2027, 1, true);
    completeFirstYear(w);
    advanceDays(w, 10);
    await saveWorld(w);
    const rec = await loadWorld();
    expect(rec).not.toBeNull();
    expect(rec!.label).toContain('2027年');
    const loaded = rec!.world;
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(w));
    advanceDays(w, 5);
    advanceDays(loaded, 5);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(w));
  });

  it('消すと読み込めない', async () => {
    const w = createWorld(2, cfg(), 2027, 1, true);
    await saveWorld(w);
    await deleteSave();
    expect(await loadWorld()).toBeNull();
  });

  it('3つの枠に別々に保存でき、1つ消してもほかは残る', async () => {
    const a = createWorld(3, cfg(), 2027, 1, true);
    const b = createWorld(4, cfg(), 2027, 2, true);
    await saveWorld(a, 2);
    await saveWorld(b, 3);
    const list = await listSaves();
    expect(list).toHaveLength(3);
    expect(list[1]!.label).toContain(a.teams.find((t) => t.id === 1)!.name);
    expect(list[2]!.label).toContain(b.teams.find((t) => t.id === 2)!.name);
    expect((await loadWorld(2))!.world.season.year).toBe(2027);
    await deleteSave(2);
    expect(await loadWorld(2)).toBeNull();
    expect((await listSaves())[1]).toBeNull();
    expect(await loadWorld(3)).not.toBeNull();
  });
});
