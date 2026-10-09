/**
 * Backup: JSON export/import and persistent storage.
 * Data only lives on this device, so regular backups matter: when you switch phones
 * or browser data gets cleared, a backup file brings everything back.
 */
import { store } from '../core/store.js';
import { createLogger } from '../core/logger.js';
import { todayKey } from '../core/dates.js';
import { ValidationError } from '../core/validate.js';

const log = createLogger('backup');

export async function exportToFile() {
  const backup = store.exportAll();
  const json = JSON.stringify(backup, null, 2);
  const name = `boss-backup-${todayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });

  // On phones the share sheet (Save to Files, Drive, email…) is more useful.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'BOSS backup' });
      await store.setSetting('lastExportAt', Date.now());
      log.info('Backup shared', backup.counts);
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      log.warn('Sharing failed, falling back to download', e);
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
  log.info('Backup downloaded', backup.counts);
  return 'downloaded';
}

/** Reads and parses a file, so a summary can be shown before importing. */
export async function readBackupFile(file) {
  if (!file) throw new ValidationError('No file selected.');
  if (file.size > 20 * 1024 * 1024) throw new ValidationError('The file is too large (over 20 MB).');
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Could not read the file: it is not valid JSON.');
  }
}

export async function importBackup(obj) {
  return store.importAll(obj);
}

/** Asks the browser to mark the data as persistent (not evicted when space runs low). */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    const ok = await navigator.storage.persist();
    log.info('Persistent storage', { ok });
    return ok;
  } catch (e) {
    log.warn('Could not request persistent storage', e);
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
