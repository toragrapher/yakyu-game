// セーブ：端末の中（IndexedDB）に保存する。サーバーは使わない
import type { World } from '../core/season/types';

const DB_NAME = 'yakyu-game';
const STORE = 'saves';
/** セーブデータの形が変わったら上げる（読み込みのときに変換する） */
export const SAVE_VERSION = 1;
const SLOT = 'main';

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

/** 保存する（いつも同じ場所に上書き） */
export async function saveWorld(w: World): Promise<void> {
  const rec: SaveRecord = { id: SLOT, version: SAVE_VERSION, savedAt: new Date().toISOString(), label: saveLabel(w), world: w };
  await tx('readwrite', (s) => s.put(rec));
}

/** 読み込む（なければ null） */
export async function loadWorld(): Promise<SaveRecord | null> {
  const rec = await tx<SaveRecord | undefined>('readonly', (s) => s.get(SLOT));
  if (!rec) return null;
  return migrate(rec);
}

/** セーブを消す */
export async function deleteSave(): Promise<void> {
  await tx('readwrite', (s) => s.delete(SLOT));
}

/** 古い形のセーブを今の形に直す（今は版1だけ） */
function migrate(rec: SaveRecord): SaveRecord {
  if (rec.version > SAVE_VERSION) throw new Error('新しい版のアプリで作られたセーブです。アプリを最新にしてください');
  return rec;
}
