// 自動セーブ：操作のたびに少し待ってから保存し、アプリを閉じるとき（画面が隠れるとき）にもすぐ保存する
import type { World } from '../core/season/types';
import { saveWorld } from './db';

const DELAY_MS = 800;
let timer: number | null = null;
let current: World | null = null;
let currentSlot = 1;
let lastSavedAt: Date | null = null;
let lastError: string | null = null;
let onStatus: (() => void) | null = null;

async function flush(): Promise<void> {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!current) return;
  try {
    await saveWorld(current, currentSlot);
    lastSavedAt = new Date();
    lastError = null;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }
  onStatus?.();
}

/** 保存を予約する（続けて呼ばれたら、最後の1回だけ保存する） */
export function scheduleSave(w: World | null, slot: number): void {
  if (current !== w || currentSlot !== slot) {
    // 別の枠に切り替えたら、前の保存時刻は出さない
    lastSavedAt = null;
    lastError = null;
  }
  current = w;
  currentSlot = slot;
  if (!w) return;
  if (timer != null) clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), DELAY_MS);
}

/** すぐに保存する */
export function saveNow(): Promise<void> {
  return flush();
}

export function saveStatus(): { savedAt: Date | null; error: string | null } {
  return { savedAt: lastSavedAt, error: lastError };
}

export function setSaveStatusListener(fn: () => void): void {
  onStatus = fn;
}

// 画面が隠れたとき（ホーム画面に戻る、アプリを切り替える）にすぐ保存する
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flush();
});
window.addEventListener('pagehide', () => void flush());
