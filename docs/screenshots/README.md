# Screenshots

| Path | Locale |
|---|---|
| `ko/*.png` | Korean UI — used by [`README.ko.md`](../../README.ko.md) |
| `en/*.png` | English UI — used by [`README.md`](../../README.md) |

| File | Screen |
|---|---|
| `01-dashboard.png` | Home dashboard |
| `02-vehicle.png` | Vehicle overview |
| `03-quick-log.png` | Quick log (fuel) |
| `04-schedule.png` | Maintenance schedule |
| `05-history.png` | History |
| `06-integrations.png` | API Integrations |
| `07-level.png` | Vehicle level & badges |

```sh
# both locales
ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/capture-screenshots.mjs

# one locale
LOCALES=en ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/capture-screenshots.mjs
```

Requires API on `:8080` and web on `:3000` with `NEXT_PUBLIC_API_URL=http://localhost:8080`.
