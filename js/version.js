/*
 * Single source of the app version, read by both the page (<script>) and the
 * service worker (importScripts). Bump it on every release: the cache is
 * refreshed and installed apps show an "Update available" prompt.
 */
self.BOSS_VERSION = '4.0.0';
