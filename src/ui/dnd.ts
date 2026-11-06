// 指で動かすドラッグ＆ドロップ（iPhoneのSafariでも動くよう、タッチの動きを自分で追う）
// ・長押し（約0.3秒）で持ち上げ、別の [data-slot] の上で離すと onDrop
// ・すぐ指を離すと onTap（押して選ぶ操作用）
// ・パソコンのマウスでは、押したまま少し動かすと持ち上がる

export interface DndHandlers {
  onDrop: (from: string, to: string) => void;
  onTap: (slot: string) => void;
}

const LONG_PRESS_MS = 300;
const MOVE_CANCEL_PX = 10;

// 画面を描き直すたびに呼ばれるので、イベントの登録は最初の1回だけにし、
// 今の画面（root）と操作（handlers）を差し替える
let root: HTMLElement | null = null;
let h: DndHandlers | null = null;
let installed = false;
/** タッチのあとにiPhoneが送ってくるマウスの操作を無視するための時刻 */
let lastTouch = 0;

export function attachDnd(el: HTMLElement, handlers: DndHandlers): void {
  root = el;
  h = handlers;
  if (installed) return;
  installed = true;
  install();
}

/** ロッカールーム以外の画面では無効にする */
export function detachDnd(): void {
  root = null;
  h = null;
}

function install(): void {
  let startX = 0;
  let startY = 0;
  let fromEl: HTMLElement | null = null;
  let ghost: HTMLElement | null = null;
  let timer: number | null = null;
  let over: HTMLElement | null = null;
  let moved = false;

  const slotAt = (x: number, y: number) => {
    if (ghost) ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (ghost) ghost.style.display = '';
    return el?.closest<HTMLElement>('[data-slot]') ?? null;
  };

  const lift = () => {
    if (!fromEl) return;
    const r = fromEl.getBoundingClientRect();
    ghost = fromEl.cloneNode(true) as HTMLElement;
    ghost.classList.add('lk-ghost');
    ghost.style.width = `${r.width}px`;
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    document.body.appendChild(ghost);
    fromEl.classList.add('lk-lifted');
  };

  const moveGhost = (x: number, y: number) => {
    if (!ghost || !fromEl) return;
    const r = fromEl.getBoundingClientRect();
    ghost.style.left = `${x - r.width / 2}px`;
    ghost.style.top = `${y - 20}px`;
    const target = slotAt(x, y);
    if (over && over !== target) over.classList.remove('lk-over');
    over = target && target !== fromEl ? target : null;
    over?.classList.add('lk-over');
  };

  const finish = (x: number, y: number, cancelled = false) => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    const from = fromEl?.dataset.slot;
    if (ghost) {
      const target = slotAt(x, y);
      ghost.remove();
      ghost = null;
      fromEl?.classList.remove('lk-lifted');
      over?.classList.remove('lk-over');
      over = null;
      if (!cancelled && h && from && target && target.dataset.slot && target !== fromEl) h.onDrop(from, target.dataset.slot);
    } else if (!cancelled && h && !moved && from) {
      h.onTap(from);
    }
    fromEl = null;
  };

  // ---- タッチ ----
  document.addEventListener('touchstart', (e) => {
    lastTouch = Date.now();
    const t = e.target as HTMLElement;
    if (!root || !root.contains(t)) return;
    if (t.closest('select, input, button, a')) return;
    const card = t.closest<HTMLElement>('[data-slot][data-drag]');
    if (!card) return;
    fromEl = card;
    moved = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    timer = window.setTimeout(() => {
      timer = null;
      lift();
      moveGhost(startX, startY);
    }, LONG_PRESS_MS);
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!fromEl) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    if (ghost) {
      e.preventDefault(); // 持ち上げている間は画面をスクロールしない
      moveGhost(x, y);
    } else if (Math.hypot(x - startX, y - startY) > MOVE_CANCEL_PX) {
      // 長押しの前に動いたらスクロールとみなす
      moved = true;
      if (timer != null) clearTimeout(timer);
      timer = null;
      fromEl = null;
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    lastTouch = Date.now();
    if (!fromEl) return;
    const t = e.changedTouches[0];
    finish(t.clientX, t.clientY);
  });
  document.addEventListener('touchcancel', () => finish(0, 0, true));

  // ---- マウス（パソコンでの確認用） ----
  document.addEventListener('mousedown', (e) => {
    if (Date.now() - lastTouch < 1000) return;
    const t = e.target as HTMLElement;
    if (!root || !root.contains(t)) return;
    if (t.closest('select, input, button, a')) return;
    const card = t.closest<HTMLElement>('[data-slot][data-drag]');
    if (!card) return;
    fromEl = card;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
  });
  document.addEventListener('mousemove', (e) => {
    if (!fromEl) return;
    if (!ghost && Math.hypot(e.clientX - startX, e.clientY - startY) > 6) lift();
    if (ghost) moveGhost(e.clientX, e.clientY);
  });
  document.addEventListener('mouseup', (e) => {
    if (!fromEl || Date.now() - lastTouch < 1000) return;
    finish(e.clientX, e.clientY);
  });
}
