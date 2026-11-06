// セーブ：端末の中（IndexedDB）に保存する。サーバーは使わない
import type { World } from '../core/season/types';

const DB_NAME = 'yakyu-game';
const STORE = 'saves';
/** セーブデータの形が変わったら上げる（読み込みのときに変換する） */
export const SAVE_VERSION = 1;
/** セーブ枠の数 */
export const SLOT_COUNT = 3;
/** 枠を作る前の版のセーブ（読み込むときに枠1へ移す） */
const OLD_SLOT = 'main';
const slotKey = (slot: number) => `slot${slot}`;
const metaKey = (slot: number) => `meta${slot}`;

/** セーブ枠の一覧に出す情報（世界のデータは重いので別に持つ） */
export interface SaveMeta {
  slot: number;
  savedAt: string;
  label: string;
}

export interface SaveRecord {
  id: string;
  version: number;
  savedAt: string;
  /** 表示用：球団名と年・日付 */
  label: string;
  world: World;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export function saveLabel(w: World): string {
  const me = w.teams.find((t) => t.id === w.userTeamId);
  const s = w.season;
  const day = s.schedule.days[Math.min(s.dayIndex, s.schedule.days.length - 1)]?.date ?? '';
  const when = w.offseason ? (w.offseason.firstYear ? `${s.year}年 開幕前` : `${w.offseason.year}年 オフ`) : s.finished ? `${s.year}年 シーズン後` : `${s.year}年 ${day.slice(5).replace('-', '/')}`;
  return `${me?.name ?? '球団'}｜${when}`;
}

/** 枠に保存する（上書き） */
export async function saveWorld(w: World, slot = 1): Promise<void> {
  const savedAt = new Date().toISOString();
  const label = saveLabel(w);
  const rec: SaveRecord = { id: slotKey(slot), version: SAVE_VERSION, savedAt, label, world: w };
  await tx('readwrite', (s) => {
    s.put({ id: metaKey(slot), slot, savedAt, label });
    return s.put(rec);
  });
}

/** 枠から読み込む（なければ null） */
export async function loadWorld(slot = 1): Promise<SaveRecord | null> {
  await moveOldSave();
  const rec = await tx<SaveRecord | undefined>('readonly', (s) => s.get(slotKey(slot)));
  if (!rec) return null;
  return migrate(rec);
}

/** 枠のセーブを消す */
export async function deleteSave(slot = 1): Promise<void> {
  await tx('readwrite', (s) => {
    s.delete(metaKey(slot));
    return s.delete(slotKey(slot));
  });
}

/** 全部の枠の情報（空の枠は null） */
export async function listSaves(): Promise<(SaveMeta | null)[]> {
  await moveOldSave();
  const out: (SaveMeta | null)[] = [];
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const m = await tx<(SaveMeta & { id: string }) | undefined>('readonly', (s) => s.get(metaKey(i)));
    out.push(m ? { slot: m.slot, savedAt: m.savedAt, label: m.label } : null);
  }
  return out;
}

/** 枠を作る前のセーブがあれば、枠1に移す（枠1が空のときだけ） */
async function moveOldSave(): Promise<void> {
  const old = await tx<SaveRecord | undefined>('readonly', (s) => s.get(OLD_SLOT));
  if (!old) return;
  const used = await tx<SaveRecord | undefined>('readonly', (s) => s.get(slotKey(1)));
  if (!used) await saveWorld(old.world, 1);
  await tx('readwrite', (s) => s.delete(OLD_SLOT));
}

/** 古い形のセーブを今の形に直す（今は版1だけ） */
function migrate(rec: SaveRecord): SaveRecord {
  if (rec.version > SAVE_VERSION) throw new Error('新しい版のアプリで作られたセーブです。アプリを最新にしてください');
  return rec;
}
