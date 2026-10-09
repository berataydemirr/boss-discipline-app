/**
 * Service worker kaydı ve güncelleme akışı.
 *
 * - Yeni sürüm indirilince kullanıcıya "Yeni sürüm hazır" bildirimi gösterilir;
 *   "Yenile"ye basınca bekleyen worker etkinleşir ve sayfa bir kez yenilenir.
 * - Geliştirme sırasında önbelleği devre dışı bırakmak için: ?nosw=1
 *   (kayıtlı worker'ı ve önbellekleri siler).
 */
import { createLogger } from './logger.js';
import { toast } from '../ui/toast.js';

const log = createLogger('sw');

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    log.warn('Service worker desteklenmiyor; çevrimdışı çalışma kapalı');
    return null;
  }

  if (new URLSearchParams(location.search).has('nosw')) {
    await unregisterAll();
    log.warn('?nosw: service worker ve önbellekler kaldırıldı');
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    log.info('Service worker kayıtlı', { scope: reg.scope });

    const promptUpdate = (worker) => {
      log.info('Yeni sürüm bekliyor');
      toast('Yeni sürüm hazır.', {
        duration: 15000,
        action: { label: 'Yenile', fn: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
      });
    };

    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        log.debug('worker durumu', { state: worker.state });
        // Controller varsa bu bir güncellemedir; yoksa ilk kurulumdur.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(worker);
      });
    });

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      log.info('Yeni sürüm etkin, yenileniyor');
      location.reload();
    });

    // Uygulama açıkken arada güncelleme kontrol et.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch((e) => log.debug('update kontrolü başarısız', e));
    });
    return reg;
  } catch (e) {
    log.error('Service worker kaydedilemedi', e);
    return null;
  }
}

export async function unregisterAll() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('disiplin-')).map((k) => caches.delete(k)));
    }
  } catch (e) {
    log.error('Service worker kaldırılamadı', e);
  }
}
