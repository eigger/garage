# Screenshots

| Path | Locale |
|---|---|
| `ko/*.png` | Korean UI — used by [`README.ko.md`](../../README.ko.md) |
| `en/*.png` | English UI — used by [`README.md`](../../README.md) |

| File | Screen |
|---|---|
| `01-dashboard.png` | Home dashboard |
| `02-vehicle-ev.png` | Vehicle overview (EV) |
| `02-vehicle-ice.png` | Vehicle overview (ICE) |
| `03-quick-log-ev.png` | Quick log (EV charging) |
| `03-quick-log-ice.png` | Quick log (ICE fueling) |
| `04-schedule-ev.png` | Maintenance schedule (EV) |
| `04-schedule-ice.png` | Maintenance schedule (ICE) |
| `05-history-ev.png` | History (EV) |
| `05-history-ice.png` | History (ICE) |
| `06-integrations.png` | API Integrations |
| `07-level-ev.png` | Vehicle level & badges (EV) |
| `07-level-ice.png` | Vehicle level & badges (ICE) |
| `08-vehicles.png` | Manage vehicles |
| `09-users.png` | Manage users |
| `10-presets.png` | Manage maintenance presets |
| `11-backup.png` | System backup & restore |
| `12-profile.png` | Profile settings |

```sh
# both locales
ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/capture-screenshots.mjs

# one locale
LOCALES=en ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/capture-screenshots.mjs
```

Requires API on `:8080` and web on `:3000` with `NEXT_PUBLIC_API_URL=http://localhost:8080`.
