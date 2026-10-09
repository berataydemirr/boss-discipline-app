/**
 * Service worker registration and update flow.
 *
 * - When a new version is downloaded, an "Update available" toast is shown;
 *   tapping "Reload" activates the waiting worker and reloads the page once.
 * - To disable caching during development: ?nosw=1 (unregisters the worker and clears caches).
 */
import { createLogger } from './logger.js';
import { toast } from '../ui/toast.js';

const log = createLogger('sw');

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    log.warn('Service workers are not supported; offline mode is disabled');
    return null;
  }

  if (new URLSearchParams(location.search).has('nosw')) {
    await unregisterAll();
    log.warn('?nosw: service worker and caches removed');
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    log.info('Service worker registered', { scope: reg.scope });

    const promptUpdate = (worker) => {
      log.info('New version waiting');
      toast('Update available.', {
        duration: 15000,
        action: { label: 'Reload', fn: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
      });
    };

    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        log.debug('worker state', { state: worker.state });
        // With an existing controller this is an update; otherwise it is the first install.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(worker);
      });
    });

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      log.info('New version active, reloading');
      location.reload();
    });

    // Check for updates whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch((e) => log.debug('Update check failed', e));
    });
    return reg;
  } catch (e) {
    log.error('Could not register service worker', e);
    return null;
  }
}

export async function unregisterAll() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('boss-')).map((k) => caches.delete(k)));
    }
  } catch (e) {
    log.error('Could not unregister service worker', e);
  }
}
