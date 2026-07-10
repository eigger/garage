# Screenshots

Captured from the local Garage UI (`scripts/capture-screenshots.mjs`).

| File | Screen |
|---|---|
| `01-dashboard.png` / `en/01-dashboard.png` | Home dashboard (ko / en) |
| `02-vehicle.png` / `en/02-vehicle.png` | Vehicle overview |
| `03-quick-log.png` / `en/03-quick-log.png` | Quick log (fuel) |
| `04-schedule.png` / `en/04-schedule.png` | Maintenance schedule |
| `05-history.png` / `en/05-history.png` | History |
| `06-integrations.png` / `en/06-integrations.png` | API Integrations |

Re-capture (API on `:8080`, web on `:3000` with `NEXT_PUBLIC_API_URL=http://localhost:8080`):

```sh
# both locales (default)
ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/capture-screenshots.mjs

# English only
LOCALES=en ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/capture-screenshots.mjs
```
