/**
 * Yedekleme: JSON dışa/içe aktarma, kalıcı depolama izni.
 * Veriler yalnızca bu cihazda durduğu için düzenli yedek önemli: telefon değişince
 * ya da tarayıcı verisi silinince yedek dosyasıyla her şey geri gelir.
 */
import { store } from '../core/store.js';
import { createLogger } from '../core/logger.js';
import { todayKey } from '../core/dates.js';
import { ValidationError } from '../core/validate.js';

const log = createLogger('backup');

export async function exportToFile() {
  const backup = store.exportAll();
  const json = JSON.stringify(backup, null, 2);
  const name = `boss-yedek-${todayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });

  // Telefonda paylaşım menüsü (Dosyalar'a kaydet, Drive, e-posta…) daha kullanışlı.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'BOSS yedeği' });
      await store.setSetting('lastExportAt', Date.now());
      log.info('Yedek paylaşıldı', backup.counts);
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      log.warn('Paylaşım başarısız, indirmeye geçiliyor', e);
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  await store.setSetting('lastExportAt', Date.now());
  log.info('Yedek indirildi', backup.counts);
  return 'downloaded';
}

/** Dosyayı okur ve ayrıştırır; içe aktarmadan önce özet göstermek için. */
export async function readBackupFile(file) {
  if (!file) throw new ValidationError('Dosya seçilmedi.');
  if (file.size > 20 * 1024 * 1024) throw new ValidationError('Dosya çok büyük (20 MB üstü).');
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Dosya okunamadı: geçerli bir JSON değil.');
  }
}

export async function importBackup(obj) {
  return store.importAll(obj);
}

/** Tarayıcıdan verileri "silinemez" olarak işaretlemesini ister (yer daralınca otomatik silinmesin). */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    const ok = await navigator.storage.persist();
    log.info('Kalıcı depolama', { ok });
    return ok;
  } catch (e) {
    log.warn('Kalıcı depolama istenemedi', e);
    return null;
  }
}

export async function storageInfo() {
  try {
    const [persisted, est] = await Promise.all([navigator.storage?.persisted?.() ?? null, navigator.storage?.estimate?.() ?? null]);
    return { persisted, usage: est?.usage ?? null, quota: est?.quota ?? null };
  } catch {
    return { persisted: null, usage: null, quota: null };
  }
}
