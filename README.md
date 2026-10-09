# BOSS

> Be your own boss.

A personal discipline app: habit tracking, quote of the day, daily priorities, evening review, focus timer, goals and stats. Installable PWA, works offline, no account, no server — all data stays on your device.

## Features

- **Today** — week strip, quote of the day, top 3 priorities, habits with streaks, quit-habit counters, evening review, notes
- **Plan** — weekly and monthly goals with carry-over
- **Focus** — Pomodoro timer linked to habits
- **Stats** — level and points, yearly heatmap, weekly rate, weekday pattern, mood insights, badges
- **Journal** — searchable history
- Reminders, JSON backup/restore, light/dark themes

## Install on your phone

1. Deploy the folder to any static host (GitHub Pages: *Settings › Pages › Deploy from branch `main` / root*).
2. Open the URL on your phone:
   - **iPhone:** Safari › Share › **Add to Home Screen**
   - **Android:** Chrome › ⋮ › **Install app**

When releasing changes, bump the version in `js/version.js` so installed apps pick up the update.

## Development

```bash
npm run serve   # http://localhost:8080
npm test        # unit tests (Node built-in runner, no dependencies)
```

Debugging: open with `?debug=1` for verbose logs, see *Settings › Developer › Logs*, or use `boss.store.debugSnapshot()` in the console. `?nosw=1` disables the service worker cache.

## Notes

- Data lives only on the device — export a backup from *Settings › Data* regularly.
- Reminders fire while the app is open; on Android they are also checked in the background (~hourly). iPhone has no background checks.
