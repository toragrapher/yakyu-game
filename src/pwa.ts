// PWA：Service Worker を登録する（本番のビルドだけ。開発中は登録しない）
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // HTTPS でない場所（同じWi-Fiの http:// など）では登録できない。その場合もゲームは普通に動く
    });
  });
}
